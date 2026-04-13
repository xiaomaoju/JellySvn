# SVN Antigravity - Claude Code 프로젝트 지침

## 프로젝트 개요
- **Name**: JellySvn (SVN Antigravity)
- **Goal**: Premium SVN GUI Client (Electron Desktop App)
- **Status**: Sprint 7 Complete — i18n, SVN Externals, Drag & Drop (2026-03-05)

## 컴포넌트 맵
- **Frontend**: Vanilla JS (app.js), Vanilla CSS (style.css), HTML5 (index.html)
- **Main Process**: `main.js` (Electron IPC, SVN spawn, file watcher, encryption)
- **Preload Bridge**: `preload.js` (contextBridge, 18 API methods)
- **Execution Logic**: `execution/svn_tool.py` (standalone CLI wrapper)
- **SOP**: 아래 SVN 표준 운영 절차 참고

## 완료된 기능
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
- [x] CSS badges for all statuses (added, modified, deleted, untracked, conflict, missing)
- [x] Glassmorphism dark-mode UI design
- [x] CORS support for cross-origin requests
- [x] Advanced Filter: Log view with keyword, author, date range filtering
- [x] Diff Viewer: Side-by-side comparison mode with inline/SBS toggle
- [x] Auth Manager: Credential management view (list, add, edit, delete, test)
- [x] Folder Tree View: directory tree navigation with SVN status per folder
- [x] SVN Properties: proplist/propget/propset/propdel with target path selector
- [x] Branch/Tag Manager: svn info, branch/tag listing, create (svn copy), switch
- [x] Auto-refresh: file watcher (fs.watch) with debounced status refresh
- [x] Keyboard Shortcuts: Ctrl+1-9 navigation, Ctrl+R/U, ?, Escape
- [x] Settings Page: theme selector (dark/midnight/forest), log limit, auto-refresh toggle
- [x] Password Encryption: Electron safeStorage with auto-migration
- [x] Real-time SVN Output Streaming: stdout/stderr → console panel
- [x] Operation Progress Overlay: spinner + label, button disable during operations
- [x] SVN Lock/Unlock Manager: lock/unlock files, lock status display, lock info, force unlock
- [x] Blame/Annotate View: line-by-line author/revision display, author color-coding
- [x] Merge Operations: source URL, revision range, dry-run preview, reintegrate merge
- [x] Export/Import: working copy/URL export, local folder import with commit message
- [x] Repository Search: filename and content search with highlighted results
- [x] SVN Cleanup: cleanup, vacuum, remove unversioned (svn cleanup)
- [x] SVN Copy/Move/Rename: file copy (svn copy) and move/rename (svn move) operations
- [x] SVN Ignore Management: svn:ignore editor with pattern add/remove, quick-add, raw edit, global ignores
- [x] Patch Create/Apply: generate unified diff patches, apply/dry-run/reverse patches
- [x] SVN Relocate: change repository URL (svn relocate) with auto-detect
- [x] SVN Changelist: organize files into named groups (svn changelist), commit per changelist
- [x] Sidebar scroll: scrollable navigation menu for many items
- [x] Update to Revision: update working copy to specific revision (svn update -r REV)
- [x] Revert to Revision: revert to/undo specific revision via Log view (svn merge)
- [x] Compare two Revisions: select 2 revisions in Log view and diff them
- [x] Repository Browser: browse remote SVN repository (svn list), copy to for branch/tag
- [x] Shelve/Unshelve: temporarily save/restore changes (svn shelve/unshelve + patch fallback)
- [x] External Diff Tool: settings for FileMerge, VS Code, BBEdit, KDiff3 (IPC handler)
- [x] Commit view file filtering: search/filter files in commit view by name/path
- [x] Status view Ignore button: quick-add untracked files to svn:ignore from status
- [x] Working Copy Upgrade: upgrade older SVN working copy format (svn upgrade)
- [x] Remote URL Log: view svn log from remote URL without checkout
- [x] i18n: Multi-language support (English/한국어), dynamic sidebar, t() function, language settings
- [x] SVN Externals: svn:externals management (view/add/edit/remove/raw edit/update)
- [x] Drag & Drop: external file drop to add, card drag selection, tree view svn move

