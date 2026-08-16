---
phase: 01-parser-model
plan: 8
subsystem: parsing
tags: [staad, load-cases, load-combination, selfweight, member-load, joint-load, typescript, vitest]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: "01-04 dispatch (COMMAND_TABLE / resolveHandler longest-prefix), 01-05 lists.ts (expandList / listItemLength / parseListId), 01-05/06 typed StaadModel + PITFALLS P2/P3 handling, 01-04 tokenizer continuation-folding"
provides:
  - "LOAD / LOAD COMB / LOAD LIST / SELFWEIGHT / MEMBER LOAD / JOINT LOAD / ELEMENT LOAD handlers registered under COMMAND_TABLE"
  - "Typed LoadCase records (kind PRIMARY|COMBINATION, combination terms, declared forceUnit) with LoadItem axis/axisRef/magnitude/targets"
  - "skipped.ts tolerated-command registrations (IGNORED_COMMAND warn-once, SKIPPED_ELEMENT warn-once, silent CHANGE/FINISH)"
affects: [01-09, phase-2-renderer, phase-3-markers, phase-2-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "handler module per command family with module-import side-effect registration"
    - "maximal-list scan (listItemLength) for row boundary detection in LOAD item rows"
    - "warn-once tolerated handlers (one structured warning per block, not per row)"
    - "TDD RED via module-absent import failure, GREEN via handler implementation"

key-files:
  created:
    - packages/parser/src/staad/loads.ts
    - packages/parser/src/staad/skipped.ts
    - packages/parser/test/staad/loads.test.ts
  modified:
    - packages/parser/src/types.ts
    - packages/parser/src/core.ts

key-decisions:
  - "LOAD COMB sign tokens (+/-) are term SEPARATORS, not factor signs (STAAD GUI emits `- 1 DL + 1 H`); a genuinely negative factor arrives as a negative numeric token"
  - "Combination references resolve to a numeric case id when the token is an integer, else the case-name string (GUI emits names DL/H/W/LL)"
  - "JOINT LOAD axisRef always GLOBAL (joints have no local axes); MEMBER LOAD G-prefixed dirs GLOBAL, bare dirs LOCAL (PITFALLS UX)"
  - "ELEMENT LOAD rows warn SKIPPED_ELEMENT per row with line attribution (implemented in loads.ts, not skipped.ts)"
  - "LoadCase.kind / terms / forceUnit added as optional fields (D-03 backward compatible); ParseContext gains currentLoadCase for item attachment"
  - "Real-file load region slice (LOAD 13..FINISH) validated against manifest counts: 288 cases = 14 PRIMARY + 274 COMBINATION (D-09)"

patterns-established:
  - "Load-case header parsing from the block HEADER entry tokens only (real LOAD blocks have empty bodies)"
  - "Item handlers read block header (SELFWEIGHT) or body rows (MEMBER/JOINT/ELEMENT LOAD); every row validated, never throws"
  - "maxRef clamping per id-space: member lists clamp to max member id, joint lists to max joint id (silent-drop prevention)"

requirements-completed: [PARSE-01, PARSE-03]

# Metrics
duration: 18min
completed: 2026-08-16
status: complete
---

# Phase 01 Plan 8: Load-Case Parsing Summary

**LOAD / LOAD COMB / SELFWEIGHT / MEMBER LOAD / JOINT LOAD handlers producing typed LoadCase records (kind, combination factor terms, declared force unit) with global/local axis conventions, plus skipped.ts tolerated-command registrations validated against the real HPP file's 288 load cases**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-16T12:37:51Z
- **Completed:** 2026-08-16T12:56:01Z
- **Tasks:** 3 (all TDD pairs: test → feat)
- **Files modified:** 5 (2 created source, 2 modified source, 1 created test)

## Accomplishments
- LOAD/LOAD COMB case headers parsed from the block header entry: `LOAD <id> [LOADTYPE <t...>] [TITLE <rest...>]` → PRIMARY LoadCase; `LOAD COMB <id> [COMB] <terms...>` → COMBINATION with factor terms (name or numeric refs, envelope/unknown tokens tolerated, sign tokens consumed as separators)
- SELFWEIGHT / MEMBER LOAD / JOINT LOAD item handlers with maximal-list scan, explicit GLOBAL/LOCAL axisRef convention, per-id-space clamping (member vs joint lists), and per-row MALFORMED_LINE tolerance (never throws, T-08-02)
- ELEMENT LOAD rows → SKIPPED_ELEMENT warnings with line attribution (plates out of scope, D-07)
- skipped.ts registers 30 tolerated commands (IGNORED_COMMAND warn-once / SKIPPED_ELEMENT warn-once / silent CHANGE+FINISH) so real files parse without UNKNOWN_COMMAND noise
- Real HPP load-region slice (lines 938-1774) parses to manifest-exact counts: 288 load cases = 14 PRIMARY + 274 COMBINATION (D-09 dual-tier validation)
- Mini-deck end-to-end through parseStaad: 2 LOAD cases + 1 LOAD COMB with item/term assertions and warning-code checks

## Task Commits

Each task was committed atomically (TDD pairs):

1. **Task 1: LOAD/LOAD COMB headers** - `87665f2` (test, RED) + `0320908` (feat, GREEN)
2. **Task 2: SELFWEIGHT/MEMBER LOAD/JOINT LOAD items** - `89cc4bd` (test, RED) + `41354c9` (feat, GREEN)
3. **Task 3: Tolerated commands + load mini-deck integration** - `6160c07` (feat incl. tests)

**Plan metadata:** `pending` (docs commit follows)

## Files Created/Modified
- `packages/parser/src/staad/loads.ts` - CREATED. loadHandler, loadCombHandler, loadListHandler (Task 1); selfweightHandler, memberLoadHandler, jointLoadHandler, elementLoadHandler (Task 2); registration side effects for all seven keys
- `packages/parser/src/staad/skipped.ts` - CREATED. registerSkippedCommands() with IGNORED_COMMAND warn-once, SKIPPED_ELEMENT warn-once, silent no-op handlers; idempotent module-import side effect
- `packages/parser/test/staad/loads.test.ts` - CREATED. 23 tests: 11 header, 10 item, mini-deck integration, real HPP slice (manifest-exact counts + spot checks)
- `packages/parser/src/types.ts` - MODIFIED. Added LoadCaseType, LoadCombinationTerm; LoadCase gains optional kind/terms/forceUnit (backward compatible)
- `packages/parser/src/core.ts` - MODIFIED. ParseContext gains optional currentLoadCase

## Decisions Made
- Combination terms stored on LoadCase (optional `terms`) rather than extending LoadItem with a new kind — matches the plan's chosen option and keeps LoadItem shape stable for Phase 2/3 consumers
- `forceUnit` snapshot at case declaration (ctx.units.force) satisfies PITFALLS P1 display requirement
- Sign-token separator semantics for LOAD COMB (GUI quirk), documented in loads.ts header
- Real-slice test prepends `UNIT METER KN` to restore the file's unit context (the unit block precedes the slice)
- skipped.ts keeps `CHANGE`/`FINISH` fully silent (bookkeeping noise), everything else warn-once

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] ParseContext.currentLoadCase added in core.ts**
- **Found during:** Task 1 (LOAD header handler)
- **Issue:** The plan's `files_modified` omitted core.ts, but load item handlers must know which case they belong to; the plan's own Task 1 action text requires "creates ctx.currentLoadCase"
- **Fix:** Added optional `currentLoadCase?: LoadCase` to ParseContext (additive, no existing behavior changed)
- **Files modified:** packages/parser/src/core.ts
- **Verification:** All 23 loads tests + full suite (142) green; tsc clean
- **Committed in:** 0320908 (Task 1 GREEN)

