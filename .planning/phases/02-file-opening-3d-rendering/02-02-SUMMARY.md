---
phase: 02-file-opening-3d-rendering
plan: 2
subsystem: ui
tags: [threejs, react-three-fiber, drei, zustand, vitest, file-service, stores]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: parseStaad + typed StaadModel/ParseResult/ParseWarning + MAX_INPUT_LENGTH
provides:
  - Pinned R3F stack in the web workspace (three 0.185.1, fiber 9.7.0, drei 10.7.8, zustand 5.0.15, @types/three 0.185.4)
  - Vitest (node env) for web/lib + web/store pure-TS tests
  - FileService platform boundary (web branch; native branch stubbed for Phase 4) enforcing FILE-01..FILE-04 pre-parse
  - modelStore (write-once per file) + viewerStore (exaggeration default 15)
affects: [02-03, 02-04, 02-05, 02-06, 02-07]

# Tech tracking
tech-stack:
  added: [three@0.185.1, @react-three/fiber@9.7.0, @react-three/drei@10.7.8, zustand@5.0.15, @types/three@0.185.4, vitest@^4.1.10]
  patterns:
    - zustand/react import path for zustand 5 + React 19
    - Platform-boundary FileService (ARCHITECTURE Pattern 4): guards throw typed FileServiceError
    - Write-once model store: setModel commits atomically, setError never mutates model/warnings (FILE-03)
    - Viewer interaction store separated from model data

key-files:
  created:
    - web/lib/fileService.ts
    - web/lib/fileService.test.ts
    - web/store/modelStore.ts
    - web/store/viewerStore.ts
    - web/vitest.config.ts
  modified:
    - web/package.json
    - package-lock.json

key-decisions:
  - "Thrown typed FileServiceError (not a result union): matches page.tsx try/catch UX and lets the UI render error.message directly"
  - "Exact (non-caret) pins for the five 3D packages to honor T-02-SC 'versions pinned exactly'; vitest kept caret ^4.1.10 per plan wording"
  - "modelStore.setError() restores status 'empty' + clears fileName while leaving model/warnings untouched (FILE-03 literal contract)"
  - "Stores import create from zustand/react (zustand 5 recommendation for React 19)"
  - "FileServiceError messages carry UI-ready copy (WRONG_TYPE = existing page.tsx string; TOO_LARGE = UI-SPEC 64 MB copy) until ErrorToast (02-06) maps codes"

patterns-established:
  - "FileService cancel-safety by construction: hidden-input onChange only fires on selection — dismiss is a strict no-op"
  - "Guard-then-read: assertValidStdFile fires extension + size checks BEFORE File.text() allocates (T-02-01 pre-check)"
  - "Duck-typed File-shaped fixtures in tests — File is not constructible in the node vitest environment"

requirements-completed: [FILE-01, FILE-02, FILE-03, FILE-04]

# Metrics
duration: 7min
completed: 2026-08-16
---

# Phase 02: Plan 2 Summary

**Pinned React Three Framework 3D stack in the web workspace, a Vitest node-env harness for web pure-TS modules, and the FileService platform boundary plus write-once modelStore and viewerStore (exaggeration default 15) that every later Phase 2 web plan imports.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-16T20:02:00Z
- **Completed:** 2026-08-16T20:09:08Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- Installed and verified the D-09 pinned 3D stack (`three@0.185.1`, `@react-three/fiber@9.7.0`, `@react-three/drei@10.7.8`, `zustand@5.0.15`, dev `@types/three@0.185.4`) plus `vitest@^4.1.10` into the web workspace with exact pins in web/package.json and the root lockfile — `web/components.json` was NOT created (UI-SPEC registry safety gate).
- Built the FileService platform boundary (D-10, Pattern 4): `assertValidStdFile` enforces case-insensitive `.std` + `MAX_INPUT_LENGTH` size guards BEFORE any read (FILE-04, T-02-01/T-02-02), `readStdFile` uses `File.text()` (never base64 — PITFALLS P6) with `UNREADABLE` wrapping, and cancel-safety is guaranteed by construction (FILE-03).
- Created the state spine: `modelStore` (write-once per file, atomic `setModel`, cancel-safe `setError`) and `viewerStore` (exaggeration default 15, D-02/D-04), both importing `create` from `zustand/react` and types from `@staad-online/parser`.

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | Package legitimacy gate | (no commit — user-approved blocking-human checkpoint, nothing built) | checkpoint |
| 2 | Install pinned 3D deps + Vitest for web | `21eac00` | chore |
| 3 | FileService + model/viewer stores | `87c0e80` | feat |