## 에이전트 팀 역할 (R&R)

| 역할 | 책임 | 핵심 역량 |
|------|------|-----------|
| **PM (팀 리더)** | 프로젝트 방향성 설정, 에이전트 간 작업 조율, 병목 구간 식별 | 아키텍처 설계, 리스크 관리, 로드맵 수립 |
| **Core Dev (Backend/SVN)** | SVN CLI 인터페이스 연동, Checkout/Commit 등 핵심 로직 최적화 | SVN 명령어 체계, 파일 I/O, 비동기 처리 |
| **QA/보안** | 단위/통합 테스트, 대규모 리포지토리 예외 상황 검증 | 엣지 케이스 탐색, 충돌 시나리오 테스트 |
| **UI/UX 엔지니어** | 사용자 대시보드 및 상태 정보 시각화, 인터랙션 개선 | 데이터 시각화, 인터랙션 디자인 |
| **테크니컬 라이터** | API 문서, 설치 가이드, 트러블슈팅 가이드 작성 | Markdown 표준화, 주석 자동화 |

## 개발 워크플로우 (Integration Strategy)

1. **레거시 코드 분석 (PM)**: 기존 소스 스캔 → 구현 완성도 평가 → 리팩토링 지점 도출
2. **핵심 기능 확장 (Core)**: Update, Commit, Merge 로직 강화 → `.svn` 메타데이터 정합성 유지
3. **안정성 검증 (QA)**: 파일 잠금(Lock), 이진 파일 충돌, 네트워크 단절 등 실무 오류 시뮬레이션

## 에이전트별 첫 번째 태스크

- **PM**: 기존 코드의 모듈 구조 파악 → 전체 클래스 다이어그램 생성
- **Core**: Checkout 기능에 이어 대량 파일 안전 Commit 트랜잭션 로직 작성
- **QA**: 기존 기능의 잠재적 레이스 컨디션(Race Condition) 체크 테스트 코드 작성

## 기술 스택

- **Runtime**: Electron 33+ (macOS, hiddenInset titlebar)
- **Language**: Vanilla JS (Frontend), Node.js (Main Process), Python (Execution)
- **SVN Interface**: Native CLI Wrapper (spawn('svn', args) in main.js)
- **UI**: Vanilla HTML5/CSS3/JS (Glassmorphism dark-mode, Outfit font)
- **Security**: Electron safeStorage for password encryption, contextIsolation

## Next Steps (Backlog)

**우선 개발 (Next Sprint):**
- ~~Advanced Filter: 날짜, 작성자, 키워드별 로그 필터링 및 검색~~ ✅ 완료
- ~~Diff Viewer: inline 또는 side-by-side 비교 모달~~ ✅ 완료
- ~~Auth Manager: SVN 서버 인증(ID/PW, SSH) 세션 유지 강화~~ ✅ 완료

**추가 개발 (이전 백로그 — 모두 완료):**
- ~~Add SVN Properties view (svn proplist/propget)~~ ✅ 완료
- ~~Add branch/tag management (svn copy/switch)~~ ✅ 완료
- ~~Add auto-refresh / file watcher~~ ✅ 완료
- ~~Add keyboard shortcuts~~ ✅ 완료
- ~~Add settings page (theme, default credentials, log limit)~~ ✅ 완료

**Sprint 4 (완료):**
- ~~SVN Lock/Unlock management (svn lock/unlock)~~ ✅ 완료
- ~~Blame/Annotate view (svn blame)~~ ✅ 완료
- ~~Merge operations (svn merge)~~ ✅ 완료
- ~~Export/Import functionality~~ ✅ 완료
- ~~Search across repository~~ ✅ 완료