**2. [Rule 1 - Bug] ParseWarning uses `message`/`severity`, not `text`**
- **Found during:** Task 1 typecheck
- **Issue:** warnMalformed initially wrote `text:` — ParseWarning (D-06) has `message` + `severity` fields; tsc failed
- **Fix:** Matched the established warning shape used by constants.ts/member-property.ts
- **Files modified:** packages/parser/src/staad/loads.ts
- **Verification:** tsc --noEmit clean
- **Committed in:** 0320908 (Task 1 GREEN)

**3. [Rule 1 - Bug] Mini-deck item count expectation corrected (test-side)**
- **Found during:** Task 3 mini-deck test
- **Issue:** The JOINT LOAD block before `LOAD 2` belongs to case 1 (currentLoadCase semantics), so case 1 has 3 items (SELFWEIGHT + MEMBER_LOAD + JOINT_LOAD), not 2; case 2's item is JOINT_LOAD -50/[7], not -123/[3]
- **Fix:** Corrected the assertions to the deck's actual semantics (this is the intended behavior — items attach to the current case until the next LOAD header)
- **Files modified:** packages/parser/test/staad/loads.test.ts
- **Verification:** mini-deck test green
- **Committed in:** 6160c07 (Task 3)

### Planned-vs-implemented differences (documented, not corrections)

