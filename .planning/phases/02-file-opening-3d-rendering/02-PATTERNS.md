# Phase 2: File Opening & 3D Rendering - Pattern Map

**Mapped:** 2026-08-16
**Files analyzed:** 21 (17 web + 3 parser-extension + 1 do-not-create)
**Analogs found:** 17 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/fileService.ts` (new) | service | file-I/O, event-driven | `web/app/page.tsx` (input+drop+parse flow) | role-match |
| `web/store/modelStore.ts` (new) | store | event-driven (write-once) | `packages/parser/src/core.ts` `createContext()` | partial |
| `web/store/viewerStore.ts` (new) | store | event-driven | none (no zustand in repo) | none |
| `web/lib/sectionShape.ts` (new) | utility | transform | `packages/parser/src/staad/steel-resolver.ts` | exact |
| `web/lib/sectionDb.ts` (new) | service | CRUD (lookup) | `steel-resolver.ts` `resolveSectionProfile` + `member-property.ts` `tableSectionName` | role-match |
| `web/data/sections.json` (new) | data | static lookup (lazy) | none (no vendored data assets) | none |
| `web/lib/scene.ts` (SceneBuilder + camera fit) (new) | service | transform | `packages/parser/src/core.ts` `finalize()` | role-match |
| `web/components/ViewerCanvas.tsx` (new) | component | event-driven (render loop) | `web/app/page.tsx` (only web component) | partial |
| `web/components/OpenControl.tsx` (new) | component | event-driven | `web/app/page.tsx` (file input + label) | role-match |
| `web/components/ExaggerationSlider.tsx` (new) | component | event-driven | `web/app/page.tsx` (`input onChange`) | role-match |
| `web/components/StatsSummary.tsx` (new) | component | read-only render | `web/app/page.tsx` (stats grid + details + warnings) | exact |
| `web/components/ErrorToast.tsx` (new) | component | UI state | `web/app/page.tsx` (line 102 error element) | role-match |
| `web/components/LoadingOverlay.tsx` (new) | component | UI state | none (page.tsx has no LOADING state) | none |
| `web/app/page.tsx` (modify) | controller (page) | file-I/O orchestration | itself (self-refactor, D-11) | exact |
| `web/app/viewer.module.css` (new) | config (style) | n/a | `web/app/page.module.css` | exact |
| `web/app/globals.css` (modify) | config (style) | n/a | itself (font-stack + token extension) | exact |
| `web/app/layout.tsx` | keep as-is | n/a | itself (UI-SPEC: metadata only) | exact |
| `web/package.json` (modify) | config | n/a | itself + `.planning/research/STACK.md` versions | exact |
| `web/components.json` | DO NOT CREATE | n/a | UI-SPEC Registry Safety gate | n/a |
| `packages/parser/src/types.ts` (modify, D-06) | model | n/a | itself (`Member` gets `rotation?: number`) | exact |
| `packages/parser/src/staad/constants.ts` (modify, D-06) | controller (handler) | transform | itself (`BETA` branch) + `member-property.ts` `applyMaterialRow` | exact |
| `packages/parser/test/staad/constants.test.ts` (modify, D-06) | test | n/a | `golden.test.ts` + `test/staad/constants.test.ts` | exact |

## Pattern Assignments

### `web/lib/fileService.ts` (service, file-I/O)

**Analog:** `web/app/page.tsx` (input + drag-drop + parse flow) — the exact code being replaced/refactored behind the boundary (D-10, D-11).

**Platform-boundary contract** (`.planning/research/ARCHITECTURE.md` Pattern 4):
```typescript
// platform/fileService.ts — ARCHITECTURE.md:209-225, simplified to D-10's decision
export interface OpenedFile { name: string; text: string; }
```
CONTEXT D-10 overrides the FSA-API example: web path is **hidden `<input type="file" accept=".std">` + native HTML5 drag-and-drop**, not `showOpenFilePicker`. Native branch is a stub for Phase 4. **Picker cancel → no-op with zero state mutation** (FILE-03).

**Imports pattern** (page.tsx:9): `import styles from "./page.module.css";` — local module imports are relative.

**.std extension guard + size guard** (page.tsx:35-38; parser `index.ts:76-85`):
```typescript
// web/app/page.tsx:35-38
if (!file.name.toLowerCase().endsWith(".std")) {
  setError("Please choose a .std file (a STAAD input deck).");
  return;
}
```
Move the guard + the `MAX_INPUT_LENGTH` check (exported at `packages/parser/src/index.ts:42`) into FileService so it fires **before** parsing (FILE-04). UI copy: "File too large or unreadable — STAAD Online reads .std decks up to 64 MB."

**File read — text, never base64** (page.tsx:40; PITFALLS P6): `const text = await file.text();` — the FileService returns `{ name, text }` after `File.text()`. Cancel of the hidden input's `onChange` (picker dismissed) must resolve to a no-op, not an error.

### `web/store/modelStore.ts` (store, write-once)

**Analog:** `packages/parser/src/core.ts` `createContext()` (lines 233-248) — the write-once accumulator; ARCHITECTURE.md state layer ($parse→model→render is one-way).

**Store shape guidance** (ARCHITECTURE.md:249-259): model data is write-once per file (`status: 'empty' | 'loading' | 'ready'` + `StaadModel` + `warnings`); view state belongs in a **separate** store. "write-once per file" — no per-frame writes.

**Imports expected:**
```typescript
import type { StaadModel, ParseResult } from "@staad-online/parser"; // barrel (index.ts:109-136)
import { create } from "zustand/react"; // zustand 5.0.15 (STACK.md) — returns { model, warnings, status, setModel }
```

**Pitfalls:** D-09/state layer — never rebuild SceneBuilder on store subscription per interaction; rebuild only when a new model is set (ARCHITECTURE.md:329 "SceneBuilder rebuilds only when a new model is set, never per interaction"). `ParseResult.warnings` type: `ParseWarning[]` (types.ts:173-176), each `{ code, message, line, severity }`.

### `web/store/viewerStore.ts` (store, interaction state)

**Analog:** none in codebase (zustand not yet installed). Pattern source: ARCHITECTURE.md:249-259 + Pattern 3 (SELECTION store `viewerStore.setSelection` FLOW example, lines 189-196).

**Content (deferred-feature-safe in Phase 2):** `exaggeration` (number, default 15 — D-02), possibly a `fitRequested`/rebase context. Selector subscription rules: high-frequency state lives in refs inside `useFrame`, never store writes per frame (ARCHITECTURE.md:259).

### `web/lib/sectionShape.ts` (utility, transform — SectionProfile polygon → extruded 3D outline)

**Analog:** `packages/parser/src/staad/steel-resolver.ts` — the **exact data contract** for input polygons.

**Input contract** (`types.ts:47-58`):
```typescript
export interface SectionProfile {
  label: string;
  points: [number, number][];      // [x, z] section-local (renders as x-horizontal, z-vertical)
  approximate: boolean;
}
```
**Polygon builder pattern to mirror** (steel-resolver.ts:63-78) — note the **point winding/order convention** (CCW around origin, [x,z] = ±half-extents):
```typescript
export function prisProfile(label: string, yd: number, zd: number, units: UnitState): ResolvedSection {
  const y = toMeters(yd, units);
  const z = toMeters(zd, units);
  return {
    label,
    points: [
      [-z / 2, -y / 2],
      [z / 2, -y / 2],
      [z / 2, y / 2],
      [-z / 2, y / 2],
    ],
    approximate: false,
    family: 'PRISMATIC',
    dims: `YD ${yd} ZD ${zd}`,
  };
}
```
Fallback shape analog: `fallbackProfile(label)` (steel-resolver.ts:86-98) — fixed half-extent box (`const FALLBACK_HALF = 0.1;` at line 39) with `approximate: true`.

**Renderer output (D-05):** feed `points: [x,z]` into a `THREE.Shape` → `ExtrudeGeometry` along the member axis (Claude's discretion on tessellation). Per-section geometry caching: **one shared geometry per distinct `sections` Map key** (`model.sections` iteration — CONTEXT: "one shared extruded geometry per profile → InstancedMesh").

### `web/lib/sectionDb.ts` (service, lookup-on-demand — D-13/D-14)

**Analog:** `steel-resolver.ts` `resolveSectionProfile(kind, label, tokens, units)` dispatch (lines 114-148) + `member-property.ts` `tableSectionName` key extraction (lines 72-82):

```typescript
// member-property.ts:72-82 — extracts the DB lookup key from TABLE rows
function tableSectionName(propTokens: readonly string[]): string | null {
  let i = 1;
  if (propTokens[i]?.toUpperCase() === 'ST') { i++; }       // legacy `TABLE ST W12X35`
  else { if (propTokens[i + 1]?.toUpperCase() !== 'ST') return null; i += 2; } // modern `TABLE 'W' ST 'W14X90'`
  return propTokens[i] ?? null;
}
```
**D-14 (on-demand):** only section names actually present in `model.sections` keys are looked up in the vendored table — never pre-load the 1,223-row DB. Lookup miss → nearest-family fallback + `approximate` flag (D-07; ties to `WARNING_CODES.UNRESOLVED_SECTION`, types.ts:190). Family detection order is Claude's discretion.

**Data file:** `web/data/sections.json` (vendored OpenBuilding MIT steel DB; JSON import or lazy `dynamic` chunk — Claude's discretion). No analog in repo for a JSON data asset; nearest is the tokenizer's no-regex stance + Map-based lookups (PITFALLS security — key by plain `Map<string, ...>`, never polluted object keys, core.ts:24-26).

### `web/lib/scene.ts` (SceneBuilder — service, transform; + camera auto-fit)

**Analog:** `packages/parser/src/core.ts` `finalize()` (lines 260-309) — the walk-the-accumulator transform that produces a derived object consumed downstream.

**Transform structure to copy** (finalize walks → computes): iterate nodes for bounds (REND-03 source), then per section key create one InstancedMesh, then per member build matrix from `startNode`/`endNode` coords (page.tsx:44 uses `model.members`, `model.nodes`; types.ts:35-45). **Rebase**: subtract centroid from node coords **before** building buffers (REND-06 / PITFALLS P8 — "rebase to centroid at parse, D-required"); `model.bounds` gives the extents, `finalize` computes raw bounds at core.ts:260-282.

**Instancing (mandatory, PITFALLS P4 + milestone constraint):**
- One `InstancedMesh` per distinct section profile (REND-02) — never one `Mesh` per member.
- Keep `instanceId ↔ memberId` parallel maps (Pattern 2, ARCHITECTURE.md:151-179 example, incl. `setColorAt` + `instanceColor.needsUpdate` for per-instance color later).
- Budget: `renderer.info.render.calls < 100` on the 10k-member fixture.
- **Dispose on new load**: `geometry.dispose()`, `material.dispose()` (P5) — `model.sections` keys × members is the dispose surface.

**Camera fit (D-01)** — fit full rebased bounds on load **and** window resize. Exaggeration applies **uniformly to cross-section geometry** (D-04) — 1fx multiplication, not per-member. Y-up, no axis remap (D-03 — three.js already Y-up, matches STAAD global Y).

### `web/components/ViewerCanvas.tsx` (component, event-driven render)

**Analog:** `web/app/page.tsx` — the only existing web component; copy its framing.

**Imports pattern** (page.tsx:1-11):
```typescript
"use client";
import { useCallback, useState } from "react";
import { parseStaad, registerParsingCommands, type ParseResult } from "@staad-online/parser";
import styles from "./page.module.css";
registerParsingCommands();
```
**Canvas framing (D-11):** `position: fixed; inset: 0` full-canvas R3F `<Canvas>`; `drei` `OrbitControls` with `enableDamping`, `dampingFactor: 0.08`, clamped min/max distance, touch + mouse (REND-05, UI-SPEC ViewerCanvas row). Reserve `pixelRatio` cap at `Math.min(devicePixelRatio, 2)` and no shadows/MSAA on member geometry (PITFALLS P5). One `<InstancedMesh>` child per profile; models arrive via `useModelStore` — the scene is **derived data**, never owns parsing (one-way pipeline).

**No web test runner exists** (`web/package.json` has scripts `dev/build/start` only) — planner must decide: add vitest to web for any pure-geometry tests, or keep `sectionShape`/`sectionDb` headless enough to test.

### `web/components/OpenControl.tsx` (component, event-driven)

**Analog:** `page.tsx:89-99` — the control that triggers the hidden input:

```typescript
<label className={styles.fileLabel}>
  <span>{fileName ?? "Drop a .std file here, or click to browse"}</span>
  <input
    type="file"
    accept=".std"
    onChange={(e) => { const file = e.target.files?.[0]; if (file) void parseFile(file); }}
  />
