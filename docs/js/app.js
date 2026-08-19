// app.js — 화면 조립 + 흐름 제어.
//
// 사용자는 HTML 을 보지 않는다. 워드처럼 글 위에서 바로 고친다(contenteditable).
// 안에서만 HTML 을 다루고, 화면 문구는 전부 일상어로 쓴다.
//
// 흐름: 키워드 → 빈칸 있는 초안 → 사람이 빈칸 채움 → 버튼 넣기 → 확인 → 복사 → 티스토리.
// 게시 자동화는 없다. 티스토리 오픈 API 는 2024년 2월에 종료됐다.

import * as store from "./store.js";
import { mdToHtml, splitTitle, esc, escAttr } from "./markdown.js";
import * as gemini from "./gemini.js";
import * as buttons from "./buttons.js";
import * as checks from "./checks.js";
import { markBlanks, unmarkBlanks } from "./editor.js";

const $ = (id) => document.getElementById(id);

// 상태 표시. className 을 통째로 덮어쓰면 식별용 클래스가 날아가므로 상태 클래스만 교체한다.
const KINDS = ["ok", "warn", "err", "loading"];
function say(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove(...KINDS);
  if (kind) el.classList.add(kind);
}

function busy(btn, on, label) {
  btn.disabled = on;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "처리 중…"; }
  else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
}

let settings = store.load();
let lastMarkdown = ""; // 생성 원본. 보관용으로 남겨 둔다.

// ────────────────────────── 본문 읽고 쓰기 ──────────────────────────
// 화면에는 빈칸이 칠해진 상태로 두고, 밖으로 나갈 때는 칠을 벗긴다.
const bodyEl = () => $("postBody");
const getBody = () => unmarkBlanks(bodyEl().innerHTML);

function setBody(html) {
  bodyEl().innerHTML = markBlanks(html);
  afterBodyChange();
}

function afterBodyChange() {
  renderPlaceholders();
  syncHtmlView();
  saveDraft();
}

function syncHtmlView() {
  $("htmlView").value = getBody();
}

// ────────────────────────── 설정 ──────────────────────────
const SETTING_FIELDS = { sGeminiKey: "geminiKey", sGeminiModel: "geminiModel" };

// 목록은 gemini.js 가 갖고 있다. 모델/분야가 바뀌어도 HTML 을 안 고치도록 여기서 채운다.
$("sGeminiModel").innerHTML = gemini.TEXT_MODELS
  .map((m) => `<option value="${escAttr(m.id)}">${esc(m.label)}</option>`).join("");
$("topic").innerHTML = gemini.TOPIC_TONES
  .map((t) => `<option value="${escAttr(t.id)}">${esc(t.id)}</option>`).join("");

function fillSettingsForm() {
  for (const [id, key] of Object.entries(SETTING_FIELDS)) $(id).value = settings[key] || "";
  if (!$("sGeminiModel").value) $("sGeminiModel").value = gemini.TEXT_MODEL_DEFAULT;
}

$("settingsBtn").addEventListener("click", () => { fillSettingsForm(); $("settingsDlg").showModal(); });

$("saveSettings").addEventListener("click", () => {
  const patch = {};
  for (const [id, key] of Object.entries(SETTING_FIELDS)) patch[key] = $(id).value.trim();
  settings = store.save(patch);
  say($("topStatus"), "설정을 저장했습니다.", "ok");
});

