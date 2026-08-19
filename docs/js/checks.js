// checks.js — 올리기 전 확인.
//
// 경고만 하고 막지는 않는다. 판단은 사람이 한다.
// 무엇이 왜 걸렸는지 이름까지 보여준다 — "남은 빈칸 3개" 만으로는 뭘 고쳐야 할지 모른다.

import { BLANKS } from "./gemini.js";
import { countButtons, hasNotice, findPlaceholders } from "./buttons.js";

export const MIN_CHARS = 1000;
export const MIN_HEADINGS = 3;

// 본문 글자 수는 "사람이 읽을 글"만 센다.
// HTML 태그, 채울 자리 표시는 빼야 1,000자 기준이 의미가 있다.
export function bodyTextLength(html) {
  let s = String(html || "");
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/\[버튼\s*:[^\]]*\]/g, " ");
  for (const b of BLANKS) s = s.split(b).join(" ");
  s = s.replace(/&[a-z]+;|&#\d+;/gi, " ");
  return s.replace(/\s+/g, "").length;
}

// 어떤 표시가 몇 개 남았는지까지 돌려준다.
export function blankDetail(html) {
  const s = String(html || "");
  const found = [];
  let total = 0;
  for (const b of BLANKS) {
    const n = s.split(b).length - 1;
    if (n > 0) { found.push(`${b} ${n}개`); total += n; }
  }
  const slots = findPlaceholders(s).length;
  if (slots > 0) found.push(`버튼 자리 ${slots}개`);
  return { total: total + slots, labels: found };
}

export function countBlanks(html) {
  return blankDetail(html).total;
}

export function countHeadings(html) {
  return (String(html || "").match(/<h[2-4]\b/gi) || []).length;
}

// 화면에 그대로 뿌릴 수 있는 형태로 돌려준다.
// help 는 "그래서 뭘 해야 하는지" 한 줄이다.
export function runChecks(bodyHtml) {
  const chars = bodyTextLength(bodyHtml);
  const blanks = blankDetail(bodyHtml);
  const headings = countHeadings(bodyHtml);
  const btn = countButtons(bodyHtml);
  const notice = hasNotice(bodyHtml);

  const list = [
    {
      key: "chars",
      ok: chars >= MIN_CHARS,
      label: "글 길이",
      detail: `${chars.toLocaleString()}자`,
      help: chars >= MIN_CHARS ? "" : `${MIN_CHARS.toLocaleString()}자는 넘어야 검색에 잘 잡힙니다. 내용을 더 채워 주세요.`,
    },
    {
      key: "blanks",
      ok: blanks.total === 0,
      label: "채우다 만 자리",
      detail: blanks.total === 0 ? "없음" : blanks.labels.join(", "),
      help: blanks.total === 0 ? "" : "글 안에 노란색(버튼 자리는 파란색)으로 칠해져 있습니다. 눌러서 직접 채우거나 지우세요.",
    },
    {
      key: "headings",
      ok: headings >= MIN_HEADINGS,
      label: "소제목 개수",
      detail: `${headings}개`,
      help: headings >= MIN_HEADINGS ? "" : `${MIN_HEADINGS}개 이상이면 읽기 좋습니다. 글에서 문단을 고르고 [소제목]을 눌러 보세요.`,
    },
    {
      key: "buttons",
      ok: btn.missingUrl === 0,
      label: "링크 버튼",
      detail: btn.total === 0 ? "없음" : `${btn.total}개${btn.missingUrl ? ` (주소 빈 것 ${btn.missingUrl}개)` : ""}`,
      help: btn.missingUrl ? "주소가 비어 있는 버튼이 있습니다. 누르면 아무 데도 가지 않습니다." : "",
    },
    {
      // 버튼이 없으면 고지도 필요 없다.
      key: "notice",
      ok: btn.total === 0 || notice,
      label: "제휴 안내 문구",
      detail: btn.total === 0 ? "버튼이 없어 필요 없음" : notice ? "있음" : "없음",
      help: btn.total > 0 && !notice ? "버튼을 넣으면 자동으로 붙습니다. 지우셨다면 다시 넣어 주세요." : "",
    },
  ];

  return { list, allOk: list.every((c) => c.ok) };
}
