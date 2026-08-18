// store.js — 설정 저장. 서버가 없으므로 전부 이 브라우저의 localStorage 에만 남는다.
// GitHub Pages 는 공개 URL이지만 키는 소스에 없고 각자 브라우저에 저장되므로 다른 사람에게 노출되지 않는다.

const KEY = "gap.settings.v1";

const DEFAULTS = {
  anthropicKey: "",
  claudeModel: "claude-sonnet-5",
  geminiKey: "",
  googleClientId: "",
  blogId: "",
  ghToken: "",
  // 이미지 저장소 기본값은 이 리포. 공개 리포라 jsDelivr 가 그대로 서빙한다.
  // 다른 리포를 쓰려면 설정에서 바꾸면 된다(브랜치 이름 주의 — 이 리포는 master).
  ghOwner: "Doo-D00",
  ghRepo: "google-ad-program",
  ghBranch: "master",
  ghPathPrefix: "images",
};

export function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch (_) {
    return { ...DEFAULTS };
  }
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
