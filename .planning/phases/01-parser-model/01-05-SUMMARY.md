---
phase: 01-parser-model
plan: 5
subsystem: parser
tags: [geometry, joints, members, lists, ranges, STAAD, typescript, tolerant]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: 01-04 parse-core (tokenizer entries, CommandBlock segmentation, ParseContext, unit-state machine, COMMAND_TABLE dispatch, parseStaad)
  - phase: 01-parser-model
    provides: 01-03 manifest counts + hermetic corpus (real HPP fixture ground truth) that the integration assertions validate against
provides:
  - lists.ts: bounded member-list range expansion (TO / BY / ALL / explicit ids) with a hard-cap zip-bomb guard — consumed by MEMBER INCIDENCES now, by MEMBER PROPERTY / SUPPORTS / LOADS / GROUPS (01-06/07/08) later
  - joint-coordinates.ts: JOINT COORDINATES handler — semicolon-packed rows, 1-based ids (D-04), meters conversion via unit state (P1), 2D z-default under PLANE/FRAME (D-02), Map-based dedupe (T-05-02), strict numeric parse (T-05-04)
  - member-incidences.ts: MEMBER INCIDENCES handler — maximal-list node-pair disambiguation, range expansion, BETA tolerance (P2), dedupe, MALFORMED_LINE warnings never throws
  - Both geometry handlers registered into the real COMMAND_TABLE; parseStaad now populates nodes + members end-to-end on the real 92 KB corpus
affects: [01-parser-model plans 6-9 (properties, supports, loads, groups, assembly), all later phases consuming the model]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Maximal-list boundary scan: the member list is the longest valid prefix of list items leaving a numeric node pair immediately after it — resolves the id-list vs node-pair token ambiguity without lookahead into later rows"
    - "Bounded expansion: range ends clamped to maxRef/hard cap BEFORE allocation; total-entry guard stops the scan at LIST_HARD_CAP (T-05-01 zip-bomb mitigation)"
    - "Local Map seeding per handler (from ctx collections) — dedupe + lookup without adding Map fields to ParseContext and without plain-object keys"
    - "Handlers register canonical keys only; abbreviated spellings (JNT COORD, MEMB INCI) arrive canonicalized by the alias table in canonicalizeCommand"
    - "TDD per handler: RED (module-absent import failure) → GREEN (minimal implementation) → atomic commits per stage"

key-files:
  created:
    - packages/parser/src/staad/lists.ts
    - packages/parser/src/staad/joint-coordinates.ts
    - packages/parser/src/staad/member-incidences.ts
    - packages/parser/test/staad/lists.test.ts
    - packages/parser/test/staad/joint-coordinates.test.ts
    - packages/parser/test/staad/member-incidences.test.ts
  modified:
    - packages/parser/src/index.ts
    - packages/parser/test/index.test.ts

key-decisions:
  - "Node pair disambiguation: for a member row, the node pair is the numeric token pair after the MAXIMAL member list (listItemLength scan) — '5 TO 7 10 20 100 200' → members 5,6,7,10,20 with pair (100,200); '3 5 6 BETA 90' → member 3 with pair (5,6), BETA tolerated"
  - "expandList ALL without maxRef expands to nothing (no reference to resolve against — tolerant, never guesses); with maxRef it is [1..maxRef]"
  - "Hard cap LIST_HARD_CAP = 1_000_000 bounds no-maxRef expansion (T-05-01); maxRef clamps both ALL and range ends"
  - "Handlers keep a LOCAL Map seeded from ctx (nodes/members) for dedupe + lookup — ParseContext shape unchanged; T-05-02 mitigation without type churn"
  - "Registration uses canonical keys only ('JOINT COORDINATES', 'MEMBER INCIDENCES') — P2 abbreviations (JNT COORD, MEMB INCI, MEMBER INCIDENCE) are canonicalized by COMMAND_ALIASES before dispatch, so alias table keys are redundant"
  - "Test files live in test/staad/ (one level deeper than the existing suite) per plan layout — module imports resolve via ../../src/…"

patterns-established:
  - "Geometry rows flow through the real tokenizer in tests (tokenize a mini deck) rather than hand-built entry arrays — semicolon-packing, line attribution, and continuations are exercised for free"
  - "Warning attribution uses entry.line (the source physical line) for every MALFORMED_LINE on geometry rows"
  - "Strict positive-integer parse (parseListId) for ids, strict finite-number parse for coordinates — NaN/Infinity never enter the model (T-05-04)"

requirements-completed: [PARSE-01, PARSE-04]

