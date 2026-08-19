// checks.js — 발행 전 완성도 점검(CLAUDE.md 6장).
//
// 경고만 하고 막지는 않는다. 판단은 사람이 한다.

import { BLANKS } from "./gemini.js";
import { countButtons, hasNotice, findPlaceholders } from "./buttons.js";

export const MIN_CHARS = 1000;
export const MIN_HEADINGS = 3;
export const MIN_BUTTONS = 2;

// 본문 글자 수는 "사람이 읽을 글"만 센다.
// HTML 태그, 빈칸 표시, 버튼 플레이스홀더는 빼야 1,000자 기준이 의미가 있다.
export function bodyTextLength(html) {
  let s = String(html || "");
  s = s.replace(/<[^>]*>/g, " ");           // 태그 제거
  s = s.replace(/\[버튼\s*:[^\]]*\]/g, " "); // 버튼 자리
  for (const b of BLANKS) s = s.split(b).join(" "); // 빈칸 4종
  s = s.replace(/&[a-z]+;|&#\d+;/gi, " ");   // 엔티티
  return s.replace(/\s+/g, "").length;
}

export function countBlanks(html) {
  const s = String(html || "");
  let n = 0;
  for (const b of BLANKS) n += s.split(b).length - 1;
  return n;
}

export function countHeadings(html) {
  return (String(html || "").match(/<h[2-4]\b/gi) || []).length;
}

// 화면에 그대로 뿌릴 수 있는 형태로 돌려준다.
export function runChecks(bodyHtml) {
  const chars = bodyTextLength(bodyHtml);
  const blanks = countBlanks(bodyHtml);
  const headings = countHeadings(bodyHtml);
  const btn = countButtons(bodyHtml);
  const placeholders = findPlaceholders(bodyHtml).length;
  const notice = hasNotice(bodyHtml);

  const list = [
    {
      key: "chars",
      ok: chars >= MIN_CHARS,
      label: `본문 ${MIN_CHARS.toLocaleString()}자 이상`,
      detail: `${chars.toLocaleString()}자`,
    },
    {
      key: "blanks",
      ok: blanks === 0 && placeholders === 0,
      label: "빈칸이 모두 채워짐",
      detail: blanks || placeholders
        ? `남은 빈칸 ${blanks}개${placeholders ? `, 버튼 자리 ${placeholders}개` : ""}`
        : "없음",
    },
    {
      key: "headings",
      ok: headings >= MIN_HEADINGS,
      label: `소제목 ${MIN_HEADINGS}개 이상`,
      detail: `${headings}개`,
    },
    {
      key: "buttons",
      ok: btn.total >= MIN_BUTTONS && btn.missingUrl === 0,
      label: `버튼 ${MIN_BUTTONS}개 이상, URL 채워짐`,
      detail: `${btn.total}개${btn.missingUrl ? `, URL 빈 것 ${btn.missingUrl}개` : ""}`,
    },
    {
      // 버튼이 없으면 고지도 필요 없다.
      key: "notice",
      ok: btn.total === 0 || notice,
      label: "제휴 고지 문구",
      detail: btn.total === 0 ? "버튼 없음 — 해당 없음" : notice ? "있음" : "없음",
    },
  ];

  return { list, allOk: list.every((c) => c.ok) };
}