## Files Created/Modified
- `web/package.json` — exact-pinned 3D deps + vitest devDep + `"test": "vitest run"` script
- `package-lock.json` — root lockfile records exact resolved versions of all five packages
- `web/vitest.config.ts` — Vitest `environment: 'node'`, default test-file include
- `web/lib/fileService.ts` — OpenedFile, FileServiceError (WRONG_TYPE/TOO_LARGE/UNREADABLE), assertValidStdFile, readStdFile; native branch stub comment for Phase 4
- `web/lib/fileService.test.ts` — 8 tests, duck-typed File fixtures
- `web/store/modelStore.ts` — write-once model store (status/model/warnings/fileName + beginLoading/setModel/setError)
- `web/store/viewerStore.ts` — exaggeration (default 15) + setExaggeration

## Decisions Made
- Thrown `FileServiceError` class beats a result union for the platform boundary — the UI (page.tsx try/catch pattern; 02-06 ErrorToast) needs stable `code` values plus a renderable message.
- Trimmed npm's caret ranges to **exact** pins (`"three": "0.185.1"`, etc.) to satisfy the threat register's "versions pinned exactly" — matches the existing exact-pin convention for next/react. `vitest` remains `^4.1.10` exactly as the plan wrote it.
- `setError()` restores `status: 'empty'` and clears `fileName` but never touches `model`/`warnings` — the literal FILE-03 contract: a failed open never commits or corrupts partial state.
- Both stores import `create` from `zustand/react` (the zustand 5 + React 19 recommended path the plan mandated over `zustand`).
- Error copy ships on the errors themselves (WRONG_TYPE/TOO_LARGE match the target strings) so nothing downstream must guess; ErrorToast (02-06) can key off `code` for its UI-SPEC copy replacement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vitest.config.ts JSDoc comment terminated early on the `**/` sequence**
- **Found during:** Task 3 (first actual `vitest run`)
- **Issue:** The comment "Default `**/*.test.{ts,tsx}` include applies." contains `**/`, which closed the block comment early → `PARSE_ERROR` on config load under vite's rolldown bundler.
- **Fix:** Rephrased the comment to avoid a glob literal (`*/` sequence).
- **Files modified:** web/vitest.config.ts
- **Verification:** `npx vitest run lib/fileService.test.ts` loads config and passes all 8 tests.
- **Committed in:** `87c0e80` (Task 3 commit)

**2. [Rule 1 - Bug] `fail` is not an exported member of 'vitest' types (v4.1.10)**
- **Found during:** Task 3 (web typecheck)
- **Issue:** `import { fail } from "vitest"` failed `tsc --noEmit` with `TS2305: Module '"vitest"' has no exported member 'fail'`.
- **Fix:** Rewrote the `rejectedCode` helper to capture the thrown value and assert it with `expect(...).toBeInstanceOf(FileServiceError)` instead of calling `fail`.
- **Files modified:** web/lib/fileService.test.ts
- **Verification:** `tsc --noEmit` clean; all 8 tests still pass.
- **Committed in:** `87c0e80` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both were mechanical correctness fixes required for the vitest config to load and the tests to typecheck. No scope creep; plan semantics unchanged.

## Issues Encountered
- The `rtk` command wrapper listed in AGENTS.md is not installed on this machine — ran raw `git`/`npm`/`npx` equivalents instead. Environment note, not a plan problem.
- Vite prints an advisory warning that `web/vitest.config.ts` is ESM in a CommonJS-typed package (`configLoader: 'native'` note). It is non-blocking (config loads, tests run). Left as-is — adding `"type": "module"` to the web package risks Next.js config handling and is out of this plan's scope.

## Known Stubs
- **FileService native branch** (Capacitor file-picker) — intentionally stubbed as a documentation comment in `web/lib/fileService.ts` for Phase 4 (D-10). The web branch is fully implemented.
- The old `web/app/page.tsx` picker/parse flow is retained and will be refactored onto `readStdFile` + the stores in 02-06/02-07 — not a stub, a deliberate ordering per the phase plan.

## Threat Flags
None — the file-service boundary added no surfaces beyond the plan's `<threat_model>` (T-02-01..02-06 tuned to the FileService actions; T-02-SC covered by the approved Task 1 gate). No network endpoints, auth paths, or schema changes at trust boundaries.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation ready for 02-03 (section DB + geometry factories), 02-04 (SceneBuilder), 02-05 (ViewerCanvas), 02-06 (chrome components), and 02-07 (page integration + tokens). Stores consume `@staad-online/parser` types and `zustand/react` exactly as planned.
- Web vitest suite green (8/8) and the `test` script wired; parser regression green (182/182).

## Self-Check: PASSED

- Files on disk: `web/lib/fileService.ts`, `web/lib/fileService.test.ts`, `web/store/modelStore.ts`, `web/store/viewerStore.ts`, `web/vitest.config.ts` — FOUND
- Commits in git: `21eac00` and `87c0e80` — FOUND in `git log --all`
- STATE.md / ROADMAP.md: NOT modified by this plan

---
*Phase: 02-file-opening-3d-rendering*
*Completed: 2026-08-16*