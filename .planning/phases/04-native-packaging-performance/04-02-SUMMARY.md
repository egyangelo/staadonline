---
phase: 04-native-packaging-performance
plan: 02
subsystem: platform-boundary
tags: [capacitor, file-picker, streaming, blob, native]

# Dependency graph
requires:
  - phase: 04-native-packaging-performance
    provides: "Capacitor 8 stack + @capawesome/capacitor-file-picker installed (04-05)"
provides:
  - "readNativeFile(picked) native Capacitor file-picker branch of the FileService platform boundary"
  - "Streaming content-URI read via Capacitor.convertFileSrc -> fetch().blob() -> blob.text() — zero base64 (PLAT-03)"
  - "Pre-read size probe so TOO_LARGE fires before blob.text() materializes (FILE-04, R-5)"
  - "Picker-cancel strict no-op returning undefined (FILE-03)"
affects: [04-06 Android picker wiring, Android app, page.tsx open path]

# Tech tracking
tech-stack:
  added: []
  patterns: [streaming-blob-read, convertFileSrc-before-fetch]

key-files:
  created: []
  modified: [web/lib/fileService.ts, web/lib/fileService.test.ts]

key-decisions:
  - "readNativeFile takes the picker's structural { name, path?, blob? } shape and returns the same OpenedFile { name, text } as readStdFile so page.tsx stays branch-agnostic (D-01/D-02)"
  - "Size probe (blob.size on web, content-length fetch on native) runs BEFORE assertValidStdFile so TOO_LARGE fires pre-read; a 0 probe passes the guard and falls through to the UNREADABLE/read path (R-5)"

patterns-established:
  - "Native file read = Capacitor.convertFileSrc(path) -> fetch(webPath).blob() -> text(); fetch is ONLY ever called on the converted URL, never the raw content:// URI (R-3)"
  - "Picker cancel = if (!picked?.name) return undefined — no beginLoading/store write/error (FILE-03)"

requirements-completed: [PLAT-03]

# Metrics
duration: 5min
completed: 2026-08-19
---

# Phase 4 Plan 2: Native FileService Branch Summary

**readNativeFile native Capacitor branch: streaming content-URI → convertFileSrc → fetch().blob() → blob.text() file open with pre-read size guard and strict picker-cancel no-op, proven by 6 new unit tests — zero base64 reads (PLAT-03)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-19T15:57:31Z
- **Completed:** 2026-08-19T16:02:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `readNativeFile(picked)` to the FileService platform boundary returning the same `OpenedFile { name, text }` shape as `readStdFile` — the UI stays branch-agnostic (D-01/D-02)
- Streaming blob path only: `Capacitor.convertFileSrc(path)` → `fetch(webPath).blob()` → `blob.text()` with zero base64 anywhere (PLAT-03, PITFALLS P6); fetch is never called on the raw content:// URI (R-3)
- Pre-read size probe (blob.size / content-length) so `TOO_LARGE` fires before text materializes (FILE-04 ordering, R-5); reuses `assertValidStdFile` + `FileServiceError` codes unchanged (WRONG_TYPE / TOO_LARGE / UNREADABLE)
- Picker cancel (empty name / undefined) is a strict no-op returning `undefined` — no beginLoading, store write, or error (FILE-03)
- 6 new unit tests covering the web blob branch, cancel no-op, WRONG_TYPE, TOO_LARGE-before-read (text() never called), UNREADABLE, and the native convertFileSrc→fetch path

## Task Commits

Each task was committed atomically (single RED→GREEN TDD cycle spanning both plan tasks):

1. **Task 1: Add readNativeFile native branch (D-01/D-02, PLAT-03)** - `fd2b838` (feat)
2. **Task 2: Unit tests — streaming path, guard ordering, cancel no-op** - `ddf462d` (test)

**Plan metadata:** `54b25c1` (docs: complete plan)

_Note: The two `tdd="true"` tasks form one cohesive feature, so the tests (RED, `ddf462d`) were committed before the implementation (GREEN, `fd2b838`); the RED gate genuinely failed (`readNativeFile is not a function`) before GREEN passed._

## Files Created/Modified
- `web/lib/fileService.ts` - added `readNativeFile` + module-local `probeContentLength`; imports `@capacitor/core` and the `@capawesome/capacitor-file-picker` type
- `web/lib/fileService.test.ts` - new `readNativeFile` describe block with 6 tests

## Decisions Made
- `readNativeFile` takes the picker's structural `{ name, path?, blob? }` shape and returns the same `OpenedFile` as `readStdFile` — page.tsx stays branch-agnostic (D-01/D-02)
- Size is probed before `assertValidStdFile` so TOO_LARGE fires pre-read; a 0 probe (no content-length) passes the guard and falls through to the UNREADABLE/read path (R-5)
- `PickedFile` imported as a type only (runtime values are only referenced by 04-06's wiring)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Verification Results
- `npx vitest run lib/fileService.test.ts` — 14/14 pass (8 pre-existing + 6 new)
- `npx tsc --noEmit` — clean (exit 0)
- Grep `btoa|atob|readData|readFile(|data:` — zero matches; the word "base64" appears only in documentation comments ("NO base64"), as prescribed by the plan's own PATTERNS §2.3 snippet
- Grep `fetch(` — both real calls use `webPath` (the `Capacitor.convertFileSrc` result); no raw `content://` fetch

## Next Phase Readiness
- Native FileService branch is proven at unit level with the Capacitor surface mocked — ready for 04-06 (Android picker wiring)
- The Android app's picker calls `readNativeFile` and routes the resulting text through the parse path

## Self-Check: PASSED

- Files exist on disk: `04-02-SUMMARY.md` ✓, `web/lib/fileService.ts` ✓, `web/lib/fileService.test.ts` ✓
- Commits exist in git history: `ddf462d` (test) ✓, `fd2b838` (feat) ✓

---

*Phase: 04-native-packaging-performance*
*Completed: 2026-08-19*