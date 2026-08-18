// app.js — 화면 조립 + 흐름 제어.
// 키워드 → 초안 생성 → 썸네일 생성/업로드 → 버튼 삽입 → 게시.

import * as store from "./store.js";
import { mdToHtml, splitTitle, esc, escAttr } from "./markdown.js";
import * as claude from "./claude.js";
import * as gemini from "./gemini.js";
import * as github from "./github.js";
import * as blogger from "./blogger.js";

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
let lastImage = null; // { base64, mime, dataUrl }

// ────────────────────────── 설정 ──────────────────────────
const SETTING_FIELDS = {
  sAnthropicKey: "anthropicKey", sClaudeModel: "claudeModel", sGeminiKey: "geminiKey",
  sGoogleClientId: "googleClientId", sGhToken: "ghToken", sGhOwner: "ghOwner",
  sGhRepo: "ghRepo", sGhBranch: "ghBranch", sGhPathPrefix: "ghPathPrefix",
};

function fillSettingsForm() {
  for (const [id, key] of Object.entries(SETTING_FIELDS)) $(id).value = settings[key] || "";
}

$("settingsBtn").addEventListener("click", () => { fillSettingsForm(); $("settingsDlg").showModal(); });

$("saveSettings").addEventListener("click", () => {
  const patch = {};
  for (const [id, key] of Object.entries(SETTING_FIELDS)) patch[key] = $(id).value.trim();
  settings = store.save(patch);
  say($("topStatus"), "설정을 저장했습니다.", "ok");
});