$("testGemini").addEventListener("click", async () => {
  const btn = $("testGemini");
  const apiKey = $("sGeminiKey").value.trim();
  const model = $("sGeminiModel").value;
  if (!apiKey) return say($("settingsStatus"), "키를 붙여넣어 주세요.", "err");
  busy(btn, true, "확인 중…");
  say($("settingsStatus"), "확인 중…", "loading");
  try {
    await gemini.testKey({ apiKey, model });
    // 확인만 하고 [닫기] 를 누르면 키가 날아간다. 성공했으면 바로 저장해 준다.
    settings = store.save({ geminiKey: apiKey, geminiModel: model });
    say($("settingsStatus"), "잘 됩니다! 저장했습니다.", "ok");
  } catch (e) {
    say($("settingsStatus"), "안 됩니다: " + e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 1. 초안 만들기 ──────────────────────────
// 무료 한도에서는 좋은 AI 가 자주 붐빈다. gemini.js 가 두 번 재시도해도 안 되면
// 기본 AI 로 한 번 더 시도한다. 바꿔서 만들었다는 사실은 화면에 알린다.
async function generateWithFallback({ keyword, topic, lang }) {
  const chosen = settings.geminiModel || gemini.TEXT_MODEL_DEFAULT;
  const args = { apiKey: settings.geminiKey, keyword, topic, lang };

  try {
    return { ...(await gemini.generateText({ ...args, model: chosen })), usedModel: chosen, fellBack: false };
  } catch (e) {
    const congested = e?.status === 503 || e?.status === 500;
    if (!congested || chosen === gemini.TEXT_MODEL_DEFAULT) throw e;

    say($("textStatus"), "AI 가 붐벼서 다른 AI 로 다시 시도 중…", "loading");
    const r = await gemini.generateText({ ...args, model: gemini.TEXT_MODEL_DEFAULT });
    return { ...r, usedModel: gemini.TEXT_MODEL_DEFAULT, fellBack: true };
  }
}

$("genText").addEventListener("click", async () => {
  const btn = $("genText");
  const keyword = $("kw").value.trim();
  if (!keyword) return say($("textStatus"), "무엇에 대해 쓸지 먼저 적어 주세요.", "warn");
  if (!settings.geminiKey) return say($("textStatus"), "먼저 [설정]에서 Gemini 키를 넣어 주세요.", "err");
  if (getBody().trim() && !confirm("지금 쓰고 있는 글을 새 초안으로 바꿉니다. 계속할까요?")) return;

  busy(btn, true, "만드는 중…");
  say($("textStatus"), "만드는 중… 30초쯤 걸립니다.", "loading");
  try {
    const { text, truncated, fellBack } = await generateWithFallback({
      keyword, topic: $("topic").value, lang: $("lang").value,
    });
    lastMarkdown = text;
    const { title, body } = splitTitle(text);
    if (title) $("postTitle").value = title;
    // 모델이 버튼 자리를 빼먹으면 코드로 넣어 준다.
    setBody(buttons.ensureButtonSlots(mdToHtml(body || text)));

    const note = fellBack ? "\n(고른 AI 가 붐벼서 다른 AI 로 만들었습니다)" : "";
    say($("textStatus"),
      (truncated ? "다 됐습니다 (조금 잘렸을 수 있어요)" : "다 됐습니다 — 노란 빈칸을 채워 주세요") + note,
      truncated || fellBack ? "warn" : "ok");
  } catch (e) {
    say($("textStatus"), e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 2. 링크 버튼 ──────────────────────────
// 초안에 잡힌 버튼 자리마다 입력칸을 만들어 준다.
function renderPlaceholders() {
  const found = buttons.findPlaceholders(getBody());
  const box = $("phList");

  if (!found.length) {
    box.innerHTML = `<p class="hint">아직 버튼 자리가 없습니다. 초안을 만들면 자리가 잡힙니다.</p>`;
    return;
  }

  box.innerHTML = found.map((p, i) => `
    <div class="ph" data-i="${i}">
      <label>${i + 1}번째 버튼</label>
      <input class="ph-text" type="text" placeholder="버튼에 쓸 문구" value="${escAttr(p.text)}">
      <input class="ph-url" type="text" placeholder="https://... (링크 주소)" value="${escAttr(p.url)}">
      <button type="button" class="ph-apply accent">이 자리에 버튼 넣기</button>
    </div>`).join("");

  box.querySelectorAll(".ph-apply").forEach((b) =>
    b.addEventListener("click", () => applyPlaceholder(Number(b.closest(".ph").dataset.i)))
  );
}

function applyPlaceholder(i) {
  const box = $("phList").querySelectorAll(".ph")[i];
  if (!box) return;
  const text = box.querySelector(".ph-text").value.trim();
  const url = box.querySelector(".ph-url").value.trim();
  if (!text || !url) return say($("btnStatus"), "버튼 문구와 링크 주소를 모두 넣어 주세요.", "warn");

  // 글이 그새 바뀌었을 수 있으므로 그때그때 다시 찾는다.
  const current = getBody();
  const found = buttons.findPlaceholders(current);
  const target = found[i];
  if (!target) return say($("btnStatus"), "버튼 자리를 찾지 못했습니다.", "err");

  let next = buttons.replaceAt(current, target.index, target.raw, buttons.buttonHtml({ text, url }));
  next = buttons.appendNotice(next);
  setBody(next);
  say($("btnStatus"), "버튼을 넣었습니다.", "ok");
}

$("insertButton").addEventListener("click", () => {
  const text = $("btnText").value.trim();
  const url = $("btnUrl").value.trim();
  if (!text || !url) return say($("btnStatus"), "버튼 문구와 링크 주소를 모두 넣어 주세요.", "warn");

  insertAtCursor(buttons.buttonHtml({ text, url }));
  setBody(buttons.appendNotice(getBody()));
  $("btnText").value = "";
  $("btnUrl").value = "";
  say($("btnStatus"), "버튼을 넣었습니다.", "ok");
});

// ────────────────────────── 3. 올리기 전 확인 ──────────────────────────
function renderChecks() {
  const { list, allOk } = checks.runChecks(getBody());
  $("checkList").innerHTML = list.map((c) =>
    `<li class="${c.ok ? "ok" : "warn"}">${c.ok ? "✔" : "✕"} ${esc(c.label)} — ${esc(c.detail)}</li>`
  ).join("");
  say($("topStatus"),
    allOk ? "다 됐습니다. 올리셔도 좋습니다." : "올리기 전에 아래를 먼저 봐 주세요.",
    allOk ? "ok" : "warn");
}

$("runCheck").addEventListener("click", renderChecks);

// ────────────────────────── 4. 내보내기 ──────────────────────────
// 서식이 살아 있는 상태로 복사한다. 그래야 티스토리 기본 편집기에 그냥 붙여넣어도
// 버튼과 소제목이 살아난다(HTML 모드로 들어갈 필요가 없다).
//
// 화면 밖에 임시 영역을 만들어 그걸 선택해서 복사한다. 이유가 두 가지다.
// 1) 브라우저가 서식(text/html)과 글자(text/plain)를 알아서 둘 다 만들어 준다.
//    직접 만들면 글자 쪽에 HTML 태그가 그대로 들어가, 붙여넣었을 때 태그가 보인다.
// 2) 화면의 글을 그대로 선택하면 노란 빈칸 칠까지 복사된다.
function copyViaSelection(html) {
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  // display:none 이면 선택이 안 된다. 화면 밖으로 밀어낸다.
  holder.style.cssText = "position:fixed;left:-9999px;top:0;width:600px;opacity:0;";
  holder.innerHTML = html;
  document.body.appendChild(holder);

  const sel = window.getSelection();
  const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  let ok = false;
  try {
    const range = document.createRange();
    range.selectNodeContents(holder);
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand("copy");
  } catch (_) { /* 아래에서 최신 방식으로 한 번 더 */ }

  sel.removeAllRanges();
  if (saved) sel.addRange(saved);
  holder.remove();
  return ok;
}

async function copyRich(html, plain) {
  if (copyViaSelection(html)) return true;

  // 위가 막히면 최신 방식으로 한 번 더. 이때는 글자 쪽을 직접 만들어 줘야 한다.
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      })]);
      return true;
    }
  } catch (_) { /* 실패로 처리한다 */ }

  return false;
}

$("copyHtml").addEventListener("click", async () => {
  const html = getBody().trim();
  if (!html) return say($("topStatus"), "아직 글이 없습니다.", "warn");

  const ok = await copyRich(html, bodyEl().innerText);
  if (ok) {
    say($("topStatus"), "복사했습니다. 티스토리 글쓰기에서 붙여넣기(Ctrl+V) 하세요.", "ok");
    return;
  }

  // 그래도 안 되면 사용자가 직접 복사할 수 있게 글을 선택해 준다.
  bodyEl().focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(bodyEl());
  sel.removeAllRanges();
  sel.addRange(range);
  say($("topStatus"), "자동 복사가 막혔습니다. 글이 선택돼 있으니 Ctrl+C 를 눌러 주세요.", "warn");
});

// 티스토리가 붙여넣기 때 버튼 스타일을 지워버리는 경우가 있다. 그때는 HTML 모드에
// 원문을 그대로 넣어야 한다. 이건 글자(text/plain)로 복사해야 한다 — 서식으로 넣으면
// HTML 모드 입력칸에 태그가 아니라 렌더된 글이 들어간다.
$("copyRaw").addEventListener("click", async () => {
  const html = getBody().trim();
  if (!html) return say($("topStatus"), "아직 글이 없습니다.", "warn");

  let ok = false;
  try {
    await navigator.clipboard.writeText(html);
    ok = true;
  } catch (_) {
    const ta = $("htmlView");
    ta.removeAttribute("readonly");
    ta.focus();
    ta.select();
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.setAttribute("readonly", "");
  }

  say($("topStatus"),
    ok ? "HTML 로 복사했습니다. 티스토리 글쓰기에서 [기본모드]를 [HTML]로 바꾸고 붙여넣으세요."
       : "복사가 막혔습니다. 아래 칸의 글을 직접 선택해 Ctrl+C 하세요.",
    ok ? "ok" : "warn");
});

$("saveHtml").addEventListener("click", () => {
  const title = $("postTitle").value.trim() || "내 글";
  const html = getBody().trim();
  if (!html) return say($("topStatus"), "아직 글이 없습니다.", "warn");

  // 원본도 같이 남겨 두면 나중에 다시 손보기 쉽다.
  const doc =
    `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>\n` +
    `<h1>${esc(title)}</h1>\n${html}\n` +
    (lastMarkdown ? `\n<!-- 처음 만들어진 원본\n${lastMarkdown.replace(/-->/g, "-- >")}\n-->\n` : "");

  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) + ".html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say($("topStatus"), "파일로 보관했습니다.", "ok");
});

// ────────────────────────── 글 편집 ──────────────────────────
// 커서 자리에 끼워 넣는다. 커서가 글 안에 없으면 맨 끝에 붙인다.
function insertAtCursor(html) {
  const el = bodyEl();
  el.focus();
  const sel = window.getSelection();

  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
    el.innerHTML = el.innerHTML + html;
    afterBodyChange();
    return;
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();
  const frag = range.createContextualFragment(html);
  range.insertNode(frag);
  sel.removeAllRanges();
  afterBodyChange();
}

// 노란 빈칸을 클릭하면 그 자리를 통째로 선택해 준다. 바로 타이핑하면 덮어써진다.
bodyEl().addEventListener("click", (e) => {
  const mark = e.target.closest?.("mark.blank");
  if (!mark) return;
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(mark);
  sel.removeAllRanges();
  sel.addRange(range);
});

// 빈칸에 글자를 넣기 시작하면 노란 칠을 벗겨 준다(다 채운 티가 나야 한다).
bodyEl().addEventListener("input", () => {
  bodyEl().querySelectorAll("mark.blank").forEach((m) => {
    const t = m.textContent.trim();
    const stillBlank = gemini.BLANKS.includes(t) || /^\[버튼\s*:[^\]]*\]$/.test(t);
    if (!stillBlank) m.replaceWith(...m.childNodes);
  });
  afterBodyChange();
});

