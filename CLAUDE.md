# google-ad-program — 프로젝트 설계서 (Claude Code용)

> 이 파일은 로컬 Claude Code가 이 프로젝트를 이어서 개발할 때 읽는 **컨텍스트/지침서**입니다.
> 새 세션을 시작할 때 Claude Code가 자동으로 이 파일을 읽습니다.

## 1. 목적
키워드 하나로 **블로그 글 + 썸네일 + 본문 버튼**을 만들고 **버튼 한 번으로 Blogger에 게시**하는
개인용 도구. 서버 없음, 빌드 도구 없음. 정적 웹앱이고 GitHub Pages로 서빙한다.

- 앱: `https://dev-doo.github.io/google-ad-program/` (Pages 켜짐: `master` 브랜치 `/docs`)
- 자체 검증: `https://dev-doo.github.io/google-ad-program/dev/selftest.html` (키 없이 순수 로직 28건)
- 로컬: `powershell -ExecutionPolicy Bypass -File dev-serve.ps1` → `http://localhost:8765`
- 설정/키 준비 절차는 **`SETUP.md`** 참고 (계정 작업이라 사람이 직접 해야 함)
- **리포는 공개다. 키를 코드에 넣지 말 것.** 커밋 이메일은 noreply 로 통일되어 있다.

> **왜 크롬 확장이 아닌가**: 게시까지 API로 하면 Blogger 편집기 DOM에 붙을 이유가 없다.
> 남의 DOM에 의존하면 계속 깨지고, 자체 UI여야 미리보기·버튼 삽입 UX를 마음대로 만들 수 있다.
> 확장 버전은 `src/` 에 남아 있으나 **더 이상 쓰지 않는다**(9번 참고).

## 2. 기능
1. **AI 글쓰기 (Gemini)** — 키워드 + 글 유형 + 언어 → 제목/본문 초안. 마크다운을 HTML로 변환해 넣는다.
2. **AI 썸네일 (Gemini)** — 키워드 + 스타일 → 이미지 생성 → 축소 → 본문에 data URI `<img>` 삽입.
3. **버튼 만들기** — 텍스트/링크/색 → 본문 커서 위치에 버튼 HTML 삽입.
4. **게시 (Blogger API)** — 우측 상단 버튼. 기본은 **초안**, 체크 해제 시 공개 발행(한 번 더 확인).

> **사용자가 넣어야 하는 값은 두 개뿐이다: Gemini API 키, OAuth 클라이언트 ID.**
> 2026-08-19 에 키를 Gemini 하나로 통일했다. 사용자가 Anthropic 키와 GitHub 토큰을 발급하지
> 못해서, 글쓰기를 Claude → Gemini 로 옮기고 이미지 호스팅(GitHub)을 없앴다.
> 게시는 Google 로그인(OAuth)이라 애초에 키가 필요 없다.

## 3. 아키텍처
```
docs/index.html       화면 구조 + 설정 대화상자
docs/app.css          스타일 (앱 셸: 좌 도구 패널 / 우 본문+미리보기, 각각 독립 스크롤)
docs/js/app.js        흐름 제어. 버튼 핸들러, 커서 삽입, 미리보기, 게시
docs/js/store.js      설정 저장 (localStorage). 키는 소스에 없다
docs/js/markdown.js   마크다운 → HTML, 첫 줄 "# 제목" 분리, esc/escAttr
docs/js/gemini.js     Gemini 텍스트 생성 + 이미지 생성 (키 하나로 둘 다)
docs/js/embed.js      이미지를 본문에 넣기 전 캔버스로 축소 → JPEG data URI
docs/js/blogger.js    Google 로그인(GIS) + Blogger API v3 발행
dev-serve.ps1         docs/ 를 localhost:8765 로 띄우는 개발용 서버
```
외부 의존성은 Google 로그인 스크립트(`accounts.google.com/gsi/client`) 하나뿐. 나머지는 순수 JS.

