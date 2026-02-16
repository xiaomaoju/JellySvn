# JellySvn (SVN Antigravity) - 프로젝트 진행 현황 문서

> **목적**: 이 파일은 프로젝트의 전체 현황, 에이전트 팀 구성, 완료/진행/예정 작업을 문서화합니다.
> 새 세션에서 이 파일을 읽으면 즉시 프로젝트를 이어서 진행할 수 있습니다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | JellySvn (SVN Antigravity) |
| **유형** | Premium SVN GUI Client (Electron Desktop App) |
| **플랫폼** | macOS (ARM64) |
| **경로** | `.` |
| **버전** | v1.0.0 |
| **최종 업데이트** | 2026-02-16 |

---

## 2. 기술 스택

| 레이어 | 기술 | 파일 |
|--------|------|------|
| **Main Process** | Electron 33+, Node.js | `main.js` (431 lines) |
| **Preload Bridge** | contextBridge, 12 API methods | `preload.js` (32 lines) |
| **Frontend** | Vanilla JS | `app.js` (2,347 lines) |
| **UI** | Vanilla HTML5/CSS3, Glassmorphism Dark-mode | `index.html` (247 lines), `style.css` (1,567 lines) |
| **Legacy Server** | Python http.server | `server.py` (224 lines) |
| **Execution** | Python CLI wrapper | `execution/svn_tool.py` (50 lines) |
| **빌드** | electron-builder | `package.json` |
| **보안** | Electron safeStorage (암호 암호화) | `main.js` |

---

## 3. 디렉토리 구조

```
SvnGUITool/
├── .claude/                  ← Claude Code 설정
│   └── settings.local.json
├── Assets/
│   └── Agents/Core/          ← 레거시 데이터 (마이그레이션 완료)
├── dist/                     ← 빌드 산출물
│   ├── builder-debug.yml
│   └── mac-arm64/            ← macOS ARM64 빌드
├── execution/
│   └── svn_tool.py           ← Python SVN CLI wrapper
├── node_modules/             ← npm 의존성
├── .tmp/                     ← 임시 파일 (커밋 금지)
├── app.js                    ← 프론트엔드 로직 (2,347 lines)
├── CLAUDE.md                 ← Claude Code 프로젝트 지침
├── index.html                ← HTML 구조 + 모달
├── main.js                   ← Electron Main Process + IPC
├── package.json              ← npm 설정 + electron-builder
├── preload.js                ← Context Bridge (12 APIs)
├── server.py                 ← 레거시 Python 서버
├── style.css                 ← Glassmorphism Dark UI (1,567 lines)
└── PROJECT_PROGRESS.md       ← 이 파일
```

---

## 4. 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────┐
│                    Electron App                  │
│  ┌───────────────────────────────────────────┐  │
│  │         Renderer Process (Frontend)        │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │ app.js  │  │index.html│  │style.css │ │  │
│  │  │ (State  │  │(Modals,  │  │(Glassmor-│ │  │
│  │  │ Manager,│  │ Sidebar, │  │ phism UI)│ │  │
│  │  │ Views)  │  │ Layout)  │  │          │ │  │
│  │  └────┬────┘  └──────────┘  └──────────┘ │  │
│  │       │ window.api.*                       │  │
│  │  ┌────▼────┐                               │  │
│  │  │preload.js│  ← contextBridge (12 APIs)  │  │
│  │  └────┬────┘                               │  │
│  └───────┼───────────────────────────────────┘  │
│          │ ipcRenderer.invoke()                  │
│  ┌───────▼───────────────────────────────────┐  │
│  │          Main Process (main.js)            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ │  │
│  │  │ IPC      │ │ SVN      │ │ File      │ │  │
│  │  │ Handlers │ │ spawn()  │ │ Watcher   │ │  │
│  │  │ (14)     │ │ (CLI)    │ │ fs.watch()│ │  │
│  │  └──────────┘ └────┬─────┘ └───────────┘ │  │
│  │  ┌──────────┐      │      ┌────────────┐ │  │
│  │  │safeStorage│     │      │ Data Files │ │  │
│  │  │(암호 암호화)│     │      │(auth/proj/ │ │  │
│  │  └──────────┘      │      │ settings)  │ │  │
│  └────────────────────┼──────────────────────┘  │
│                       │                          │
└───────────────────────┼──────────────────────────┘
                        │ spawn('svn', args)
                   ┌────▼────┐
                   │ SVN CLI │
                   │ (시스템)  │
                   └─────────┘
