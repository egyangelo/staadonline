---
phase: 01-parser-model
plan: 07
subsystem: api
tags: [staad-parser, supports, groups, dispatch, typescript, vitest]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: 01-04 core-state segmentation (START-scope absorption, finalize group linking), 01-05 lists (expandList/parseListId), 01-06 member-property namedSections + constants MATERIAL
provides:
  - SUPPORTS block → typed Support records (PINNED/FIXED/FIXED_BUT/ENFORCED/SPRING) with per-DOF releases
  - START/END GROUP DEFINITION → typed Group records (memberIds/jointIds/elementIds) keyed by exact `_NAME`
  - Plate-support and ELEMENT-group SKIPPED_ELEMENT warnings (D-07)
  - First full-dispatch mini-deck integration test through parseStaad
affects: 01-09 golden-file wiring, Phase 2 (REND-01 model rendering), Phase 3 (color-by-material reads Member.material)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "registerCommand side-effect registration (units.ts pattern) for every command module"
    - "TDD per task: RED module-absent import failure → GREEN implementation (01-08 pattern)"
    - "Tolerant parsing: store dangling refs + warn, never throw (PARSE-03)"
    - "expandList-bounded range expansion at every trust boundary (T-05-01/T-07-01)"

key-files:
  created:
    - packages/parser/src/staad/supports.ts
    - packages/parser/src/staad/groups.ts
    - packages/parser/test/staad/supports.test.ts
    - packages/parser/test/staad/groups.test.ts
    - packages/parser/test/staad/supports-groups.test.ts
  modified:
    - packages/parser/src/types.ts

key-decisions:
  - "FIXED BUT <dofs>: listed DOFs are RELEASED (true in releases) per the types.ts contract ('true = released') and the plan's own action text; the plan's literal test expectation {FY:false, MZ:false} was a typo"
  - "SPRING supports record type SPRING + verbatim stiffness note (Support.note) — Rule 2 addition because the D-03 shape had no note field"
  - "Plate support rows (any row containing a PLATE marker) → SKIPPED_ELEMENT warning, no Support record, never a throw (D-07)"
  - "Dangling joint refs in SUPPORTS: store the support anyway + MALFORMED_LINE warning (plan's chosen option, T-07-03)"
  - "ELEMENT group rows are recorded (elementIds) AND warned SKIPPED_ELEMENT so downstream linking never reports UNRESOLVED_SECTION for a legitimately-defined group"
  - "Unknown group section keywords (word-start rows) are tolerated silently; list-start rows without _NAME warn MALFORMED_LINE"

patterns-established:
  - "Command handlers are self-registering modules (side-effect import); test files import the module to prove dispatch registration"
  - "Restraint model: releases = {FX,FY,FZ,MX,MY,MZ}, true = released (types.ts contract shared by supports + mini-deck)"
  - "Group linking: member-property/core.ts finalize link members by exact `_NAME` key — handler preserves underscore spelling verbatim (D-04)"

requirements-completed: [PARSE-01, PARSE-05]

# Metrics
duration: 16min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 7: SUPPORTS + GROUP DEFINITION Handlers Summary

**SUPPORTS and START/END GROUP DEFINITION block handlers producing typed Support (per-DOF releases) and Group records, with plate/ELEMENT skipping per D-07, verified through the first full-dispatch mini-deck integration test**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-16T16:13:49Z
- **Completed:** 2026-08-16T16:29:00Z
- **Tasks:** 3 (all TDD)
- **Files modified:** 6

## Accomplishments
- `supports.ts`: parses SUPPORTS rows (`<joint-list> <restraint>`) into Support records — PINNED (translations fixed, rotations released), FIXED, FIXED BUT <dofs> (listed DOFs released), ENFORCED, SPRING (stiffness note) — registered under 'SUPPORTS'
- `groups.ts`: parses START GROUP DEFINITION body (JOINT/ELEMENT/MEMBER sections) into typed Group records keyed by exact `_NAME`; ELEMENT rows warn SKIPPED_ELEMENT (D-07) while still recording elementIds; endGroupsHandler defensive no-op under 'END GROUP DEFINITION'
- `supports-groups.test.ts`: first end-to-end dispatch proof — full mini-deck (STAAD SPACE → UNIT → JOINT COORDINATES → MEMBER INCIDENCES → GROUP DEFINITION → SUPPORTS → MEMBER PROPERTY → CONSTANTS) runs through parseStaad with exact counts, support types, group memberIds, and warning assertions
- 159/159 parser tests green across the full suite (16 files) — no regressions from the new registrations

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: supports.ts handler** - `a4020af` (test: RED) → `83840bd` (feat: GREEN)
2. **Task 2: groups.ts handler** - `748ae2e` (test: RED) → `33b5fa6` (feat: GREEN) → `dc891a1` (test: expectation corrections during GREEN)
3. **Task 3: mini-deck integration** - `c0de6b3` (test)

**Plan metadata:** pending final `docs(01-07)` commit