## 4. 외부 API 레퍼런스
### Gemini (텍스트)
- POST `https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:generateContent`
- 헤더 `x-goog-api-key`
- 바디: `{"systemInstruction":{"parts":[{"text":"..."}]},"contents":[{"role":"user","parts":[{"text":"..."}]}],`
  `"generationConfig":{"maxOutputTokens":16384}}`
- 응답: `candidates[0].content.parts[].text` (thought 파트는 제외), `finishReason`,
  차단 시 `promptFeedback.blockReason`
- 모델(2026-08-19 무료 한도 실측): `gemini-3.1-flash-lite`(**기본** — 3~5초에 안정적으로 성공) /
  `gemini-3.7-flash`(품질은 낫지만 503 과부하가 잦다) / `gemini-2.5-pro`(429, 무료 한도로는 거의 못 쓴다)
- 503/500 과 초당 제한형 429 는 2초·5초 간격으로 두 번 더 재시도한다. 요금제 한도형 429 는
  기다려도 안 풀리므로 재시도하지 않고 바로 알린다(`isPlanQuota`).
- `maxOutputTokens` 는 넉넉히. Gemini 3 도 thinking 이 출력 토큰을 나눠 쓰므로 작게 잡으면 본문이 빈다.
- **`systemInstruction` 을 거부하면 지시를 본문 앞에 붙여 한 번 재시도한다**(`gemini.js` 참고).
  형식이 바뀌어도 조용히 죽지 않게 하려는 안전장치다.

### Gemini (이미지)
- POST `https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:generateContent`
- 헤더 `x-goog-api-key`, 바디 `{"contents":[{"parts":[{"text":"..."}]}],"generationConfig":{"responseModalities":["IMAGE"]}}`
- 응답: `candidates[0].content.parts[].inlineData.data` (base64) + `inlineData.mimeType`
- **`IMAGE_MODEL` 은 자주 갱신된다.** 실패하면 문서에서 최신 ID 확인 후 `docs/js/gemini.js` 갱신.
  https://ai.google.dev/gemini-api/docs/image-generation
- 2026-08-19 기준 현행은 Gemini 3 계열이다. `gemini-3.1-flash-image`(기본값) /
  `gemini-3.1-flash-lite-image`(싸고 빠름) / `gemini-3-pro-image`(고품질).
  `gemini-2.5-flash-image` 는 legacy 로 내려갔다.

### Blogger (게시)
- 발행: POST `https://www.googleapis.com/blogger/v3/blogs/{blogId}/posts?isDraft=true|false`
- 블로그 목록: GET `https://www.googleapis.com/blogger/v3/users/self/blogs`
- 스코프: `https://www.googleapis.com/auth/blogger`
- 인증: GIS 토큰 방식(`google.accounts.oauth2.initTokenClient`). **클라이언트 시크릿 불필요.**

## 5. 빌드 단계
- [x] **W0. 뼈대** — 화면, 설정 저장, 커서 삽입, 미리보기. (버튼 삽입/미리보기는 실제 브라우저 검증 완료)
- [x] **W1. 글쓰기** — 2026-08-19 실제 키로 성공. `gemini-3.1-flash-lite` 로 3~5초, 1100~1300자,
      "# 제목" 출력 형식도 지켜졌다. 말투 다듬기는 W4 로 미룬다.
- [ ] **W2. 썸네일** — ⛔ **무료 한도로는 막혀 있다.** 이미지 모델 4개 전부 429
      (`exceeded your current quota ... check your plan and billing`). 코드 문제가 아니라 요금제 문제다.
      결제를 붙이면 그때 확인한다. 축소/삽입 로직은 selftest 로 검증돼 있다.
- [ ] **W3. 게시** — ~~Cloud Console 설정(SETUP.md)~~(완료) → 로그인 → 초안 게시 → 공개 발행 확인.
      브라우저 CORS 는 통과 확인됨(8번 참고). **data URI 이미지를 Blogger 가 받아주는지는 미검증** ↓
