// github.js — 썸네일을 GitHub 리포에 올리고 jsDelivr CDN URL 을 돌려준다.
// Blogger API v3 에는 이미지 업로드 엔드포인트가 없다. 본문에는 <img src="..."> 로만
// 넣을 수 있으므로 이미지를 어딘가에 호스팅해야 한다.
//
// 필요한 것: 대상 리포에 contents:write 권한이 있는 GitHub 토큰(세분화 토큰 권장).
// ⚠ jsDelivr 는 공개 리포만 서빙한다. 비공개 리포면 raw URL 을 쓰되 CDN 이 아니다.

const API = "https://api.github.com";

function slug(s) {
  return String(s).trim().toLowerCase()
    .replace(/[^\w가-힣-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function buildPath({ prefix, keyword, mime }) {
  const ext = (mime || "image/png").split("/")[1].replace("jpeg", "jpg");
  const dir = String(prefix || "images").replace(/^\/+|\/+$/g, "");
  return `${dir}/${stamp()}-${slug(keyword)}.${ext}`;
}

export function cdnUrl({ owner, repo, branch, path }) {
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

// base64 는 data URL 접두사 없이 순수 본문만 넘긴다.
export async function upload({ token, owner, repo, branch, path, base64, message }) {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${encodeURI(path)}`, {
    method: "PUT",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: message || `thumbnail: ${path}`,
      content: base64,
      branch: branch || "main",
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    const hint = {
      401: "토큰이 잘못되었거나 만료되었습니다.",
      403: "권한이 없습니다. 토큰에 이 리포의 contents 쓰기 권한이 있는지 확인하세요.",
      404: "리포를 찾지 못했습니다. owner/repo/branch 를 확인하세요(토큰 권한 부족일 때도 404 가 납니다).",
      409: "브랜치 상태가 충돌했습니다. 브랜치 이름을 확인하세요.",
      422: "경로나 내용이 올바르지 않습니다. 같은 경로에 파일이 이미 있을 수 있습니다.",
    }[res.status] || "";
    throw new Error(`GitHub 업로드 실패(${res.status})${hint ? " — " + hint : ""}\n${detail}`);
  }

  const data = await res.json();
  return {
    path: data?.content?.path || path,
    rawUrl: data?.content?.download_url || "",
    cdnUrl: cdnUrl({ owner, repo, branch: branch || "main", path: data?.content?.path || path }),
  };
}
