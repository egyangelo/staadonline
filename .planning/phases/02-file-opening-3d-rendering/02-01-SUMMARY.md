---
phase: 02-file-opening-3d-rendering
plan: 01
subsystem: parser
tags: [staad, parser, constants, beta, rotation, d-06, headless]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: tolerant headless parser, typed StaadModel, WARNING_CODES, expandList/maxRef guards
provides:
  - Member.rotation?: number on the typed model (D-06 contract for the renderer)
  - CONSTANTS BETA <angle> MEMB <list> parsed through both dispatch paths
  - malformed BETA tolerance (MALFORMED_LINE, never throws)
affects: [02-04 SceneBuilder, 02-03 section profile geometry, 02-file-opening-3d-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "two-path dispatch mirrored from applyMaterialRow (header-entry vs CONSTANTS-body)"
    - "warn-don't-throw with row-labelled MALFORMED_LINE message"
    - "Map-based member lookup (T-06-02), bounded expandList maxRef expansion (T-06-01)"

key-files:
  created: []
  modified:
    - packages/parser/src/types.ts
    - packages/parser/src/staad/constants.ts
    - packages/parser/test/staad/constants.test.ts

key-decisions:
  - "D-06 honored as a parser extension: Member.rotation?: number, stored unmodified in degrees"
  - "BETA helper mirrors applyMaterialRow's two dispatch paths (BETA block header + CONSTANTS body)"
  - "warnMalformed generalized with a row label (default 'MATERIAL') so BETA rows report 'Malformed BETA row' while MATERIAL output stays byte-identical"
  - "Task 1 TDD contract test lives in constants.test.ts; its RED gate is tsc (TS2353/TS2339) since a pure optional type field is not runtime-detectable"

patterns-established:
  - "BETA rows: Number + Number.isFinite angle validation (parseDimValue mirror), expandList bounded by maxMemberId, Map-based member lookup, MALFORMED_LINE for every malformed shape"

requirements-completed: [REND-01]

# Metrics
duration: 5min
completed: 2026-08-16
---

# Phase 2 Plan 01: Parser Extension (D-06 BETA rotation) Summary

**STAAD CONSTANTS `BETA`/`MEMBER` rotation rows no longer dropped — each member's axial rotation is recorded as `Member.rotation?: number` (degrees, unmodified) through both dispatch paths, malformed rows still warn MALFORMED_LINE and never throw, unlocking D-06 for the 02-04 SceneBuilder.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-16T19:54:00Z (approx)
- **Completed:** 2026-08-16T19:58:40Z
- **Tasks:** 3 (Task 1 TDD = 2 commits; Tasks 2-3 = 1 each)
- **Files modified:** 3 (types.ts, staad/constants.ts, test/staad/constants.test.ts)

## Accomplishments
- `Member.rotation?: number` added to the typed model with a D-06 doc comment — no other type or the WARNING_CODES block changed.
- `applyBetaRow` implemented and wired into both the BETA-block-header dispatch path and the CONSTANTS-body loop (mirroring `applyMaterialRow`), so rotation is reachable through real segmented fixture decks and handwritten decks alike.
- Malformed BETA rows (non-finite/missing angle, missing MEMB/MEMBER marker, empty member list) push exactly one `MALFORMED_LINE` warning with the source line and return — never a throw (tolerance contract PARSE-03).
- Security mitigations: `expandList(..., { maxRef: maxMemberId(ctx) })` bounds the member list (T-02-01/T-06-01 — `BETA ... MEMB 1 TO 999999999` cannot allocate unbounded); member lookup via `Map` (T-02-03/T-06-02 — no plain-object keys); angle stored only as a finite number (T-02-02/T-02-05).
- Full parser suite green: 182 tests across 18 files, including the real HPP fixture's CONSTANTS slice which now dispatches `BETA 90 MEMB 964 TO 975` with zero warnings (test (5) unchanged as regression proof).

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): Add failing contract test for Member.rotation (D-06)** - `121ec48` (test)
2. **Task 1 (TDD GREEN): Add optional Member.rotation field (D-06)** - `e1459dc` (feat)
3. **Task 2: Record member rotation in BETA branch (D-06)** - `afd4ca9` (feat)
4. **Task 3: BETA rotation tests in constants.test.ts (D-06)** - `318dc74` (test)

**Plan metadata:** `(docs) complete 02-01 plan` — recorded after this summary.

## Files Created/Modified
- `packages/parser/src/types.ts` - `Member.rotation?: number` added (D-06), doc comment explaining degrees + no unit conversion; no other type or WARNING_CODES change.
- `packages/parser/src/staad/constants.ts` - `applyBetaRow` helper, `parseBetaAngle` finite-check (mirrors `parseDimValue`), `warnMalformed` row-label parameter (MATERIAL output byte-identical), both dispatch paths wired, module doc updated.
- `packages/parser/test/staad/constants.test.ts` - test (3) updated to assert `rotation === 90` on members 1-2; new cases (6) negative angle -45, (7) default-absent, (8) non-finite angle warns MALFORMED_LINE, (9) missing MEMB marker warns MALFORMED_LINE; Member.rotation contract block; fixture slice test (5) unchanged.

## Decisions Made
- Followed the plan's four new/updated BETA test cases verbatim and kept the real-fixture dispatch test (5) untouched as the D-06 regression proof.
- `warnMalformed` generalized with a `row` label defaulting to `'MATERIAL'` so BETA rows emit the accurate "Malformed BETA row: …" message while MATERIAL call sites and output stay byte-identical (plan required reuse of the existing helper).
- Task 1's TDD RED gate is `tsc --noEmit` failing with TS2353/TS2339 (a pure optional type field is not runtime-detectable); the contract test asserting rotation on Member literals is the commit-carried test.

## Deviations from Plan

None - plan executed exactly as written. (Task 1's TDD split into RED test commit + GREEN field commit per the tdd protocol; this is the mandated structure, not a deviation.)

## Threat Flags

None - the parser extension is headless and introduces no new network endpoints, auth paths, file-access patterns, or trust-boundary schema changes beyond the plan's own `<threat_model>`. The BETA branch executes the plan's T-02-01..T-02-05 mitigations (bounded expandList, finite angle, Map lookup, warn-don't-throw, numeric-only storage).

## Issues Encountered
- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Renderer contract unblocked for 02-04: the SceneBuilder can read `member.rotation` (degrees) when orienting extruded section profiles about the member axis (D-06 / REND-01).
- 02-02 (3D stack + FileService) and 02-03 (section DB + geometry factories) are independent of this change; rotation is consumed at the scene-matrix stage.
- Ready for 02-02.

---

*Phase: 02-file-opening-3d-rendering*
*Completed: 2026-08-16*

## Self-Check: PASSED

- Files created: `.planning/phases/02-file-opening-3d-rendering/02-01-SUMMARY.md` exists.
- Commits verified in `git log`: `121ec48`, `e1459dc`, `afd4ca9`, `318dc74`, `49e2033`.
- Parser suite green: 182 tests / 18 files passed (`npx vitest run`), `npx tsc --noEmit` exit 0.
- Grep: no plain-object member lookup (`Record<number` / object keys) introduced in `constants.ts` — member lookup is Map-based.
- Real HPP CONSTANTS slice dispatches warning-free (fixture test (5), unchanged).
- STATE.md and ROADMAP.md not modified by this plan (orchestrator-owned shared files).