</label>
```
**Pattern:** button/CTA triggers `inputEl.click()` on the hidden input; `onChange` fires only when a file is *selected* — picker cancel never fires it (FILE-03 cancel-safe is preserved by construction). Imports from `fileService.ts`. UI-SPEC: accent fill `#007AFF`/`#0A84FF`, radius 12, min-height 44 (touch)/36 (desktop), padding `0 24px`, 16px 600 white label, press scale 0.97, optional folder-open SVG.

### `web/components/ExaggerationSlider.tsx` (component, event-driven)

**Analog:** `page.tsx:91-98` `<input type="file">` `onChange` handler pattern — same one-way `onChange → state` commit.

**Contract (UI-SPEC + D-02/D-04):** caption "SIZE EXAGGERATION" (12px uppercase) + detail readout "15×"; range 1–100, step 1, **default 15**; track 4px radius 999 with accent fill/thumb; 44px hit area; value commits continuously (no debounce) — writes into `useViewerStore`; the scene re-applies it uniformly (D-04) as a geometry scale on the shared profile geometries (not per-frame — compute at exaggeration change).

### `web/components/StatsSummary.tsx` (component, read-only) — STRONGEST analog

**Analog:** `web/app/page.tsx:104-162` — the retained parse-stats output (D-11), pattern-for-pattern:

