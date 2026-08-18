# google-ad-program — 프로젝트 설계서 (Claude Code용)

> 이 파일은 로컬 Claude Code가 이 프로젝트를 이어서 개발할 때 읽는 **컨텍스트/지침서**입니다.
> 새 세션을 시작할 때 Claude Code가 자동으로 이 파일을 읽습니다.

## 1. 목적
Blogger(구글 블로그) 글쓰기 편집기에 아래 3가지 기능을 넣는 **개인용 크롬 확장 프로그램**(Manifest V3).
개발자 본인 1인 프로젝트이며, 노트북 여러 대에서 각자 API 키를 넣어 사용한다. 서버 없음.

## 2. 기능 명세 (3개 탭)
1. **AI 글쓰기 (Claude)** — 주제 키워드 + 글 유형(유틸리티/리뷰/정보/뉴스) + 언어를 받아 블로그 초안 생성 → 편집기 삽입/복사.
2. **AI 썸네일 (Gemini)** — 주제 키워드 + 썸네일 스타일을 받아 이미지 생성 → 미리보기 → 저장/편집기 삽입.
3. **버튼 설정 (마크업)** — 버튼 텍스트 + URL + 색상을 받아 HTML 버튼 스니펫 생성 → 복사/HTML 모드 삽입.

## 3. 아키텍처
```
manifest.json         MV3. host_permissions: blogger.com / api.anthropic.com / generativelanguage.googleapis.com
src/background.js     서비스 워커. 메시지(GEN_TEXT/GEN_IMAGE/PING) 처리. 여기서만 외부 API fetch.
src/content.js        Blogger 편집기에 3탭 패널 UI 주입 + 편집기 삽입 로직.
src/content.css       패널 스타일(gap- 접두사).
src/options.*         Anthropic/Gemini 키·모델 저장(chrome.storage.sync).
src/popup.*           키 등록 상태 표시 + 설정 열기.
```
메시지 흐름: content.js → `chrome.runtime.sendMessage` → background.js → 외부 API → 응답 반환.
**API 키는 코드에 절대 하드코딩하지 않는다.** 항상 chrome.storage에서 읽는다.

## 4. 외부 API 레퍼런스
### Claude (텍스트) — 확정
- POST `https://api.anthropic.com/v1/messages`
- 헤더: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`,
  그리고 브라우저 직접 호출 허용용 `anthropic-dangerous-direct-browser-access: true`
- 모델: `claude-sonnet-5`(기본) / `claude-haiku-4-5` / `claude-opus-5`
- 응답 텍스트: `data.content[].text` (type === "text")

### Gemini (이미지) — 빌드 시 최신 확인 필요 ⚠
- 문서: https://ai.google.dev/gemini-api/docs/image-generation
- 베이스라인 구현: POST `https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:generateContent`,
  헤더 `x-goog-api-key: <KEY>`, 바디 `{"contents":[{"parts":[{"text":"..."}]}], "generationConfig":{"responseModalities":["IMAGE"]}}`
- 응답 이미지: `candidates[0].content.parts[].inlineData.data` (base64) + `inlineData.mimeType`
- **모델 ID(`GEMINI_IMAGE_MODEL`)는 자주 갱신됨.** 첫 작업 시 문서에서 최신 이미지 모델 ID를 확인하고
  `background.js`의 상수를 갱신할 것. (예: gemini-2.5-flash-image → 이후 3.x 계열)
- Gemini 키 발급: https://aistudio.google.com/app/apikey

## 5. 빌드 단계 (권장 순서)
- [ ] **P0. 로드 확인** — `chrome://extensions` → 개발자 모드 → 압축해제 로드. 편집기에서 `✦ AI 도구` 버튼 보이는지.
- [ ] **P1. 글쓰기 탭** — options에 Claude 키 저장 → "글쓰기 키 테스트" 성공 → 실제 생성 확인.
- [ ] **P2. 편집기 삽입 정밀화** — Blogger 편집기 실제 DOM(iframe 구조) 확인 후 `content.js`의
      `editableTargets/tryInsertHTML/insertPlainText` 를 실제 구조에 맞게 보강. (아래 6번 함정 참고)
- [ ] **P3. 썸네일 탭** — Gemini 모델 ID 최신화 → 이미지 생성/미리보기 → 저장 → 삽입.
- [ ] **P4. 버튼 탭** — HTML 모드 삽입 동작 확인, 색상/스타일 옵션 확장.
- [ ] **P5. 다듬기** — 로딩 표시, 에러 메시지, 말투 프리셋, 히스토리 등.

## 6. 알려진 함정 / 주의
- **Blogger 편집기는 iframe + contenteditable** 구조라, 리치 텍스트 모드에서 `execCommand('insertHTML')`이
  항상 먹지 않는다. 그래서 현재 코드는 **복사 대체 경로**를 항상 제공한다. P2에서 실제 DOM을 열어보고
  (요소 검사) 정확한 타깃을 잡을 것. 버튼/이미지 같은 HTML은 **"HTML 보기" 모드 삽입**이 가장 안정적.
- content script는 페이지 CORS 제약을 받으므로 **외부 API 호출은 반드시 background(서비스 워커)에서** 한다.
- `chrome.storage.sync`는 크롬 계정 동기화 시 기기 간 공유될 수 있음. 기기별 다른 키를 원하면 각 기기에서 저장.
- 코드 수정 후 `chrome://extensions`에서 **새로고침(↻)** 해야 반영. content.css/js 변경은 페이지 새로고침도 필요.

## 7. 코딩 규칙
- 순수 JS(빌드 도구 없음), 한국어 주석 유지.
- UI 클래스 접두사 `gap-`(패널 공통) 유지 — Blogger CSS와 충돌 방지.
- 비밀정보(키) 커밋 금지. `.gitignore`에 개인 메모/키 파일 추가.

## 8. 지금 상태
v0.2 스캐폴드 — 3탭 UI, Claude 글쓰기 연동, Gemini 이미지 연동(베이스라인), 버튼 마크업 생성까지 동작.
다음 할 일은 위 P2(편집기 삽입 정밀화)와 P3(Gemini 모델 최신화)부터.
