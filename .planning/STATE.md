---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: STAAD Online Viewer
current_phase: 01
current_phase_name: parser-model
status: executing
stopped_at: Completed 01-04-PLAN.md
last_updated: "2026-08-16T07:30:58.741Z"
last_activity: 2026-08-15
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 9
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15)

**Core value:** Open a STAAD `.std` file and see the 3D analytical model render correctly — on any device, in any browser, without STAAD.Pro.
**Current focus:** Phase 01 — parser-model

## Current Position

Phase: 01 (parser-model) — EXECUTING
Plan: 5 of 9
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

Last session: 2026-08-16T07:30:58.728Z
Stopped at: Completed 01-04-PLAN.md
Resume file: None