**Sprint 5 (완료):**
- ~~SVN Cleanup (svn cleanup, vacuum, remove unversioned)~~ ✅ 완료
- ~~SVN Copy/Move/Rename (svn copy, svn move)~~ ✅ 완료
- ~~SVN Ignore Management (svn:ignore editor, quick-add, raw edit, global ignores)~~ ✅ 완료
- ~~Patch Create/Apply (unified diff, apply/dry-run/reverse)~~ ✅ 완료
- ~~SVN Relocate (svn relocate with auto-detect)~~ ✅ 완료
- ~~SVN Changelist (svn changelist, commit per changelist)~~ ✅ 완료
- ~~Sidebar scroll (scrollable navigation menu)~~ ✅ 완료

**Sprint 6 (완료 — SnailSVN 기능 비교 기반):**
- ~~Update to Revision (svn update -r REV, Tools 뷰)~~ ✅ 완료
- ~~Revert to Revision (svn merge -r HEAD:REV, Log 뷰)~~ ✅ 완료
- ~~Compare two Revisions (svn diff -r REV1:REV2, Log 뷰 체크박스)~~ ✅ 완료
- ~~Repository Browser (svn list URL, 원격 탐색 + Copy to)~~ ✅ 완료
- ~~Shelve/Unshelve (svn shelve/unshelve + 패치 기반 fallback)~~ ✅ 완료
- ~~External Diff Tool 설정 (FileMerge, VS Code, BBEdit, KDiff3)~~ ✅ 완료
- ~~Commit 뷰 파일 필터링 (파일명/경로 검색)~~ ✅ 완료
- ~~Status 뷰에서 Ignore 추가 (untracked 파일 → svn:ignore)~~ ✅ 완료
- ~~SVN Working Copy Upgrade (svn upgrade, Tools 뷰)~~ ✅ 완료
- ~~Remote URL Log 조회 (체크아웃 없이 원격 URL 로그)~~ ✅ 완료

**Sprint 7 (완료 — v1.1.0):**
- ~~Multi-language support (i18n: 한국어/English, dynamic sidebar, t() 함수)~~ ✅ 완료
- ~~SVN Externals management (svn:externals 조회/추가/수정/삭제/Raw편집)~~ ✅ 완료
- ~~Drag & Drop file operations (외부 파일 드롭, 카드 드래그 선택, Tree 뷰 이동)~~ ✅ 완료

## SVN 표준 운영 절차 (SOP)

**Execution Script**: `execution/svn_tool.py`
- Arguments: `status`, `update`, `commit -m "message"`, `log`, etc.
- Output: JSON object with `success`, `output`, and `error`.

**Procedures:**
1. **Checkout**: 'Checkout' 버튼으로 저장소를 로컬 디렉토리에 클론
2. **Check Status**: 변경 목록 확인. 체크박스로 파일 선택하여 일괄 작업
3. **Update**: 'Update All'로 전체 동기화 / 파일 선택 후 'Update'로 개별 동기화
4. **Commit**: 파일 선택 → 'Commit' 클릭 → 메시지 입력 후 확인
5. **Revert**: 개별 'Revert' 버튼 또는 다중 선택 후 일괄 'Revert'
6. **Diff**: 'Diff'로 콘솔에서 변경 내용 확인

**Error Handling:**
- `SVN command not found` → SVN 설치 안내
- 인증 실패 → `.env` 확인 또는 사용자에게 프롬프트
- 충돌 발생 → UI에 표시 후 충돌 해결 절차 안내

## Setup & Usage
1. **Install SVN**: `svn` 명령이 터미널에서 사용 가능해야 합니다.
2. **Start the Server**: `python3 server.py`
3. **Open the UI**: 브라우저에서 `http://localhost:8000` 접속

