// claude.js — Anthropic Messages API 로 블로그 초안을 생성한다.
// 브라우저에서 직접 부르므로 anthropic-dangerous-direct-browser-access 헤더가 필요하다.

const URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

// output_config.effort 를 지원하는 모델. haiku-4-5 는 지원하지 않아 400 이 난다.
const EFFORT_MODELS = new Set(["claude-sonnet-5", "claude-opus-5"]);

const GEN_TIMEOUT_MS = 180000;
const TEST_TIMEOUT_MS = 30000;

function explainHttpError(status, bodyText) {
  let apiMsg = "";
  try { apiMsg = JSON.parse(bodyText)?.error?.message || ""; } catch (_) { apiMsg = (bodyText || "").slice(0, 300); }
  const hint = {
    400: "요청 형식 오류입니다. 모델 ID가 올바른지 확인하세요.",
    401: "API 키가 잘못되었거나 만료되었습니다. 설정에서 키를 다시 확인하세요.",
    403: "이 키로는 접근 권한이 없습니다.",
    404: "모델을 찾을 수 없습니다. 모델 ID를 확인하세요.",
    413: "요청이 너무 큽니다. 키워드를 줄여보세요.",
    429: "요청 한도(rate limit)를 초과했습니다. 잠시 후 다시 시도하세요.",
    500: "Anthropic 서버 오류입니다. 잠시 후 재시도하세요.",
    529: "서버가 과부하 상태입니다. 잠시 후 재시도하세요.",
  }[status] || "";
  return `Claude 오류(${status})${hint ? " — " + hint : ""}${apiMsg ? "\n" + apiMsg : ""}`;
}

async function call(apiKey, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(explainHttpError(res.status, await res.text()));
    return await res.json();
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`응답이 ${Math.round(timeoutMs / 1000)}초 안에 오지 않았습니다.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

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

// 키 유효성만 최소 비용으로 확인한다. HTTP 200 자체가 키가 유효하다는 증거다.
export async function testKey({ apiKey, model }) {
  const data = await call(apiKey, { model, max_tokens: 16, messages: [{ role: "user", content: "ping" }] }, TEST_TIMEOUT_MS);
  return !!data;
}

export async function generate({ apiKey, model, keyword, docType, lang }) {
  const { system, user } = buildPrompt({ keyword, docType, lang });
  const body = {
    model,
    // sonnet-5 / opus-5 는 thinking 이 기본 ON 이고 thinking 토큰도 max_tokens 를 소모한다.
    // 넉넉히 잡지 않으면 본문이 비거나 잘린다.
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (EFFORT_MODELS.has(model)) body.output_config = { effort: "medium" };

  const data = await call(apiKey, body, GEN_TIMEOUT_MS);

  if (data?.stop_reason === "refusal") {
    throw new Error(`모델이 이 요청을 거절했습니다(${data?.stop_details?.category || "unknown"}). 키워드를 바꿔 보세요.`);
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error(`본문이 비어 있습니다(stop_reason: ${data?.stop_reason || "?"}).`);
  return { text, truncated: data?.stop_reason === "max_tokens" };
}