- **Stats grid** (page.tsx:107-131): 6 `card` cells — `<span className={styles.cardValue}>{stats.nodes}</span>` + `<span className={styles.cardLabel}>Joints</span>` (Joints / Members / Sections / Supports / Load cases / Groups).
- **Stats state builder** (page.tsx:45-54) — reuse the exact mapping, incl. units string + bounds formatting:
```typescript
bounds: `X ${b.min[0].toFixed(2)}..${b.max[0].toFixed(2)}  Y ${b.min[1].toFixed(2)}..${b.max[1].toFixed(2)}  Z ${b.min[2].toFixed(2)}..${b.max[2].toFixed(2)}`,
```
- **Mono UNITS/BOUNDS block** (page.tsx:133-142 `<dl className={styles.details}>`): `dt` 12px uppercase + `dd` mono `ui-monospace, "Cascadia Mono", Consolas, monospace` (page.module.css:134-138).
- **Warnings** (page.tsx:146-158) — filenames/`<code>{w.code}</code> line {w.line}`. **Approximate chip (D-07)**: count sections with `approximate === true` (source: `WARNING_CODES.UNRESOLVED_SECTION` / `SectionProfile.approximate`, tie page.tsx warnings pattern) — informational only in Phase 2.
- **Clean note** (page.tsx:160-162): `stats && warnings.length === 0 && Clean parse — no warnings.` → success chip.