// 붙여넣기는 서식을 버리고 글자만 받는다. 남의 사이트 스타일이 딸려오면 티스토리에서 깨진다.
bodyEl().addEventListener("paste", (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, text);
});

// 간단한 서식 도구
$("toolbar").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-cmd]");
  if (!btn) return;
  bodyEl().focus();
  const cmd = btn.dataset.cmd;
  if (cmd === "heading") document.execCommand("formatBlock", false, "h3");
  else document.execCommand(cmd, false, null);
  afterBodyChange();
});

// ── 쓰던 글 자동 보관 ──
// 서버가 없으므로 탭을 닫거나 새로고침하면 그냥 사라진다.
const DRAFT_KEY = "gap.draft.v1";
let draftTimer = null;

function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const title = $("postTitle").value, body = bodyEl().innerHTML;
    // 빈 상태는 저장하지 않는다. 저장하면 앱을 새 탭에서 열자마자
    // 다른 탭에서 쓰던 글이 빈 값으로 덮여 사라진다. 비우는 것은 [새로 쓰기] 로만.
    if (!title && !bodyEl().textContent.trim()) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body, md: lastMarkdown, at: Date.now() })); } catch (_) {}
  }, 500);
}

function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!d || (!d.title && !d.body)) return;
    $("postTitle").value = d.title || "";
    bodyEl().innerHTML = markBlanks(unmarkBlanks(d.body || ""));
    lastMarkdown = d.md || "";
    afterBodyChange();
    const when = d.at ? new Date(d.at).toLocaleString() : "";
    say($("topStatus"), `쓰시던 글을 되살렸습니다${when ? ` (${when})` : ""}.`, "ok");
  } catch (_) {}
}

$("newPost").addEventListener("click", () => {
  if (($("postTitle").value || bodyEl().textContent.trim()) && !confirm("제목과 글을 모두 비웁니다. 계속할까요?")) return;
  $("postTitle").value = "";
  bodyEl().innerHTML = "";
  lastMarkdown = "";
  try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
  afterBodyChange();
  $("checkList").innerHTML = "";
  say($("topStatus"), "새로 시작합니다.", "ok");
});

$("postTitle").addEventListener("input", saveDraft);

// ────────────────────────── 시작 ──────────────────────────
fillSettingsForm();
restoreDraft();
renderPlaceholders();
syncHtmlView();