```

---

## 5. 에이전트 팀 구성 (Agent Team)

### 5.1 팀 구조

| ID | 역할 | 담당 영역 | 주요 파일 | 상태 |
|----|------|-----------|-----------|------|
| **AG-PM** | PM / 아키텍트 | 전체 방향성, 코드 구조 설계, 작업 조율 | CLAUDE.md, PROJECT_PROGRESS.md | Active |
| **AG-CORE** | Core Dev (Backend/SVN) | SVN CLI 연동, IPC 핸들러, Electron Main | `main.js`, `preload.js` | Active |
| **AG-FRONT** | UI/UX 엔지니어 | 프론트엔드 뷰, 인터랙션, CSS 스타일링 | `app.js`, `style.css`, `index.html` | Active |
| **AG-QA** | QA / 보안 | 기능 검증, 엣지 케이스 테스트, 보안 검토 | 전체 | Active |
| **AG-DOC** | 테크니컬 라이터 | 문서화, 가이드 작성, CLAUDE.md 유지보수 | `CLAUDE.md`, `PROJECT_PROGRESS.md` | Active |

### 5.2 에이전트별 역할 상세

#### AG-PM (PM / 아키텍트)
- 새 기능 요구사항 분석 및 설계
- 에이전트 간 작업 우선순위 조율
- 아키텍처 결정 (새 IPC 핸들러 구조, 데이터 흐름 등)
- 코드 리뷰 및 통합 관리

#### AG-CORE (Core Dev)
- `main.js`에 새 IPC 핸들러 추가
- `preload.js`에 새 API 메서드 노출
- SVN CLI 명령어 래핑 및 에러 핸들링
- 데이터 파일 관리 (auth, projects, settings)

#### AG-FRONT (UI/UX 엔지니어)
- `app.js`에 새 뷰 렌더링 함수 추가
- `index.html`에 필요한 모달/구조 추가
- `style.css`에 새 컴포넌트 스타일 추가
- 키보드 단축키 확장

#### AG-QA (QA / 보안)
- 각 기능의 정상/비정상 경로 테스트
- SVN 명령어 실패 시나리오 검증
- UI 반응성 및 에러 메시지 검증
- 보안 취약점 점검 (인젝션, 경로 탐색 등)

#### AG-DOC (테크니컬 라이터)
- CLAUDE.md 업데이트 (완료 기능 체크, 새 백로그 추가)
- PROJECT_PROGRESS.md 현행화
- 코드 내 주요 함수 설명 유지

---

## 6. 완료된 기능 (Sprint 1~3 완료)

### Sprint 1: 핵심 기능 (완료)
- [x] Status view with file selection, Diff, Revert, Add, Delete
- [x] Checkout modal with native macOS folder picker
- [x] Auth modal with auto-retry on auth failure
- [x] Project tabs management (add, switch, remove)
- [x] Console logging with clear button
- [x] Update All (sidebar) / Selective file Update (bulk action bar)
- [x] Commit view (dedicated page with inline message input, Select All)
- [x] Revert view (dedicated page with bulk revert, Select All)
- [x] Log view with commit history, author, date, changed files (expandable)
- [x] Conflict resolution UI (Resolve mine / Resolve theirs / Revert)
- [x] Missing file status detection
- [x] CSS badges for all statuses
- [x] Glassmorphism dark-mode UI design

### Sprint 2: 고급 기능 (완료)
- [x] Advanced Filter: Log view with keyword, author, date range filtering
- [x] Diff Viewer: Side-by-side comparison mode with inline/SBS toggle
- [x] Auth Manager: Credential management view (list, add, edit, delete, test)
- [x] CORS support for cross-origin requests

### Sprint 3: 확장 기능 (완료)
- [x] Folder Tree View: directory tree navigation with SVN status per folder
- [x] SVN Properties: proplist/propget/propset/propdel with target path selector
- [x] Branch/Tag Manager: svn info, branch/tag listing, create (svn copy), switch
- [x] Auto-refresh: file watcher (fs.watch) with debounced status refresh
- [x] Keyboard Shortcuts: Ctrl+1-9 navigation, Ctrl+R/U, ?, Escape
- [x] Settings Page: theme selector (dark/midnight/forest), log limit, auto-refresh toggle
- [x] Password Encryption: Electron safeStorage with auto-migration
- [x] Real-time SVN Output Streaming: stdout/stderr → console panel
- [x] Operation Progress Overlay: spinner + label, button disable during operations

---

## 7. 현재 진행 작업 (Sprint 4: New Features)

### 7.1 백로그 항목

| 우선순위 | 기능 | 상태 | 담당 에이전트 | 설명 |
|----------|------|------|--------------|------|
| P1 | **SVN Lock/Unlock** | ✅ 완료 | AG-CORE + AG-FRONT | 파일 잠금/해제, 잠금 상태 표시, 잠금 정보 확인 |
| P2 | **Blame/Annotate** | ✅ 완료 | AG-CORE + AG-FRONT | 파일별 라인 단위 작성자/리비전 표시 |
| P3 | **Merge Operations** | ✅ 완료 | AG-CORE + AG-FRONT | 소스/타겟 선택, 머지 프리뷰, 충돌 처리 |
| P4 | **Export/Import** | ✅ 완료 | AG-CORE + AG-FRONT | 워킹 카피/저장소 내보내기, 로컬 폴더 가져오기 |
| P5 | **Search (Repository)** | ✅ 완료 | AG-CORE + AG-FRONT | 파일명/내용 기반 저장소 전체 검색 (IPC 추가) |

### 7.2 기능별 구현 계획

#### P1: SVN Lock/Unlock Management
```
구현 범위:
- main.js: (기존 run-svn 활용, 추가 IPC 불필요)
- app.js:
  - state에 lockInfo 추가
  - 'lock' 뷰 또는 status 뷰 내 잠금 상태 표시
  - renderLockView() 또는 status 뷰에 lock/unlock 버튼 추가
  - fetchLockStatus() → svn status 결과에서 잠금(K/O/B/T) 파싱
