chrome.runtime.sendMessage({ type: "PING" }).then((r) => {
  const c = document.getElementById("c"), g = document.getElementById("g");
  c.textContent = r?.hasClaude ? "✅ 글쓰기(Claude) 키 등록됨" : "⚠ Claude 키 없음";
  c.className = "state " + (r?.hasClaude ? "ok" : "warn");
  g.textContent = r?.hasGemini ? "✅ 썸네일(Gemini) 키 등록됨" : "⚠ Gemini 키 없음";
  g.className = "state " + (r?.hasGemini ? "ok" : "warn");
}).catch(() => { document.getElementById("c").textContent = "상태 확인 불가"; });

document.getElementById("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
