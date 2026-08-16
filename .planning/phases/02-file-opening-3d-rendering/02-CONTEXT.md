# Phase 2: File Opening & 3D Rendering - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Users open a `.std` file via the system file picker or by drag-and-drop (desktop web) and see the 3D analytical model render correctly in the browser: real cross-section shapes (outline extrusions, not generic cylinders), one `InstancedMesh` per distinct section profile, centroid-rebased coordinates, an auto-fit camera, and touch/mouse orbit/zoom/pan navigation. Opening must be cancel-safe (no error or state corruption) and oversized/unreadable files must be rejected with a clear message before parsing. This is the core-value moment of the project — the renderer consumes the Phase 1 `StaadModel` produced by the pure `parseStaad(text)` API.

Explicitly OUT of scope for Phase 2 (Phase 3+): color-by-section/group/material, supports/loads markers, member inspection/highlighting, summary panel, load-case selector, Capacitor native shell and worker parsing (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Camera & Navigation
- **D-01:** Camera auto-fits the full (rebased) model bounds on file load AND on window resize; the user then orbits/zooms/pans freely.
- **D-02:** Member size exaggeration is user-adjustable via a slider with a default of ~15x (inside REND-04's 10-20x range). Matches STAAD.Pro's exaggeration + slider behavior.
- **D-03:** Up-axis is Y (STAAD global Y is up, gravity −Y) — same as three.js, no axis remap. 2D plane frames (Z=0 joints) render flat and correct.
- **D-04:** The exaggeration factor applies uniformly to all member cross-sections at the default value; the slider changes it uniformly app-wide.

### Section Shape Fidelity
- **D-05:** Real cross-section shapes render as **true outline extrusions**: each `SectionProfile` outline polygon (`points: [x, z]`) is extruded along the member axis into a 3D shape so the I-beam profile is visible when viewed end-on. Not generic cylinders, not flat rectangles. (REND-01)
- **D-06:** Member section rotation from STAAD `BETA` / `CONSTANTS` is honored when orienting the extruded profile about the member axis, **where the parsed model carries it**. If the current `Member` type has no rotation field, add the field as a small parser extension rather than dropping the decision — planners/research should verify model support.
- **D-07:** Unresolved/approximate sections render as **nearest-shape fallbacks** — nearest recognizable profile family (W/I-shape, HSS/tube, angle, channel, else a small box) — always carrying the `approximate` flag. (Continuation of Phase 1 D-05.)

### Web App Foundation
- **D-08:** Keep the existing **Next.js 16** app (App Router, `use client` pages). Deliberate deviation from STACK.md's original Vite recommendation — a working parser-integrated scaffold already exists and R3F works in client components; Capacitor static export is achievable via `output: 'export'` in a later phase.
- **D-09:** 3D stack = **React Three Fiber v9 + drei (OrbitControls) + three.js 0.185 + Zustand** stores for model/view state. (STACK.md.)
- **D-10:** File opening goes through a **FileService** platform boundary (ARCHITECTURE Pattern 4): web path via `<input type="file">` + native HTML5 drag-and-drop + picker-cancel handling; the native path (Capacitor file-picker) is stubbed for Phase 4.
- **D-11:** The 3D viewer **replaces the current home page** — full-canvas 3D scene with a file-open UI overlay. The existing parse-stats summary output is retained after a file loads.
- **D-12:** Viewer UI chrome is a **minimal floating overlay** for Phase 2: open controls + exaggeration slider over the canvas. No header/toolbar/panel layout yet — summary and inspection panels land in Phase 3.

### Section Database
- **D-13:** Vendor the **OpenBuilding MIT steel database** (1,223 AISC sections + STAAD-to-AISC mapping) into the app so section names resolve to real profile geometry. Unblocks real W/I/HSS shapes for REND-01. (Resolves the Phase 1 D-05 / STATE.md blocker.)
- **D-14:** Section DB resolution is **on-demand**: only section names actually referenced by a parsed model are looked up against the bundled table. The DB ships in the bundle but does not pre-load all entries.

### Claude's Discretion
- Extrusion tessellation approach (three `Shape` → `ExtrudeGeometry` vs manual vertex construction), per-family profile orientation defaults, exact nearest-family detection order, slider min/max/step, Zustand store slice shapes, and whether the vendored DB is bundled as a JSON import or lazy chunk.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research (project-level)
- `.planning/research/ARCHITECTURE.md` — Pattern 2 (one InstancedMesh per section profile, instanceId↔memberId maps, setColorAt per-instance color), Pattern 4 (FileService platform boundary), seedings/note: P8 rebase in patterns §"WebGL / large coordinates", §Data Flow (parse→model→scene), §Suggested Build Order steps 1–3 (FileService + minimal open flow, SceneBuilder + instanced members, camera fit).
- `.planning/research/STACK.md` — Recommended versions: three 0.185.1, @react-three/fiber 9.7.0, drei 10.7.8, zustand 5.0.15, React 19.2.8. NOTE: Vite recommendation is superseded by D-08 (keep Next.js 16); package versions for the 3D stack still apply.
- `.planning/research/PITFALLS.md` — P4 draw-call explosion (instancing mandatory, `render.calls < 100` budget), P5 iOS context loss / pixelRatio cap / dispose on load, P6 file-read memory (avoid base64; use File.text()/blob reader — Phases 2 pickup), P8 float32 precision collapse (rebase model to centroid at parse, D-required), §UX Pitfalls (frame model from bounds, size exaggeration slider, Y-up, resize re-render).

### Requirements
- `.planning/REQUIREMENTS.md` — FILE-01..04, REND-01..06 (Phase 2 scope), traceability section.

### Roadmap / Project
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, depends-on (Phase 1).
- `.planning/PROJECT.md` — Key decisions (render procedural shapes, not glTF; Capacitor hybrid), Context, Constraints (instancing from start; format tolerance).

### Code (parser contract — renderer consumes these)
- `packages/parser/src/types.ts` — `StaadModel` (nodes, members, sections `Map<string, SectionProfile & SectionMeta>`, supports, loadCases, groups, units, bounds), `SectionProfile.points` polygon contract, warning codes — the exact shapes SceneBuilder consumes. Check `Member` for a BETA/rotation field (D-06).
- `packages/parser/src/index.ts` — `parseStaad(text): ParseResult`, `registerParsingCommands()`, `MAX_INPUT_LENGTH = 64_000_000` size guard — the only public parser API (ARCHITECTURE Pattern 1).
- `web/app/page.tsx` — existing picker + drag-drop + parse-stats scaffold to be replaced/refactored into the viewer + FileService (D-11).
- `web/package.json` — current web deps (next 16.3.1, react 19.2.8, @staad-online/parser).

### Real sample file
- `staadSample/HPP_Main_Building_2.std` — primary ground-truth model for manual viewer verification (space frame, METER/KN, PRIS + TABLE sections).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/parser` (whole package) — typed `StaadModel`, `parseStaad`, structured warnings; the renderer consumes all of it with zero re-parsing.
- `web/app/page.tsx` — existing file-open (input + drag-drop), parse, and stats-summary scaffold; to be refactored behind FileService and folded into the viewer page.
- `web/app/page.module.css` — existing styling reference for the open/perf UI.

### Established Patterns
- **One-way pipeline** (parse → model → render): renderer never owns parsing; SceneBuilder rebuilds only on new model, never per interaction.
- **Instancing from day one** (PITFALLS P4 / milestone constraint): one InstancedMesh per distinct section profile, never one Mesh per member.
- **Stable warning codes**: UI asserts on `WARNING_CODES` (e.g., UNRESOLVED_SECTION feeds the approximate flag UX).

### Integration Points
- FileService → `parseStaad(text)` → Zustand model store → SceneBuilder → R3F `<Canvas>`.
- `model.bounds` → camera auto-fit (D-01) and coordinate rebase pivot (P8).
- `sections Map<key, SectionProfile & SectionMeta>` → one shared extruded geometry per profile → InstancedMesh.

</code_context>

<specifics>
## Specific Ideas

- The real sample `HPP_Main_Building_2.std` must open and render correctly — the primary manual acceptance check for Phase 2 (matches the Phase 1 golden-corpus ground truth).
- After load, revert to showing the existing parse-stats summary (joints/members/sections/supports/load cases/groups/units/bounds) alongside the 3D view — D-11.
- The exaggeration slider should feel STAAD.Pro-like (default ~15x, uniform, adjustable) — D-02/D-04.

</specifics>

<deferred>
## Deferred Ideas

- **Capacitor native file picker + static export** — Phase 4 (FileService native branch is stubbed now, D-10).
- **Color modes, supports/loads markers, inspection/highlight, summary panel, load-case selector, full toolbar layout** — Phase 3.
- **Web Worker parse + progress** — Phase 4.
- **True-size-only display option** (disable exaggeration) — optional extension; not required by Phase 2.

None — discussion stayed within phase scope (items above are pre-existing roadmap deferrals).

</deferred>

---

*Phase: 2-File Opening & 3D Rendering*
*Context gathered: 2026-08-16*