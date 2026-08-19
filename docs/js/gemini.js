// gemini.js — Gemini 로 글과 썸네일을 만든다.
//
// ⚠ 모델 ID 는 자주 갱신된다. 최신 확인:
//   텍스트  https://ai.google.dev/gemini-api/docs/models
//   이미지  https://ai.google.dev/gemini-api/docs/image-generation

// 2026-08-19 무료 한도로 실제 호출해 본 결과가 라벨에 반영되어 있다:
//   3.1-flash-lite  3~5초에 안정적으로 성공 → 기본값
//   3.7-flash       503(과부하)이 자주 난다
//   2.5-pro         429(한도 초과). 무료 한도가 거의 없다
export const TEXT_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "빠름 (기본)" },
  { id: "gemini-3.7-flash", label: "품질 좋음 (자주 붐빔)" },
  { id: "gemini-2.5-pro", label: "최고 품질 (유료 한도 필요)" },
];
export const TEXT_MODEL_DEFAULT = "gemini-3.1-flash-lite";

// 주제 분야별 말투.
export const TOPIC_TONES = [
  { id: "금융", tone: "신중하고 정확하게. 단정하지 말고 조건을 밝힌다." },
  { id: "창업·정보", tone: "실용적으로. 절차와 준비물을 순서대로 짚는다." },
  { id: "리뷰", tone: "경험 중심으로. 좋았던 점과 아쉬운 점을 같이 쓴다." },
  { id: "생활", tone: "친근하게. 어려운 말을 풀어 쓴다." },
];

// ⚠ 이미지 생성은 무료 한도가 사실상 없다. 무료 키로는 세 모델 모두 429(요금제 한도)다.
//   결제를 붙여야 열린다. 코드 문제로 오해하지 말 것. (2026-08-19 확인)
export const IMAGE_MODEL = "gemini-3.1-flash-image";

