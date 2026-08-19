// app.js — 화면 조립 + 흐름 제어.
// 키워드 → 빈칸 포함 초안 → 사람이 채움 → 버튼 삽입 → 점검 → HTML 복사 → 티스토리에 붙여넣기.
//
// 게시 자동화는 없다. 티스토리 오픈 API 는 2024년 2월에 종료됐다(CLAUDE.md 참고).

import * as store from "./store.js";
import { mdToHtml, splitTitle, esc, escAttr } from "./markdown.js";
import * as gemini from "./gemini.js";
import * as buttons from "./buttons.js";
import * as checks from "./checks.js";

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
let lastMarkdown = ""; // 생성 원본. 백업용으로 남겨 둔다(CLAUDE.md 10장).

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
  if (!apiKey) return say($("settingsStatus"), "Gemini 키를 입력하세요.", "err");
  busy(btn, true, "테스트 중…");
  say($("settingsStatus"), `테스트 중… (${model})`, "loading");
  try {
    await gemini.testKey({ apiKey, model });
    // 테스트만 하고 [닫기] 를 누르면 키가 날아간다. 성공했으면 바로 저장해 준다.
    settings = store.save({ geminiKey: apiKey, geminiModel: model });
    say($("settingsStatus"), `성공! ${model} 키가 정상입니다. (저장했습니다)`, "ok");
  } catch (e) {
    say($("settingsStatus"), "실패: " + e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 1. 초안 생성 ──────────────────────────
// 무료 한도에서는 고품질 모델이 자주 503(과부하)이다. gemini.js 가 두 번 재시도해도
// 안 되면 기본 모델로 한 번 더 시도한다. 사용자에게는 바꿔서 만들었다고 알린다.
async function generateWithFallback({ keyword, topic, lang }) {
  const chosen = settings.geminiModel || gemini.TEXT_MODEL_DEFAULT;
  const args = { apiKey: settings.geminiKey, keyword, topic, lang };

  try {
    return { ...(await gemini.generateText({ ...args, model: chosen })), usedModel: chosen, fellBack: false };
  } catch (e) {
    const congested = e?.status === 503 || e?.status === 500;
    if (!congested || chosen === gemini.TEXT_MODEL_DEFAULT) throw e;

    say($("textStatus"), `${chosen} 이 혼잡합니다. ${gemini.TEXT_MODEL_DEFAULT} 로 다시 시도 중…`, "loading");
    const r = await gemini.generateText({ ...args, model: gemini.TEXT_MODEL_DEFAULT });
    return { ...r, usedModel: gemini.TEXT_MODEL_DEFAULT, fellBack: true };
  }
}

$("genText").addEventListener("click", async () => {
  const btn = $("genText");
  const keyword = $("kw").value.trim();
  if (!keyword) return say($("textStatus"), "키워드를 입력하세요.", "warn");
  if (!settings.geminiKey) return say($("textStatus"), "설정에서 Gemini 키를 먼저 저장하세요.", "err");

  busy(btn, true, "생성 중…");
  say($("textStatus"), "생성 중… (모델에 따라 1분 이상 걸릴 수 있습니다)", "loading");
  try {
    const { text, truncated, usedModel, fellBack } = await generateWithFallback({
      keyword, topic: $("topic").value, lang: $("lang").value,
    });
    lastMarkdown = text;
    const { title, body } = splitTitle(text);
    if (title) $("postTitle").value = title;
    $("postBody").value = mdToHtml(body || text);
    renderPreview();
    renderPlaceholders();

    const note = fellBack ? `\n(고른 모델이 혼잡해서 ${usedModel} 로 생성했습니다)` : "";
    say($("textStatus"),
      (truncated ? "완료 (길이 제한으로 잘렸을 수 있습니다)" : "완료 — 빈칸을 채우세요") + note,
      truncated || fellBack ? "warn" : "ok");
  } catch (e) {
    say($("textStatus"), e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 2. 제휴 버튼 ──────────────────────────
// 초안에 들어 있는 [버튼: 텍스트 | URL] 자리마다 입력칸을 만들어 준다.
function renderPlaceholders() {
  const found = buttons.findPlaceholders($("postBody").value);
  const box = $("phList");

  if (!found.length) {
    box.innerHTML = `<p class="hint">본문에 버튼 자리가 없습니다. 초안을 생성하거나 아래에서 직접 넣으세요.</p>`;
    return;
  }

  box.innerHTML = found.map((p, i) => `
    <div class="ph" data-i="${i}">
      <label>버튼 ${i + 1}</label>
      <input class="ph-text" type="text" placeholder="버튼 텍스트" value="${escAttr(p.text)}">
      <input class="ph-url" type="text" placeholder="https://... (제휴 링크)" value="${escAttr(p.url)}">
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
  if (!text || !url) return say($("btnStatus"), "버튼 텍스트와 링크를 모두 입력하세요.", "warn");

  // 본문이 그새 바뀌었을 수 있으므로 그때그때 다시 찾는다.
  const found = buttons.findPlaceholders($("postBody").value);
  const target = found[i];
  if (!target) return say($("btnStatus"), "버튼 자리를 찾지 못했습니다. 본문을 확인하세요.", "err");

  let body = buttons.replaceAt($("postBody").value, target.index, target.raw, buttons.buttonHtml({ text, url }));
  body = buttons.appendNotice(body);
  $("postBody").value = body;
  renderPreview();
  renderPlaceholders();
  say($("btnStatus"), "버튼을 넣었습니다. 고지 문구도 확인하세요.", "ok");
}

$("insertButton").addEventListener("click", () => {
  const text = $("btnText").value.trim();
  const url = $("btnUrl").value.trim();
  if (!text || !url) return say($("btnStatus"), "버튼 텍스트와 링크를 모두 입력하세요.", "warn");

  insertIntoBody(buttons.buttonHtml({ text, url }));
  $("postBody").value = buttons.appendNotice($("postBody").value);
  renderPreview();
  renderPlaceholders();
  say($("btnStatus"), "본문에 삽입했습니다.", "ok");
});

// ────────────────────────── 3. 발행 전 점검 ──────────────────────────
function renderChecks() {
  const { list, allOk } = checks.runChecks($("postBody").value);
  $("checkList").innerHTML = list.map((c) =>
    `<li class="${c.ok ? "ok" : "warn"}">${c.ok ? "✔" : "✕"} ${esc(c.label)} — ${esc(c.detail)}</li>`
  ).join("");
  say($("topStatus"), allOk ? "점검 통과 — 발행해도 좋습니다." : "발행 전 확인 필요 — 아래 항목을 보세요.", allOk ? "ok" : "warn");
}

$("runCheck").addEventListener("click", renderChecks);

// ────────────────────────── 4. 내보내기 ──────────────────────────
function fullHtml() {
  const title = $("postTitle").value.trim();
  // 티스토리 에디터에는 제목을 따로 넣으므로 본문만 내보낸다.
  return $("postBody").value.trim() + (title ? "" : "");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // 클립보드 권한이 없으면 선택 상태로라도 만들어 준다.
    const ta = $("postBody");
    ta.focus();
    ta.select();
    return false;
  }
}

$("copyHtml").addEventListener("click", async () => {
  const html = fullHtml();
  if (!html) return say($("topStatus"), "본문이 비어 있습니다.", "warn");
  const ok = await copyText(html);
  say($("topStatus"),
    ok ? "HTML 을 복사했습니다. 티스토리 글쓰기 → HTML 모드에 붙여넣으세요."
       : "복사 권한이 없어 본문을 선택했습니다. Ctrl+C 로 복사하세요.",
    ok ? "ok" : "warn");
});

$("saveHtml").addEventListener("click", () => {
  const title = $("postTitle").value.trim() || "draft";
  const html = fullHtml();
  if (!html) return say($("topStatus"), "본문이 비어 있습니다.", "warn");

  // 원본 마크다운도 같이 남겨 두면 나중에 다시 손보기 쉽다(CLAUDE.md 10장 백업).
  const doc =
    `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>\n` +
    `<h1>${esc(title)}</h1>\n${html}\n` +
    (lastMarkdown ? `\n<!-- 생성 원본(마크다운)\n${lastMarkdown.replace(/-->/g, "-- >")}\n-->\n` : "");

  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) + ".html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say($("topStatus"), "파일로 저장했습니다.", "ok");
});

// ────────────────────────── 본문 편집 / 미리보기 ──────────────────────────
// 커서 위치에 끼워 넣는다. 커서가 없으면 맨 끝.
function insertIntoBody(html) {
  const el = $("postBody");
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const glue = before && !before.endsWith("\n") ? "\n" : "";
  const chunk = glue + html + "\n";

  el.value = before + chunk + after;
  const caret = before.length + chunk.length;
  el.focus();
  el.setSelectionRange(caret, caret);
  renderPreview();
}

// ── 작성 중인 글 자동 저장 ──
// 서버가 없으므로 탭을 닫거나 새로고침하면 쓰던 글이 그냥 사라진다.
const DRAFT_KEY = "gap.draft.v1";
let draftTimer = null;

function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const title = $("postTitle").value, body = $("postBody").value;
    // 빈 상태는 저장하지 않는다. 저장하면 앱을 새 탭에서 열자마자
    // 다른 탭에서 쓰던 초안이 빈 값으로 덮여 사라진다. 비우는 것은 [새 글] 로만.
    if (!title && !body) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body, md: lastMarkdown, at: Date.now() })); } catch (_) {}
  }, 500);
}

function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!d || (!d.title && !d.body)) return;
    $("postTitle").value = d.title || "";
    $("postBody").value = d.body || "";
    lastMarkdown = d.md || "";
    const when = d.at ? new Date(d.at).toLocaleString() : "";
    say($("topStatus"), `작성 중이던 글을 복원했습니다${when ? ` (${when})` : ""}. 새로 시작하려면 [새 글].`, "ok");
  } catch (_) {}
}

$("newPost").addEventListener("click", () => {
  if (($("postTitle").value || $("postBody").value) && !confirm("제목과 본문을 비웁니다. 계속할까요?")) return;
  $("postTitle").value = "";
  $("postBody").value = "";
  lastMarkdown = "";
  try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
  renderPreview();
  renderPlaceholders();
  $("checkList").innerHTML = "";
  say($("topStatus"), "새 글을 시작합니다.", "ok");
});

let previewTimer = null;
function renderPreview() {
  saveDraft();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const title = $("postTitle").value.trim();
    $("preview").srcdoc =
      `<!doctype html><meta charset="utf-8">` +
      `<style>body{font:16px/1.8 -apple-system,"Malgun Gothic",sans-serif;padding:20px;max-width:720px;margin:0 auto;color:#1a202c}` +
      `img{max-width:100%}h1{font-size:26px}h2{font-size:21px;margin-top:1.6em}h3{font-size:18px}` +
      `pre{background:#f1f5f9;padding:12px;border-radius:8px;overflow:auto}` +
      // 남은 빈칸이 눈에 띄어야 채울 마음이 든다.
      `mark{background:#fef08a}</style>` +
      (title ? `<h1>${esc(title)}</h1>` : "") +
      highlightBlanks($("postBody").value);
  }, 200);
}

// 미리보기에서만 빈칸을 노랗게 칠한다. 본문 자체는 건드리지 않는다.
function highlightBlanks(html) {
  let s = html;
  for (const b of gemini.BLANKS) s = s.split(b).join(`<mark>${b}</mark>`);
  s = s.replace(/\[버튼\s*:[^\]]*\]/g, (m) => `<mark>${m}</mark>`);
  return s;
}

$("postBody").addEventListener("input", () => { renderPreview(); renderPlaceholders(); });
$("postTitle").addEventListener("input", renderPreview);

document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const showPreview = tab.dataset.view === "preview";
    $("postBody").classList.toggle("hidden", showPreview);
    $("preview").classList.toggle("hidden", !showPreview);
    if (showPreview) renderPreview();
  })
);

// ────────────────────────── 시작 ──────────────────────────
fillSettingsForm();
restoreDraft();
renderPreview();
renderPlaceholders();
