// background.js — 서비스 워커 (AI 호출 중계)
// - 텍스트 생성: Claude (Anthropic Messages API)
// - 이미지 생성: Gemini (Google Generative Language API)
// API 키는 코드에 없고 chrome.storage.sync 에 저장된 사용자 키를 사용한다.

// ============ Claude (텍스트) ============
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// output_config.effort 를 지원하는 모델. haiku-4-5 는 지원하지 않아 400 이 난다.
const EFFORT_MODELS = new Set(["claude-sonnet-5", "claude-opus-5"]);

// 요청 타임아웃(ms). sonnet-5/opus-5 는 adaptive thinking 이 기본 ON 이라
// 짧은 글이라도 30초 이상 걸릴 수 있다.
const GEN_TIMEOUT_MS = 180000;
const TEST_TIMEOUT_MS = 30000;

function buildTextPrompt({ keyword, docType, lang }) {
  const language = lang || "한국어";
  const typeMap = {
    "유틸리티": "실용 정보/사용법 중심의 유틸리티성 글",
    "리뷰": "직접 써본 듯한 후기/리뷰 글",
    "정보": "개념과 배경을 설명하는 정보성 글",
    "뉴스": "사실 전달 중심의 뉴스형 글",
  };
  const style = typeMap[docType] || "블로그 글";
  return {
    system: `당신은 ${language}로 블로그 글을 잘 쓰는 전문 작가입니다. 요청한 유형(${style})에 맞춰, 소제목을 적절히 나눈 완성된 초안을 자연스럽게 작성합니다. 과장·군더더기 없이 정보가 분명해야 합니다.`,
    user: `아래 키워드로 ${style}을(를) ${language}로 작성해줘.\n\n키워드: ${keyword}`,
  };
}

// HTTP 오류 본문을 사람이 읽을 수 있는 한국어 메시지로 변환
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