## 디렉토리 구조
```
├── CLAUDE.md              ← 이 파일 (Claude Code 진입점)
├── execution/             ← Python 스크립트 (결정론적 도구)
├── index.html, style.css, app.js  ← Web UI (Vanilla JS/CSS/HTML5)
├── server.py              ← Backend API (Python http.server)
├── .env                   ← 환경 변수 및 API 키
└── .tmp/                  ← 중간 파일 (재생성 가능, 커밋 금지)
```

## 3계층 아키텍처(3-Layer Architecture)

당신은 신뢰성을 극대화하기 위해 관심사를 분리하는 3계층 아키텍처 내에서 작동합니다. LLM은 확률적이지만, 대부분의 비즈니스 로직은 결정론적이며 일관성을 필요로 합니다. 이 시스템은 그 불일치를 해결합니다.

**계층 1: 지시 (Directive - 무엇을 할 것인가)**
- Markdown으로 작성된 SOP(표준 운영 절차)이며, 이 `CLAUDE.md` 파일에 통합되어 있습니다.
- 목표, 입력, 사용할 도구/스크립트, 출력 및 예외 사례를 정의합니다.
- 중간 관리자에게 주는 것과 같은 자연어 지침입니다.

**계층 2: 오케스트레이션 (Orchestration - 의사 결정)**
- 이것은 당신의 역할입니다. 당신의 임무는 지능적인 라우팅입니다.
- 지침을 읽고, 실행 도구를 올바른 순서로 호출하며, 오류를 처리하고, 명확한 설명이 필요한 경우 질문하며, 학습된 내용을 바탕으로 지침을 업데이트합니다.
- 당신은 의도와 실행 사이의 연결 고리입니다.

**계층 3: 실행 (Execution - 작업 수행)**
- `execution/` 폴더에 있는 결정론적 Python 스크립트입니다.
- 환경 변수, API 토큰 등은 `.env`에 저장됩니다.
- API 호출, 데이터 처리, 파일 작업, 데이터베이스 상호작용을 처리합니다.
- 신뢰할 수 있고, 테스트 가능하며, 빠릅니다.

**이 방식이 작동하는 이유:** 단계당 90%의 정확도는 5단계를 거치면 59%의 성공률로 떨어집니다. 해결책은 복잡성을 결정론적 코드에 맡기는 것입니다.

## 운영 원칙

**1. 도구 확인이 우선**
스크립트를 작성하기 전에 `execution/` 폴더를 확인하세요. 기존 스크립트가 없을 때만 새 스크립트를 생성합니다.

**2. 에러 발생 시 자가 교정(Self-anneal)**
- 에러 메시지와 스택 트레이스를 읽습니다.
- 스크립트를 수정하고 다시 테스트합니다. (유료 토큰 등을 사용하는 경우 사전에 사용자에게 확인합니다.)
- 학습한 내용(API 제한, 타이밍, 예외 사례 등)을 지침에 반영합니다.

**3. 학습 내용에 따라 지침 업데이트**
지침은 살아있는 문서입니다. API 제약 조건, 더 나은 접근 방식, 일반적인 오류 등을 발견하면 지침을 업데이트하세요.

## 자가 교정 루프(Self-annealing loop)

1. 수정합니다.
2. 도구를 업데이트합니다.
3. 도구를 테스트하여 작동을 확인합니다.
4. 새로운 흐름을 포함하도록 지침을 업데이트합니다.
5. 이제 시스템이 더 강력해졌습니다.

## 파일 구성

- `.tmp/` 파일은 항상 재생성 가능해야 하며 절대 커밋하지 않습니다.
- 최종 결과물은 클라우드 서비스(Google Sheets, Slides 등)에 있어야 합니다.
- 유료 API 호출 전 반드시 사용자 확인을 받습니다.

## 요약

당신은 인간의 의도(지침)와 결정론적 실행(Python 스크립트) 사이에 위치합니다. 지시 사항을 읽고, 결정을 내리고, 도구를 호출하고, 오류를 처리하며 시스템을 지속적으로 개선하세요.