$("testClaude").addEventListener("click", async () => {
  const btn = $("testClaude");
  const apiKey = $("sAnthropicKey").value.trim();
  const model = $("sClaudeModel").value;
  if (!apiKey) return say($("settingsStatus"), "Anthropic 키를 입력하세요.", "err");
  busy(btn, true, "테스트 중…");
  say($("settingsStatus"), `테스트 중… (${model})`, "loading");
  try {
    await claude.testKey({ apiKey, model });
    say($("settingsStatus"), `성공! ${model} 키가 정상입니다.`, "ok");
  } catch (e) {
    say($("settingsStatus"), "실패: " + e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 1. 글 생성 ──────────────────────────
$("genText").addEventListener("click", async () => {
  const btn = $("genText");
  const keyword = $("kw").value.trim();
  if (!keyword) return say($("textStatus"), "키워드를 입력하세요.", "warn");
  if (!settings.anthropicKey) return say($("textStatus"), "설정에서 Anthropic 키를 먼저 저장하세요.", "err");

  busy(btn, true, "생성 중…");
  say($("textStatus"), "생성 중… (모델에 따라 1분 이상 걸릴 수 있습니다)", "loading");
  try {
    const { text, truncated } = await claude.generate({
      apiKey: settings.anthropicKey,
      model: settings.claudeModel || "claude-sonnet-5",
      keyword,
      docType: $("docType").value,
      lang: $("lang").value,
    });
    const { title, body } = splitTitle(text);
    if (title) $("postTitle").value = title;
    $("postBody").value = mdToHtml(body || text);
    renderPreview();
    say($("textStatus"), truncated ? "완료 (길이 제한으로 잘렸을 수 있습니다)" : "완료", truncated ? "warn" : "ok");
  } catch (e) {
    say($("textStatus"), e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 2. 썸네일 ──────────────────────────
$("genImage").addEventListener("click", async () => {
  const btn = $("genImage");
  const keyword = $("kw").value.trim();
  if (!keyword) return say($("imgStatus"), "위 주제 키워드를 먼저 입력하세요.", "warn");
  if (!settings.geminiKey) return say($("imgStatus"), "설정에서 Gemini 키를 먼저 저장하세요.", "err");

  busy(btn, true, "생성 중…");
  say($("imgStatus"), "이미지 생성 중…", "loading");
  $("thumbPreview").innerHTML = "";
  $("thumbActions").classList.add("hidden");
  try {
    lastImage = await gemini.generateImage({ apiKey: settings.geminiKey, keyword, style: $("thumbStyle").value });
    const img = document.createElement("img");
    img.src = lastImage.dataUrl;
    img.alt = keyword;
    $("thumbPreview").appendChild(img);
    $("thumbActions").classList.remove("hidden");
    say($("imgStatus"), "완료", "ok");
  } catch (e) {
    say($("imgStatus"), e.message, "err");
  } finally {
    busy(btn, false);
  }
});

$("saveImage").addEventListener("click", () => {
  if (!lastImage) return;
  const a = document.createElement("a");
  a.href = lastImage.dataUrl;
  a.download = "thumbnail." + (lastImage.mime.split("/")[1] || "png").replace("jpeg", "jpg");
  a.click();
});

$("insertImage").addEventListener("click", async () => {
  const btn = $("insertImage");
  if (!lastImage) return;
  const need = store.missing(settings, ["ghToken", "ghOwner", "ghRepo"]);
  if (need.length) {
    return say($("imgStatus"), `설정에서 GitHub 항목이 비어 있습니다: ${need.join(", ")}`, "err");
  }

  const keyword = $("kw").value.trim() || "thumbnail";
  busy(btn, true, "업로드 중…");
  say($("imgStatus"), "GitHub 에 업로드 중…", "loading");
  try {
    const path = github.buildPath({ prefix: settings.ghPathPrefix, keyword, mime: lastImage.mime });
    const r = await github.upload({
      token: settings.ghToken,
      owner: settings.ghOwner,
      repo: settings.ghRepo,
      branch: settings.ghBranch || "main",
      path,
      base64: lastImage.base64,
      message: `thumbnail: ${keyword}`,
    });
    // 이미지 자체에 정렬을 준다 — 래퍼 div 는 편집기/테마에 따라 사라질 수 있다.
    insertIntoBody(
      `<img src="${escAttr(r.cdnUrl)}" alt="${escAttr(keyword)}" style="display:block;margin:0 auto;max-width:100%" />`
    );
    say($("imgStatus"), `업로드 완료 — 본문에 삽입했습니다.\n${r.cdnUrl}`, "ok");
  } catch (e) {
    say($("imgStatus"), e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 3. 버튼 ──────────────────────────
$("insertButton").addEventListener("click", () => {
  const text = $("btnText").value.trim();
  const url = $("btnUrl").value.trim();
  const color = $("btnColor").value;
  if (!text || !url) return say($("btnStatus"), "버튼 텍스트와 링크를 모두 입력하세요.", "warn");

  const html =
    `<div style="text-align:center;margin:24px 0;">` +
    `<a href="${escAttr(url)}" target="_blank" rel="noopener" ` +
    `style="display:inline-block;background:${color};color:#fff;text-decoration:none;` +
    `padding:14px 28px;border-radius:8px;font-weight:700;font-size:16px;">${esc(text)}</a></div>`;

  insertIntoBody(html);
  say($("btnStatus"), "본문에 삽입했습니다.", "ok");
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
// 서버가 없으므로 탭을 닫거나 새로고침하면 생성한 글이 그냥 사라진다.
// 제목/본문을 localStorage 에 계속 흘려 두고 다음에 열 때 되살린다.
const DRAFT_KEY = "gap.draft.v1";
let draftTimer = null;

function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const title = $("postTitle").value, body = $("postBody").value;
    // 빈 상태는 저장하지 않는다. 저장하면 앱을 새 탭에서 열자마자
    // 다른 탭에서 쓰던 초안이 빈 값으로 덮여 사라진다.
    // 비우는 것은 [새 글] 버튼으로만 한다.
    if (!title && !body) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body, at: Date.now() })); } catch (_) {}
  }, 500);
}

function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!d || (!d.title && !d.body)) return;
    $("postTitle").value = d.title || "";
    $("postBody").value = d.body || "";
    const when = d.at ? new Date(d.at).toLocaleString() : "";
    say($("topStatus"), `작성 중이던 글을 복원했습니다${when ? ` (${when})` : ""}. 새로 시작하려면 [새 글].`, "ok");
  } catch (_) {}
}

$("newPost").addEventListener("click", () => {
  if (($("postTitle").value || $("postBody").value) && !confirm("제목과 본문을 비웁니다. 계속할까요?")) return;
  $("postTitle").value = "";
  $("postBody").value = "";
  try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
  renderPreview();
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
      `pre{background:#f1f5f9;padding:12px;border-radius:8px;overflow:auto}</style>` +
      (title ? `<h1>${esc(title)}</h1>` : "") +
      $("postBody").value;
  }, 200);
}

$("postBody").addEventListener("input", renderPreview);
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

// ────────────────────────── Google 연결 / 게시 ──────────────────────────
function setAuthChip(on, label) {
  const chip = $("authChip");
  chip.textContent = label;
  chip.classList.toggle("chip-on", on);
  chip.classList.toggle("chip-off", !on);
}

async function connectGoogle({ interactive = true } = {}) {
  if (!settings.googleClientId) {
    say($("topStatus"), "설정에서 Google OAuth 클라이언트 ID 를 먼저 저장하세요.", "err");
    return false;
  }
  try {
    say($("topStatus"), "Google 연결 중…", "loading");
    await blogger.requestToken(settings.googleClientId, { interactive });
    const blogs = await blogger.listBlogs();

    const sel = $("blogSelect");
    sel.innerHTML = blogs.length
      ? blogs.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")
      : `<option value="">블로그 없음</option>`;
    if (settings.blogId && blogs.some((b) => b.id === settings.blogId)) sel.value = settings.blogId;
    else if (blogs.length) settings = store.save({ blogId: (sel.value = blogs[0].id) });

    setAuthChip(true, "Google 연결됨");
    say($("topStatus"), `연결됨 — 블로그 ${blogs.length}개`, "ok");
    return true;
  } catch (e) {
    setAuthChip(false, "Google 미연결");
    if (interactive) say($("topStatus"), e.message, "err");
    else say($("topStatus"), "");
    return false;
  }
}

$("authChip").addEventListener("click", () => connectGoogle({ interactive: true }));
$("blogSelect").addEventListener("change", () => { settings = store.save({ blogId: $("blogSelect").value }); });

$("publishBtn").addEventListener("click", async () => {
  const btn = $("publishBtn");
  const title = $("postTitle").value.trim();
  const content = $("postBody").value.trim();
  const isDraft = $("asDraft").checked;

  if (!title) return say($("topStatus"), "제목을 입력하세요.", "warn");
  if (!content) return say($("topStatus"), "본문이 비어 있습니다.", "warn");
  if (!blogger.isSignedIn() && !(await connectGoogle({ interactive: true }))) return;

  const blogId = $("blogSelect").value;
  if (!blogId) return say($("topStatus"), "게시할 블로그를 선택하세요.", "warn");

  if (!isDraft && !confirm("초안이 아니라 바로 공개 발행합니다. 진행할까요?")) return;

  busy(btn, true, "게시 중…");
  say($("topStatus"), isDraft ? "초안으로 올리는 중…" : "발행 중…", "loading");
  try {
    const r = await blogger.publish({ blogId, title, content, isDraft });
    const link = isDraft || !r.url ? r.editUrl : r.url;
    say($("topStatus"), (isDraft ? "초안으로 올렸습니다: " : "발행했습니다: ") + link, "ok");
    window.open(link, "_blank", "noopener");
  } catch (e) {
    say($("topStatus"), e.message, "err");
  } finally {
    busy(btn, false);
  }
});

// ────────────────────────── 시작 ──────────────────────────
fillSettingsForm();
restoreDraft();
renderPreview();
// 이미 동의한 적이 있으면 팝업 없이 조용히 연결을 시도한다(실패해도 조용히 넘어간다).
window.addEventListener("load", () => {
  if (settings.googleClientId) setTimeout(() => connectGoogle({ interactive: false }), 600);
});