# Metrics
duration: 7min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 5: Geometry Handlers — JOINT COORDINATES, MEMBER INCIDENCES & List Expansion Summary

**Production JOINT COORDINATES and MEMBER INCIDENCES handlers with a bounded list-range expansion helper — the real 92 KB HPP corpus now parses to 1122 nodes (max id 1222, node 2 at y = -2.8 m) and all 350 members (member 1: 1→739) through parseStaad, with 2D z-defaults, unit conversion to meters, and every malformed row degrading to a MALFORMED_LINE warning**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-16T10:36:00Z
- **Completed:** 2026-08-16T10:42:54Z
- **Tasks:** 3 (TDD ×3) + 1 wiring step (8 commits)
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- `lists.ts`: `expandList` + `listItemLength` + `parseListId` — STAAD P2 list syntax (explicit ids, `TO`, `TO BY`, `ALL`, mixed forms) expanded to concrete 1-based ids; **bounded expansion** (range ends clamped to `maxRef` or `LIST_HARD_CAP`, bounds validated before allocation, total-entry guard) neutralizes the T-05-01 zip-bomb surface (`1 TO 999999999` → capped at 1M entries, or 100 with `maxRef: 100`); non-numeric tokens skipped tolerantly; 12 tests
- `joint-coordinates.ts`: `id x y [z]` rows → typed `Node` records normalized to METERS through the running unit state (P1 — FEET default × 0.3048 verified); semicolon-packed rows (real fixture shape `1 0 0 0; 2 0 -2.8 0;`); 2-coordinate rows → z=0 under PLANE/FRAME (D-02) but MALFORMED_LINE under SPACE (never fabricated); Map-based duplicate dedupe (T-05-02, first wins); trailing specifiers tolerated; strict finite-number parse (T-05-04); 8 tests
- `member-incidences.ts`: `member-list start-node end-node [BETA…]` rows → typed `Member` records with 1-based source ids (D-04); **maximal-list scan** disambiguates the list from the node pair (`5 TO 7 10 20 100 200` → members 5,6,7,10,20 each 100→200; `3 5 6 BETA 90` → member 3 with BETA tolerated); malformed/non-numeric rows warn MALFORMED_LINE with source line, never throw; duplicate dedupe (T-05-02); 7 tests
- Wiring: both handlers registered into the real `COMMAND_TABLE` via `src/index.ts` import side effects; `parseStaad` now parses the real corpus end-to-end — node count (1122 rows / max id 1222), member count (350, manifest-computed), member 1 = (1, 739), bounds, units M/KN all asserted through the production path
- Full suite: 101/101 vitest pass (74 baseline + 27 new), `tsc --noEmit` clean; zero new dependencies (T-05-SC)

## Task Commits

Each task was committed atomically (TDD stages separate):

1. **Task 1: List-range expansion (TDD)** - `29774ea` (test: RED) + `ed2c450` (feat: GREEN) + `aa39e3d` (fix: test import path)
2. **Task 2: JOINT COORDINATES handler (TDD)** - `0421fd4` (test: RED) + `9e9a985` (feat: GREEN)
3. **Task 3: MEMBER INCIDENCES handler (TDD)** - `ef3d065` (test: RED) + `d9e9199` (feat: GREEN)
4. **Wiring: geometry handlers into parseStaad** - `145b097` (feat)

**Plan metadata:** `8d986c2` (docs: complete plan)

## Files Created/Modified
- `packages/parser/src/staad/lists.ts` - expandList (bounded range expansion), listItemLength (list-item scanner), parseListId (strict positive-integer parse), LIST_HARD_CAP
- `packages/parser/src/staad/joint-coordinates.ts` - jointCoordinatesHandler: id x y [z] rows → Nodes, meter conversion, 2D z-default, dedupe, strict parse
- `packages/parser/src/staad/member-incidences.ts` - memberIncidencesHandler: maximal-list node-pair split, range expansion, BETA tolerance, dedupe
- `packages/parser/test/staad/lists.test.ts` - 12 tests (explicit/TO/BY/mixed/ALL/caps/skip/descending + scanner)
- `packages/parser/test/staad/joint-coordinates.test.ts` - 8 tests (rows, semicolons, 2D, FEET, SPACE malformed, duplicates, bad numbers, trailing tokens)
- `packages/parser/test/staad/member-incidences.test.ts` - 7 tests (single, range+ids, BETA, semicolons, malformed, no-pair, duplicates)
- `packages/parser/src/index.ts` - added geometry handler side-effect imports (JOINT COORDINATES, MEMBER INCIDENCES)
- `packages/parser/test/index.test.ts` - removed 01-04 test-local JOINT COORDINATES stub; real-fixture test now asserts members (350, member 1 = 1→739) through the production path

