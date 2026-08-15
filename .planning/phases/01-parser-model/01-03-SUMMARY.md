---
phase: 01-parser-model
plan: 3
subsystem: testing
tags: [fixtures, golden-corpus, vitest, node:fs, STAAD, hermetic]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: 01-01 tokenizer/types (Token, TokenizedLine, tokenize) that the corpus will exercise in later plans
provides:
  - Hermetic golden corpus inside packages/parser/test/fixtures (real 92 KB STAAD.Pro file + 5 hand-written edge cases)
  - manifest.ts D-09 dual-tier expected counts (computed for real, constants for hand-written)
  - Deterministic import.meta.url-based loadFixture loader + FIXTURE_NAMES
  - Smoke test (8 tests) proving harness correctness
affects: [01-parser-model plan 4/5+ (parser assembly), all future parser validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "import.meta.url-based path resolution (never process.cwd()) for hermetic fixture access"
    - "No-regex string helpers for fixture counting (matches tokenizer T-02-01 stance)"
    - "Dual-tier expected counts: computed for real files, hand-counted constants for small fixtures"

key-files:
  created:
    - packages/parser/test/fixtures/real/HPP_Main_Building_2.std
    - packages/parser/test/fixtures/handwritten/plane-2d.std
    - packages/parser/test/fixtures/handwritten/feet-imperial.std
    - packages/parser/test/fixtures/handwritten/legacy-table.std
    - packages/parser/test/fixtures/handwritten/continuations.std
    - packages/parser/test/fixtures/handwritten/unknown-commands.std
    - packages/parser/test/fixtures/manifest.ts
    - packages/parser/test/fixtures/loadFixture.ts
    - packages/parser/test/fixtures/fixtures.test.ts
    - packages/parser/test/fixtures/node-env.d.ts
  modified: []

key-decisions:
  - "Group count stops at END GROUP DEFINITION (40 entries), not MEMBER PROPERTY (75) — naive block scan would over-count"
  - "LOAD R1 LOADTYPE Mass excluded from loadPrimary (non-numeric id); only LOAD <digits> LOADTYPE counts (14), LOAD COMB <id> counts separately (274), loadCases = 288"
  - "Ambient node-env.d.ts shim for node:fs/node:path/node:url instead of installing @types/node (T-03-SC forbids installs; 01-01 owns dependencies)"
  - "Counting helpers accept abbreviated headers (MEMB INCI / ELEM INCI) per PITFALLS P2"

patterns-established:
  - "Manifest = single source of truth for expected counts; computed deterministically for real file, constants for hand-written"
  - "Hand-written fixtures are small (< 40 lines) and always end with `* end of fixture` terminator"
  - "Byte-identical real-fixture copy (92518 bytes verified) — never regenerate by hand"

requirements-completed: [PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05]

# Metrics
duration: 12min
completed: 2026-08-15
status: complete
---

# Phase 1: Plan 3 — Golden Corpus & Fixture Harness Summary

**Hermetic golden corpus inside packages/parser: byte-identical 92 KB real STAAD.Pro fixture, 5 hand-written edge-case fixtures, deterministic no-regex count manifest (D-09 dual-tier), and a passing 8-test smoke suite**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-15T22:50:26+03:00
- **Completed:** 2026-08-15T23:02:00+03:00
- **Tasks:** 3 (4 commits)
- **Files modified:** 10

## Accomplishments
- Real fixture `HPP_Main_Building_2.std` copied byte-identical (92518 = 92518 bytes) into `packages/parser/test/fixtures/real/` — corpus is hermetic, tests no longer depend on repo-root `staadSample/`
- 5 hand-written edge-case fixtures: 2D plane (Z omitted), imperial FEET/KIPS with mid-file UNIT INCH switch, unquoted legacy `TABLE ST W12X35`, `MEMB INCI` abbreviation + `-` continuation + `;`-packed joints + `*` comment, and FROBNICATE unknown-command tolerance
- `manifest.ts` exports `expected` map with computed real counts and hand-counted constants; all helpers are no-regex string scanners documented inline
- `loadFixture.ts` resolves via `import.meta.url` (never cwd), throws on unknown names; smoke test green (8/8, full suite 35/35)
- Checker-verified ground truth reproduced exactly: 1222 joints / 350 members / 938 elements / 40 groups / 14 primary / 274 comb / 288 loads, unit METER KN

## Task Commits

Each task was committed atomically:

1. **Task 1: Copy real fixture + build deterministic count helpers** - `9bf38b5` (test)
2. **Task 2: Write hand-written edge-case fixtures** - `85a4b98` (test)
3. **Task 3: Hermetic loader + smoke test** - `d0f1736` (test)

**Plan metadata:** `7faae3c` (docs: complete plan)

## Files Created/Modified
- `packages/parser/test/fixtures/real/HPP_Main_Building_2.std` - 92518-byte byte-identical copy of the real STAAD.Pro ground-truth file
- `packages/parser/test/fixtures/handwritten/plane-2d.std` - STAAD PLANE, 3 joints as `id x y` (Z omitted), PINNED supports
- `packages/parser/test/fixtures/handwritten/feet-imperial.std` - FEET KIPS then UNIT INCH + PRIS YD/ZD (PITFALLS P1 stateful units)
- `packages/parser/test/fixtures/handwritten/legacy-table.std` - unquoted `1 2 TABLE ST W12X35` (PITFALLS P3)
- `packages/parser/test/fixtures/handwritten/continuations.std` - `MEMB INCI` abbrev, `-` continuation, `;`-packed joints, `*` comment
- `packages/parser/test/fixtures/handwritten/unknown-commands.std` - FROBNICATE block skipped with warning, not fatal
- `packages/parser/test/fixtures/manifest.ts` - D-09 expected counts: helpers (countJoints/countMemberRows/countElementRows/countGroupEntries/countLoadPrimary/countLoadComb/detectUnit) + expected/expectedReal/expectedHandwritten
- `packages/parser/test/fixtures/loadFixture.ts` - FIXTURE_DIR via import.meta.url, FIXTURE_NAMES (6), loadFixture(name) throwing on unknown
- `packages/parser/test/fixtures/fixtures.test.ts` - 8 smoke tests incl. checker ground-truth spot checks (1222/350/938/40/14/274/288, METER KN)
- `packages/parser/test/fixtures/node-env.d.ts` - minimal ambient shim for node:fs/node:path/node:url + ImportMeta (see deviations)

## Decisions Made
- **Group boundary is END GROUP DEFINITION (40), not MEMBER PROPERTY (75):** a naive scan to the next command would count ELEMENT PROPERTY/DEFINE MATERIAL `_`-entries and letter-lines. The helper explicitly bounds the group block by START/END markers.
- **LOAD disambiguation (checker #9):** `LOAD <digits> LOADTYPE` = primary (14), `LOAD COMB <digits>` = combination (274), `loadCases` = sum (288). Non-numeric `LOAD R1 LOADTYPE Mass` correctly excluded by digit check.
- **Ambient shim over install:** no `@types/node` present and T-03-SC forbids installs (01-01 owns dependencies), so a minimal hand-written `node-env.d.ts` covers exactly the three builtins + ImportMeta used by the harness.
- **Hand-written counts are exact constants** (fixtures small enough to count manually), cross-checked by running the same helpers over them — all 5 PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Counting helpers leaked counts when a block header was absent**
- **Found during:** Task 2 (hand-written fixture cross-check)
- **Issue:** `countGroupEntries`/`countJoints`/`countBlockEntries` used `findIndex` without a guard; when a fixture had no `START GROUP DEFINITION` (or no JOINT COORDINATES), `start = -1` made the scan run from line 0 across the whole file, producing garbage group/joint counts (3-4) for fixtures that have none.
- **Fix:** Return 0 immediately when the block header is absent; also accept abbreviated headers (`MEMB INCI`, `ELEM INCI`) in `countBlockEntries` per PITFALLS P2 so `continuations.std`'s abbreviated `MEMB INCI` is counted correctly.
- **Files modified:** packages/parser/test/fixtures/manifest.ts
- **Verification:** All 5 hand-written fixtures now cross-check PASS against expectedHandwritten; real counts unchanged (1222/350/938/40/14/274/288)
- **Committed in:** cc07274 (separate fix commit)

**2. [Rule 3 - Blocking] Missing @types/node breaks tsc on node: imports**
- **Found during:** Task 1 (typecheck of manifest.ts with `node:fs`/`node:path`/`node:url` imports)
- **Issue:** `tsc --noEmit` fails on `node:fs` etc. because `@types/node` is not installed and plan T-03-SC forbids installs.
- **Fix:** Added minimal ambient `node-env.d.ts` (readFileSync string+Buffer overloads, join/dirname, fileURLToPath, ImportMeta.url). Typecheck passes (exit 0); deliberately scoped to only what the harness uses.
- **Files modified:** packages/parser/test/fixtures/node-env.d.ts
- **Verification:** `npm run typecheck` exit 0; full vitest suite green
- **Committed in:** 9bf38b5 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes were required for correctness and for the harness to typecheck/run at all. No scope creep — shim is minimal, helpers still no-regex.

## Issues Encountered
- `console` is untyped under lib ES2022 (no DOM lib) — test files deliberately avoid `console` entirely.
- `npx tsc` (unqualified) resolves the wrong package; all typechecks run via `npm run typecheck` inside `packages/parser`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Hermetic corpus + manifest + loader ready for 01-04/01-05 parser assembly: any future parser test can `loadFixture(name)` and assert counts against `manifest.expected`
- `expected` map keys match `FIXTURE_NAMES` exactly — parser tests should iterate FIXTURE_NAMES and compare against `expected[name]`
- Real file ground truth is checker-verified and now asserted in tests (guards against accidental fixture drift)

---
*Phase: 01-parser-model*
*Completed: 2026-08-15*

## Self-Check: PASSED

- All 10 created files verified present (real fixture, 5 hand-written, manifest.ts, loadFixture.ts, fixtures.test.ts, node-env.d.ts)
- All 4 commits verified in git history: 9bf38b5, cc07274, 85a4b98, d0f1736
- Full vitest suite 35/35 green; `npm run typecheck` exit 0; byte-count equality 92518 = 92518