**4. ELEMENT LOAD handled in loads.ts, not skipped.ts**
- **Found during:** Task 3
- **Issue:** The plan lists ELEMENT LOAD under skipped.ts registrations; per-row line attribution (D-07 requires the line) is only possible from a dedicated handler
- **Fix:** elementLoadHandler in loads.ts pushes SKIPPED_ELEMENT per row with the row's line; skipped.ts covers ELEMENT INCIDENCES / ELEMENT PROPERTY warn-once per block
- **Files modified:** packages/parser/src/staad/loads.ts, packages/parser/src/staad/skipped.ts
- **Verification:** mini-deck + real-slice SKIPPED_ELEMENT assertions green

**5. LOAD LIST registered in loads.ts (silent loadListHandler), not skipped.ts**
- **Found during:** Task 1
- **Issue:** The plan's skipped.ts list includes LOAD LIST, but it belongs to the load-family module and needs no warning
- **Fix:** loadListHandler no-op + belt-and-suspenders tokens[1]==='LIST' check in loadHandler
- **Files modified:** packages/parser/src/staad/loads.ts
- **Verification:** header test (6) asserts no case + no warnings

**6. JOIN/JOINT list clamping uses per-id-space maxRef**
- **Found during:** Task 2 (correctness)
- **Issue:** Member-id clamping for joint lists would silently drop valid joint ranges above the member count (real file: 1222 joints vs 350 members)
- **Fix:** jointLoadHandler clamps to max joint id, memberLoadHandler/selfweightHandler clamp to max member id
- **Files modified:** packages/parser/src/staad/loads.ts
- **Verification:** Task 2 tests (targets assertions) green

**7. Multi-token loadtype support (beyond plan's single-token `<t>`)**
- **Found during:** Task 1 (real-file awareness: `LOAD 3 LOADTYPE Roof Live TITLE LR` at line 1024)
- **Issue:** Single-token capture would truncate 'Roof Live' to 'Roof'
- **Fix:** loadHandler consumes loadtype tokens until TITLE/end, joining with spaces
- **Files modified:** packages/parser/src/staad/loads.ts
- **Verification:** header test (9) 'Roof Live'; real-slice spot checks green

**8. Real-slice unit-context prepend (test-side)**
- **Found during:** Task 3 real-slice test design
- **Issue:** The slice starts at LOAD 13 (line 938); the file's UNIT METER KN (line 13) precedes it, so default FT/KIP would poison forceUnit assertions
- **Fix:** Prepended `UNIT METER KN` to the sliced deck
- **Files modified:** packages/parser/test/staad/loads.test.ts
- **Verification:** forceUnit === 'KN' for all 288 cases green

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 2) + 5 documented planned-vs-implemented differences
**Impact on plan:** All auto-fixes necessary for correctness and the plan's own stated requirements. No scope creep, no behavior beyond the plan.

## Issues Encountered
- Mini-deck test initially asserted wrong item counts (test-authoring error, corrected — see deviation 3)
- `rg` unavailable on this Windows host (use Grep tool / Select-String) — tooling note, no impact

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01-09 can wire loads.ts + skipped.ts into the production import list (registerParsingCommands) — the registrations are complete and proven
- Plan 01-07 (SUPPORTS/GROUPS) remains unexecuted and is independent of this plan
- Phase 2 renderer can consume LoadCase.items (axis/axisRef/magnitude/targets) and combination terms for display
- Phase 3 markers: axisRef GLOBAL/LOCAL convention recorded per T-08-04

---
*Phase: 01-parser-model*
*Completed: 2026-08-16*

## Self-Check: PASSED
- FOUND: packages/parser/src/staad/loads.ts, packages/parser/src/staad/skipped.ts, packages/parser/test/staad/loads.test.ts, 01-08-SUMMARY.md
- FOUND: commits 87665f2, 0320908, 89cc4bd, 41354c9, 6160c07
