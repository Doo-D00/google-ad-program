// gemini.js — Gemini 로 블로그 초안(텍스트)과 썸네일(이미지)을 만든다.
// 키를 하나로 통일하려고 글쓰기도 Gemini 로 옮겼다(예전에는 Claude 였다).
//
// ⚠ 모델 ID 는 자주 갱신된다. 최신 확인:
//   텍스트  https://ai.google.dev/gemini-api/docs/models
//   이미지  https://ai.google.dev/gemini-api/docs/image-generation

// 2026-08-19 문서 확인: gemini-2.5-flash-image 는 legacy 로 내려갔고 Gemini 3 계열이 현행이다.
//   gemini-3.1-flash-image      범용 기본값(속도/품질 균형)  ← 지금 쓰는 것
//   gemini-3.1-flash-lite-image 더 빠르고 싸다
//   gemini-3-pro-image          복잡한 구성이 필요할 때
export const IMAGE_MODEL = "gemini-3.1-flash-image";

// 화면의 모델 선택에 그대로 쓰인다.
export const TEXT_MODELS = [
  { id: "gemini-3.7-flash", label: "gemini-3.7-flash (기본)" },
  { id: "gemini-3.1-flash-lite", label: "gemini-3.1-flash-lite (빠르고 저렴)" },
  { id: "gemini-2.5-pro", label: "gemini-2.5-pro (고품질)" },
];
export const TEXT_MODEL_DEFAULT = "gemini-3.7-flash";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const IMAGE_TIMEOUT_MS = 180000;
const TEXT_TIMEOUT_MS = 180000;
const TEST_TIMEOUT_MS = 30000;

// 텍스트도 thinking 이 붙어 출력 토큰을 나눠 쓴다. 작게 잡으면 본문이 비거나 잘린다.
const MAX_OUTPUT_TOKENS = 16384;

function explainHttpError(status, bodyText) {
  let apiMsg = "";
  try { apiMsg = JSON.parse(bodyText)?.error?.message || ""; } catch (_) { apiMsg = (bodyText || "").slice(0, 300); }
  const hint = {
    400: "요청이 거부되었습니다. 키가 올바른지, 모델 ID가 최신인지 확인하세요.",
    403: "이 키로는 접근 권한이 없습니다. 키가 이 API 에 대해 활성화되어 있는지 확인하세요.",
    404: "모델을 찾을 수 없습니다. 모델 ID를 확인하세요.",
    429: "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
    500: "Google 서버 오류입니다. 잠시 후 재시도하세요.",
    503: "모델이 과부하 상태입니다. 잠시 후 재시도하세요.",
  }[status] || "";
  return `Gemini 오류(${status})${hint ? " — " + hint : ""}${apiMsg ? "\n" + apiMsg : ""}`;
}

async function call({ apiKey, model, body, timeoutMs }) {
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

// ────────────────────────── 텍스트 ──────────────────────────

function buildPrompt({ keyword, docType, lang }) {
  const language = lang || "한국어";
  const typeMap = {
    유틸리티: "실용적인 방법/사용법 중심",
    리뷰: "장단점과 사용 경험 중심",
    정보: "배경지식과 정리 중심",
    뉴스: "사실 전달과 맥락 중심",
  };
  return {
    system:
      `당신은 ${language}로 글을 쓰는 블로그 작가입니다. ` +
      `읽기 쉬운 문단과 소제목으로 구성하고, 과장 없이 구체적으로 씁니다.\n` +
      `출력 형식을 반드시 지키세요:\n` +
      `- 첫 줄은 "# 제목" 형식의 글 제목 한 줄\n` +
      `- 그 다음 줄부터 본문. 소제목은 ## 를 사용\n` +
      `- 인사말, 설명, 코드펜스로 전체를 감싸는 것 금지. 마크다운 본문만 출력`,
    user:
      `주제 키워드: ${keyword}\n글 유형: ${docType} (${typeMap[docType] || ""})\n언어: ${language}\n\n` +
      `위 주제로 블로그 글을 작성해 주세요.`,
  };
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

export async function generateText({ apiKey, model, keyword, docType, lang }) {
  const { system, user } = buildPrompt({ keyword, docType, lang });
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
  if (blocked) throw new Error(`요청이 차단되었습니다(${blocked}). 키워드를 바꿔 보세요.`);

  const text = pickText(data);
  if (!text) throw new Error(`본문이 비어 있습니다(finishReason: ${finish || "?"}).`);
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

// ────────────────────────── 이미지 ──────────────────────────

function buildImagePrompt({ keyword, style }) {
  const styleMap = {
    "포스터 스타일": "bold poster layout, large typography, high contrast",
    "썸네일 스타일": "youtube-thumbnail style, punchy, centered subject",
    미니멀: "minimal, flat, lots of negative space",
    "사진 스타일": "photorealistic, natural lighting, shallow depth of field",
  };
  return (
    `Blog thumbnail image about "${keyword}". ${styleMap[style] || ""}. ` +
    `16:9 aspect ratio, clean composition, no text artifacts, no watermark.`
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
  if (!inline) throw new Error("이미지 응답을 찾지 못했습니다. 모델 ID가 최신인지 확인하세요.");

  const mime = inline.mimeType || inline.mime_type || "image/png";
  return { base64: inline.data, mime, dataUrl: `data:${mime};base64,${inline.data}` };
}
