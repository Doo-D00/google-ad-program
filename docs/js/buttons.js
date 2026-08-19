// buttons.js — 제휴 버튼 HTML 과 플레이스홀더 변환.
//
// 티스토리 HTML 모드는 외부 CSS 와 class 를 유실시킨다. 그래서 스타일을 전부
// style 속성에 직접 박는다(CLAUDE.md 5장). class 로 빼지 말 것 — 버튼이 맨 링크로 보인다.

import { escAttr, esc } from "./markdown.js";

// 제휴/광고 링크는 구글 정책상 sponsored 표기 의무다. nofollow 도 같이 붙인다.
const REL = "nofollow sponsored noopener";

export const AFFILIATE_NOTICE = "이 글은 제휴 링크를 포함합니다.";

// 완성도 체크가 이 문구로 고지 유무를 판단한다. 문구를 바꾸면 checks.js 도 같이 본다.
export function noticeHtml() {
  return `<p style="margin:24px 0 0; font-size:13px; color:#6b7280;">${esc(AFFILIATE_NOTICE)}</p>`;
}

export function buttonHtml({ text, url }) {
  return (
    `<div style="text-align:center; margin:28px 0;">` +
    `<a href="${escAttr(url)}" target="_blank" rel="${REL}" ` +
    `style="display:inline-block; background:#2563eb; color:#ffffff; ` +
    `padding:15px 32px; border-radius:10px; font-size:17px; ` +
    `font-weight:700; text-decoration:none; ` +
    `box-shadow:0 3px 10px rgba(37,99,235,0.3);">` +
    `${esc(text)} →</a></div>`
  );
}

// 생성된 초안에는 "[버튼: 텍스트 | URL]" 이 글자 그대로 들어 있다.
// 모델이 안내 문구를 조금 바꿔 넣는 경우가 있어 대괄호 안을 느슨하게 잡는다.
const PLACEHOLDER_RE = /\[버튼\s*:\s*([^\]|]*)(?:\|([^\]]*))?\]/g;

// 본문에서 버튼 자리를 찾는다. 채워야 할 순서대로 돌려준다.
export function findPlaceholders(body) {
  const out = [];
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  let m;
  while ((m = re.exec(String(body || ""))) !== null) {
    const rawText = (m[1] || "").trim();
    const rawUrl = (m[2] || "").trim();
    out.push({
      raw: m[0],
      index: m.index,
      // 모델이 남긴 안내어("텍스트", "URL")는 값이 아니라 빈칸으로 본다.
      text: /^텍스트$/.test(rawText) ? "" : rawText,
      url: /^URL$/i.test(rawUrl) ? "" : rawUrl,
    });
  }
  return out;
}

export function hasPlaceholder(body) {
  return findPlaceholders(body).length > 0;
}

// 첫 번째로 나오는 플레이스홀더 하나를 버튼 HTML 로 바꾼다.
// 같은 문자열이 여러 번 나와도 하나씩만 바꾸도록 인덱스로 자른다.
export function replaceAt(body, index, raw, html) {
  const s = String(body || "");
  if (s.slice(index, index + raw.length) !== raw) return s;
  return s.slice(0, index) + html + s.slice(index + raw.length);
}

// 본문에 이미 제휴 고지가 있는지. 문구 일부만 있어도 있는 것으로 본다.
export function hasNotice(body) {
  return /제휴\s*링크를?\s*포함/.test(String(body || ""));
}

// 고지 문구를 본문 맨 끝에 붙인다. 이미 있으면 그대로 둔다.
export function appendNotice(body) {
  const s = String(body || "");
  if (hasNotice(s)) return s;
  const glue = s && !s.endsWith("\n") ? "\n" : "";
  return s + glue + noticeHtml() + "\n";
}

// 본문에 들어 있는 버튼 개수와 URL 이 비어 있는 버튼 수.
export function countButtons(body) {
  const s = String(body || "");
  const anchors = s.match(/<a\b[^>]*rel="[^"]*sponsored[^"]*"[^>]*>/g) || [];
  const empty = anchors.filter((a) => /href="\s*"/.test(a)).length;
  return { total: anchors.length, missingUrl: empty };
}
