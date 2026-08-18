// blogger.js — Google 로그인(GIS)과 Blogger API v3 발행.
//
// 브라우저만으로 끝내야 하므로 클라이언트 시크릿이 필요 없는 토큰 방식을 쓴다.
// 발급된 액세스 토큰은 약 1시간짜리이고 갱신 토큰은 없다 — 만료되면 다시 요청한다.
// Google Cloud Console 에서 OAuth 클라이언트(웹 애플리케이션)를 만들고
// 이 페이지의 origin 을 "승인된 JavaScript 원본"에 등록해야 한다.

const SCOPE = "https://www.googleapis.com/auth/blogger";
const API = "https://www.googleapis.com/blogger/v3";

let tokenClient = null;
let clientIdUsed = "";
let accessToken = "";
let expiresAt = 0;

export function isSignedIn() {
  return !!accessToken && Date.now() < expiresAt;
}

export function signOut() {
  accessToken = "";
  expiresAt = 0;
}

function ensureClient(clientId) {
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google 로그인 스크립트가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.");
  }
  // 클라이언트 ID 가 바뀌면 새로 만든다.
  if (!tokenClient || clientIdUsed !== clientId) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: () => {}, // 요청할 때마다 교체한다
    });
    clientIdUsed = clientId;
  }
  return tokenClient;
}

// interactive=false 면 이미 동의한 계정에 대해 팝업 없이 조용히 갱신을 시도한다.
export function requestToken(clientId, { interactive = true } = {}) {
  return new Promise((resolve, reject) => {
    const client = ensureClient(clientId);
    client.callback = (resp) => {
      if (resp?.error) return reject(new Error(`Google 인증 실패: ${resp.error}`));
      accessToken = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
      resolve(accessToken);
    };
    client.error_callback = (err) => reject(new Error(`Google 인증 취소/실패: ${err?.type || "unknown"}`));
    client.requestAccessToken({ prompt: interactive ? "" : "none" });
  });
}

export async function ensureToken(clientId) {
  if (isSignedIn()) return accessToken;
  return await requestToken(clientId, { interactive: true });
}

async function apiFetch(path, init = {}, { retryAuth = true } = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers || {}) },
  });

  // 토큰은 1시간짜리다. 글을 오래 쓰다 보면 게시 직전에 만료되기 쉬우므로
  // 401 이면 조용히 한 번 갱신해서 재시도한다(사용자가 다시 쓰게 만들지 않는다).
  if (res.status === 401 && retryAuth && clientIdUsed) {
    try {
      await requestToken(clientIdUsed, { interactive: true });
      return await apiFetch(path, init, { retryAuth: false });
    } catch (_) { /* 갱신 실패하면 아래 공통 오류 처리로 넘어간다 */ }
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    const hint = {
      401: "인증이 만료되었습니다. 다시 로그인하세요.",
      403: "권한이 없습니다. Cloud 프로젝트에서 Blogger API 를 사용 설정했는지, 이 계정이 해당 블로그의 관리자인지 확인하세요.",
      404: "블로그를 찾지 못했습니다. 블로그 ID 를 확인하세요.",
    }[res.status] || "";
    throw new Error(`Blogger 오류(${res.status})${hint ? " — " + hint : ""}\n${detail}`);
  }
  return await res.json();
}

export async function listBlogs() {
  const data = await apiFetch("/users/self/blogs");
  return (data.items || []).map((b) => ({ id: b.id, name: b.name, url: b.url }));
}

// isDraft=true 면 초안으로 올라간다. 실수로 공개 발행되는 걸 막기 위해 기본값으로 쓴다.
export async function publish({ blogId, title, content, labels = [], isDraft = true }) {
  const post = await apiFetch(`/blogs/${blogId}/posts?isDraft=${isDraft ? "true" : "false"}`, {
    method: "POST",
    body: JSON.stringify({ kind: "blogger#post", title, content, labels }),
  });
  return {
    id: post.id,
    url: post.url || "",
    editUrl: `https://www.blogger.com/blog/post/edit/${blogId}/${post.id}`,
  };
}
