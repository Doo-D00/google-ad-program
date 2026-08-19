// embed.js — 썸네일을 본문에 data URI 로 직접 싣기 위해 크기를 줄인다.
//
// Blogger API v3 에는 이미지 업로드 엔드포인트가 없다. 예전에는 GitHub 에 올리고
// jsDelivr URL 을 넣었지만, 키를 Gemini 하나로 통일하면서 GitHub 토큰을 쓰지 않기로 했다.
// 그래서 이미지를 본문 HTML 안에 base64 로 싣는다.
//
// ⚠ 원본을 그대로 실으면 글이 몇 MB 가 되어 게시가 실패하거나 편집기가 느려진다.
// 가로 폭을 제한하고 JPEG 로 다시 인코딩해서 크기를 떨어뜨린다.

export const MAX_WIDTH = 1200;
export const JPEG_QUALITY = 0.82;

// 이 이상이면 사용자에게 경고한다. Blogger 가 정확히 몇 바이트에서 막는지는 문서화되어
// 있지 않아, 안전하게 잡은 값이다.
export const WARN_BYTES = 900 * 1024;

// data URI 의 실제 전송 바이트 수(문자열 길이 그대로가 본문에 들어간다).
export function dataUrlBytes(dataUrl) {
  return typeof dataUrl === "string" ? dataUrl.length : 0;
}

export function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + "MB";
  return Math.round(bytes / 1024) + "KB";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    img.src = src;
  });
}

// data: 원본은 캔버스를 오염시키지 않으므로 toDataURL 이 그대로 동작한다.
export async function shrinkToDataUrl(dataUrl, { maxWidth = MAX_WIDTH, quality = JPEG_QUALITY } = {}) {
  const img = await loadImage(dataUrl);
  const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // JPEG 는 투명도가 없다. 깔지 않으면 투명 부분이 검게 나온다.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL("image/jpeg", quality);
  // 줄인 게 오히려 크면(작은 원본 등) 원본을 쓴다.
  const best = out.length < dataUrl.length ? out : dataUrl;
  return { dataUrl: best, width: w, height: h, bytes: dataUrlBytes(best) };
}