export const THUMB_STYLES = [
  { id: "실사", prompt: "photorealistic photograph, natural lighting, shallow depth of field, no text" },
  { id: "그림", prompt: "hand-drawn illustration, clean flat colors, editorial illustration style, no text" },
  { id: "애니메이션", prompt: "anime style illustration, vivid colors, clean linework, no text" },
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_TIMEOUT_MS = 180000;
const IMAGE_TIMEOUT_MS = 180000;
const TEST_TIMEOUT_MS = 30000;

// 텍스트도 thinking 이 출력 토큰을 나눠 쓴다. 작게 잡으면 본문이 비거나 잘린다.
const MAX_OUTPUT_TOKENS = 16384;

// 429 는 두 가지가 섞여 온다. "잠시 후 재시도"로 풀리는 초당 요청 제한과,
// 요금제 자체에 한도가 없어서 기다려도 안 풀리는 경우다. 응답 본문으로 구분한다.
export function isPlanQuota(bodyText) {
  return /billing|plan|exceeded your current quota/i.test(bodyText || "");
}

function explainHttpError(status, bodyText) {
  let apiMsg = "";
  try { apiMsg = JSON.parse(bodyText)?.error?.message || ""; } catch (_) { apiMsg = (bodyText || "").slice(0, 300); }
  let hint = {
    400: "요청이 거부되었습니다. 키가 올바른지 확인하세요.",
    403: "이 키로는 접근 권한이 없습니다.",
    404: "모델을 찾을 수 없습니다. 모델 ID를 확인하세요.",
    429: "요청이 너무 잦습니다. 잠시 후 다시 시도하세요.",
    500: "Google 서버 오류입니다. 잠시 후 재시도하세요.",
    503: "지금 붐빕니다. 잠시 후 다시 시도하세요.",
  }[status] || "";
  if (status === 429 && isPlanQuota(bodyText)) {
    hint = "지금 요금제의 한도를 넘었습니다. 기다려도 풀리지 않습니다.";
  }
  return `오류(${status})${hint ? " — " + hint : ""}${apiMsg ? "\n" + apiMsg : ""}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 503/500 과 초당 제한형 429 는 조금 기다리면 풀린다. 요금제 한도형 429 는 바로 던진다.
const RETRY_DELAYS_MS = [2000, 5000];

async function callOnce({ apiKey, model, body, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(explainHttpError(res.status, text));
      err.status = res.status;
      err.rawBody = text;
      throw err;
    }
    return JSON.parse(text);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`응답이 ${Math.round(timeoutMs / 1000)}초 안에 오지 않았습니다.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function call(args) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(args);
    } catch (e) {
      const transient = e?.status === 503 || e?.status === 500 || (e?.status === 429 && !isPlanQuota(e?.rawBody));
      if (!transient || attempt >= RETRY_DELAYS_MS.length) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

// ────────────────────────── 글 ──────────────────────────

// 채워 넣을 자리 표시. 빈칸 모드에서만 쓴다.
export const BLANKS = ["[내 경험]", "[실제 수치]", "[내 의견]", "[최신 확인]"];

// 버튼 자리. 사람이 문구와 링크를 채우면 buttons.js 가 실제 HTML 로 바꾼다.
export const BUTTON_PLACEHOLDER = "[버튼: 텍스트 | URL]";

// mode
//  "complete" — 바로 올릴 수 있는 완성본 (기본)
//  "blanks"   — 사람이 채울 빈칸을 남긴 초안
export function buildPrompt({ keyword, topic, lang, mode = "complete" }) {
  const language = lang || "한국어";
  const tone = TOPIC_TONES.find((t) => t.id === topic)?.tone || "";

  const common = [
    `당신은 ${language}로 쓰는 블로그 글 작가입니다.`,
    ``,
    `[반드시 지킬 것]`,
    `- 어떤 출처도 그대로 옮기지 말고 완전히 재구성해서 쓰세요.`,
    `- 확인되지 않은 수치·날짜·금액·상품명·고유명사를 지어내지 마세요.`,
    tone ? `- 말투: ${tone}` : ``,
    `- 소제목(##)을 3개 이상 쓰세요.`,
    `- 본문은 1,000자 이상.`,
    ``,
    `[글의 흐름]`,
    `1. 후킹 — 독자의 문제나 궁금증을 먼저 꺼낸다`,
    `2. 핵심 정보 A — 질문에 대한 실질적인 답. 여기가 글의 가치다`,
    `3. ${BUTTON_PLACEHOLDER} — 바로 앞줄에 왜 눌러야 하는지 맥락을 한 줄 쓴다`,
    `4. 사례나 상황 설명`,
    `5. 핵심 정보 B — 선택지 비교, 장단점, 판단 근거`,
    `6. ${BUTTON_PLACEHOLDER} — 마찬가지로 앞줄에 맥락 한 줄`,
    `7. 주의사항·팁`,
    `8. 요약`,
    ``,
    `[버튼 규칙]`,
    `- ${BUTTON_PLACEHOLDER} 를 글자 그대로 2개 넣으세요. 링크를 지어내지 마세요.`,
    `- 버튼은 정보를 충분히 준 뒤에 옵니다. 글 맨 앞에 두지 마세요.`,
    ``,
    `[출력 형식]`,
    `- 첫 줄은 "# 제목" 형식의 제목 한 줄`,
    `- 그 다음 줄부터 마크다운 본문. 소제목은 ## 를 사용`,
    `- 인사말, 설명, 코드펜스로 전체를 감싸는 것 금지. 마크다운 본문만 출력`,
  ];

  const modeRules = mode === "blanks"
    ? [
        `글을 완성하지 마세요. 사람이 채울 빈칸을 일부러 남기는 것이 당신의 역할입니다.`,
        ``,
        `[빈칸]`,
        `- 아래 4종을 본문 안에 각각 최소 한 번 넣으세요:`,
        `  [내 경험] — 글쓴이의 실제 경험이 들어갈 자리`,
        `  [실제 수치] — 확인이 필요한 숫자 자리`,
        `  [내 의견] — 글쓴이의 판단이 들어갈 자리`,
        `  [최신 확인] — 발행 시점에 다시 확인할 정보 자리`,
        `- 확인 안 된 숫자는 [실제 수치] 로 비우세요.`,
      ]
    : [
        `그대로 올릴 수 있는 완성된 글을 쓰세요. 채워 넣으라는 표시를 남기지 마세요.`,
        ``,
        `[지어내지 않으면서 완성하는 법]`,
        `- 정확한 금액·금리·마감일처럼 확인이 필요한 숫자는 쓰지 마세요.`,
        `  대신 "지원 규모는 공고마다 다르니 공고문에서 확인하세요" 처럼`,
        `  독자가 스스로 확인하도록 안내하는 문장으로 자연스럽게 처리하세요.`,
        `- 대괄호 표시([...])를 남기지 마세요. 단, 위 버튼 표시는 예외입니다.`,
      ];

  const system = [...modeRules, ``, ...common].filter(Boolean).join("\n");

  const user =
    `주제: ${keyword}\n분야: ${topic}\n언어: ${language}\n\n` +
    (mode === "blanks"
      ? `위 주제로 블로그 글 초안을 작성해 주세요. 빈칸을 남기는 것을 잊지 마세요.`
      : `위 주제로 블로그 글을 완성해 주세요.`);

  return { system, user };
}

function textBody({ system, user, withSystemField }) {
  const body = {
    contents: [{ role: "user", parts: [{ text: withSystemField ? user : `${system}\n\n---\n\n${user}` }] }],
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  };
  if (withSystemField) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}

// 응답에서 사람이 읽을 텍스트만 모은다. thinking 파트가 섞여 오면 제외한다.
function pickText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
}

export async function generateText({ apiKey, model, keyword, topic, lang, mode }) {
  const { system, user } = buildPrompt({ keyword, topic, lang, mode });
  const useModel = model || TEXT_MODEL_DEFAULT;

  let data;
  try {
    data = await call({ apiKey, model: useModel, body: textBody({ system, user, withSystemField: true }), timeoutMs: TEXT_TIMEOUT_MS });
  } catch (e) {
    // systemInstruction 필드를 거부하는 모델/버전이면 지시를 본문 앞에 붙여 한 번만 다시 시도한다.
    const rejectedSystemField = e?.status === 400 && /system[_ ]?instruction/i.test(e?.rawBody || "");
    if (!rejectedSystemField) throw e;
    data = await call({ apiKey, model: useModel, body: textBody({ system, user, withSystemField: false }), timeoutMs: TEXT_TIMEOUT_MS });
  }

  const finish = data?.candidates?.[0]?.finishReason || "";
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw new Error(`요청이 차단되었습니다(${blocked}). 주제를 바꿔 보세요.`);

  const text = pickText(data);
  if (!text) throw new Error(`글이 비어 있습니다(${finish || "?"}).`);
  return { text, truncated: finish === "MAX_TOKENS" };
}

// 키 유효성만 최소 비용으로 확인한다. HTTP 200 자체가 키가 유효하다는 증거다.
export async function testKey({ apiKey, model }) {
  const data = await call({
    apiKey,
    model: model || TEXT_MODEL_DEFAULT,
    body: { contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 16 } },
    timeoutMs: TEST_TIMEOUT_MS,
  });
  return !!data;
}

// ────────────────────────── 썸네일 ──────────────────────────

function buildImagePrompt({ keyword, style }) {
  const s = THUMB_STYLES.find((t) => t.id === style)?.prompt || "";
  return (
    `Blog thumbnail image about "${keyword}". ${s}. ` +
    `16:9 aspect ratio, clean composition, no text, no letters, no watermark.`
  );
}

export async function generateImage({ apiKey, keyword, style }) {
  const data = await call({
    apiKey,
    model: IMAGE_MODEL,
    body: {
      contents: [{ parts: [{ text: buildImagePrompt({ keyword, style }) }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    },
    timeoutMs: IMAGE_TIMEOUT_MS,
  });

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const inline = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
  if (!inline) throw new Error("이미지를 받지 못했습니다. 모델 ID가 최신인지 확인하세요.");

  const mime = inline.mimeType || inline.mime_type || "image/png";
  return { base64: inline.data, mime, dataUrl: `data:${mime};base64,${inline.data}` };
}
