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
      <button type="button" class="gap-close" title="닫기">✕</button>
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

  function status(el, text, kind) { el.textContent = text || ""; el.className = "gap-status" + (kind ? " gap-" + kind : ""); }

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
    // TODO(로컬): Blogger 편집기에 <img> 삽입 — 편집기 iframe 본문에 넣는 로직을 실제 DOM에 맞춰 보강.
    const ok = tryInsertHTML(`<img src="${lastImageDataUrl}" style="max-width:100%"/>`);
    status($(".gt-status"), ok ? "이미지를 삽입했습니다." : "삽입 실패 — 이미지 저장 후 수동 업로드하세요.", ok ? "ok" : "warn");
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
    const ok = tryInsertHTML(html);
    status($(".gb-status"), ok ? "삽입했습니다(HTML 모드 권장)." : "삽입 실패 — 복사 후 HTML 모드에 붙여넣기.", ok ? "ok" : "warn");
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
      insertPlainText(src?.value || "");
    })
  );

  // ---------- 편집기 삽입 유틸 (실제 DOM에 맞춰 로컬에서 보강) ----------
  function editableTargets() {
    const targets = [];
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === "TEXTAREA")) targets.push({ el: active, doc: document });
    document.querySelectorAll("iframe").forEach((f) => {
      try { const b = f.contentDocument?.body; if (b?.isContentEditable) targets.push({ el: b, doc: f.contentDocument, win: f.contentWindow }); } catch (_) {}
    });
    return targets;
  }
  function insertPlainText(text) {
    if (!text) return false;
    const t = editableTargets()[0];
    if (!t) return false;
    if (t.win) t.win.focus(); else t.el.focus();
    const ok = t.doc.execCommand && t.doc.execCommand("insertText", false, text);
    if (!ok) t.el.appendChild(t.doc.createTextNode(text));
    return true;
  }
  function tryInsertHTML(html) {
    const t = editableTargets()[0];
    if (!t) return false;
    if (t.win) t.win.focus(); else t.el.focus();
    const ok = t.doc.execCommand && t.doc.execCommand("insertHTML", false, html);
    return !!ok;
  }
})();
