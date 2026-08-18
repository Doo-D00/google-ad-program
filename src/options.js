// options.js — Claude/Gemini 키 및 모델 저장

const el = (id) => document.getElementById(id);
const statusEl = el("status");
function show(m, k) { statusEl.textContent = m; statusEl.className = "status " + (k || ""); }

// 서비스 워커가 잠들었거나 확장을 새로 로드한 직후에는 sendMessage 가 reject 된다.
// 감싸지 않으면 상태창이 "테스트 중…"에 그대로 멈춰 원인을 알 수 없다.
async function send(msg) {
  try {
    const r = await chrome.runtime.sendMessage(msg);
    if (!r) return { ok: false, message: "서비스 워커 응답이 없습니다. chrome://extensions 에서 확장을 새로고침(↻)하세요." };
    return r;
  } catch (e) {
    return { ok: false, message: "확장과 통신 실패: " + (e?.message || e) + "\nchrome://extensions 에서 새로고침(↻) 후 다시 시도하세요." };
  }
}

function currentValues() {
  return {
    anthropicKey: el("anthropicKey").value.trim(),
    claudeModel: el("claudeModel").value,
    geminiKey: el("geminiKey").value.trim(),
  };
}

chrome.storage.sync.get(["anthropicKey", "claudeModel", "geminiKey"]).then((s) => {
  if (s.anthropicKey) el("anthropicKey").value = s.anthropicKey;
  if (s.claudeModel) el("claudeModel").value = s.claudeModel;
  if (s.geminiKey) el("geminiKey").value = s.geminiKey;
});

el("save").addEventListener("click", async () => {
  await chrome.storage.sync.set(currentValues());
  show("저장했습니다.", "ok");
});

el("test").addEventListener("click", async () => {
  const v = currentValues();
  if (!v.anthropicKey) return show("Anthropic 키를 입력하세요.", "err");
  // 테스트 전에 화면의 모든 값을 저장한다(예전 코드는 Gemini 키를 날렸다).
  await chrome.storage.sync.set(v);

  const btn = el("test");
  btn.disabled = true;
  show(`테스트 중… (${v.claudeModel})`);
  // 본문 생성이 아니라 max_tokens=16 의 최소 요청만 보낸다. 몇 초면 끝나고 과금도 거의 없다.
  const resp = await send({ type: "TEST_KEY", payload: { key: v.anthropicKey, model: v.claudeModel } });
  btn.disabled = false;

  show(resp?.ok ? `성공! ${resp.model} 키가 정상입니다.` : "실패: " + (resp?.message || "오류"), resp?.ok ? "ok" : "err");
});