- index.html: 사이드바에 Lock 네비게이션 버튼 추가 (또는 status에 통합)
- style.css: lock 관련 badge 스타일

SVN 명령어:
  - svn lock <path> -m "message"    → 파일 잠금
  - svn unlock <path>               → 파일 해제
  - svn status -u                   → 잠금 상태 확인 (6번째 컬럼: K=내가 잠금, O=타인 잠금)
  - svn info <path>                 → Lock Owner, Lock Created 정보
```

#### P2: Blame/Annotate View
```
구현 범위:
- app.js:
  - renderBlameView() 함수 추가
  - fetchBlame(filePath) → svn blame 실행 후 파싱
  - 파일 선택 UI (드롭다운 또는 입력)
  - 라인별 author/revision/date 표시 (색상 구분)
- index.html: 사이드바에 Blame 네비게이션 추가
- style.css: blame 전용 스타일 (라인 넘버, 작성자 컬럼)

SVN 명령어:
  - svn blame <path>                → 라인별 리비전 + 작성자
  - svn blame -v <path>             → 상세 (날짜 포함)
```

#### P3: Merge Operations
```
구현 범위:
- app.js:
  - renderMergeView() 함수
  - 소스 URL 선택 (branch/tag 목록에서)
  - 리비전 범위 지정 UI
  - 머지 프리뷰 (--dry-run)
  - 머지 실행 + 충돌 시 status 뷰로 이동
- index.html: 사이드바에 Merge 네비게이션 추가

SVN 명령어:
  - svn merge <source-url> [--dry-run]           → 머지 (프리뷰)
  - svn merge -r N:M <source-url>                → 리비전 범위 머지
  - svn merge --reintegrate <branch-url>         → 브랜치 재통합
```

#### P4: Export/Import
```
구현 범위:
- app.js:
  - renderExportImportView() 함수
  - Export: URL 또는 워킹카피 경로 + 대상 폴더 선택
  - Import: 로컬 폴더 + 대상 SVN URL + 커밋 메시지

