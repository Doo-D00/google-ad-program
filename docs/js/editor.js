// editor.js — 본문 편집 영역의 표시용 처리.
//
// 사용자는 HTML 을 보지 않는다. 워드처럼 글 위에서 바로 고친다.
// 채워야 할 빈칸은 노랗게 칠해서 눈에 띄게 하고, 내보낼 때는 그 칠을 벗긴다.
// (칠한 <mark> 가 티스토리로 넘어가면 형광펜이 그어진 채 발행된다.)

import { BLANKS } from "./gemini.js";

const BUTTON_SLOT_RE = /\[버튼\s*:[^\]]*\]/g;

// 칠을 벗긴다. 안의 글자는 그대로 남는다.
export function unmarkBlanks(html) {
  return String(html || "").replace(/<mark class="blank[^"]*"[^>]*>([\s\S]*?)<\/mark>/g, "$1");
}

// 빈칸과 버튼 자리를 칠한다. 두 번 칠하지 않도록 먼저 벗기고 시작한다.
export function markBlanks(html) {
  let s = unmarkBlanks(html);

  for (const b of BLANKS) {
    s = s.split(b).join(`<mark class="blank" title="여기를 클릭하고 직접 써 넣으세요">${b}</mark>`);
  }
  s = s.replace(BUTTON_SLOT_RE, (m) =>
    `<mark class="blank slot" title="왼쪽 '링크 버튼' 칸에서 채우세요">${m}</mark>`);

  return s;
}