- [ ] **W4. 다듬기** — 라벨(태그) 입력, 이미지 여러 장, 초안 불러와 수정, 히스토리 등.

## 6. 알려진 함정 / 주의
- **Blogger API v3 에는 이미지 업로드 엔드포인트가 없다.** 본문에 `<img src="...">` 로만 넣을 수 있다.
  예전에는 GitHub + jsDelivr 로 호스팅했지만, 키를 Gemini 하나로 통일하면서 **본문에 data URI 로
  직접 싣는 방식**으로 바꿨다(`embed.js`). 원본을 그대로 실으면 글이 몇 MB 가 되므로 가로 1200px /
  JPEG 로 줄여서 넣는다.
- ⚠ **data URI 를 Blogger 가 받아주는지는 아직 실제로 확인하지 않았다.** 거부되거나 용량 제한에
  걸리면 [이미지 저장]으로 내려받아 Blogger 편집기에서 직접 넣는 경로로 안내한다(버튼은 이미 있다).
  그것도 아니면 GitHub 업로드를 되살린다 — 지운 코드는 `docs/js/github.js` 로 git 이력에 있다
  (커밋 `3b92411` 시점).
- **`file://` 로 열면 안 된다.** ES 모듈과 OAuth 원본 검사가 동작하지 않는다. 반드시 http 로 띄운다.
- **OAuth 승인된 JavaScript 원본**에 실제 사용할 주소를 모두 등록해야 한다
  (`https://dev-doo.github.io`, `http://localhost:8765`).
- 액세스 토큰은 약 1시간짜리이고 갱신 토큰이 없다. 만료되면 다시 연결하면 된다.
- 게시 기본값은 **초안**. 실수로 공개 발행되는 걸 막기 위한 것이니 바꾸지 말 것.
- 상태 표시 헬퍼는 `className` 을 통째로 덮어쓰지 말 것 — 식별용 클래스가 날아가 다음 호출에서
  요소를 못 찾는다. (확장 버전에서 실제로 났던 버그. `classList` 만 교체한다.)
- 속성값(href/alt)에는 `escAttr` 을 쓴다. `esc` 는 따옴표를 막지 않아 URL 하나로 태그가 깨진다.

## 7. 코딩 규칙
- 순수 JS(빌드 도구 없음), ES 모듈, 한국어 주석 유지.
- 비밀정보(키/토큰) 커밋 금지. 전부 사용자 입력 → localStorage.
- 게시·업로드처럼 되돌리기 어려운 동작은 기본값을 안전한 쪽으로 둔다.

## 8. 지금 상태 (2026-08-19 기준)
정적 웹앱 완성 + 배포됨. 리포 공개 전환, Pages 켜짐, 커밋 이메일 noreply 통일까지 끝.

**2026-08-19 GitHub 계정 이름 변경: `Doo-D00` → `dev-doo`**
앱 주소가 `https://dev-doo.github.io/google-ad-program/` 로 바뀌었다. 옛 주소는 404 다
(GitHub 는 리포 URL 은 리다이렉트해주지만 Pages 주소는 안 해준다). 리모트 URL, 커밋 이메일,
문서는 갱신 완료.
**2026-08-19 키를 Gemini 하나로 통일**
사용자가 Anthropic 키와 GitHub 토큰을 발급하지 못해, 글쓰기를 Claude → Gemini 로 옮기고
(`claude.js` 삭제) 이미지 호스팅을 없앴다(`github.js` 삭제, `embed.js` 로 data URI 삽입).
설정에 남아 있던 옛 키(`anthropicKey`, `ghToken` 등)는 `store.js` 의 `migrate()` 가 읽을 때
한 번 지운다 — 안 쓰는 토큰을 브라우저에 남기지 않으려는 것이다.
**Cloud Console 설정 완료(2026-08-19)**: OAuth 클라이언트는 이름 변경으로 깨진 게 아니라 애초에
없었다. 이번에 프로젝트 `pivotal-bonbon-471106-n0` 에 Blogger API v3 사용 설정, 동의 화면(외부/
테스트 중, 테스트 사용자 `doosw02@gmail.com`), 웹 클라이언트(원본 `https://dev-doo.github.io`,
`http://localhost:8765`)까지 만들었고 클라이언트 ID 는 Pages 주소의 localStorage 에 저장했다.
**W3 는 이제 실제 로그인 클릭만 남았다** — 여기서 Blogger CORS 통과 여부가 처음 확인된다.

