// store.js — 설정 저장. 서버가 없으므로 전부 이 브라우저의 localStorage 에만 남는다.
// GitHub Pages 는 공개 URL이지만 키는 소스에 없고 각자 브라우저에 저장되므로 다른 사람에게 노출되지 않는다.

const KEY = "gap.settings.v1";

// 2026-08 계정 이름 변경: Doo-D00 → dev-doo. 옛 이름은 이미 남에게 풀려 있으므로 그대로 두면 위험하다.
const OLD_OWNER = "doo-d00";

const DEFAULTS = {
  anthropicKey: "",
  claudeModel: "claude-sonnet-5",
  geminiKey: "",
  googleClientId: "",
  blogId: "",
  ghToken: "",
  // 이미지 저장소 기본값은 이 리포. 공개 리포라 jsDelivr 가 그대로 서빙한다.
  // 다른 리포를 쓰려면 설정에서 바꾸면 된다(브랜치 이름 주의 — 이 리포는 master).
  ghOwner: "dev-doo",
  ghRepo: "google-ad-program",
  ghBranch: "master",
  ghPathPrefix: "images",
};

// 이름 변경 전에 저장해둔 설정이 브라우저에 남아 있으면 업로드가 404 로 깨진다.
// 옛 owner 일 때만 새 이름으로 갈아끼운다 — 다른 리포를 쓰고 있으면 건드리지 않는다.
function migrate(s) {
  if (String(s.ghOwner || "").toLowerCase() !== OLD_OWNER) return s;
  return { ...s, ghOwner: DEFAULTS.ghOwner };
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