SVN 명령어:
  - svn export <url|path> <local-path>           → 내보내기
  - svn import <local-path> <url> -m "msg"       → 가져오기
```

#### P5: Search Across Repository
```
구현 범위:
- app.js:
  - renderSearchView() 함수
  - 검색 입력 UI (키워드, 파일 패턴)
  - grep 기반 검색 결과 표시

방법:
  - svn list -R <url> | grep <pattern>           → 파일명 검색
  - 로컬 워킹 카피에서 grep/find 활용             → 내용 검색
```

---

## 8. IPC API 현황 (preload.js 기준)

| API Method | IPC Channel | 용도 |
|------------|-------------|------|
| `loadProjects()` | `load-projects` | 프로젝트 목록 로드 |
| `saveProject(project)` | `save-project` | 프로젝트 저장 |
| `deleteProject(path)` | `delete-project` | 프로젝트 삭제 |
| `loadAuth()` | `load-auth` | 인증 정보 로드 (패스워드 제외) |
| `saveAuth(creds)` | `save-auth` | 인증 정보 저장 |
| `deleteAuth(urlKey)` | `delete-auth` | 인증 정보 삭제 |
| `runSvn(command, cwd, url)` | `run-svn` | SVN 명령 실행 |
| `onSvnOutput(callback)` | `svn-output` | SVN 실시간 출력 수신 |
| `browseFolder()` | `browse-folder` | 네이티브 폴더 선택 |
| `validateRepo(path)` | `validate-repo` | SVN 저장소 유효성 검사 |
| `deleteFile(filePath, cwd)` | `delete-file` | 파일/폴더 삭제 |
| `listDirectory(dirPath)` | `list-directory` | 디렉토리 목록 |
| `loadSettings()` | `load-settings` | 설정 로드 |
| `saveSettings(settings)` | `save-settings` | 설정 저장 |
| `watchDirectory(dirPath)` | `watch-directory` | 파일 감시 시작 |
| `unwatchDirectory()` | `unwatch-directory` | 파일 감시 중지 |
| `onFileChanged(callback)` | `file-changed` | 파일 변경 이벤트 수신 |

---

## 9. UI 네비게이션 구조

```
사이드바 (현재)              사이드바 (Sprint 4 완료 후)
├── 📊 Status               ├── 📊 Status
├── 📥 Update All           ├── 📥 Update All
├── 📤 Commit               ├── 📤 Commit
├── 🔄 Revert               ├── 🔄 Revert
├── 🚀 Checkout             ├── 🚀 Checkout
├── 📜 Log                  ├── 📜 Log
├── 📁 Tree                 ├── 📁 Tree
├── 🔑 Auth                 ├── 🔑 Auth
├── 📋 Properties           ├── 📋 Properties
├── 🌿 Branch               ├── 🌿 Branch
├── ───                      ├── 🔒 Lock        ← NEW (P1)
├── ⚙️ Settings              ├── 👤 Blame       ← NEW (P2)
└──                          ├── 🔀 Merge       ← NEW (P3)
                             ├── 📦 Export       ← NEW (P4)
                             ├── 🔍 Search       ← NEW (P5)
                             ├── ───
                             └── ⚙️ Settings
```

---

## 10. 키보드 단축키 현황

| 단축키 | 기능 | 업데이트 필요 |
|--------|------|--------------|
| Ctrl+1 | Status | - |
| Ctrl+2 | Commit | - |
| Ctrl+3 | Revert | - |
| Ctrl+4 | Log | - |
| Ctrl+5 | Tree | - |
| Ctrl+6 | Auth | - |
| Ctrl+7 | Properties | - |
| Ctrl+8 | Branch | - |
| Ctrl+9 | Settings | 재배정 필요 (새 뷰 추가 시) |
| Ctrl+R | Refresh | - |
| Ctrl+U | Update All | - |
| Ctrl+Enter | Commit (커밋 뷰) | - |
| Escape | 모달 닫기 | - |
| ? | 단축키 도움말 | 새 단축키 추가 반영 필요 |

---

## 11. 새 세션에서 이어서 진행하는 방법

### 빠른 시작
```bash
# 1. 프로젝트 디렉토리로 이동
cd .