**브라우저에서 실제로 검증한 것**
- 화면 로딩(콘솔 에러 없음), 커서 위치 버튼 삽입, 미리보기 렌더
- 미리보기 iframe 샌드박스 — 주입한 `<script>` 가 실행되지 않음
- 초안 자동 저장/복원, 빈 값으로 덮어쓰지 않음
- `dev/selftest.html` 35건 통과 (이미지 축소 로직 포함)
- 설정 마이그레이션 — 옛 `anthropicKey`/`ghToken` 이 실제로 지워지고 Gemini 키/클라이언트 ID 는 남음
- Gemini 텍스트 3개 모델 모두 잘못된 키로 호출 시 401/400 이 읽힘(엔드포인트·오류 처리 정상)

**아직 실제 키로 검증하지 않은 것 — 다음 세션의 시작점**
W1(Gemini 글 생성) → W2(Gemini 썸네일 + 본문 삽입) → W3(Blogger 게시) 순으로 확인한다.
**사용자가 넣어야 할 건 Gemini 키 하나뿐이다**(클라이언트 ID 는 이미 저장돼 있다).
화면에 뜬 오류 메시지를 기준으로 잡는다.

**CORS 는 2026-08-19 에 네 API 모두 통과 확인했다(키 없이).** Pages 오리진에서 가짜 자격증명으로
호출해 401/403 응답 본문을 읽을 수 있는지로 확인했다 — Blogger 401, Anthropic 401, Gemini 400,
GitHub 401. **즉 프록시나 확장 회귀 같은 구조 변경은 필요 없다.** 같은 확인이 다시 필요하면
브라우저 콘솔에서 잘못된 키로 한 번 호출해 보면 된다(네트워크 오류가 아니라 상태 코드가 읽히면 통과).

남은 위험과 대응:
1. **data URI 이미지를 Blogger 가 받아주는지** — 가장 불확실한 부분이다. 6번 항목의 대응을 따른다.
2. **Gemini 텍스트 요청 형식** — `systemInstruction` 이 거부되면 `gemini.js` 가 알아서 한 번
   재시도한다. 그래도 400 이면 응답 본문에 Google 이 이유를 적어주니 그걸 보고 고친다.
3. **모델 ID** — 텍스트/이미지 모두 자주 갱신된다. "본문이 비어 있습니다"/"이미지 응답을 찾지
   못했습니다"/404 면 문서에서 최신 ID 확인 후 `docs/js/gemini.js` 갱신.
4. **W3 OAuth 403** — 동의 화면 테스트 사용자 미등록, 또는 이 계정이 해당 블로그 관리자가 아닐 때.
   (Blogger API 사용 설정과 테스트 사용자 등록은 2026-08-19 에 끝냈다.)

## 9. 레거시: 크롬 확장 (`src/`, `manifest.json`)
Blogger 편집기에 패널을 주입하던 v0.2~P2 버전. 웹앱으로 전환하면서 사용 중단했다.
지우지 않고 둔 이유는 삽입 엔진(캐럿 기억, 모드 판별, 마크다운 변환)이 참고할 가치가 있어서다.
`docs/js/markdown.js` 는 이 코드에서 가져왔다. 웹앱이 안정되면 삭제해도 된다.
