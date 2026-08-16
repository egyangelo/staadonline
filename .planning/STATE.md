---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: STAAD Online Viewer
current_phase: 01
current_phase_name: parser-model
status: executing
stopped_at: Completed 01-05-PLAN.md
last_updated: "2026-08-16T13:29:29.062Z"
last_activity: 2026-08-15
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 9
  completed_plans: 8
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15)

**Core value:** Open a STAAD `.std` file and see the 3D analytical model render correctly — on any device, in any browser, without STAAD.Pro.
**Current focus:** Phase 01 — parser-model

## Current Position

Phase: 01 (parser-model) — EXECUTING
Plan: 9 of 9
Status: Ready to execute
Last activity: 2026-08-15 — Phase 01 execution started

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Velocity:**

- Total plans completed: 1
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: none
- Trend: —

| Phase 01-parser-model P1 | 3min | 3 tasks | 7 files |
| Phase 01-parser-model P2 | 4min | 3 tasks | 2 files |
| Phase 01-parser-model P3 | 12min | 3 tasks | 10 files |
| Phase 01-parser-model P4 | 11min | 3 tasks | 9 files |
| Phase 01-parser-model P5 | 7min | 3 tasks | 8 files |
| Phase 01-parser-model P6 | 257min | 7 tasks | 8 files |
| Phase 01-parser-model P8 | 18 | 3 tasks | 5 files |
| Phase 01-parser-model P07 | 16min | 3 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phase order follows the research dependency chain — Parser → Rendering → Interaction → Native/Perf; the web app must be fully proven in-browser before Capacitor integration.
- [Roadmap]: Phase 1 is a headless parser + golden corpus with no UI — validated via headless tests on fixtures, not the file picker (FILE requirements land in Phase 2).
- [Roadmap]: Instancing (one InstancedMesh per section profile) and centroid rebasing are "from the start" architecture, decided at roadmap time per research P4/P8.
- [Roadmap]: iOS native packaging explicitly out of scope for v1 (user decision; web + Android only).
- [Phase ?]: Parser ships as standalone package @staad-online/parser with source-first exports; zero runtime dependencies per STACK.md (dependency-free by design) — Keeps parser hermetic and worker-ready
- [Phase 01-parser-model]: Unit tokens are STAAD abbreviated forms (FT/IN/KIP/LB/KN/M) as literal unions in UnitLength/UnitForce — Parser unit-state machine maps UNIT command tokens directly; D-03 locked shape
- [Phase 01-parser-model]: Sections and groups stored in Map containers (no eval-prone structures) — Threat model T-01 boundary prefers Map-based containers; lookup by sectionKey/group name
- [Phase 01-parser-model]: TypeScript 7.0.2 + Vitest 4.1.10 installed as latest stable — STACK.md pins latest stable; verified against npm registry before install
- [Phase 01-parser-model]: Tokenizer emits entries (TokenizedLine { line, tokens }) not physical lines - semicolon-packed GUI output becomes N entries sharing the source line number; continuations keep the first physical line number
- [Phase 01-parser-model]: Continuation detection is token-based (a standalone trailing - token at end of physical line) not char-based - negative numbers like -2.8 and mid-line - are naturally data
- [Phase 01-parser-model]: Unterminated quotes close at end of line (quote region = rest of line) - tolerant, never throws (T-02-03)
- [Phase 01-parser-model]: Line-ending normalization uses literal replaceAll (not regex) - no regex touches input content (T-02-01 ReDoS mitigation)
- [Phase 01-parser-model]: Group count boundary is END GROUP DEFINITION (40 entries), NOT MEMBER PROPERTY (75): naive block scan over-counts ELEMENT PROPERTY/DEFINE MATERIAL entries
- [Phase 01-parser-model]: LOAD disambiguation (checker #9): LOAD <digits> LOADTYPE = primary (14), LOAD COMB <id> = combination (274), loadCases = sum (288); non-numeric LOAD R1 LOADTYPE Mass excluded by digit check
- [Phase 01-parser-model]: Ambient node-env.d.ts shim (node:fs/node:path/node:url + ImportMeta) instead of installing @types/node — T-03-SC forbids installs, 01-01 owns dependencies
- [Phase 01-parser-model]: Counting helpers accept abbreviated headers (MEMB INCI / ELEM INCI) per PITFALLS P2
- [Phase 01-parser-model]: Canonical unit-state defaults are FT/KIP (locked UnitLength/UnitForce unions); STAAD token forms FEET/KIPS map via aliases — never stored
- [Phase 01-parser-model]: WARNING_CODES stays locked at six codes (types-smoke enforces); the 64MB size-guard reuses IGNORED_COMMAND with severity 'error' at line 0 instead of adding a 7th code
- [Phase 01-parser-model]: DEFINE-block tolerance (checker #8): single-pass scoped absorption; terminators are END DEFINE, or LOAD<digits>/PERFORM/PAGE/PRINT/DEFINE headers; non-numeric LOAD R1 LOADTYPE Mass is reference-load DATA (absorbed)
- [Phase 01-parser-model]: Segmentation is a single-pass state machine: unquoted uppercase-first token = new header; digit/_/quote/- first tokens = body; leading body before any header is skipped silently
- [Phase 01-parser-model]: STAAD header sets ctx.structure (PLANE/SPACE/FRAME); 2-coordinate joint rows valid only under PLANE/FRAME (z=0) — SPACE + 2-coord row = MALFORMED_LINE
- [Phase 01-parser-model]: Member-row node-pair disambiguation via maximal-list scan (listItemLength): the node pair is the numeric pair after the LONGEST valid member list — '5 TO 7 10 20 100 200' -> members 5,6,7,10,20 with pair (100,200); '3 5 6 BETA 90' -> member 3 with pair (5,6), BETA tolerated
- [Phase 01-parser-model]: expandList ALL without maxRef expands to nothing (no reference to resolve against, tolerant); with maxRef it is [1..maxRef]. Hard cap LIST_HARD_CAP = 1_000_000 bounds no-maxRef expansion; maxRef clamps ALL and range ends (T-05-01 zip-bomb guard)
- [Phase 01-parser-model]: Geometry handlers (joint-coordinates, member-incidences) keep a LOCAL Map seeded from ctx.nodes/ctx.members for dedupe + lookup — T-05-02 mitigation without adding Map fields to ParseContext
- [Phase 01-parser-model]: Handler registration uses canonical keys only (JOINT COORDINATES, MEMBER INCIDENCES); P2 abbreviations (JNT COORD, MEMB INCI, MEMBER INCIDENCE) are canonicalized by COMMAND_ALIASES before dispatch so alias table keys are redundant
- [Phase 01-parser-model]: Geometry test files live in test/staad/ (one level deeper than the existing suite) per plan layout — module imports resolve via ../../src/... not ../src/...
- [Phase 01-parser-model]: MEMBER PROPERTY handler registers under the canonical key 'MEMBER PROPERTIES' (core.ts COMMAND_ALIASES maps PROPERTY to PROPERTIES); the plan's raw 'MEMBER PROPERTY' key could never match canonicalized headers — 01-04 established alias canonicalization; registration keys must use canonical pluralized forms
- [Phase 01-parser-model]: Section labels: TABLE rows use the table section name; unnamed PRIS/PIPE rows use '_' + property text; named rows use the name itself; identical dims dedupe to one key — Dedupe + stable keys for downstream section map
- [Phase 01-parser-model]: Approximate flag from resolveSectionProfile is the single source of truth driving the UNRESOLVED_SECTION warning — One mechanism, no duplicated resolution logic
- [Phase 01-parser-model]: CONSTANTS handler registered under CONSTANTS, MATERIAL, and BETA keys; the real fixture's segmentation splits rows into their own blocks, so single-key registration silently loses materials — Real-file structure requires multi-key reachability
- [Phase 01-parser-model]: Material names stored RAW as written (CONCRETE/STEEL_36_KSI uppercase in real file); Phase 3 normalizes for matching — Faithful to source; display data untrusted
- [Phase 01-parser-model]: Member-list expansion passes maxRef = max member id (1490 in real file), not members.length (350) — member ids are non-contiguous — Count-based clamping would drop property links for ids 964..1490
- [Phase 01-parser-model]: Named-section to member links happen at finalize via groups; 01-08 delivers the real START GROUP DEFINITION handler — Group-link mechanism proven at unit level; real-file group parse is a later plan
- [Phase 01-parser-model]: LOAD COMB sign tokens (+/-) are term separators, not factor signs (GUI emits '- 1 DL + 1 H'); negative factors are negative numeric tokens — STAAD GUI combination syntax quirk verified in HPP_Main_Building_2.std
- [Phase 01-parser-model]: Combination refs resolve to numeric case id when integer, else case-name string (DL/H/W/LL) — GUI emits names since combo ids differ from case ids
- [Phase 01-parser-model]: JOINT LOAD axisRef always GLOBAL; MEMBER LOAD G-prefixed dirs GLOBAL, bare dirs LOCAL — Joints have no local axes; PITFALLS UX convention, T-08-04
- [Phase 01-parser-model]: ELEMENT LOAD rows warn SKIPPED_ELEMENT per row with line (loads.ts); skipped.ts covers ELEMENT INCIDENCES/PROPERTY warn-once — D-07 requires line attribution
- [Phase 01-parser-model]: FIXED BUT <dofs>: listed DOFs are RELEASED (true) per types.ts contract (true = released); plan's literal {FY:false,MZ:false} was a typo — Consistency with the shared SupportReleases contract; mini-deck asserts same
- [Phase 01-parser-model]: SPRING supports record type SPRING + verbatim stiffness note (Support.note, new optional field) — Rule 2: D-03 shape had no note field but plan requires record type + note
- [Phase 01-parser-model]: ELEMENT group rows stored AND warned SKIPPED_ELEMENT (D-07) so downstream linking never reports UNRESOLVED_SECTION for defined groups — Group must exist for core.ts finalize/member-property linking

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1] Research gap: no validated real `.std` sample files in-repo yet — golden corpus (plane frame, space frame, semicolon-packed GUI output, mixed-unit, modern quoted-DB) must be gathered from STAAD.Pro-generated files; highest-priority input for Phase 1.
- [Phase 2] Section database decision pending: bundle an AISC edition vs vendor OpenBuilding's MIT steel DB vs fallback-only "approximate" flags — affects Phase 2 fallback rendering and inspector accuracy claims.
- [Phase 2/3] Size exaggeration default (~10-20x) and load-case selector placement need engineer UAT input during Phase 2/3.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Platform | iOS native packaging | Deferred to later milestone | 2026-08-15 |
| Resilience | Persisted model restore, recent files, share-sheet open | v2 (REQUIREMENTS.md) | 2026-08-15 |

## Session Continuity

Last session: 2026-08-16T13:28:43.034Z
Stopped at: Completed 01-05-PLAN.md
Resume file: None
