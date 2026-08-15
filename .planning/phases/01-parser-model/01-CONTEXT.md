# Phase 1: Parser & Model - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A tolerant, headless `.std` parser converts STAAD input decks into a typed, unit-correct `StaadModel`, validated against a golden-file corpus. No UI — verified via headless tests on fixtures. Parser produces typed nodes, members, sections, supports, loads, groups, and bounds. Section geometry resolves PRIS to rectangular polygons; TABLE ST members get approximate fallback shapes flagged as such (full section DB deferred to Phase 2). Plates/solids (ELEMENT SHELL) are skipped with warnings — out of scope. The parser is pure (zero DOM/Three imports) and worker-ready.

</domain>

<decisions>
## Implementation Decisions

### Golden Corpus
- **D-01:** Corpus source = real STAAD.Pro-generated files in `staadSample/`, starting with `HPP_Main_Building_2.std` (92 KB, metric METER KN, semicolon-packed coords, PRIS properties, modern quoted-DB syntax `'EUROPE (EN 2023).DB3'`, `TABLE 'IPE' ST`, member ranges `TO`, groups, plates, load cases).
- **D-02:** Supplement real files with hand-written fixtures covering edge cases not present in the real sample: 2D `STAAD PLANE` (Z omitted), `FEET`/imperial units, older/unquoted TABLE syntax variants, `" -"` continuations, unknown-command tolerance.

### Model Schema
- **D-03:** Full typed model — typed records for Node, Member, Section, Support, LoadCase, LoadItem, Group, Bounds, each with the fields downstream (renderer, inspector, summary panel) need.
- **D-04:** Keep original 1-based `.std` numbers as source-of-truth IDs (engineers reference member/joint numbers in coordination). 0-based internal indexes used where convenient for arrays, but source numbers are preserved as fields.

### Section Geometry
- **D-05:** Phase 1 resolves PRIS YD/ZD to rectangular polygons at parse time. TABLE ST members get an approximate fallback shape plus an "approximate" flag. Full bundled section DB (AISC/steel tables) deferred to Phase 2 (research flagged this as a Phase 2 decision).

### Warnings Model
- **D-06:** Structured warning objects: `{ code, message, line, severity }` with stable codes. `ParseResult` exposes `warnings[]` for UI; tests assert on codes.
- **D-07:** Warnings for: unknown commands, skipped plates/solids, unresolved sections, malformed lines, unit changes — each with a stable code.

### Validation
- **D-08:** Vitest (fits the Vite/TS stack) with golden-file snapshots. Tolerant cases assert warning codes.
- **D-09:** Dual-tier validation: hand-written fixtures assert exact counts + specific values (unit state, member geometry); real `staadSample` files assert tolerant no-crash parsing + expected counts.

### the agent's Discretion
- Parser internal structure (tokenizer vs scanner, command-dispatch table layout) — follow research ARCHITECTURE.md patterns.
- Precise stable warning-code naming scheme.
- Fixture directory layout inside the parser package.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research (project-level)
- `.planning/research/ARCHITECTURE.md` — Parser must be a pure headless module (`parseStaad(text): ParseResult`) with zero DOM/Three imports; tokenizer not regex; unit-state machine; command dispatch on normalized names; tolerant parsing collects warnings instead of throwing; worker-ready. `instanceId ↔ memberId` map notes.
- `.planning/research/PITFALLS.md` — P1 units are stateful (default FEET/KIPS, switch mid-file); P2 `.std` grammar breaks naive line parsers (`;` multi-entry, `" -"` continuations, `*` comments, command abbreviations, trailing-dot floats); P3 MEMBER PROPERTY syntax drifts across versions (legacy `TABLE ST W12X35` vs modern quoted `'US (AISC 2023).db3'` + `TABLE 'W' ST 'W14X90'`); P8 coordinate precision collapse at ~1e5+ → rebase to model centroid.
- `.planning/research/STACK.md` — TypeScript + Vitest + Vite stack; no existing STAAD parser on npm (custom required); OpenBuilding MIT parser as reference for command coverage.
- `.planning/research/SUMMARY.md` — Milestone-level synthesis; phase ordering rationale.

### Requirements
- `.planning/REQUIREMENTS.md` — PARSE-01..05 (Phase 1 scope), traceability section.

### Roadmap
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, depends-on.

### Real sample files
- `staadSample/HPP_Main_Building_2.std` — Real STAAD.Pro GUI output; ground-truth for golden corpus. User provides additional files into this directory.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield repo (no application code exists yet).

### Established Patterns
- No codebase patterns yet; research ARCHITECTURE.md establishes the pipeline pattern (parse → model → render, strictly one-way).

### Integration Points
- Parser is a standalone headless module; later phases import it (Phase 2 file-open flow, Phase 4 Web Worker). No existing code to connect to.

</code_context>

<specifics>
## Specific Ideas

- Real sample `HPP_Main_Building_2.std` must parse without crashing and produce correct counts (it is the primary ground-truth).
- The parser must handle the exact constructs present in the real sample: `UNIT METER KN`, `JOINT COORDINATES` semicolon-packed, `MEMBER INCIDENCES`, `ELEMENT INCIDENCES SHELL` (skip with warning), `START GROUP DEFINITION`, `ELEMENT PROPERTY`, `DEFINE MATERIAL`, `MEMBER PROPERTY AMERICAN` (PRIS), `MEMBER PROPERTY 'EUROPE (EN 2023).DB3'` (TABLE), `CONSTANTS`/`MATERIAL`, `SUPPORTS`, `MEMBER RELEASE`, `MEMBER CRACKED`, `DEFINE REFERENCE LOADS`, `LOAD` cases, `SELFWEIGHT`, `DEFINE WIND LOAD`, `PERFORM ANALYSIS`, design/check blocks — unknown commands tolerated with warnings.

</specifics>

<deferred>
## Deferred Ideas

- Full bundled section database (AISC/steel) — Phase 2 (research flagged as Phase 2 decision).
- Analysis results (`.OUT` files) — next milestone.
- `.e2k`/`.s2k` multi-format support — future; keep parser format-isolated.

None — discussion stayed within phase scope (the items above are pre-existing roadmap/research deferrals).

</deferred>

---

*Phase: 1-Parser & Model*
*Context gathered: 2026-08-15*