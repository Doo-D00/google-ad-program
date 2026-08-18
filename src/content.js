// content.js — Blogger 편집기에 3탭 패널(AI 글쓰기 / AI 썸네일 / 버튼 설정)을 삽입한다.
// 편집기 DOM 삽입은 사이트 구조에 따라 달라질 수 있어, 항상 "복사" 대체 경로를 제공한다.
// ※ 로컬 Claude Code 작업 포인트는 CLAUDE.md의 "빌드 단계"와 아래 TODO 주석 참고.

(function () {
  if (window.__gapLoaded) return;
  window.__gapLoaded = true;

  // ---------- FAB ----------
  const fab = document.createElement("button");
  fab.className = "gap-fab";
  fab.type = "button";
  fab.textContent = "✦ AI 도구";
  document.body.appendChild(fab);

  // ---------- 패널 ----------
  const panel = document.createElement("div");
  panel.className = "gap-panel gap-hidden";
  panel.innerHTML = `
    <div class="gap-head">
      <span>Blogger AI 도구</span>
      <span class="gap-head-actions"><button type="button" class="gap-diag" title="편집기 인식 상태 진단">🛠</button><button type="button" class="gap-close" title="닫기">✕</button></span>
    </div>
    <div class="gap-tabs">
      <button type="button" class="gap-tab gap-active" data-tab="write">AI 글쓰기</button>
      <button type="button" class="gap-tab" data-tab="thumb">AI 썸네일</button>
      <button type="button" class="gap-tab" data-tab="button">버튼 설정</button>
    </div>

    <!-- 탭 1: AI 글쓰기 (Claude) -->
    <section class="gap-body" data-panel="write">
      <label class="gap-label">주제 키워드</label>
      <textarea class="gw-keyword" rows="3" placeholder="키워드나 질문을 입력하세요"></textarea>
      <label class="gap-label">글 유형</label>
      <select class="gw-type">
        <option>유틸리티</option><option>리뷰</option><option>정보</option><option>뉴스</option>
      </select>
      <label class="gap-label">언어 선택</label>
      <select class="gw-lang"><option>한국어</option><option>English</option></select>
      <button type="button" class="gap-primary gw-run">AI 콘텐츠 생성</button>
      <div class="gap-status gw-status"></div>
      <textarea class="gw-out" rows="8" placeholder="결과가 여기에 표시됩니다."></textarea>
      <div class="gap-row">
        <button type="button" class="gap-copy" data-src="gw-out">복사</button>
        <button type="button" class="gap-insert" data-src="gw-out">편집기에 삽입</button>
      </div>
    </section>

    <!-- 탭 2: AI 썸네일 (Gemini) -->
    <section class="gap-body gap-hidden" data-panel="thumb">
      <label class="gap-label">주제 키워드</label>
      <input class="gt-keyword" type="text" placeholder="예) 계란찜 만드는법" />
      <p class="gap-hint">입력한 키워드가 썸네일 이미지의 주제로 사용됩니다.</p>
      <label class="gap-label">생성 방식</label>
      <select class="gt-engine"><option>Gemini 스타일</option></select>
      <label class="gap-label">썸네일 스타일</label>
      <select class="gt-style">
        <option>포스터 스타일</option><option>썸네일 스타일</option><option>미니멀</option><option>사진 스타일</option>
      </select>
      <button type="button" class="gap-primary gap-danger gt-run">AI 썸네일 생성</button>
      <div class="gap-status gt-status"></div>
      <div class="gt-preview"></div>
      <div class="gap-row gt-actions gap-hidden">
        <button type="button" class="gt-download">이미지 저장</button>
        <button type="button" class="gt-insert">편집기에 삽입</button>
      </div>
    </section>

    <!-- 탭 3: 버튼 설정 (HTML 마크업 삽입) -->
    <section class="gap-body gap-hidden" data-panel="button">
      <label class="gap-label">버튼 텍스트</label>
      <input class="gb-text" type="text" placeholder="예) 월드컵 중계 바로가기->" />
      <label class="gap-label">버튼 URL</label>
      <input class="gb-url" type="text" placeholder="https://example.com/..." />
      <label class="gap-label">버튼 색상</label>
      <input class="gb-color" type="color" value="#2b6cb0" />
      <button type="button" class="gap-primary gb-run">버튼 마크업 만들기</button>
      <div class="gap-status gb-status"></div>
      <label class="gap-label">생성된 HTML</label>
      <textarea class="gb-out" rows="5" placeholder="여기에 HTML이 생성됩니다."></textarea>
      <div class="gap-row">
        <button type="button" class="gap-copy" data-src="gb-out">복사</button>
        <button type="button" class="gb-insert">HTML 모드에 삽입</button>
      </div>
      <p class="gap-hint">Blogger 편집기의 <b>HTML 보기</b> 모드에서 삽입하면 버튼이 그대로 적용됩니다.</p>
    </section>
  `;
  document.body.appendChild(panel);
  const $ = (s) => panel.querySelector(s);
  const $all = (s) => panel.querySelectorAll(s);

  // ---------- 열기/닫기 & 탭 전환 ----------
  fab.addEventListener("click", () => panel.classList.toggle("gap-hidden"));
  $(".gap-close").addEventListener("click", () => panel.classList.add("gap-hidden"));
  $all(".gap-tab").forEach((t) =>
    t.addEventListener("click", () => {
      $all(".gap-tab").forEach((x) => x.classList.remove("gap-active"));
      t.classList.add("gap-active");
      const name = t.dataset.tab;
      $all("[data-panel]").forEach((p) => p.classList.toggle("gap-hidden", p.dataset.panel !== name));
    })
  );

  // className 을 통째로 덮어쓰면 gw-status 같은 식별용 클래스까지 지워져
  // 다음 status() 호출에서 요소를 못 찾는다. 상태 클래스만 교체한다.
  const STATUS_KINDS = ["gap-ok", "gap-warn", "gap-error", "gap-loading"];
  function status(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove(...STATUS_KINDS);
    if (kind) el.classList.add("gap-" + kind);
  }

  // ============ 탭1: 글쓰기 ============
  $(".gw-run").addEventListener("click", async () => {
    const keyword = $(".gw-keyword").value.trim();
    if (!keyword) return status($(".gw-status"), "키워드를 입력하세요.", "warn");
    status($(".gw-status"), "생성 중…", "loading");
    $(".gw-out").value = "";
    const resp = await chrome.runtime.sendMessage({
      type: "GEN_TEXT",
      payload: { keyword, docType: $(".gw-type").value, lang: $(".gw-lang").value },
    });
    if (resp?.ok) { $(".gw-out").value = resp.text; status($(".gw-status"), "완료", "ok"); }
    else status($(".gw-status"), resp?.message || "오류", "error");
  });

  // ============ 탭2: 썸네일 ============
  let lastImageDataUrl = null;
  $(".gt-run").addEventListener("click", async () => {
    const keyword = $(".gt-keyword").value.trim();
    if (!keyword) return status($(".gt-status"), "키워드를 입력하세요.", "warn");
    status($(".gt-status"), "이미지 생성 중… (10초 내외)", "loading");
    $(".gt-preview").innerHTML = "";
    $(".gt-actions").classList.add("gap-hidden");
    const resp = await chrome.runtime.sendMessage({
      type: "GEN_IMAGE",
      payload: { keyword, style: $(".gt-style").value },
    });
    if (resp?.ok) {
      lastImageDataUrl = resp.dataUrl;
      const img = document.createElement("img");
      img.src = resp.dataUrl; img.className = "gt-img";
      $(".gt-preview").appendChild(img);
      $(".gt-actions").classList.remove("gap-hidden");
      status($(".gt-status"), "완료", "ok");
    } else status($(".gt-status"), resp?.message || "오류", "error");
  });

  $(".gt-download").addEventListener("click", () => {
    if (!lastImageDataUrl) return;
    const a = document.createElement("a");
    a.href = lastImageDataUrl; a.download = "thumbnail.png"; a.click();
  });
  $(".gt-insert").addEventListener("click", () => {
    if (!lastImageDataUrl) return;
    // data URL 을 그대로 넣으면 글 용량이 커지고 Blogger 가 저장할 때 지울 수도 있다.
    // 가장 확실한 경로는 [이미지 저장] 후 Blogger 업로드 버튼으로 올리는 것.
    // 래퍼 <div>로 가운데 정렬하면 안 된다 — 캐럿이 <p> 안에 있을 때
    // execCommand 가 <p> 안의 <div> 를 평탄화하면서 정렬이 날아간다.
    // img 자체에 display:block;margin:auto 를 주면 어디에 들어가든 유지된다.
    const r = insertHTML(`<img src="${lastImageDataUrl}" style="display:block;margin:0 auto;max-width:100%"/>`);
    status(
      $(".gt-status"),
      r.ok ? r.message + " 저장 후에도 남아있지 않으면 [이미지 저장] 후 직접 업로드하세요." : r.message,
      r.ok ? "ok" : "warn"
    );
  });

  // ============ 탭3: 버튼 마크업 ============
  $(".gb-run").addEventListener("click", () => {
    const text = $(".gb-text").value.trim();
    const url = $(".gb-url").value.trim();
    const color = $(".gb-color").value;
    if (!text || !url) return status($(".gb-status"), "버튼 텍스트와 URL을 모두 입력하세요.", "warn");
    const html =
      `<div style="text-align:center;margin:24px 0;">` +
      `<a href="${url}" target="_blank" rel="noopener" ` +
      `style="display:inline-block;background:${color};color:#fff;text-decoration:none;` +
      `padding:14px 28px;border-radius:8px;font-weight:700;font-size:16px;">${text}</a></div>`;
    $(".gb-out").value = html;
    status($(".gb-status"), "생성 완료 — 복사하거나 HTML 모드에 삽입하세요.", "ok");
  });
  $(".gb-insert").addEventListener("click", () => {
    const html = $(".gb-out").value;
    if (!html) return status($(".gb-status"), "먼저 마크업을 생성하세요.", "warn");
    const r = insertHTML(html);
    status($(".gb-status"), r.message, r.ok ? "ok" : "warn");
  });

  // ============ 공통: 복사 / 삽입 ============
  $all(".gap-copy").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const src = panel.querySelector("." + btn.dataset.src);
      const text = src?.value || "";
      if (!text) return;
      try { await navigator.clipboard.writeText(text); } catch (_) { src.select(); document.execCommand("copy"); }
      btn.textContent = "복사됨!"; setTimeout(() => (btn.textContent = "복사"), 1200);
    })
  );
  $all(".gap-insert").forEach((btn) =>
    btn.addEventListener("click", () => {
      const src = panel.querySelector("." + btn.dataset.src);
      const text = (src?.value || "").trim();
      if (!text) return;
      // Claude 출력은 마크다운이다. 그대로 넣으면 편집기에 ## 와 ** 가 그대로 보인다.
      // HTML 로 바꿔 넣으면 쓰기 모드에서는 서식이 적용되고, HTML 모드에서는 소스가 들어간다.
      const r = insertHTML(mdToHtml(text));
      const st = btn.closest("[data-panel]")?.querySelector(".gap-status");
      if (st) status(st, r.message, r.ok ? "ok" : "warn");
    })
  );

  // ============ 진단 (실제 Blogger DOM 확인용) ============
  $(".gap-diag").addEventListener("click", async () => {
    const t = resolveTarget();
    const desc = (c) =>
      `[${c.kind}] <${c.el.tagName.toLowerCase()}> id=${c.el.id || "-"} ` +
      `class=${String(c.el.className || "-").slice(0, 60)} area=${Math.round(c.area || 0)} ` +
      `doc=${c.doc === document ? "top" : "iframe#" + (frameNameOf(c.doc) || "?")}`;
    const list = collectTargets();
    const report = [
      "URL: " + location.href,
      "편집 후보: " + list.length + "개",
      "선택될 타깃: " + (t ? desc(t) : "없음"),
      "기억된 캐럿: " + (lastRange ? "rich(range)" : lastSel ? "html(" + lastSel.join("~") + ")" : "없음"),
      "",
      ...list.map((c, i) => i + 1 + ". " + desc(c)),
    ].join("\n");
    console.log("[gap] 편집기 진단\n" + report);
    let copied = false;
    try { await navigator.clipboard.writeText(report); copied = true; } catch (_) {}
    // alert 은 쓰지 않는다 — 텍스트 복사가 안 되고 페이지를 멈춘다.
    diagOut.textContent = report + "\n\n(콘솔 출력" + (copied ? " + 클립보드 복사" : "") + " 완료)";
    diagOut.classList.remove("gap-hidden");
  });
  const diagOut = document.createElement("pre");
  diagOut.className = "gap-diag-out gap-hidden";
  diagOut.addEventListener("click", () => diagOut.classList.add("gap-hidden")); // 클릭하면 닫힘
  panel.appendChild(diagOut);

  // ================================================================
  // 편집기 삽입 엔진 (P2)
  // ----------------------------------------------------------------
  // Blogger 편집기를 다룰 때의 핵심 제약 3가지:
  //  1) 패널 버튼을 누르는 순간 document.activeElement 는 패널이 된다.
  //     삽입 시점에 편집기를 찾는 건 이미 늦다. "패널 밖에서 마지막으로
  //     포커스됐던 편집 영역과 캐럿"을 평소에 기억해 두고 그것을 복원한다.
  //  2) 쓰기(리치) 모드는 iframe + contenteditable, HTML 모드는 textarea 라
  //     삽입 방법이 완전히 다르다. 타깃 종류를 보고 분기한다.
  //  3) 삽입 후 input 이벤트를 발생시켜야 Blogger 내부 모델이 변경을 인지해
  //     자동 저장에 반영된다.
  // ================================================================

  // ---------- 문서 / 후보 수집 ----------
  function inPanel(node) {
    return node === panel || node === fab || panel.contains(node) || fab.contains(node);
  }
  function frameNameOf(doc) {
    try { const f = doc.defaultView.frameElement; return f && (f.id || f.className || f.name); } catch (_) { return null; }
  }
  // 같은 오리진 문서만 순회한다(교차 오리진 iframe 은 접근 시 예외가 난다).
  function allDocs(root, depth, acc) {
    root = root || document; depth = depth || 0; acc = acc || [];
    acc.push(root);
    if (depth >= 3) return acc;
    root.querySelectorAll("iframe, frame").forEach((f) => {
      let d = null;
      try { d = f.contentDocument; } catch (_) {}
      if (d && d.body) allDocs(d, depth + 1, acc);
    });
    return acc;
  }
  function areaOf(el) {
    try { const r = el.getBoundingClientRect(); return r.width * r.height; } catch (_) { return 0; }
  }
  // kind: "rich"(contenteditable) | "html"(textarea). 넓은 순으로 정렬해 본문이 앞에 오게 한다.
  function collectTargets() {
    const out = [];
    allDocs().forEach((doc) => {
      const win = doc.defaultView;
      const push = (el, kind) => {
        if (!el || inPanel(el)) return;
        const area = areaOf(el);
        if (area < 1000) return; // 숨겨졌거나 아이콘 크기면 본문이 아니다
        out.push({ el, doc, win, kind, area });
      };
      if (doc.body && doc.body.isContentEditable) push(doc.body, "rich");
      doc.querySelectorAll('[contenteditable=""],[contenteditable="true"]').forEach((el) => push(el, "rich"));
      doc.querySelectorAll("textarea").forEach((el) => push(el, "html"));
    });
    return out.sort((a, b) => b.area - a.area);
  }

  // ---------- 마지막 편집 위치 기억 ----------
  let lastTarget = null; // { el, doc, win, kind }
  let lastRange = null;  // rich 모드 캐럿
  let lastSel = null;    // html 모드 캐럿 [start, end]

  function rememberFrom(doc) {
    const el = doc.activeElement;
    if (!el || inPanel(el)) return;
    if (el.tagName === "TEXTAREA") {
      lastTarget = { el, doc, win: doc.defaultView, kind: "html" };
      lastSel = [el.selectionStart, el.selectionEnd];
      lastRange = null;
      return;
    }
    const host = el.isContentEditable ? el : (doc.body && doc.body.isContentEditable ? doc.body : null);
    if (!host) return;
    lastTarget = { el: host, doc, win: doc.defaultView, kind: "rich" };
    lastSel = null;
    try {
      const s = doc.getSelection();
      if (s && s.rangeCount) lastRange = s.getRangeAt(0).cloneRange();
    } catch (_) {}
  }

  const watchedDocs = new WeakSet();
  function watchDoc(doc) {
    if (!doc || watchedDocs.has(doc)) return;
    watchedDocs.add(doc);
    const h = () => rememberFrom(doc);
    ["focusin", "mouseup", "keyup", "selectionchange"].forEach((ev) => {
      try { doc.addEventListener(ev, h, true); } catch (_) {}
    });
  }
  // 편집기 iframe 은 늦게 붙고, 쓰기 <-> HTML 모드 전환 때 새로 생기기도 한다.
  function watchAll() { allDocs().forEach(watchDoc); }
  watchAll();
  setInterval(watchAll, 2000);

  function resolveTarget() {
    if (lastTarget && lastTarget.el.isConnected && areaOf(lastTarget.el) > 0) return lastTarget;
    // 기억해 둔 타깃이 사라졌다면(모드 전환 등) 캐럿 정보도 함께 버린다.
    lastRange = null; lastSel = null;
    return collectTargets()[0] || null;
  }

  // ---------- 실제 삽입 ----------
  // 프레임워크가 value setter 를 가로챈 경우에도 값이 들어가도록 네이티브 setter 를 쓴다.
  function setValue(el, v) {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    if (d && d.set) d.set.call(el, v); else el.value = v;
  }
  function fireInput(el, data) {
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: data || null }));
    } catch (_) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function htmlToPlain(html) {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent || "";
  }

  // HTML 모드(textarea): 기억해 둔 캐럿 위치에 소스를 끼워 넣는다.
  function insertIntoTextarea(t, text) {
    const el = t.el;
    const len = el.value.length;
    let s = lastSel ? lastSel[0] : len;
    let e = lastSel ? lastSel[1] : len;
    if (s > len || e > len) { s = e = len; } // 내용이 바뀌어 캐럿이 범위를 벗어난 경우
    const before = el.value.slice(0, s);
    const after = el.value.slice(e);
    const glue = before && !before.endsWith("\n") ? "\n" : "";
    const body = glue + text + "\n";
    setValue(el, before + body + after);
    const caret = before.length + body.length;
    el.focus();
    try { el.setSelectionRange(caret, caret); } catch (_) {}
    lastSel = [caret, caret];
    fireInput(el, text);
    return true;
  }

  // 쓰기 모드(contenteditable): 캐럿 복원 후 3단계로 시도한다.
  function insertIntoRich(t, html) {
    const doc = t.doc, win = t.win || doc.defaultView;
    try { win.focus(); } catch (_) {}
    try { t.el.focus(); } catch (_) {}

    const sel = doc.getSelection();
    try {
      sel.removeAllRanges();
      if (lastRange && lastRange.startContainer && lastRange.startContainer.isConnected) {
        sel.addRange(lastRange);
      } else {
        const r = doc.createRange();
        r.selectNodeContents(t.el);
        r.collapse(false); // 캐럿 기록이 없으면 본문 맨 끝
        sel.addRange(r);
      }
    } catch (_) {}

    // 1순위: execCommand — 편집기 자체 실행취소 스택에 남는 유일한 방법.
    let how = null;
    try { if (doc.execCommand && doc.execCommand("insertHTML", false, html)) how = "insertHTML"; } catch (_) {}

    // 2순위: 붙여넣기 이벤트 — 에디터가 paste 를 가로채 자체 처리하는 구조일 때 대응.
    //        preventDefault 되면(dispatchEvent 가 false) 에디터가 처리했다는 뜻.
    if (!how) {
      try {
        const dt = new DataTransfer();
        dt.setData("text/html", html);
        dt.setData("text/plain", htmlToPlain(html));
        const handled = !t.el.dispatchEvent(
          new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })
        );
        if (handled) how = "paste";
      } catch (_) {}
    }

    // 3순위: DOM 직접 삽입 — 거의 항상 성공하지만 편집기 실행취소에는 남지 않는다.
    if (!how) {
      try {
        const holder = doc.createElement("div");
        holder.innerHTML = html;
        const frag = doc.createDocumentFragment();
        let last = null;
        while (holder.firstChild) { last = holder.firstChild; frag.appendChild(last); }
        const range = sel.rangeCount ? sel.getRangeAt(0) : null;
        if (range) { range.deleteContents(); range.insertNode(frag); }
        else t.el.appendChild(frag);
        if (last) {
          const after = doc.createRange();
          after.setStartAfter(last); after.collapse(true);
          sel.removeAllRanges(); sel.addRange(after);
        }
        how = "dom";
      } catch (_) {}
    }

    if (how) {
      try { lastRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null; } catch (_) {}
      fireInput(t.el, null);
    }
    return how;
  }

  // 공개 진입점: 모드를 판별해 알맞은 방법으로 넣는다.
  function insertHTML(html) {
    const t = resolveTarget();
    if (!t) {
      return { ok: false, message: "편집기를 찾지 못했습니다. 본문을 한 번 클릭한 뒤 다시 시도하세요." };
    }
    if (t.kind === "html") {
      insertIntoTextarea(t, html);
      return { ok: true, message: "HTML 모드 본문에 삽입했습니다." };
    }
    const how = insertIntoRich(t, html);
    if (!how) return { ok: false, message: "삽입 실패 — 복사 후 [HTML 보기] 모드에 붙여넣으세요." };
    return { ok: true, message: `쓰기 모드에 삽입했습니다. (${how})` };
  }

  // ---------- 마크다운 -> HTML ----------
  // Claude 출력은 마크다운이라 그대로 넣으면 편집기에 ## 와 ** 가 그대로 노출된다.
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function inlineMd(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function mdToHtml(md) {
    const lines = String(md).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let list = null, code = null, para = [];
    const flushPara = () => { if (para.length) { out.push("<p>" + inlineMd(para.join(" ")) + "</p>"); para = []; } };
    const flushList = () => { if (list) { out.push("</" + list + ">"); list = null; } };
    for (const raw of lines) {
      if (/^\s*```/.test(raw)) {
        flushPara(); flushList();
        if (code === null) code = [];
        else { out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>"); code = null; }
        continue;
      }
      if (code !== null) { code.push(raw); continue; }

      const line = raw.trim();
      if (!line) { flushPara(); flushList(); continue; }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushPara(); flushList();
        // 글 제목이 h1 이므로 마크다운 # 는 h2 부터 매핑한다.
        const n = Math.min(h[1].length + 1, 6);
        out.push(`<h${n}>${inlineMd(h[2])}</h${n}>`);
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushPara(); flushList(); out.push("<hr />"); continue; }

      const ul = line.match(/^[-*+]\s+(.*)$/);
      const ol = line.match(/^\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        const want = ul ? "ul" : "ol";
        if (list !== want) { flushList(); list = want; out.push("<" + want + ">"); }
        out.push("<li>" + inlineMd((ul || ol)[1]) + "</li>");
        continue;
      }
      flushList();
      para.push(line);
    }
    if (code !== null) out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
    flushPara(); flushList();
    return out.join("\n");
  }
})();
