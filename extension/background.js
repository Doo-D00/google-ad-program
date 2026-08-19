// background.js — 받은 글을 잠깐 들고 있다가, 티스토리 글쓰기 탭이 열리면 건네준다.
//
// 왜 저장해 두나: 탭을 새로 열면 그 탭의 content script 가 준비될 때까지 시간이 걸린다.
// 미리 밀어 넣을 수 없으므로, 저쪽에서 준비되면 가져가게 한다.

const PENDING = "pendingPost";

function writeUrl(blogUrl) {
  const host = String(blogUrl || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) return "";
  return `https://${host}/manage/newpost/`;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PUBLISH") {
    const url = writeUrl(msg.blogUrl);
    if (!url) {
      sendResponse({ ok: false, error: "블로그 주소가 없습니다. 글 도우미 설정에 넣어 주세요." });
      return true;
    }
    // 30분이 지난 것은 버린다. 예전에 눌러 둔 글이 엉뚱한 때 채워지면 안 된다.
    chrome.storage.local.set({ [PENDING]: { title: msg.title, html: msg.html, at: Date.now() } }, () => {
      chrome.tabs.create({ url }, () => sendResponse({ ok: true }));
    });
    return true; // 비동기 응답
  }

  // 티스토리 쪽 content script 가 "채울 글 있어?" 하고 물어본다.
  if (msg?.type === "TAKE_PENDING") {
    chrome.storage.local.get(PENDING, (data) => {
      const p = data?.[PENDING];
      const fresh = p && Date.now() - (p.at || 0) < 30 * 60 * 1000;
      // 한 번 가져가면 지운다. 새로고침할 때마다 다시 채워지면 곤란하다.
      if (p) chrome.storage.local.remove(PENDING);
      sendResponse(fresh ? { post: p } : { post: null });
    });
    return true;
  }

  return false;
});
