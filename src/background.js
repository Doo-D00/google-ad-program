// background.js — 서비스 워커 (AI 호출 중계)
// - 텍스트 생성: Claude (Anthropic Messages API)
// - 이미지 생성: Gemini (Google Generative Language API)
// API 키는 코드에 없고 chrome.storage.sync 에 저장된 사용자 키를 사용한다.

// ============ Claude (텍스트) ============
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

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

async function callClaude(payload) {
  const { anthropicKey, claudeModel } = await chrome.storage.sync.get(["anthropicKey", "claudeModel"]);
  if (!anthropicKey) return { ok: false, error: "NO_KEY", message: "Anthropic API 키가 없습니다. 설정에서 저장하세요." };
  const model = claudeModel || "claude-sonnet-5";
  const { system, user } = buildTextPrompt(payload);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: "HTTP_" + res.status, message: `Claude 오류(${res.status}): ${detail}` };
    }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: "NETWORK", message: "네트워크 오류: " + (e?.message || e) };
  }
}

// ============ Gemini (이미지) ============
// NOTE(로컬 빌드 시 확인): Gemini 이미지 모델 버전은 자주 올라갑니다.
//   현재 문서(https://ai.google.dev/gemini-api/docs/image-generation)에서
//   최신 이미지 생성 모델 ID를 확인해 GEMINI_IMAGE_MODEL 을 갱신하세요.
//   아래는 안정적으로 검증된 generateContent + inlineData 방식(베이스라인)입니다.
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"; // TODO: 최신(예: gemini-3.x-flash-image)으로 확인 후 갱신
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
  try {
    const res = await fetch(url, {
      method: "POST",
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
      return { ok: false, error: "HTTP_" + res.status, message: `Gemini 오류(${res.status}): ${detail}` };
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
    return { ok: false, error: "NETWORK", message: "네트워크 오류: " + (e?.message || e) };
  }
}

// ============ 메시지 라우팅 ============
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GEN_TEXT") { callClaude(msg.payload).then(sendResponse); return true; }
  if (msg?.type === "GEN_IMAGE") { callGeminiImage(msg.payload).then(sendResponse); return true; }
  if (msg?.type === "PING") {
    chrome.storage.sync.get(["anthropicKey", "geminiKey"]).then((s) =>
      sendResponse({ ok: true, hasClaude: !!s.anthropicKey, hasGemini: !!s.geminiKey })
    );
    return true;
  }
});
