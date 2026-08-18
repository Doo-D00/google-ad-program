// markdown.js — Claude 출력(마크다운)을 Blogger 본문 HTML 로 바꾼다.
// 확장 버전 content.js 의 mdToHtml 을 그대로 가져왔다.

export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 속성값(href, alt 등)에는 따옴표까지 막아야 한다. 안 그러면 URL 안의 " 하나로 태그가 깨진다.
export function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inlineMd(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    // 이 시점의 문자열은 이미 esc() 를 거쳤다. & 를 또 바꾸면 &amp;amp; 가 되므로
    // 여기서는 따옴표만 막는다.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, url) => `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener">${label}</a>`);
}

export function mdToHtml(md) {
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
      // 글 제목이 h1 이므로 본문 소제목은 h2 부터 매핑한다.
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

// Claude 에게 첫 줄을 "# 제목" 으로 달라고 시켰다. 그 줄을 제목으로 떼어낸다.
export function splitTitle(md) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const m = lines[i] && lines[i].trim().match(/^#\s+(.*)$/);
  if (!m) return { title: "", body: md };
  return { title: m[1].trim(), body: lines.slice(i + 1).join("\n").trim() };
}
