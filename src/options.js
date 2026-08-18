// options.js — Claude/Gemini 키 및 모델 저장

const el = (id) => document.getElementById(id);
const statusEl = el("status");
function show(m, k) { statusEl.textContent = m; statusEl.className = "status " + (k || ""); }

chrome.storage.sync.get(["anthropicKey", "claudeModel", "geminiKey"]).then((s) => {
  if (s.anthropicKey) el("anthropicKey").value = s.anthropicKey;
  if (s.claudeModel) el("claudeModel").value = s.claudeModel;
  if (s.geminiKey) el("geminiKey").value = s.geminiKey;
});

el("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    anthropicKey: el("anthropicKey").value.trim(),
    claudeModel: el("claudeModel").value,
    geminiKey: el("geminiKey").value.trim(),
  });
  show("저장했습니다.", "ok");
});

el("test").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    anthropicKey: el("anthropicKey").value.trim(),
    claudeModel: el("claudeModel").value,
  });
  if (!el("anthropicKey").value.trim()) return show("Anthropic 키를 입력하세요.", "err");
  show("테스트 중…");
  const resp = await chrome.runtime.sendMessage({
    type: "GEN_TEXT",
    payload: { keyword: "테스트", docType: "정보", lang: "한국어" },
  });
  show(resp?.ok ? "성공! Claude 키가 정상입니다." : "실패: " + (resp?.message || "오류"), resp?.ok ? "ok" : "err");
});