// Anthropic Messages API 공통 호출부 (타임아웃 + 오류 해석)
async function anthropicFetch(apiKey, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        // 브라우저(확장 서비스 워커)에서 직접 호출하려면 반드시 필요
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: "HTTP_" + res.status, message: explainHttpError(res.status, detail) };
    }
    return { ok: true, data: await res.json() };
  } catch (e) {
    if (e?.name === "AbortError") {
      return { ok: false, error: "TIMEOUT", message: `응답이 ${Math.round(timeoutMs / 1000)}초 안에 오지 않았습니다. 다시 시도하세요.` };
    }
    return { ok: false, error: "NETWORK", message: "네트워크 오류: " + (e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// 키 유효성만 최소 비용으로 확인한다.
// max_tokens 를 16 으로 두면 thinking 에 다 소모돼 본문이 비어도 상관없다 —
// HTTP 200 자체가 "키가 유효하다"는 증거이기 때문.
async function testClaudeKey(payload) {
  const stored = await chrome.storage.sync.get(["anthropicKey", "claudeModel"]);
  const apiKey = (payload?.key || stored.anthropicKey || "").trim();
  if (!apiKey) return { ok: false, error: "NO_KEY", message: "Anthropic API 키가 없습니다. 설정에서 저장하세요." };
  const model = payload?.model || stored.claudeModel || "claude-sonnet-5";
  const r = await anthropicFetch(apiKey, {
    model,
    max_tokens: 16,
    messages: [{ role: "user", content: "ping" }],
  }, TEST_TIMEOUT_MS);
  return r.ok ? { ok: true, model } : r;
}

async function callClaude(payload) {
  const { anthropicKey, claudeModel } = await chrome.storage.sync.get(["anthropicKey", "claudeModel"]);
  if (!anthropicKey) return { ok: false, error: "NO_KEY", message: "Anthropic API 키가 없습니다. 설정에서 저장하세요." };
  const model = claudeModel || "claude-sonnet-5";
  const { system, user } = buildTextPrompt(payload);

  // max_tokens 주의: sonnet-5 / opus-5 는 thinking 파라미터를 생략하면
  // adaptive thinking 이 기본 ON 이고, thinking 토큰도 max_tokens 를 소모한다.
  // 예전 값(2500)은 사고 과정에 전부 먹혀 본문이 비거나 잘릴 수 있어 넉넉히 잡는다.
  const body = {
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
  };
  // effort 를 낮추면 블로그 초안 정도는 품질 손해 없이 확실히 빨라진다.
  if (EFFORT_MODELS.has(model)) body.output_config = { effort: "medium" };

  const r = await anthropicFetch(anthropicKey, body, GEN_TIMEOUT_MS);
  if (!r.ok) return r;

  const data = r.data;
  // 안전 분류기가 거절한 경우: HTTP 200 이지만 본문이 비어 있다.
  if (data?.stop_reason === "refusal") {
    const cat = data?.stop_details?.category || "unknown";
    return { ok: false, error: "REFUSAL", message: `모델이 이 요청을 거절했습니다(${cat}). 키워드를 바꿔 다시 시도하세요.` };
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) {
    return { ok: false, error: "EMPTY", message: `본문이 비어 있습니다(stop_reason: ${data?.stop_reason || "?"}). 다시 시도하세요.` };
  }
  return { ok: true, text, truncated: data?.stop_reason === "max_tokens" };
}

// ============ Gemini (이미지) ============
// NOTE(로컬 빌드 시 확인): Gemini 이미지 모델 버전은 자주 올라갑니다.
//   현재 문서(https://ai.google.dev/gemini-api/docs/image-generation)에서
//   최신 이미지 생성 모델 ID를 확인해 GEMINI_IMAGE_MODEL 을 갱신하세요.
//   아래는 안정적으로 검증된 generateContent + inlineData 방식(베이스라인)입니다.
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"; // TODO(P3): 최신 모델 ID 확인 후 갱신
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function buildImagePrompt({ keyword, style }) {
  const styleMap = {
    "포스터 스타일": "bold poster style, strong typography space, high contrast, eye-catching",
    "썸네일 스타일": "YouTube-thumbnail style, clear focal subject, vivid colors, high contrast",
    "미니멀": "minimal, clean, lots of negative space, simple shapes",
    "사진 스타일": "photorealistic, natural lighting",
  };
  const styleText = styleMap[style] || "clean blog thumbnail";
  return `Blog thumbnail image about "${keyword}". ${styleText}. 16:9 composition, no watermark, no gibberish text.`;
}

async function callGeminiImage(payload) {
  const { geminiKey } = await chrome.storage.sync.get(["geminiKey"]);
  if (!geminiKey) return { ok: false, error: "NO_KEY", message: "Gemini API 키가 없습니다. 설정에서 저장하세요." };
  const url = `${GEMINI_BASE}/${GEMINI_IMAGE_MODEL}:generateContent`;
  const prompt = buildImagePrompt(payload);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEN_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // 일부 모델은 responseModalities 지정이 필요할 수 있음 — 로컬에서 확인
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: "HTTP_" + res.status, message: `Gemini 오류(${res.status}): ${detail.slice(0, 400)}` };
    }
    const data = await res.json();
    // 응답에서 base64 이미지(inlineData) 추출
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData || p.inline_data);
    const inline = imgPart?.inlineData || imgPart?.inline_data;
    if (!inline?.data) {
      return { ok: false, error: "NO_IMAGE", message: "이미지 데이터가 응답에 없습니다. 모델 ID/응답 형식을 확인하세요.\n" + JSON.stringify(data).slice(0, 500) };
    }
    const mime = inline.mimeType || inline.mime_type || "image/png";
    return { ok: true, dataUrl: `data:${mime};base64,${inline.data}` };
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, error: "TIMEOUT", message: "이미지 생성 응답이 오지 않았습니다. 다시 시도하세요." };
    return { ok: false, error: "NETWORK", message: "네트워크 오류: " + (e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// ============ 메시지 라우팅 ============
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GEN_TEXT") { callClaude(msg.payload).then(sendResponse); return true; }
  if (msg?.type === "GEN_IMAGE") { callGeminiImage(msg.payload).then(sendResponse); return true; }
  if (msg?.type === "TEST_KEY") { testClaudeKey(msg.payload).then(sendResponse); return true; }
  if (msg?.type === "PING") {
    chrome.storage.sync.get(["anthropicKey", "geminiKey"]).then((s) =>
      sendResponse({ ok: true, hasClaude: !!s.anthropicKey, hasGemini: !!s.geminiKey })
    );
    return true;
  }
});