CSS carry-over catalog (UI-SPEC §Existing Styling): `.grid`, `.cardValue`/`.cardLabel` (24px 600 / 12px uppercase), uppercase-12px label style, `.details` mono block, and the error/warnings/clean **color families** migrate into `viewer.module.css`.

### `web/components/ErrorToast.tsx` (component, UI state)

**Analog:** `page.tsx:102`: `{error && <p className={styles.error}>{error}</p>}` — single `error: string | null` state cleared at the start of each open (`parseFile` sets `setError(null)` first, page.tsx:32). Keep the guard style; UI-SPEC: glass surface + 2px destructive border (`#FF3B30`/`#FF453A`), destructive title + secondary body, bottom-center, dismiss on next action. Copy per UI-SPEC Copywriting contract (wrong type / too large).

### `web/components/LoadingOverlay.tsx` (component, UI state) — NO ANALOG

**Reason:** `page.tsx` has no LOADING state today (sync parse). Treat as greenfield. Contract (UI-SPEC): "Opening…" (16px secondary, spinner) over dimmed canvas; blocks pointer input; **cancel-safe** (repeat-open or drop aborts in-flight open; subsequent LOADED replaces non-destructively with no confirmation — Apple §16). Reduce-motion: opacity cross-fade only.

### `web/app/page.tsx` (modify — becomes the viewer page)

