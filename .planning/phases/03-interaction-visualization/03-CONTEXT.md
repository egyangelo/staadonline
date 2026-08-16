# Phase 3: Interaction & Visualization - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 makes the rendered model *readable*. Users can color members by section / group / material without rebuilding the scene (per-instance color buffer rewrite — COLOR-04); see supports as 3D markers that distinguish restraint types (MARK-01) and loads as 3D arrows with direction + magnitude labels for a selected load case, with global-vs-local axis conventions labeled (MARK-02/03/04); tap or click a member to inspect its section, group, length, and node coordinates with a usable hover highlight on dense models (INSP-01/02) and an "approximate dimensions" flag for name-only sections (INSP-03); and read a fuller model summary panel (node/member counts, group list, bounding box, force-unit labels, parse-warning count — SUMR-01/02/03). This is the Phase 2 viewer extended — same one-way parse → model → render pipeline, same instanced renderer, same Stores, same minimal-floating-chrome UI language (D-11/D-12). Panels, toolbar toggles, and load-case selector land here (deferred from Phase 2 D-12).

Explicitly OUT of scope (Phase 4+): Capacitor native shell, worker parsing, analysis results (`.OUT`), multi-format import, true-scale-only display mode.

</domain>

<decisions>
## Implementation Decisions

### Color Modes
- **D-01:** Color modes assign members a **fixed categorical palette** — each distinct section / group / material key maps to a hue from a curated palette (not a continuous scale). Default mode on file load is **by section** (matches STAAD.Pro's readable engineering identity).
- **D-02:** The palette is **cyclic** — when distinct keys exceed palette size, hues repeat by round-robin (engineers distinguish adjacent categories by shape anyway). Fixed curated sets per mode, sensible defaults.
- **D-03:** Group mode renders **unassigned members as neutral grey** — no group key, no color slot.
- **D-04:** A uniform **"All members"** mode exists and paints every member **accent blue** (reads as the clean/selected baseline, Apple-style). COLOR-04 governs switching modes without rebuilding the scene — per-instance color buffer rewrite.

### Support Markers
- **D-05:** Support markers use **shape to encode restraint type**: FIXED = cube (all six DOFs restrained), PINNED = pyramid/tetrahedron (translation-only), FIXED_BUT = cube with released-axis notches, SPRING = coil/spring shape, ENFORCED/PLATE = distinct smaller shapes.
- **D-06:** Marker size **scales with the size-exaggeration factor** so markers read against exaggerated member geometry.
- **D-07:** Supports + loads are one **combined marker layer behind a single toggle** in the chrome (all or nothing — keeps chrome minimal, D-12).
- **D-08:** Per-axis release detail (which DOFs released) and spring stiffness surface **on inspection only** (when the marker is tapped) — not always-visible.

### Load Arrows & Load-Case Selector
- **D-09:** **All load kinds render** as 3D glyphs: joint/nodal loads and member concentrated loads as arrows, distributed loads as segmented/array arrows, moments as curved double-arrow glyphs (engineer convention), SELFWEIGHT included.
- **D-10:** Load magnitude labels appear **behind a toggle**, which **defaults ON** when the loads layer is shown (not always-on, not only on pick).
- **D-11:** Global-vs-local axis convention surfaces as a **legend only** (a per-load-case legend chip, e.g. "GLOBAL" / "LOCAL", using the parser's `axisRef`) — per-arrow G/L tags are not shown.
- **D-12:** The load-case selector offers **primary cases, combinations, AND repeated loads**. Selecting a combination or repeated case **renders the union of items from the cases it references** (weights ignored — the view shows what's involved, not factored results).

### Member Inspection
- **D-13:** Member detail (section, group, length, node coordinates) surfaces in a **floating glass popover** that slides in on member tap — reuses the StatsSummary glass styling, coherent with existing chrome.
- **D-14:** Picking technique is **raycast + throttle** — raycast picks the 3D member and its support/load markers; hover highlights members; a periodic NO_TAP throttle guards against dense-model raycast spam.
- **D-15:** Approximate-dimension members (INSP-03) show a **prominent "Approximate dimensions" badge (orange) in the inspector popover** when `section.approximate` is true — no 3D tinting.

### Summary Panel
- **D-16:** The Phase 2 StatsSummary glass card is the **base**; the fuller SUMR summary (adds group list + bounding box, plus force-unit labels and warning count) **expands from that card** when a header control is tapped, rather than being a separate replacement panel.

### Claude's Discretion
- Exact per-mode palette color values (curated sets, section/group/material variants), marker glyph geometry proportions, arrow glyph geometry details, popover layout specifics, "expand StatsSummary → full summary" interaction mechanics, hover/selection highlight visual (dim-others+brighten vs selected-only) — planner may validate visuals against research and the Phase 2 UI-SPEC tokens.
- RENAMING NOTE: D-numbers reset per phase (3). Downstream agents must treat each phase's D-numbers as scoped to that phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research (project-level)
- `.planning/research/ARCHITECTURE.md` — Pattern 2 (one InstancedMesh per section profile, `instanceId ↔ memberId` maps, **`setColorAt` per-instance color** rewrite — the COLOR-04 mechanism), Pattern 4 (FileService), §Data Flow (parse→model→scene), §WebGL/large coordinates (P8 rebase), §Suggested Build Order.
- `.planning/research/PITFALLS.md` — P4 draw-call explosion (instancing mandatory), P5 iOS context loss / pixelRatio cap / dispose on load, P8 float32 precision collapse (rebase), §UX Pitfalls (frame model from bounds, exaggeration slider, Y-up).
- `.planning/research/STACK.md` — three 0.185.1 / @react-three/fiber 9.7.0 / drei 10.7.8 / zustand 5.0.15 (Superseded-at-D-08 note: keep Next.js 16; 3D stack versions apply).

### Phase Contexts (decisions to respect)
- `.planning/phases/01-parser-model/01-CONTEXT.md` — D-04 (1-based source-ids preserved; engineers reference member/joint numbers), D-05 (approximate fallback shapes for TABLE/unresolved sections).
- `.planning/phases/02-file-opening-3d-rendering/02-CONTEXT.md` — D-02 (exaggeration default 15×, slider), D-03 (Y-up, no remap), D-05 (true outline extrusions), D-06 (BETA rotation), D-07 (approximate → nearest-family fallbacks + flag), D-11 (viewer replaces home page, stats retained), D-12 (minimal floating chrome; panels deferred to Phase 3).

### Requirements
- `.planning/REQUIREMENTS.md` — COLOR-01..04, MARK-01..04, INSP-01..03, SUMR-01..03 (Phase 3 scope), traceability section.

### Roadmap / Project
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria (UI hint: yes), depends-on (Phase 2).
- `.planning/PROJECT.md` — Key decisions (procedural shapes not glTF; Capacitor hybrid), Constraints (instancing from start; format tolerance).

### Code (types downstream consumes)
- `packages/parser/src/types.ts` — `StaadModel` (nodes, members, sections Map, supports, loadCases, groups, units, bounds), `SupportType` / `SupportReleases` / `Support` (nodeId, type, releases, line, note), `LoadItem` (kind, axis, `axisRef: 'GLOBAL' | 'LOCAL'`, magnitude, targets), `LoadCase` (id, title, loadtype, items, kind PRIMARY/COMBINATION, terms), `Member` (id, startNode/endNode, sectionKey, group, material, rotation), `Group` (name, memberIds, jointIds, elementIds), `UnitSystem`.
- `web/store/modelStore.ts` — read-only model + warnings committed atomically on load; `setError` never mutates model/warnings (FILE-03).
- `web/store/viewerStore.ts` — viewer interaction state (exaggeration 15×, later: selected member, color mode, marker toggles, selected load case).
- `web/components/ViewerCanvas.tsx` (*if Phase 2 landed as planned*) — the R3F canvas host that owns the scene; Phase 3 adds interactive picking, color rewrites, and marker layers inside it.
- `web/lib/sectionShape.ts` + `web/lib/sectionDb.ts` (*Phase 2*) — outline profiles + AISC/table geometry the markers and popover inspect.
- `web/components/StatsSummary.tsx` / `.module.css` (*Phase 2*) — the glass card this phase expands into the full SUMR panel (D-16).

### Real sample file
- `staadSample/HPP_Main_Building_2.std` — primary ground-truth model for manual viewer verification (space frame, METER/KN, PRIS + TABLE sections, groups, load cases, supports).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/parser` types + `parseStaad` — supports/loads/groups all already carry the fields Phase 3 consumes (restraint releases, axisRef, magnitudes, group member ids).
- `web/store/viewerStore.ts` — interaction state store ready to hold selected member id, color mode, marker toggles, load-case id.
- `web/components/StatsSummary` + its glass CSS Module — base for the expanded SUMR panel (D-16).
- Phase 2 chrome components (`OpenControl`, `ExaggerationSlider`) and CSS Modules — token/glass styling to mirror for toggles, legend, popover.
- `web/components/ViewerCanvas` (*Phase 2*) — scene host + OrbitControls; picking/color/marker logic attaches here.

### Established Patterns
- One-way pipeline (parse → model → render); renderer never owns parsing; scene rebuilds only on new model, never per interaction — color mode changes MUST go through the instanced color buffer (COLOR-04), not rebuilds.
- Instancing from day one (PITFALLS P4): one InstancedMesh per section profile; per-instance color via `instanceColor` attribute rewrite.
- Apple-style chrome: glass `rgba(255,255,255,0.65)` + `blur(20px) saturate(180%)`, radius 20, mono readouts, 44px touch targets, `prefers-reduced-motion/transparency/contrast` variants (02-UI-SPEC).

### Integration Points
- ViewerCanvas (or SceneBuilder) → per-instance color attribute rewrite for COLOR-04.
- modelStore.supports → marker geometry group; modelStore.loadCases/items → arrow glyphs under load-case selection; viewerStore holds active color mode / marker toggle / selected load case.
- StatsSummary card → expanded SUMR summary (group list, bounding box).
- model.sections Map → approximate flag for INSP-03 badge.

</code_context>

<specifics>
## Specific Ideas

- The real sample `HPP_Main_Building_2.std` must color, mark, and inspect correctly — primary manual acceptance check (same ground truth as Phase 2).
- Markers and arrows must read at the actual exaggerated sizes used by the default 15× exaggeration (D-06).
- Load magnitude labels should show force-unit-aware values (e.g., "12.5 KN") matching the model's parsed force units (SUMR-02 spirit carries into labels).
- The expansion of StatsSummary into the full summary should feel like a continuous motion, not a swap (Apple-style continuity).

</specifics>

<deferred>
## Deferred Ideas

- **Analysis results (`.OUT` files)** — next milestone (already in Phase 1 deferrals).
- **Multi-format import (`.e2k`/`.s2k`)** — future; parser stays format-isolated.
- **True-scale-only display mode** (disable exaggeration) — optional extension, not required by Phase 3.

None — discussion stayed within phase scope (items above are pre-existing roadmap/phase deferrals).

</deferred>

---

*Phase: 3-Interaction & Visualization*
*Context gathered: 2026-08-17*