## Decisions Made
- Node-pair disambiguation via maximal-list scan (documented above) — the only token-ambiguity point in member rows
- `expandList` ALL without maxRef → [] (unresolvable — tolerant, never guesses); ALL with maxRef → [1..maxRef]
- Local per-handler Map seeded from ctx collections instead of adding Map fields to ParseContext — same T-05-02 guarantee, zero core type churn
- Canonical-only registration keys; P2 abbreviations already canonicalized by COMMAND_ALIASES before dispatch
- Test layout `test/staad/` per plan → `../../src/…` import depth (existing suite's `../src/…` was one level shallower)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 01-04's test-local JOINT COORDINATES stub shadowed the production handler**
- **Found during:** Wiring step (after Task 3 GREEN)
- **Issue:** `test/index.test.ts` registered a test-local JOINT COORDINATES stub into the real COMMAND_TABLE. Once the production handler registered (module import side effect), the stub's later registration OVERWROTE it — `parseStaad` would have kept dispatching to the stub, defeating the plan's requirement that the production handler be picked up (and leaving the 01-04 "Known Stubs" entry unresolved).
- **Fix:** Removed the stub + its registration and now-unused imports; test 1 additionally asserts the exact manifest member count and member 1 = (1, 739) through the production path.
- **Files modified:** packages/parser/test/index.test.ts
- **Verification:** full suite 101/101 green; real-fixture assertions pass through the production handler
- **Committed in:** 145b097 (wiring commit)

**2. [Rule 1 - Test bug] lists.test.ts module import resolved to the wrong directory**
- **Found during:** Task 1 GREEN (first vitest run after implementing lists.ts)
- **Issue:** The new test files live in `test/staad/` (one level deeper than the existing suite), so `../src/staad/lists` resolved to `test/src/staad/lists` — "Cannot find module" even though the implementation existed (caught before GREEN by tsc/vitest module resolution).
- **Fix:** Corrected to `../../src/staad/lists` in the test import.
- **Files modified:** packages/parser/test/staad/lists.test.ts
- **Verification:** 12/12 lists tests pass after the fix
- **Committed in:** aa39e3d (fix commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 — stub shadowing; 1 Rule 1 — test import path)
**Impact on plan:** The stub removal was required to meet the plan's own success criterion (handlers registered so parseStaad picks them up); the import fix was a test-file placement artifact. No scope creep, no behavioral changes beyond the plan.

## Issues Encountered
- The plan's `files_modified` frontmatter did not list `src/index.ts`/`test/index.test.ts`, but wiring the handlers into `parseStaad` (a stated plan requirement) necessarily touches both — handled as documented deviation #1, no plan-level impact.
- Win32 path quirk: one git invocation used a `packages/parser` workdir with repo-relative paths (staging failed, no changes lost) — re-run from repo root succeeded; noted for future executors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `parseStaad` now produces real nodes + members from the real corpus; 01-06 (MEMBER PROPERTY / sections) can rely on `ctx.members` being populated with 1-based ids when it links sections
- `lists.ts` is the shared list-expansion primitive 01-06/07/08 (properties, supports, loads, START GROUP DEFINITION — the corpus's `_RAFT 132 TO 162 …` group rows) will consume; its `maxRef` option is the member-count reference those blocks need
- Group-definition ranges with continuation lines (`-` joins, e.g. `_RAFT 132 TO 162 211 212 217 TO 228 …`) are already tokenizer-handled; expandList accepts the resulting long token arrays
- Blockers: none. Open concerns carried from 01-04 unchanged (section database decision Phase 2, load-case size exaggeration UAT Phase 2/3)

---

*Phase: 01-parser-model*
*Completed: 2026-08-16*

## Self-Check: PASSED

- Created files verified on disk: `lists.ts`, `joint-coordinates.ts`, `member-incidences.ts`, all three `test/staad/*.test.ts` files, `01-05-SUMMARY.md` — all FOUND
- Commits verified in git: `29774ea`, `ed2c450`, `aa39e3d`, `0421fd4`, `9e9a985`, `ef3d065`, `d9e9199`, `145b097`, `8d986c2` — all FOUND
- Full suite: 101/101 vitest pass; `tsc --noEmit` clean
- TDD gate compliance: 3× `test(01-05)` RED commits precede 3× `feat(01-05)` GREEN commits in `git log` — gate sequence valid, no violations
