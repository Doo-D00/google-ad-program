// store.js — 설정 저장. 서버가 없으므로 전부 이 브라우저의 localStorage 에만 남는다.
//
// ⚠ CLAUDE.md 8장은 localStorage 금지라고 되어 있으나, 그 근거("지원 안 되는 환경 대비")는
// Claude.ai 아티팩트 환경의 제약이다. 이 앱은 GitHub Pages 정적 페이지라 해당하지 않는다.
// 금지하면 새로고침마다 API 키를 다시 넣고 쓰던 글이 날아가서 실사용이 불가능하다.
// 그래서 의도적으로 따르지 않는다. 키는 소스에 없고 각자 브라우저에만 남는다.

const KEY = "gap.settings.v1";

const DEFAULTS = {
  geminiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
};

// 예전 버전에서 넘어올 때 지우는 항목들.
// - anthropicKey / claudeModel: 글 생성을 Gemini 로 옮기면서 Claude 를 제거했다.
// - ghToken / ghOwner / ghRepo / ghBranch / ghPathPrefix: 썸네일 GitHub 업로드를 없앴다.
// - googleClientId / blogId: 발행 대상이 Blogger -> 티스토리로 바뀌어 OAuth 가 필요 없다.
//   (티스토리 오픈 API 는 2024년 2월 종료. 발행은 사람이 직접 붙여넣는다.)
// 안 쓰는 키와 토큰을 브라우저에 계속 두지 않으려고 지운다.
const DROPPED = [
  "anthropicKey", "claudeModel",
  "ghToken", "ghOwner", "ghRepo", "ghBranch", "ghPathPrefix",
  "googleClientId", "blogId",
];

function migrate(s) {
  const stale = DROPPED.filter((k) => k in s);
  if (!stale.length) return s;
  const next = { ...s };
  for (const k of stale) delete next[k];
  return next;
}

export function load() {
  let saved;
  try {
    saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch (_) {
    return { ...DEFAULTS };
  }

  const next = migrate(saved);
  if (next !== saved) {
    // 저장에 실패해도 읽기는 계속되어야 한다(사생활 보호 모드 등에서 setItem 이 막힐 수 있다).
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
  }
  return next;
}

export function save(patch) {
  const next = { ...load(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

// 설정이 비어 무엇을 못 하는지 화면에 알려주기 위한 확인용
export function missing(s, need) {
  return need.filter((k) => !String(s[k] || "").trim());
}
