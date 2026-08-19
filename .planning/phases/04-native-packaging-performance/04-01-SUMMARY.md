---
phase: 04-native-packaging-performance
plan: 01
subsystem: parser
tags: [parseStaad, onProgress, ParseProgress, typescript, vitest, worker-safe]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: the pure, headless parseStaad entry point and zero-dependency parser this plan extends
provides:
  - Optional non-breaking onProgress callback on parseStaad firing a non-decreasing fraction [0,1]
  - Exported ParseProgress contract ({ fraction: number; stage?: string })
  - Unit coverage proving non-breaking compatibility, per-block progress sequence, size-guard no-progress, and empty-input [1]
affects: [04-03 (web worker relay), 04-04 (determinate progress overlay), 04-06 (page wiring)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Non-breaking optional second parameter added to an existing public API
    - Pure/worker-safe value callback (never captures DOM/postMessage/React)
    - Per-block progress cadence (0.1 → 0.15..0.95 → 1.0) with block-count-derived fractions

key-files:
  created: []
  modified:
    - packages/parser/src/types.ts (ParseProgress interface)
    - packages/parser/src/index.ts (parseStaad onProgress + re-export)
    - packages/parser/test/index.test.ts (tests A-D + type-export test)

key-decisions:
  - "parseStaad(text, onProgress?) is strictly non-breaking: optional 2nd param, all existing callers/tests compile unchanged (D-06)"
  - "Progress cadence is per-block: 0.1 after tokenize+segment, 0.15→0.95 through the block loop, 1.0 at finalize; fractions are block-count-derived numbers, never input strings (D-06, T-04-02)"
  - "The 64 MB size-guard early return stays BEFORE any callback; an oversized input reports no progress (T-04-01)"
  - "The callback stays pure/worker-safe — only a numeric fraction crosses the boundary; the Phase 4 worker wraps it"
  - "Empty input fires exactly [1] (no 0.1 when there are no blocks) — satisfies the empty-deck success criterion"

patterns-established:
  - "Non-breaking API extension: add an optional trailing callback param, gate with cheap `onProgress?.(...)` calls"
  - "Pure progress contract: a numeric fraction in [0,1] crosses the parser boundary, never a DOM/browser capture"
  - "Per-block (not per-line/per-token) progress cadence keeps callback count in the hundreds-thousands for multi-MB decks"

requirements-completed: [PERF-02]

# Metrics
duration: 4min
completed: 2026-08-19
---

# Phase 4 Plan 01: Optional Progress Callback Summary

**parseStaad gains a non-breaking optional onProgress callback firing a per-block non-decreasing fraction (0.1 after tokenize, 0.15→0.95 through the block loop, 1.0 at finalize), with an exported ParseProgress contract and unit coverage proving compatibility, size-guard no-progress, and empty-input [1]**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-19T11:42:50Z
- **Completed:** 2026-08-19T11:46:29Z
- **Tasks:** 3 (all `type="auto" tdd="true"`, RED→GREEN each)
- **Files modified:** 3 source/test files (+1 SUMMARY)

## Accomplishments

- Added `export interface ParseProgress { fraction: number; stage?: string }` in `types.ts` (D-06) and re-exported it from `index.ts` between `ParseResult` and `ParseWarning` — no new imports.
- Extended `parseStaad` non-breaking: `parseStaad(text: string, onProgress?: (fraction: number) => void): ParseResult` — all existing callers/tests compile unchanged (proven by test A and the full 187-test suite).
- Fired a monotonic fraction sequence at per-block cadence: `0.1` after tokenize+segment (gated on blocks>0), `0.15 + (i/total)*0.8` per block (→0.15..0.95), `1.0` after finalize.
- Preserved the 64 MB size-guard early return BEFORE any callback (T-04-01); oversized input reports no progress.
- The callback stays pure/worker-safe — no DOM/postMessage/React capture (grep-verified), zero new dependencies (T-04-SC).
- Full parser suite green: 187 tests across 18 files, `tsc --noEmit` clean.

## Task Commits

Each task was committed atomically (TDD RED→GREEN):

1. **Task 1: Export ParseProgress contract in types.ts (D-06)** — `207358a` (test: RED), `8d16505` (feat: GREEN)
2. **Task 2: Extend parseStaad with optional onProgress (D-06)** — `9414557` (test: RED), `a7b45dd` (feat: GREEN)
3. **Task 3: Unit tests — non-breaking compatibility + progress sequence** — `dbf25c5` (test)

**Plan metadata:** `docs(04-01): complete optional progress callback plan` (final metadata commit)

_Note: TDD tasks have multiple commits (test → feat)._

## Files Created/Modified

- `packages/parser/src/types.ts` - Added `ParseProgress` interface (fraction required, stage optional) adjacent to `ParseResult`, pure-contract convention, D-06 doc header.
- `packages/parser/src/index.ts` - `parseStaad(text, onProgress?)` with 0.1 / per-block 0.15→0.95 / 1.0 sequence; size guard preserved pre-callback; re-exported `ParseProgress`; D-06 doc comments.
- `packages/parser/test/index.test.ts` - Added `ParseProgress contract export` describe + `parseStaad — optional progress callback` describe with tests A (compat), B (sequence), C (size-guard no-progress), D (empty → [1]).

## Decisions Made

- Optional trailing callback param = non-breaking; existing `parseStaad(text)` calls stay valid (D-06).
- Per-block cadence for progress granularity (hundreds-thousands of messages for multi-MB decks, not millions).
- Fractions are block-count-derived numbers only, never derived from input strings (T-04-02).
- Empty deck reports exactly [1] (0.1 gated on `blocks.length > 0`) — aligns with the empty-input success criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan Inconsistency] 0.1 progress gated on non-empty block list**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** The plan's Task 2 action text says to invoke `onProgress?.(0.1)` unconditionally after `segmentBlocks`, which for an empty input would fire `[0.1, 1.0]`. But Task 3 Test D and the plan's `<success_criteria>` require empty input to fire **exactly `[1]`** ("empty deck has no blocks"). The two plan statements contradict.
- **Fix:** Gated the `0.1` call behind `blocks.length > 0` so an empty deck reports only the final `1.0`, satisfying the acceptance/success criteria. Non-empty decks are unaffected (0.1 still fires first).
- **Files modified:** packages/parser/src/index.ts
- **Verification:** Test D (`expect(seen2).toEqual([1])`) and Test B (multi-block non-decreasing ending at 1.0) both pass.
- **Committed in:** a7b45dd (Task 2 GREEN)

---

**Total deviations:** 1 auto-fixed (1 plan inconsistency resolved toward acceptance/success criteria).
**Impact on plan:** Minimal — gating 0.1 on non-empty blocks is the only resolution consistent with Test D and the empty-deck success criterion; no behavior change for real decks.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The parser now exposes a worker-safe progress signal the Phase 4 Web Worker (04-03) can wrap and relay via `postMessage`.
- The exported `ParseProgress` contract is the typed bridge for the worker protocol and the determinate progress overlay (04-04).
- Page wiring (04-06) can pass a progress callback straight into `parseStaad` through the shared parse path.

---

*Phase: 04-native-packaging-performance*
*Completed: 2026-08-19*

## Self-Check: PASSED

Created files verified on disk: `.planning/phases/04-native-packaging-performance/04-01-SUMMARY.md` (this file). Commits verified via `git log`: `207358a`, `8d16505`, `9414557`, `a7b45dd`, `dbf25c5` (task commits) — see git log below. All verification commands pass: `vitest run test/index.test.ts` (10), `vitest run` (187), `tsc --noEmit` (clean), grep (no runtime postMessage/document/window/React).