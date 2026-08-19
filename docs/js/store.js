// store.js — 설정 저장. 서버가 없으므로 전부 이 브라우저의 localStorage 에만 남는다.
// GitHub Pages 는 공개 URL이지만 키는 소스에 없고 각자 브라우저에 저장되므로 다른 사람에게 노출되지 않는다.

const KEY = "gap.settings.v1";

const DEFAULTS = {
  // 글쓰기와 썸네일 모두 이 키 하나를 쓴다.
  geminiKey: "",
  geminiModel: "gemini-3.7-flash",
  googleClientId: "",
  blogId: "",
};

// 예전 설정에서 넘어올 때 지우는 항목들.
// - anthropicKey / claudeModel: 글쓰기를 Gemini 로 옮기면서 Claude 를 제거했다.
// - ghToken / ghOwner / ghRepo / ghBranch / ghPathPrefix: 썸네일을 GitHub 에 올리지 않고
//   본문에 data URI 로 직접 싣게 바꾸면서 필요 없어졌다.
// 남아 있어도 동작에 지장은 없지만, 안 쓰는 토큰을 브라우저에 계속 두지 않으려고 지운다.
const DROPPED = ["anthropicKey", "claudeModel", "ghToken", "ghOwner", "ghRepo", "ghBranch", "ghPathPrefix"];

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
