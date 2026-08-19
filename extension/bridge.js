// bridge.js — 글 도우미 웹앱과 확장 프로그램을 잇는다.
//
// 웹앱은 확장을 직접 부를 수 없다(확장 ID를 알아야 하고, 개발자 모드로 설치하면 ID가 매번 바뀐다).
// 그래서 웹앱은 window.postMessage 로 던지고, 이 스크립트가 받아서 확장에 넘긴다.

const TAG = "gap-tistory";

// 웹앱이 "확장이 깔려 있나?" 를 알 수 있게 표시를 남긴다.
// document_start 에 돌아서 웹앱 스크립트보다 먼저 찍힌다.
document.documentElement.dataset.gapExtension = chrome.runtime.getManifest().version;

window.addEventListener("message", (e) => {
  // 다른 사이트가 심어 놓은 메시지를 받지 않도록 같은 창에서 온 것만 받는다.
  if (e.source !== window) return;
  const msg = e.data;
  if (!msg || msg.tag !== TAG || msg.type !== "PUBLISH") return;

  chrome.runtime.sendMessage(
    { type: "PUBLISH", title: String(msg.title || ""), html: String(msg.html || ""), blogUrl: String(msg.blogUrl || "") },
    (res) => {
      window.postMessage({ tag: TAG, type: "PUBLISH_RESULT", ok: !!res?.ok, error: res?.error || "" }, "*");
    }
  );
});
