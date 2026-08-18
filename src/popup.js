const c = document.getElementById("c"), g = document.getElementById("g");

chrome.runtime.sendMessage({ type: "PING" }).then((r) => {
  if (!r) throw new Error("no response");
  c.textContent = r.hasClaude ? "✅ 글쓰기(Claude) 키 등록됨" : "⚠ Claude 키 없음";
  c.className = "state " + (r.hasClaude ? "ok" : "warn");
  g.textContent = r.hasGemini ? "✅ 썸네일(Gemini) 키 등록됨" : "⚠ Gemini 키 없음";
  g.className = "state " + (r.hasGemini ? "ok" : "warn");
}).catch(() => {
  c.textContent = "상태 확인 불가 — 확장 새로고침(↻) 필요";
  c.className = "state warn";
  g.textContent = "";
});

document.getElementById("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