## Files Created/Modified
- `packages/parser/src/staad/supports.ts` - SUPPORTS handler: joint-list expansion, restraint parsing (PINNED/FIXED/FIXED_BUT/ENFORCED/SPRING), plate-row skip, dangling-ref tolerance
- `packages/parser/src/staad/groups.ts` - START/END GROUP DEFINITION handler: section switching, `_NAME` group rows, ELEMENT SKIPPED_ELEMENT, unknown-keyword tolerance
- `packages/parser/src/types.ts` - added optional `note?: string` to Support (SPRING stiffness, Rule 2)
- `packages/parser/test/staad/supports.test.ts` - 8 unit tests for the SUPPORTS handler
- `packages/parser/test/staad/groups.test.ts` - 8 unit tests for the GROUP DEFINITION handler
- `packages/parser/test/staad/supports-groups.test.ts` - mini-deck end-to-end dispatch integration

## Decisions Made
- FIXED BUT semantics follow the types.ts contract: listed DOFs are released (`true`). The plan's literal test expectation `{FY:false, MZ:false}` contradicts both the type contract and the plan's own action text ("all fixed except listed releases") — a plan-authoring typo, documented as deviation #1.
- SPRING stiffness is recorded as a verbatim `note` string on the Support record (new optional field) rather than inventing a structured stiffness shape — plates/springs are out of phase scope beyond recording.
- ELEMENT group rows are stored AND warned (not dropped): the group must exist so core.ts finalize and member-property linking never report UNRESOLVED_SECTION for a legitimately-defined group.
- END GROUP DEFINITION is consumed by the START scope in segmentBlocks (never dispatched); the no-op registration is purely defensive for un-scoped decks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FIXED BUT releases direction: plan's literal expectation contradicted the type contract**
- **Found during:** Task 1 (supports.test.ts test 3)
- **Issue:** Plan text said `7 FIXED BUT FY MZ` → `releases { FY:false, MZ:false }`, but types.ts defines `true = released` and the plan's own action text says "all fixed except listed releases" — so FY/MZ must be `true`.
- **Fix:** Implemented and tested per the type contract (`{FX:false, FY:true, FZ:false, MX:false, MY:false, MZ:true}`); documented the plan typo in test comments and this summary.
- **Files modified:** packages/parser/src/staad/supports.ts, packages/parser/test/staad/supports.test.ts
- **Verification:** supports.test.ts test 3 asserts the contract-correct releases; mini-deck asserts the same.
- **Committed in:** 83840bd (Task 1 GREEN)

**2. [Rule 2 - Missing Critical] Support type had no note field for SPRING stiffness**
- **Found during:** Task 1 (supports.test.ts test 6)
- **Issue:** Plan requires SPRING "record type + note", but the D-03 Support shape had no field for the stiffness spec.
- **Fix:** Added optional `note?: string` to Support in types.ts (additive, backward-compatible — existing Support constructions in tests/UI unaffected) and stored the verbatim stiffness tokens (`FX 1000`) there.
- **Files modified:** packages/parser/src/types.ts, packages/parser/src/staad/supports.ts
- **Verification:** supports.test.ts test 6 asserts `note === 'FX 1000'`; full suite green.
- **Committed in:** 83840bd (Task 1 GREEN)

**3. [Rule 2 - Missing Critical] Unknown group section keywords initially warned instead of being tolerated**
- **Found during:** Task 2 (groups.test.ts test 5 during GREEN)
- **Issue:** My first handler treated any non-`_NAME` row as MALFORMED_LINE, but the plan requires unknown section keywords (T-07-05) to be tolerated without warning — the plan's test 5 expects zero warnings for `FANCY SECTION`.
- **Fix:** Split the row classification: LIST-starting rows (numeric/ALL/TO/BY) without `_NAME` → MALFORMED_LINE (T-07-04); word-starting rows → unknown section keyword, tolerated silently (T-07-05).
- **Files modified:** packages/parser/src/staad/groups.ts
- **Verification:** groups.test.ts test 5 (zero warnings) and test 6 (MALFORMED_LINE) both green.
- **Committed in:** 33b5fa6 (Task 2 GREEN)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing-critical)
**Impact on plan:** All auto-fixes were necessary for correctness/plan-spec compliance. No scope creep.

## Issues Encountered
- **Continuation form in my own test deck (test 4):** I initially wrote the `-` continuation on its OWN line (`\n- 49 TO 51`), but STAAD syntax is a TRAILING lone `-` (`_COLS 1 TO 5 -\n49 TO 51`). The tokenizer correctly implements the trailing form; my test expectation was wrong. Fixed the test deck; verified tokenizer behavior is correct as-is.
- **Warning line attribution in test expectations:** Rows live on physical line 2 of the test decks, so warnings carry `line: 2` — my first assertions expected block line 1. Corrected in `dc891a1`.
- **Arithmetic slip:** `1 TO 12` + `49 TO 57` = 21 ids (12+9), not 20; corrected in `dc891a1`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Supports + groups handlers registered and unit-tested; mini-deck proves full dispatch works before 01-09 wires them into production `src/index.ts` (currently only imported by tests) and adds the golden-file corpus test.
- 01-09 can now import `supports.ts`/`groups.ts` into index.ts and run the real HPP fixture end-to-end.
- Watch item: `Support.note` is a new optional field — Phase 2/3 consumers should render it (e.g., spring stiffness tooltip) or ignore it safely.

---
*Phase: 01-parser-model*
*Completed: 2026-08-16*

## Self-Check: PASSED

- Files verified: supports.ts, groups.ts, 3 test files, SUMMARY.md all present
- Commits verified: a4020af, 83840bd, 748ae2e, 33b5fa6, dc891a1, c0de6b3 all in git log