**Analog:** itself. Self-refactor notes:
- Keep `"use client"`, parser barrel import, and `registerParsingCommands()` (page.tsx:1-11).
- Replace dropzone/label body with: full-canvas `<ViewerCanvas>` + floating chrome cluster (`OpenControl`, `ExaggerationSlider` bottom-left; `StatsSummary` above it; `LoadingOverlay`; `ErrorToast` bottom-center). UI-SPEC states: `EMPTY → LOADING → LOADED`, `ERROR` from LOADING; EMPTY restored on error without corruption.
- Window-level drag-and-drop moves into FileService/`onDrop`; `dragOver` state drives the window-wide drag-over fill + transient accent ring (page.tsx:80-88 pattern: `onDragOver` preventDefault + set true, `onDragLeave` set false, `onDrop` preventDefault + parse).

### `web/app/page.module.css` / `viewer.module.css` (config/style)

**Analog:** `web/app/page.module.css` (238 lines) — complete styling/token reference; UI-SPEC §Existing Styling prescribes exactly which declarations carry over (stats-grid card, cardValue/cardLabel, mono details, error/warnings/clean color families; dark-mode toggle block at lines 185-237). New glass tokens: `rgba(255,255,255,0.65)`/`rgba(28,28,30,0.72)` + `backdrop-filter: blur(20px) saturate(180%)`; radii 6/12/20/999; spacing 4/8/16/24/32/48/64; transform+opacity (+will-change) animations; `prefers-reduced-motion/reduced-transparency/contrast` media blocks (UI-SPEC §Motion).

### `web/app/globals.css` (modify)

**Analog:** itself (47 lines). Keep `--background/--foreground` + `prefers-color-scheme` toggle + antialiased + box-sizing reset; **change `font-family: Arial, Helvetica, sans-serif` (line 27) to the `system-ui` stack** (D-10/UI-SPEC typography).

### `web/package.json` (modify)

**Analog:** itself + STACK.md:11-20. Add pinned versions: `three@0.185.1`, `@react-three/fiber@9.7.0`, `@react-three/drei@10.7.8`, `zustand@5.0.15`, `@types/three@0.185.x` (dev). Keep `@staad-online/parser: "*"`; `next.config.ts` must keep `transpilePackages: ["@staad-online/parser"]` (next.config.ts:6). Next 16 note: R3F v9 + `"use client"` page is the D-08 path (App Router, existing scaffold); no server/client mixing.

### `web/app/layout.tsx` — NO CHANGE (UI-SPEC §Existing Styling line 34)

Keep as-is: metadata title/description only.

### PARSER EXTENSION (D-06 — BETA/rotation field)

**`packages/parser/src/types.ts` (modify):** add to `Member` (lines 35-45):
```typescript
export interface Member {
  id: number;
  startNode: number;
  endNode: number;
  sectionKey?: string;
  group?: string;
  material?: string;
  /** D-06: member rotation about its axis from CONSTANTS BETA (degrees), when the file carries it. */
  rotation?: number;
}
```

**`packages/parser/src/staad/constants.ts` (modify):** the `BETA` branch (lines 99-101) currently **ignores** BETA rows. New branch mirrors `applyMaterialRow` (lines 63-86: `name`/`marker MEMB` parsing → `expandList(listTokens, { maxRef })` (bounded, T-06-01) → `memberById = new Map(ctx.members.map(m => [m.id, m]))` → per-id set). Parse `BETA <angle> MEMB <list>` → `Number(angle)` (finite-check like `steel-resolver.ts:42-47 parseDimValue`) → `member.rotation = angle`. Never throw on malformed (MALFORMED_LINE warning pattern, warnMalformed at constants.ts:47-54). Registration already covers BETA segmentation: `registerCommand(['CONSTANTS', 'MATERIAL', 'BETA'], constantsHandler)` (line 120).

**Test analog:** `packages/parser/test/staad/constants.test.ts` + `golden.test.ts:22-26` (vitest `describe/it/expect`; `parseStaad` import; `WARNING_CODES` literal assertions; var `line`-based warning assert). Assert `member.rotation` lands for a `BETA 90 MEMB 1 2` fixture and malformed BETA warns `MALFORMED_LINE`.

## Shared Patterns

