---
phase: 01-parser-model
plan: 4
subsystem: parser
tags: [parse-core, segmentation, units, dispatch, STAAD, typescript, tolerant]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: 01-01 tokenizer/types (Token, TokenizedLine, tokenize, WARNING_CODES, StaadModel) that parseStaad consumes
  - phase: 01-parser-model
    provides: 01-03 hermetic corpus + manifest counts (real HPP fixture, countJointRows ground truth) that the integration suite validates against
provides:
  - Stateful unit-state machine (resolve-units): STAAD UNIT token aliases (FEET/INCH/METER/KIPS...) → canonical FT/KIP/KN unit state, whole-line validation, structured UNIT_CHANGE/MALFORMED_LINE warnings
  - Tolerant block segmentation + command canonicalization (core.ts): uppercase-first headers, digit/_/quote/- body, DEFINE/START scoped absorption with END DEFINE + tolerant terminators (checker #8)
  - ParseContext accumulator + finalize: Map-based collections, bounds computation, member↔section linking, D-04 1-based id preservation
  - COMMAND_TABLE dispatch (staad/index.ts): longest-canonical-prefix resolveHandler, prototype-safe table, UNIT + STAAD handlers wired (checkers #2/#3)
  - Public parseStaad(text): ParseResult entry with 64 MB input-size guard (T-04-01) and unknown-command tolerance (T-04-03)
affects: [01-parser-model plans 5-9 (geometry, properties, loads, supports, groups, assembly), all later phases consuming the model]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-pass no-lookahead state-machine segmentation (normal/define/start scopes) — never requires re-scanning the token stream"
    - "Longest-prefix command dispatch over a canonicalized, alias-expanded key space (Object.create(null) table — prototype-safe)"
    - "Map-based entity context (nodes/members/sections/groups) — no Record<number> lookups (T-04-02)"
    - "Every failure path degrades to a structured warning, never a throw"
    - "Test-local handler stubs registered into the real dispatch table for end-to-end pipeline proofs before production handlers land (01-05)"

key-files:
  created:
    - packages/parser/src/resolve-units.ts
    - packages/parser/src/core.ts
    - packages/parser/src/staad/index.ts
    - packages/parser/src/staad/units.ts
    - packages/parser/src/staad/header.ts
    - packages/parser/src/index.ts
    - packages/parser/test/resolve-units.test.ts
    - packages/parser/test/core.test.ts
    - packages/parser/test/index.test.ts
  modified: []

key-decisions:
  - "Canonical unit-state defaults are FT/KIP (locked UnitLength/UnitForce unions); STAAD token forms FEET/KIPS map via aliases — never stored"
  - "WARNING_CODES stays locked at six codes (types-smoke enforces); the 64MB size-guard reuses IGNORED_COMMAND with severity 'error' at line 0 instead of adding a 7th code"
  - "DEFINE-block tolerance (checker #8): single-pass scoped absorption; terminators are END DEFINE, or LOAD<digits>/PERFORM/PAGE/PRINT/DEFINE headers; non-numeric LOAD R1 LOADTYPE Mass is reference-load DATA (absorbed)"
  - "Segmentation is a single-pass state machine: unquoted uppercase-first token = new header; digit/_/quote/- first tokens = body; leading body before any header is skipped silently"
  - "STAAD header sets ctx.structure (PLANE/SPACE/FRAME); 2-coordinate joint rows valid only under PLANE/FRAME (z=0) — SPACE + 2-coord row = MALFORMED_LINE"
  - "index.test.ts registers a test-local JOINT COORDINATES stub (normalizing via toMeters) so structure/unit behavior is provable end-to-end before 01-05's real handler"

patterns-established:
  - "Dispatch keys are canonicalized command names (uppercase + P2 aliases expanded); handlers register full names AND aliases"
  - "D-04 ids are 1-based source ids preserved on entities; internal order = array position"
  - "Real-fixture assertions reuse manifest-computed ground truth (max joint id 1222); corpus has non-contiguous joint ids (1122 rows)"

requirements-completed: [PARSE-02, PARSE-03, PARSE-05]

# Metrics
duration: 11min
completed: 2026-08-16
status: complete
---

# Phase 1: Plan 4 — Parse Core: Units, Segmentation, Dispatch & Public API Summary

**Stateful UNIT unit-state machine, tolerant single-pass block segmentation, canonicalized longest-prefix command dispatch with UNIT/STAAD handlers, and a public parseStaad entry — the real 92 KB HPP fixture parses end-to-end (1122 joints, node 2 at y = -2.8 exactly, units M/KN, computed bounds) with unknown commands degrading to structured warnings**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-16T10:13:33Z
- **Completed:** 2026-08-16T10:24:23Z
- **Tasks:** 3 (4 commits)
- **Files modified:** 9

## Accomplishments
- `resolve-units.ts`: stateful unit-state machine (PITFALLS P1) — length/force alias tables (IN/INCH/INCHES, FT/FE/FEET, M/ME/METER/METERS, KIP/KIPS, KG/KGF, LB/LBS...), whole-line validation (no state change on unrecognized tokens, T-04-04), length-only/force-only UNIT lines, single UNIT_CHANGE info warning on switch, `toMeters` normalization; 14 tests
- `core.ts`: tolerant segmentation (checker #8) — uppercase-first headers; digit/`_`/quote/`-` body; DEFINE/START scoped absorption (END DEFINE, END, tolerant terminators `LOAD <digits>`/PERFORM/PAGE/PRINT/DEFINE; `LOAD R1` reference data absorbed); P2 alias canonicalization (`MEMB INCI` → `MEMBER INCIDENCES`); ParseContext + finalize (Map-based, bounds, member-section links, D-04 ids); 20 tests
- `staad/`: `COMMAND_TABLE` (Object.create(null), T-04-02), longest-prefix `resolveHandler`, `registerCommand`; UNIT handler forwarding header tokens to `applyUnitCommand` (checker #2); STAAD handler setting `ctx.structure` (checker #3)
- `index.ts`: public `parseStaad(text)` — 64 MB size guard (T-04-01) returning an error-severity warning result, tokenize→segment→dispatch→finalize pipeline, UNKNOWN_COMMAND tolerance (T-04-03), `registerParsingCommands()` bootstrap for 01-09
- End-to-end integration suite (5 tests): real HPP fixture parses without throwing — units M/KN, 1122 joint rows (max id 1222, manifest-verified), node 2 y = -2.8 exactly, finite computed bounds, UNKNOWN_COMMAND present; empty input → P1 defaults; STAAD PLANE 2-coord rows → z=0 with no MALFORMED_LINE; STAAD SPACE 2-coord row → MALFORMED_LINE (row skipped, never fabricated); size guard → 1 error warning
- Full suite: 74/74 vitest pass, `tsc --noEmit` clean; zero new dependencies (T-04-SC)

## Task Commits

Each task was committed atomically:

1. **Task 1: Unit-state machine (TDD)** - `2301c0f` (test: RED) + `c3ecdc4` (feat: GREEN)
2. **Task 2: Block segmentation + canonicalization + finalize** - `ff85931` (feat)
3. **Task 3: Command dispatch + public parseStaad entry** - `9b67765` (feat)

**Plan metadata:** `4f38132` (docs: complete plan)

_Note: Task 1 was a TDD task (test → feat commits)._

## Files Created/Modified
- `packages/parser/src/resolve-units.ts` - LENGTH_ALIASES/FORCE_ALIASES maps, createUnitState (FT/KIP), applyUnitCommand(entry, state, warn), toMeters
- `packages/parser/src/core.ts` - CommandBlock, ParseContext, canonicalizeCommand, segmentBlocks (state machine), createContext, finalize
- `packages/parser/src/staad/index.ts` - CommandHandler type, COMMAND_TABLE, registerCommand, resolveHandler (longest token-prefix)
- `packages/parser/src/staad/units.ts` - UNIT handler → applyUnitCommand (side-effect registration)
- `packages/parser/src/staad/header.ts` - STAAD handler → ctx.structure (PLANE/SPACE/FRAME, default SPACE)
- `packages/parser/src/index.ts` - parseStaad public API, MAX_INPUT_LENGTH = 64_000_000, registerParsingCommands, size guard
- `packages/parser/test/resolve-units.test.ts` - 14 tests (alias mapping, whole-line validation, state switching, toMeters with toBeCloseTo for 12-inch float case)
- `packages/parser/test/core.test.ts` - 20 tests (canonicalization, segmentation scopes, DEFINE tolerance, context defaults, finalize bounds/links)
- `packages/parser/test/index.test.ts` - 5 end-to-end tests incl. real-fixture parse, PLANE/SPACE 2D behavior, size guard; test-local JOINT COORDINATES stub

## Decisions Made
- Canonical defaults FT/KIP — the plan's "FEET/KIPS" wording (P1) is the STAAD *token* form; the locked UnitLength/UnitForce unions accept only FT/KIP, so tokens map to canonical values (see deviations)
- Size guard reuses `IGNORED_COMMAND` with severity `'error'` at line 0 — WARNING_CODES is locked at six codes by types-smoke.test.ts
- DEFINE scope terminates on `LOAD <numeric>` (not `LOAD R1`) — proven against the real fixture's DEFINE REFERENCE LOADS (883-906) and DEFINE WIND LOAD (914) regions
- Single-pass segmentation with no lookahead — tolerant terminators are re-processed as new headers in the next iteration instead of being pre-scanned
- Test-local JOINT COORDINATES stub registered into the real dispatch table (normalizes via toMeters) — proves structure + unit-state end-to-end before 01-05's production handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Type mismatch] Test assertions used STAAD token forms FEET/KIPS instead of canonical FT/KIP**
- **Found during:** Task 1 (GREEN — typecheck)
- **Issue:** Plan P1 states defaults "FEET+KIPS", but locked unions `UnitLength`/`UnitForce` (types.ts, 01-01) contain `FT`/`KIP` only — `TS2322: Type '"FEET"' is not assignable to type 'UnitLength'`
- **Fix:** Canonical unit state is FT/KIP; the plan's FEET/KIPS are STAAD input tokens mapped via aliases. Updated test assertions and createUnitState default
- **Files modified:** packages/parser/test/resolve-units.test.ts, packages/parser/src/resolve-units.ts
- **Verification:** typecheck clean, 14/14 unit tests pass
- **Committed in:** c3ecdc4 (GREEN commit, part of Task 1)

**2. [Rule 1 - Test bug] Quoted-entry fixture in core.test.ts was tokenized incorrectly by the test helper**
- **Found during:** Task 2 (first vitest run)
- **Issue:** The helper split `'QUOTED 1'` into two unquoted tokens, so the uppercase `QUOTED` became a header instead of body — a test artifact, not an implementation bug
- **Fix:** Constructed the quoted token as a single `{ text: 'QUOTED 1', quoted: true }` token, matching the real tokenizer contract
- **Files modified:** packages/parser/test/core.test.ts
- **Verification:** 20/20 core tests pass
- **Committed in:** ff85931 (Task 2 commit)

**3. [Rule 1 - Test correctness] Node-count assertion conflated row count with max joint id; SPACE assertion inverted**
- **Found during:** Task 3 (integration run)
- **Issue:** Real fixture has NON-CONTIGUOUS joint ids — 1122 rows, max id 1222 (manifest `joints` is the max id). Initial `toHaveLength(1222)` was wrong; also asserted node 1 exists under STAAD SPACE when the 2-coord row is correctly rejected
- **Fix:** Added deterministic `countJointRows()` (mirrors manifest counting, D-09 no-hardcoding rule) + max-id check against `expected['real/...'].joints`; corrected test 4 to assert the row is skipped (0 nodes) under SPACE
- **Files modified:** packages/parser/test/index.test.ts
- **Verification:** 5/5 integration tests pass
- **Committed in:** 9b67765 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 — test/type correctness)
**Impact on plan:** All fixes were test-side correctness alignments; implementation matches the design exactly. No scope creep.

## Known Stubs
- `packages/parser/test/index.test.ts` — test-local `JOINT COORDINATES` handler stub (registers into the real COMMAND_TABLE). Intentional: 01-04 delivers only core-state handlers; the production geometry handler lands in 01-05. Production behavior today: geometry blocks produce UNKNOWN_COMMAND warnings (tolerant, per T-04-03) — the model correctly lacks geometry until 01-05.

## Issues Encountered
- `gsd-tools` `state.record-metric` requires named flags (`--phase --plan --duration [--tasks --files]`), not positional args — shim help documents the named form (noted for future executors)
- Verified against the real fixture: joint ids are non-contiguous (1122 rows / max 1222) — an important ground-truth nuance for every later plan asserting node counts

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `parseStaad` public API is live and tolerantly parses the full real fixture; 01-05 can add geometry handlers (JOINT COORDINATES / MEMBER INCIDENCES / ELEMENT INCIDENCES) into the existing COMMAND_TABLE without pipeline changes
- 01-06+ consume ParseContext collections (namedSections, memberSectionLinks, groups) built for section/load handling
- Blockers: none. Concern carried forward: section database decision (Phase 2) and load-case size exaggeration UAT (Phase 2/3) remain open per STATE.md

---
*Phase: 01-parser-model*
*Completed: 2026-08-16*
