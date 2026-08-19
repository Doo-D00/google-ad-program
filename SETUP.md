# 설치 / 설정 가이드

웹앱(`docs/`)을 쓰기 위해 한 번만 해두면 되는 준비 작업입니다.
**계정 작업이라 직접 하셔야 합니다.**

---

## 0. 어디서 실행하나

두 가지 중 하나(둘 다 등록해두면 편합니다).

| 방법 | 주소 |
|---|---|
| GitHub Pages | `https://dev-doo.github.io/google-ad-program/` |
| 로컬 | `http://localhost:8765` — `powershell -ExecutionPolicy Bypass -File dev-serve.ps1` |

**Pages는 이미 켜져 있습니다** (Source: `master` / `/docs`). `master` 에 푸시하면 1분 내로 반영됩니다.

> 이 리포는 **공개**입니다. 그래야 Pages(무료 계정)와 jsDelivr(4번 이미지 호스팅)가 동작합니다.
> 소스에는 키가 없습니다 — 전부 사용자가 입력해 각자 브라우저의 localStorage 에만 저장됩니다.
> 커밋 작성자 이메일은 `207117628+dev-doo@users.noreply.github.com` (개인 메일 노출 없음).
> **앞으로도 키를 코드에 넣지 마세요.** 공개 리포라 그대로 인터넷에 노출됩니다.

> `file://` 로 열면 안 됩니다. ES 모듈과 Google 로그인이 동작하지 않습니다.

---

## 1. Claude (글쓰기)

1. https://console.anthropic.com 에서 API 키 발급
2. 앱 → **설정** → Anthropic API 키에 붙여넣기 → **키 테스트** → 저장

모델은 `claude-sonnet-5`(기본) / `claude-haiku-4-5`(빠름) / `claude-opus-5`(고품질) 중 선택.

## 2. Gemini (썸네일)

1. https://aistudio.google.com/app/apikey 에서 키 발급
2. 앱 → 설정 → Gemini API 키에 붙여넣기 → 저장

> 이미지 모델 ID는 자주 바뀝니다. 생성이 실패하면 `docs/js/gemini.js` 의 `IMAGE_MODEL` 을
> [최신 문서](https://ai.google.dev/gemini-api/docs/image-generation)의 모델로 갱신하세요.

## 3. Google / Blogger (게시)

1. https://console.cloud.google.com 에서 프로젝트 생성
2. **API 및 서비스 → 라이브러리 → "Blogger API v3" 사용 설정**
3. **OAuth 동의 화면** 구성 — 외부(External), 테스트 사용자에 본인 계정 추가
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션**
5. **승인된 JavaScript 원본**에 위 0번의 주소를 등록
   - `https://dev-doo.github.io`
   - `http://localhost:8765`
6. 생성된 **클라이언트 ID**를 앱 → 설정 → OAuth 클라이언트 ID 에 저장
7. 앱 상단의 `Google 미연결` 칩을 클릭해 로그인하면 블로그 목록이 채워집니다

> ⚠ **2026-08-19 에 GitHub 계정 이름을 `Doo-D00` → `dev-doo` 로 바꿨습니다.** 옛 주소
> `https://doo-d00.github.io` 는 404 이므로, 승인된 JavaScript 원본에는 반드시
> **`https://dev-doo.github.io`** 를 등록하세요. 틀리면 로그인이 `origin mismatch` 로 실패합니다.
>
> **2026-08-19 현재 실제 상태** — 위 1~2번은 되어 있고(프로젝트 `pivotal-bonbon-471106-n0`,
> Blogger API v3 **사용 설정 완료**), **3~7번은 아직 안 되어 있습니다.** OAuth 동의 화면과
> 클라이언트가 아직 없으니 위 절차를 3번부터 그대로 진행하면 됩니다.

> 클라이언트 **시크릿은 필요 없습니다**. 브라우저에서 토큰만 받는 방식입니다.
> 토큰은 약 1시간 뒤 만료되며, 만료되면 다시 연결하면 됩니다.

## 4. 이미지 호스팅 (GitHub)

Blogger API에는 **이미지 업로드 엔드포인트가 없습니다.** 본문에 `<img src="...">` 로만
넣을 수 있어서 이미지를 어딘가에 올려야 합니다. 여기서는 GitHub 리포 + jsDelivr CDN을 씁니다.

1. 이미지를 담을 **공개 리포** 준비 (이 리포를 그대로 써도 됩니다)
2. https://github.com/settings/tokens → **Fine-grained token** 발급
   - Repository access: 해당 리포만
   - Permissions: **Contents → Read and write**
3. 앱 → 설정 → GitHub 토큰 / owner / repo / branch / 경로 프리픽스 저장

업로드되면 `https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{경로}` 형태의 URL이
본문에 삽입됩니다. **jsDelivr는 공개 리포만 서빙합니다.**

---

## 사용 흐름

1. 주제 키워드 입력 → **AI 콘텐츠 생성** (제목과 본문 HTML이 채워짐)
2. **AI 썸네일 생성** → **업로드 후 본문에 삽입**
3. 본문 HTML에서 원하는 위치에 커서를 두고 → **버튼 만들기** → 삽입
4. 미리보기 확인 → 우측 상단 **게시**

게시는 **초안으로**가 기본값입니다. 체크를 해제하면 바로 공개 발행되며 한 번 더 확인을 묻습니다.