### Web module framing
**Source:** `web/app/page.tsx:1-11`
**Apply to:** all new web components + modified page.tsx
```typescript
"use client";
import { useCallback, useState } from "react";
import { parseStaad, registerParsingCommands, type ParseResult } from "@staad-online/parser";
import styles from "./page.module.css";
registerParsingCommands();
```

### Conditional-class pattern (layout)
**Source:** `web/app/page.tsx:80-88`
**Apply to:** OpenControl/Opt dropzone, viewer chrome hover/drag states
```typescript
className={`${styles.dropzone} ${dragOver ? styles.dragover : ""}`}
```

### File-validation + error state pattern
**Source:** `web/app/page.tsx:31-59`
**Apply to:** fileService.ts, page.tsx, ErrorToast
```typescript
try {
  const text = await file.text();
  const result = parseStaad(text);
  // ...commit state...
} catch (e) {
  setError(e instanceof Error ? e.message : String(e));
}
```
Guard `.std` extension + `MAX_INPUT_LENGTH` (index.ts:42) **before** parse; never commit partial state on failure (cancel-safe FILE-03).

### Serialize-then-render pattern
**Source:** `packages/parser/src/core.ts:260-309` `finalize()`
**Apply to:** `scene.ts` (SceneBuilder), ModelStore.
One derived build pass that computes derived data (bounds) then walks members/sections into a build result; rebuilding on a new model is a full re-run, never incremental.

### Warn-don't-throw
**Source:** `packages/parser/src/staad/steel-resolver.ts:147` (returns null → caller warns `MALFORMED_LINE`), `index.ts:76-85`
**Apply to:** sectionDb.ts lookup miss, constants.ts BETA parse (D-06)
Resolve → fallback (approximate) → always carry the `approximate` flag (D-07); never fabricate exact geometry for an unresolvable section (P3/T-06-04).

### Stable-warning-code coupling
**Source:** `packages/parser/src/types.ts:184-193` `WARNING_CODES`, `golden.test.ts` asserting literals
**Apply to:** StatsSummary approximate chip, ErrorToast messages
UI asserts on `WARNING_CODES.UNRESOLVED_SECTION` (approximate count); never rename codes.

### Map-based lookups / no prototype-pollution
**Source:** `packages/parser/src/core.ts:24-26`, `member-property.ts:169-176`
**Apply to:** sectionDb (section name → geometry), scene instanceId↔memberId maps (typed arrays at scale), modelStore
Use `Map<string, T>`/`Map<number, T>` — never plain-object keys for entity lookups.

### Dispose GPU resources on replace
**Source:** PITFALLS P5 (context loss / memory leak)
**Apply to:** ViewerCanvas, scene.ts
`geometry.dispose()`/`material.dispose()` when a new model replaces the old; cap `pixelRatio ≤ 2`; no shadows/MSAA on member layer.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `web/store/viewerStore.ts` | store | event-driven | No zustand/store code exists in the repo (phases 1 had no web UI state) |
| `web/data/sections.json` | data | static lookup | No vendored data assets exist yet (first bundled dataset) |
| `web/components/ViewerCanvas.tsx` (scene) | component | event-driven | Only one web component exists (page.tsx); no R3F/three code in repo |
| `web/components/LoadingOverlay.tsx` | component | UI state | page.tsx has no loading-state analog (sync parse) |
| `web/components/ExaggerationSlider.tsx` | component | event-driven | No slider/range UI exists; input-onChange pattern is a partial (page.tsx:91-98) |

For the no-analog files, the planner should source patterns from `.planning/research/ARCHITECTURE.md` (Patterns 2/3/4, §State Management, §Data Flow) and `.planning/research/STACK.md` (drei OrbitControls contract), rather than the codebase.

## Metadata

**Analog search scope:** `web/` (app/, next.config.ts, package.json), `packages/parser/` (src/, test/, fixtures), `.planning/research/` (ARCHITECTURE.md, STACK.md, PITFALLS.md), `.planning/REQUIREMENTS.md`
**Files scanned:** 12 (page.tsx, page.module.css, globals.css, layout.tsx, next.config.ts, web/package.json; parser types/index/core/staad-index/steel-resolver/member-property/constants; manifest/loadFixture/golden tests)
**Pattern extraction date:** 2026-08-16