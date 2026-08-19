// gemini.js — Gemini 로 썸네일 이미지를 생성한다.
// ⚠ 이미지 모델 ID 는 자주 갱신된다. 최신 확인: https://ai.google.dev/gemini-api/docs/image-generation
// 2026-08-19 문서 확인: gemini-2.5-flash-image 는 legacy 로 내려갔고 Gemini 3 계열이 현행이다.
//   gemini-3.1-flash-image      범용 기본값(속도/품질 균형)  ← 지금 쓰는 것
//   gemini-3.1-flash-lite-image 더 빠르고 싸다
//   gemini-3-pro-image          복잡한 구성이 필요할 때
export const IMAGE_MODEL = "gemini-3.1-flash-image";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 180000;

function buildPrompt({ keyword, style }) {
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${IMAGE_MODEL}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt({ keyword, style }) }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!res.ok) throw new Error(`Gemini 오류(${res.status}): ${(await res.text()).slice(0, 400)}`);

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const inline = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
    if (!inline) throw new Error("이미지 응답을 찾지 못했습니다. 모델 ID가 최신인지 확인하세요.");

    const mime = inline.mimeType || inline.mime_type || "image/png";
    return { base64: inline.data, mime, dataUrl: `data:${mime};base64,${inline.data}` };
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("이미지 생성 응답이 오지 않았습니다.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
