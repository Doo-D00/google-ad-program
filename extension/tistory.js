// tistory.js — 티스토리 글쓰기 화면에 글을 채워 넣는다.
//
// ⚠ 남의 화면을 조작하는 코드다. 티스토리가 편집기를 바꾸면 깨진다.
// 그래서 선택자를 하나로 못 박지 않고 여러 방법으로 찾는다. 못 찾으면 조용히 실패하지 말고
// 화면에 무엇을 못 찾았는지 띄운다 — 그래야 고칠 수 있다.

(() => {
  const BOX_ID = "gap-panel";

  // ── 화면 알림 ──────────────────────────────────────────
  function panel(html, kind = "info") {
    let el = document.getElementById(BOX_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = BOX_ID;
      el.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;" +
        "font:13px/1.6 -apple-system,'Malgun Gothic',sans-serif;padding:14px 16px;border-radius:10px;" +
        "box-shadow:0 8px 30px rgba(0,0,0,.25);background:#fff;color:#1a202c;border:1px solid #e2e8f0";
      document.body.appendChild(el);
    }
    el.style.borderColor = kind === "err" ? "#e53e3e" : kind === "ok" ? "#38a169" : "#e2e8f0";
    el.innerHTML = html;
    return el;
  }

  const visible = (n) => {
    const r = n.getBoundingClientRect();
    return r.width > 80 && r.height > 20;
  };

  // ── 제목 칸 찾기 ───────────────────────────────────────
  function findTitle(doc) {
    const byId = doc.querySelector("#post-title-inp, input[name='title'], input#title");
    if (byId) return byId;

    const inputs = [...doc.querySelectorAll("input[type='text'], input:not([type]), textarea")].filter(visible);
    // 대개 "제목" 이 placeholder 나 aria-label 에 들어 있다.
    const hinted = inputs.find((i) =>
      /제목|title/i.test(`${i.placeholder || ""} ${i.getAttribute("aria-label") || ""} ${i.name || ""}`));
    if (hinted) return hinted;

    // 그래도 없으면 화면 위쪽의 첫 한 줄 입력칸.
    return inputs.find((i) => i.tagName === "INPUT" && i.getBoundingClientRect().top < 400) || null;
  }

  // ── 본문 편집 영역 찾기 ────────────────────────────────
  // 티스토리 편집기는 contenteditable 이거나 iframe 안에 들어 있을 수 있다. 둘 다 본다.
  function findBody() {
    const pick = (doc) =>
      [...doc.querySelectorAll("[contenteditable='true'], [contenteditable='']")]
        .filter(visible)
        .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || null;

    const direct = pick(document);
    if (direct) return { el: direct, doc: document, where: "본문(직접)" };

    for (const f of document.querySelectorAll("iframe")) {
      let d;
      try { d = f.contentDocument; } catch (_) { continue; } // 다른 출처면 못 본다
      if (!d) continue;
      const inner = pick(d);
      if (inner) return { el: inner, doc: d, where: "본문(iframe)" };
      if (d.body && d.body.isContentEditable) return { el: d.body, doc: d, where: "본문(iframe body)" };
    }
    return null;
  }

  // ── 채우기 ─────────────────────────────────────────────
  function setTitle(el, text) {
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
    // React 계열은 value 를 직접 넣으면 무시한다. 네이티브 setter 로 넣고 이벤트를 알린다.
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
    el.focus();
    if (setter) setter.call(el, text); else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setBody(target, html) {
    const { el, doc } = target;
    el.focus();
    try {
      // 편집기 자신의 입력 처리를 타도록 execCommand 로 넣는다.
      // innerHTML 을 직접 바꾸면 편집기 내부 상태와 어긋나 저장이 안 되는 경우가 있다.
      const sel = doc.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      if (doc.execCommand("insertHTML", false, html)) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return "insertHTML";
      }
    } catch (_) { /* 아래로 */ }

    el.innerHTML = html;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return "innerHTML";
  }

  // ── 발행 버튼 찾기 ─────────────────────────────────────
  function findPublish() {
    const cands = [...document.querySelectorAll("button, a, [role='button']")].filter(visible);
    return cands.find((b) => /^\s*(완료|발행|등록)\s*$/.test(b.textContent || "")) || null;
  }

  // ── 흐름 ───────────────────────────────────────────────
  chrome.runtime.sendMessage({ type: "TAKE_PENDING" }, (res) => {
    const post = res?.post;
    if (!post) return; // 사용자가 그냥 글쓰기 화면에 들어온 경우

    // 편집기가 늦게 뜬다. 잠깐 기다렸다 채운다.
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const titleEl = findTitle(document);
      const body = findBody();

      if (!body && tries < 20) return; // 최대 10초 기다린다
      clearInterval(timer);

      if (!body) {
        panel(
          `<b>본문 칸을 찾지 못했습니다.</b><br>티스토리 편집기가 바뀐 것 같습니다.<br>` +
          `글은 클립보드에 복사돼 있으니 <b>Ctrl+V</b> 로 붙여넣어 주세요.`, "err");
        return;
      }

      const okTitle = setTitle(titleEl, post.title || "");
      const how = setBody(body, post.html || "");

      panel(
        `<b>글을 채웠습니다.</b><br>` +
        `제목 ${okTitle ? "○" : "✕ (직접 입력해 주세요)"} · ${body.where} · ${how}<br>` +
        `<div style="margin-top:10px"><button id="gap-pub" style="padding:7px 14px;border:0;border-radius:7px;` +
        `background:#2563eb;color:#fff;font-weight:700;cursor:pointer">발행 버튼 누르기</button> ` +
        `<button id="gap-close" style="padding:7px 12px;border:1px solid #cbd5e0;border-radius:7px;` +
        `background:#fff;cursor:pointer">닫기</button></div>` +
        `<div style="margin-top:8px;color:#718096;font-size:11px">내용을 확인한 뒤 눌러 주세요. ` +
        `대표 이미지는 여기서 직접 올리셔야 합니다.</div>`, "ok");

      document.getElementById("gap-close").onclick = () => document.getElementById(BOX_ID)?.remove();
      document.getElementById("gap-pub").onclick = () => {
        const btn = findPublish();
        if (!btn) {
          panel(`<b>발행 버튼을 찾지 못했습니다.</b><br>화면의 발행 버튼을 직접 눌러 주세요.`, "err");
          return;
        }
        btn.click();
        panel(`발행 창을 열었습니다. 공개 설정을 확인하고 마무리해 주세요.`, "ok");
      };
    }, 500);
  });
})();