# 2. 앱 실행 (개발 모드)
npm start

# 3. 빌드
npm run build
```

### Claude Code에게 전달할 컨텍스트
```
프로젝트 경로: .
1. CLAUDE.md를 먼저 읽어주세요
2. PROJECT_PROGRESS.md를 읽어서 현재 진행 상황을 파악해주세요
3. Sprint 4 백로그(섹션 7)를 확인하고 다음 작업을 이어서 진행해주세요
```

### 작업 완료 시 업데이트 체크리스트
- [ ] `PROJECT_PROGRESS.md` 섹션 7 상태 업데이트 (🔲 → ✅)
- [ ] `CLAUDE.md` 완료된 기능 체크 및 백로그 업데이트
- [ ] `preload.js` API 변경 시 섹션 8 업데이트
- [ ] 새 네비게이션 추가 시 섹션 9 업데이트
- [ ] 새 단축키 추가 시 섹션 10 업데이트

---

## 12. 알려진 이슈 및 참고 사항

### 구조적 참고
- `server.py`는 Electron 전환 이전의 레거시 서버. 현재는 `main.js`가 모든 백엔드 처리 담당
- `execution/svn_tool.py`는 독립 CLI wrapper로, Electron 앱에서는 직접 사용하지 않음 (main.js가 직접 svn spawn)
- 데이터 파일(auth.json, projects.json, settings.json)은 `app.getPath('userData')`에 저장됨
- 구 경로(`Assets/Agents/Core/`)에서 자동 마이그레이션 로직 포함

### SVN 인증 흐름
1. `run-svn` IPC → loadAuthWithDecrypt() → credentials 복호화
2. `--username` 플래그로 사용자명 전달
3. stdin으로 패스워드 전달 (프로세스 목록 노출 방지)
4. stdin 실패 시 `--password` 플래그로 폴백 재시도
5. 인증 실패 시 프론트엔드에서 Auth Modal 자동 표시 → 재시도

### 테마 시스템
- CSS 변수 기반: `--bg-deep`, `--bg-dark`, `--accent-primary`, `--accent-secondary`
- 3개 테마: dark (기본), midnight, forest
- `applyTheme()` 함수에서 `document.documentElement.style.setProperty()` 방식

---

## 13. Sprint 4 구현 완료 로그 (2026-02-16)

### 수정된 파일 요약

| 파일 | 변경 전 | 변경 후 | 주요 변경 |
|------|---------|---------|-----------|
| `app.js` | 2,347 lines | 3,187 lines (+840) | 5개 뷰 + 상태 + 헬퍼 함수 추가 |
| `style.css` | 1,567 lines | 2,276 lines (+709) | Lock/Blame/Merge/Search + 기존 누락 스타일 추가 |
| `index.html` | 247 lines | 262 lines (+15) | 사이드바 5개 네비게이션 버튼 추가 |
| `main.js` | 431 lines | 514 lines (+83) | search-files IPC 핸들러 추가 |
| `preload.js` | 32 lines | 33 lines (+1) | searchFiles API 메서드 노출 |

### 에이전트 실행 기록

| 에이전트 | 작업 | 소요 시간 | 상태 |
|----------|------|-----------|------|
| AG-CORE+FRONT #1 | Lock/Unlock + Blame | ~7분 | 완료 |
| AG-CORE+FRONT #2 | Merge + Export/Import | ~6.5분 | 완료 |
| AG-CORE+FRONT #3 | Search (+ IPC) | ~5분 | 완료 |
| AG-QA (Verifier) | 통합 검증 | ~2분 | ALL CLEAR |

### 검증 결과
- JavaScript 문법 검증: app.js, main.js, preload.js 모두 통과 (node -c)
- 함수 중복 없음
- HTML ID 중복 없음
- 모든 뷰 라우팅 정상 (state → switchView → render → renderXxxView)
- 누락된 기존 CSS 스타일 보강 완료 (Settings, Properties, Branch, Shortcuts, Nav-spacer, Toggle-switch)

---

*마지막 업데이트: 2026-02-16*
*작성: AG-PM + AG-DOC*
