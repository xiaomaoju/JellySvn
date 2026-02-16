# Sprint 5 — 핵심 SVN 기능 추가 진행상황

## 새로 추가하는 기능

### 1. SVN Cleanup (svn cleanup)
- [x] main.js — IPC 핸들러 (기존 run-svn 활용)
- [x] app.js — doCleanup(), doCleanupRemoveUnversioned() 함수
- [x] app.js — Tools 뷰에 Cleanup UI (일반/Vacuum/Unversioned 삭제)
- [x] index.html — Tools 사이드바 버튼 추가
- [x] 실행 테스트 확인 ✅

### 2. SVN Copy/Move/Rename (svn copy, svn move)
- [x] app.js — doCopyMove() 함수
- [x] app.js — Tools 뷰에 Copy/Move UI (소스/대상 경로 입력)
- [x] app.js — operation select (copy/move 선택)
- [x] 실행 테스트 확인 ✅

### 3. svn:ignore 관리
- [x] app.js — fetchIgnorePatterns() 함수
- [x] app.js — renderIgnoreView() 전용 뷰
- [x] app.js — addIgnorePattern(), removeIgnorePattern() 함수
- [x] app.js — quickAddIgnore() 빠른 추가 버튼 (*.log, *.tmp 등)
- [x] app.js — saveIgnoreRaw() 직접 편집 기능
- [x] app.js — addGlobalIgnorePattern() (svn:global-ignores)
- [x] app.js — 미추적 파일 목록에서 바로 ignore 추가
- [x] index.html — Ignore 사이드바 버튼 추가
- [x] 실행 테스트 확인 ✅

### 4. Patch 생성/적용
- [x] main.js — save-file-dialog IPC 핸들러
- [x] main.js — write-file IPC 핸들러
- [x] main.js — open-file-dialog IPC 핸들러
- [x] preload.js — saveFileDialog, writeFile, openFileDialog API
- [x] app.js — createPatch(), createPatchForFiles() 함수
- [x] app.js — applyPatch() (일반/Dry Run/Reverse)
- [x] app.js — Export/Import 뷰에 Patch 섹션 통합
- [x] 실행 테스트 확인 ✅

### 5. SVN Relocate (svn relocate)
- [x] app.js — doRelocate() 함수
- [x] app.js — detectRepoUrl() 자동 감지
- [x] app.js — Tools 뷰에 Relocate UI
- [x] app.js — 프로젝트 URL 자동 업데이트
- [x] 실행 테스트 확인 ✅

### 6. SVN Changelist (svn changelist)
- [x] app.js — fetchChangelists() 파싱
- [x] app.js — addToChangelist(), removeFromChangelist() 함수
- [x] app.js — commitChangelist() 함수
- [x] app.js — Tools 뷰에 Changelist 관리 UI
- [x] app.js — Commit 뷰에 changelist 커밋 버튼 통합
- [x] 실행 테스트 확인 ✅

## UI/UX 개선
- [x] 사이드바 스크롤 기능 추가 (overflow-y: auto, 커스텀 스크롤바)
- [x] nav-item 크기 최적화 (padding/font-size 축소)
- [x] nav-menu gap 축소 (8px → 4px)
- [x] CSS 스타일 폴리싱 (nav icon 크기, ignore/tools 전용 스타일) ✅
- [x] DevTools 비활성화 후 최종 스크린샷 확인 ✅

## 코드 품질
- [x] app.js 구문 검증 통과
- [x] main.js 구문 검증 통과
- [x] 전체 앱 실행 및 에러 없음 확인 ✅
- [x] CLAUDE.md 업데이트 (완료된 기능 반영) ✅

## Finder 통합
### 7. Quick Actions (우클릭 메뉴)
- [x] jellysvn-open.sh — Finder에서 JellySvn 앱 열기
- [x] jellysvn-status.sh — SVN Status 알림 표시
- [x] jellysvn-update.sh — SVN Update 실행
- [x] jellysvn-commit.sh — JellySvn 커밋 뷰 열기
- [x] jellysvn-cleanup.sh — SVN Cleanup 실행
- [x] install-quickactions.sh — .workflow 번들 자동 설치
- [x] ~/Library/Services/ 에 5개 워크플로우 설치 완료 ✅

### 8. FinderSync Extension (파일 상태 오버레이)
- [x] FinderSync.swift — Sandbox 호환 FinderSync 확장
- [x] AppDelegate.swift — 메뉴바 호스트 앱
- [x] project.yml — xcodegen 프로젝트 스펙
- [x] App Sandbox 엔타이틀먼트 설정
- [x] Apple Development 인증서로 코드 서명
- [x] SVN 상태 배지 이미지 (clean/modified/added/conflict/untracked/deleted)
- [x] 우클릭 컨텍스트 메뉴 (Status, Update, Commit, Revert, Cleanup, Log)
- [x] NSUserScriptTask 기반 SVN 명령 실행 (Sandbox 호환)
- [x] pluginkit 등록 및 활성화 확인 ✅
- [x] build.sh 빌드 스크립트 작성 ✅

## 🎉 Sprint 5 + Finder 통합 완료!
