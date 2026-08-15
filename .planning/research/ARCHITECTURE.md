# Architecture Research

**Domain:** Client-side structural model viewer (STAAD `.std` parser + 3D renderer + Capacitor shell)
**Researched:** 2026-08-15
**Confidence:** MEDIUM (web-verified findings; STAAD command syntax cross-checked against official Bentley docs and an existing reference implementation)

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER (React)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ FileOpen UI  │  │ ViewerCanvas │  │ InfoPanel    │  │ SummaryPanel│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬─────┘ │
├─────────┴─────────────────┴─────────────────┴─────────────────┴───────┤
│                          STATE LAYER (Zustand)                        │
│   useModelStore (parsed model, status)    useViewerStore (selection,  │
│   ── write-once per file ──               colorMode, visibility)      │
├─────────┬─────────────────┬─────────────────┬─────────────────┬───────┤
│  File   │     PARSER      │     MODEL       │    RENDERER     │       │
│  Service│   (pure TS)     │  (typed data)   │  (R3F + Three)  │       │
│  ┌──────┴─────┐  ┌────────┴───────┐  ┌──────┴───────┐  ┌─────┴─────┐  │
│  │ picker     │  │ tokenizer      │  │ StaadModel   │  │ Scene     │  │
│  │ abstraction│  │ command parsers│  │ Node/Member/ │  │ Builder   │  │
│  │ (web/native)│ │ (per command)  │  │ Section/...  │  │ (instances)│ │
│  └──────┬─────┘  └────────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
├─────────┴─────────────────┴─────────────────┴─────────────────┴───────┤
│                      PLATFORM BOUNDARY (Capacitor)                    │
│   @capacitor/core (WebView bridge)   @capacitor/file-picker (native)  │
│   ── identical web code in browser AND iOS/Android WebView ──         │
└────────────────────────────────────────────────────────────────────────┘
```

The pipeline is strictly one-way: **file → parse → model → render**. The parser never touches the DOM, Three.js, or React. The renderer never parses. UI reads from stores, never from Three.js objects directly.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| FileService | Opens a file through a platform-appropriate picker; returns a unified `{ name, text }` result | Web: `showOpenFilePicker` → fallback `<input type="file">`. Native: `@capacitor/file-picker` |
| Parser (tokenizer) | Splits `.std` text into tokens/lines, strips comments, handles semicolon-separated entries and multi-line commands | Pure TS, no imports from DOM/Three |
| Parser (commands) | One handler per STAAD command block: JOINT COORDINATES, MEMBER INCIDENCES, MEMBER PROPERTY, SUPPORTS, LOAD* | `parser/staad/commands/` folder, registered in a dispatch table |
| Parser (section resolver) | Maps section names to geometry: `PRIS YD/ZD` → rect polygon; `TABLE ST W12X35` → lookup in bundled AISC/section database | `steel-resolver.ts` (pattern proven by OpenBuilding) |
| Model | Typed, normalized data model: nodes, members, sections, supports, load cases, groups, units, bounds | Plain TS interfaces + one `buildModel()` reducer |
| SceneBuilder | Consumes `StaadModel` and creates instanced meshes; owns the mapping `memberId ↔ instanceId` | React Three Fiber component or imperative builder |
| Renderer | Draws instanced members, support markers, load arrows; frustum culling + LOD; picking | Three.js + `InstancedMesh2` (@three.ez/instanced-mesh) |
| Stores | Selection, hover, color mode, visibility, parse status | Zustand (3 small stores, not one big one) |
| Capacitor shell | Native packaging only; no business logic | iOS (Xcode) / Android (Gradle) source projects, `npx cap sync` |

## Recommended Project Structure

```
staad-online/
├── src/
│   ├── parser/                  # PURE TS — zero DOM/Three imports; headless-testable
│   │   ├── types.ts             # Node, Member, SectionProfile, SectionMeta, Support, LoadCase, StaadModel, ParseWarning
│   │   ├── tokenizer.ts         # Line/token splitting, comment stripping, semicolon handling
│   │   ├── index.ts             # parseStaad(text: string): ParseResult — the only public entry point
│   │   ├── resolve-units.ts     # Tracks UNIT command context (length/force units change mid-file)
│   │   └── staad/
│   │       ├── index.ts         # Command dispatch table: 'JOINT COORDINATES' → handler, etc.
│   │       ├── joint-coordinates.ts
│   │       ├── member-incidences.ts
│   │       ├── member-property.ts     # PRIS YD/ZD, TABLE ST, groups (MEMBER GROUP)
│   │       ├── supports.ts            # PINNED/FIXED/FIXED BUT/ENFORCED + springs + range generation
│   │       ├── loads.ts               # LOAD/LOADING/LOAD COMBINATION, MEMBER/JOINT LOAD, REPEAT LOAD
│   │       └── steel-resolver.ts      # TABLE names → bundled section database keys
│   ├── data/
│   │   └── sections.json        # Bundled section database (generated from AISC/standard tables)
│   ├── model/
│   │   └── geometry.ts          # SectionProfile → extruded BoxGeometry/etc. (renderer-side helpers)
│   ├── renderer/
│   │   ├── SceneBuilder.ts      # model → InstancedMesh2(es); builds instance matrices + base colors
│   │   ├── MemberLayers.ts      # per-section-profile instanced mesh; instanceId ↔ memberId arrays
│   │   ├── Markers.ts           # supports + loads as instanced arrows/cones/spheres
│   │   ├── Picker.ts            # raycaster → instanceId → memberId → store
│   │   └── ViewerCanvas.tsx     # R3F Canvas: lights, camera, controls, scene
│   ├── store/
│   │   ├── modelStore.ts        # parse status, StaadModel, warnings (write-once per file)
│   │   ├── viewerStore.ts       # selectedId, hoveredId, colorMode, visibility toggles
│   │   └── uiStore.ts           # panel open state, mobile toolbar state
│   ├── platform/
│   │   ├── fileService.ts       # openFile(): Promise<{ name: string; text: string }>
│   │   ├── fileService.web.ts   # showOpenFilePicker → <input type="file"> fallback
│   │   └── fileService.native.ts# @capacitor/file-picker → FileReader → text
│   ├── components/
│   │   ├── layout/              # TopBar, MainLayout
│   │   ├── viewer/              # ViewerCanvas wrapper, drag-drop overlay
│   │   └── panels/              # InfoPanel (member detail), SummaryPanel
│   └── app.tsx                  # Root: platform init, file-open wiring
├── ios/ android/                # Capacitor native source projects (generated)
└── web/                         # PWA deploy target of the same build
```

### Structure Rationale

- **`parser/` is isolated and pure:** no `import * as THREE`, no `window`, no React. This is the single most important decision — it makes the parser unit-testable headlessly (node:test or vitest with real `.std` fixtures), enables running it in a Web Worker for large files, and means a future "results viewer" (.ANL/.OUT parser) or an editing tool can reuse it unchanged.
- **One folder per command block:** the `.std` format is a sequence of command blocks with version-drifted names (`LOADING` vs `LOAD`, `MEMBER INCIDENCE` vs `MEMBER INCIDENCES`). A dispatch table makes tolerant aliasing trivial (`'MEMBER INCIDENCE'.normalize()` → canonical key).
- **`renderer/` knows only the model, not the format:** the renderer consumes `SectionProfile` polygons and member geometry — the OpenBuilding pattern "every section is a polygon; no `if (type === 'W_FLANGE')` dispatch in the renderer". Adding a new section shape touches only the parser.
- **`platform/` is the only place platform code lives:** everything else is identical web code. Capacitor imports are confined here (plus root app bootstrap).
- **Stores separated by concern:** model data (write-once, immutable-ish) vs view/interaction state (frequently changing) vs UI chrome. Mirrors the proven pascalorg/editor R3F store split (`useScene` / `useViewer` / `useEditor`).

## Architectural Patterns

### Pattern 1: Pure Parser Decoupled from Rendering

**What:** The parser is a pure function `parseStaad(text: string): ParseResult` with zero dependencies on DOM/Three/React. The renderer consumes only the typed model it produces.

**When to use:** Any format-parsing app where the file format is versioned and the renderer may change independently (STAAD `.std`, future `.OUT` results, `.e2k`/`.s2k` formats).

**Trade-offs:** Slightly more boilerplate (a typed model layer between parse and render); wins massively on testability, worker offloading, and format-version tolerance.

**Example:**
```typescript
// parser/types.ts — no imports from DOM or Three
export interface Node { id: number; x: number; y: number; z: number; }
export interface Member {
  id: number; startNode: number; endNode: number;
  sectionKey?: string; group?: string;
}
export interface SectionProfile { label: string; points: [number, number][]; } // [x, z] polygon
export interface SectionMeta { family: 'STEEL' | 'CONCRETE' | 'PRISMATIC'; dims?: string; area?: number; Ix?: number; Iy?: number; }
export interface StaadModel {
  nodes: Node[]; members: Member[];
  sections: Map<string, SectionProfile & SectionMeta>;
  supports: Support[]; loadCases: LoadCase[];
  groups: Map<string, number[]>;      // group name → member ids
  units: { length: 'MM' | 'CM' | 'M' | 'FT' | 'IN'; force: 'KN' | 'KG' | 'N' | 'KIP' | 'LB' };
  bounds: { min: [number, number, number]; max: [number, number, number] };
  warnings: ParseWarning[];
}

// parser/index.ts
export function parseStaad(text: string): ParseResult {
  const tokens = tokenize(text);                       // handles ; , multi-line, comments
  const ctx = createParseContext();
  for (const block of blocks(tokens)) {
    const handler = COMMAND_TABLE[canonicalize(block.name)];
    if (handler) handler(ctx, block.body);             // unknown block → ctx.warnings.push(...)
    else ctx.warnings.push({ kind: 'UNKNOWN_COMMAND', line: block.line, name: block.name });
  }
  return finalize(ctx);                                // computes bounds, links members↔sections
}

// Unit test (headless, no browser):
//   expect(parseStaad(fixture('sample-rc.std')).members).toHaveLength(5)
```

### Pattern 2: Instanced Rendering with Per-Instance Identity

**What:** Render members as **one `InstancedMesh`/`InstancedMesh2` per distinct section profile**, with a dense matrix per member. Maintain parallel arrays mapping `instanceId → memberId`. Per-instance color via `setColorAt` + `instanceColor.needsUpdate = true`.

**When to use:** Any model with hundreds to hundreds-of-thousands of similar elements (structural frames are the canonical case). Never create one `Mesh` per member.

**Trade-offs:** One draw call per section profile instead of per member (huge win); the cost is the instance↔member bookkeeping and the fact that a member's color/visibility must be updated through the instanced buffers, not a `mesh.material`.

**Example:**
```typescript
// renderer/MemberLayers.ts — one InstancedMesh2 per section profile
const layer = new InstancedMesh2(profileGeometry(profile), material, memberIds.length);
layer.perObjectFrustumCulled = true;          // skip off-screen members every frame
layer.addLOD(profileGeometryLow(profile), material, 200); // distance-based LOD

members.forEach((member, i) => {
  layer.setMatrixAt(i, memberMatrix(member));  // oriented box/cylinder from node→node
  layer.setColorAt(i, colorFor(member));       // color-by-section / group / material
});
instanceIndex.set(member.id, i);               // memberId → instanceId (both directions)

// Picking — three.js Raycaster returns instanceId natively:
const hits = raycaster.intersectObject(layer);
if (hits[0]) { const memberId = instanceToMember.get(hits[0].instanceId); ... }

// Highlight — restore from saved base color buffer:
layer.setColorAt(hits[0].instanceId, HIGHLIGHT_COLOR);
layer.instanceColor.needsUpdate = true;
```

### Pattern 3: Selection Manager + Store (Two-Way Interaction Loop)

**What:** Renderer meshes never own selection logic. A thin manager converts pick events → store mutations; UI and highlight effects subscribe to the store. `hoveredId` is a separate scalar from `selectedIds`.

**When to use:** Any interactive 3D viewer where click→inspect and color-changing modes coexist.

**Trade-offs:** One extra indirection layer; pays off because selection, coloring, and the info panel stay consistent without the renderer knowing about UI.

**Example (flow):**
```
pointerdown on Canvas → Picker.raycast() → { instanceId } → instanceToMember
    → viewerStore.getState().setSelection(memberId)      [single source of truth]
    → InfoPanel subscribes: shows section/group/length/nodes
    → MemberLayers subscribes: setColorAt(memberId, HIGHLIGHT) + needsUpdate
    → click outside / Escape → resetSelection()
```

### Pattern 4: Platform Boundary via Service Abstraction

**What:** All platform differences live behind one tiny interface. The rest of the codebase imports `platform/` only.

**When to use:** Capacitor hybrid apps that must also ship as a plain web app (this project's core constraint: same codebase, browser + native).

**Trade-offs:** Minor; the alternative (scattering `Capacitor.isNativePlatform()` checks through the app) is a maintenance trap.

**Example:**
```typescript
// platform/fileService.ts
export interface OpenedFile { name: string; text: string; }
export const openFile = (): Promise<OpenedFile> =>
  Capacitor.isNativePlatform() ? openNative() : openWeb();

// platform/fileService.native.ts — @capacitor/file-picker (NOT Filesystem for user files!)
const result = await FilePicker.pickFiles({ types: ['application/octet-stream', 'text/plain'] });
const file = result.files[0];
return { name: file.name, text: await file.text() };

// platform/fileService.web.ts
if ('showOpenFilePicker' in window) {
  const [handle] = await window.showOpenFilePicker({ types: [{ description: 'STAAD', accept: { 'text/plain': ['.std', '.txt'] } }] });
  const file = await handle.getFile();
  return { name: file.name, text: await file.text() };
}
// Fallback (Safari iOS, Firefox): hidden <input type="file" accept=".std,.txt">
```

## Data Flow

### Request Flow — File Open

```
[User taps "Open"] → FileService.openFile()
    ├─ native → FilePicker.pickFiles → File.text()
    └─ web   → showOpenFilePicker | <input type=file> → File.text()
        ↓
    parseStaad(text)                    (pure; may run in a Web Worker)
        ↓
    modelStore.setModel(result)         (status: parsing → ready | warnings)
        ↓
    SceneBuilder.build(model)           (creates instanced layers, markers, bounds-fit camera)
        ↓
    ViewerCanvas renders; SummaryPanel populates
```

### State Management

```
[File drop / picker]
    ↓
useModelStore ──────── parse status, StaadModel, warnings (write-once)
    ↓ consumes
SceneBuilder → renderer (imperative Three.js; NOT React state)
    ↓ emits (pointer events)
Picker → useViewerStore ──── selectedId, hoveredId, colorMode, visibility
    ↓ subscribe (selectors)
InfoPanel / SummaryPanel / MemberLayers (highlight re-paint)
```

Rules (from R3F production guidance): state that changes infrequently (selection, color mode, visibility) lives in Zustand with selector subscriptions. Per-frame animation (camera smoothing, marker pulse) lives in refs mutated inside `useFrame` — never React state, never store writes per frame. The scene is a view, not a data source: data flows in via stores, interactions flow out via events.

### Key Data Flows

1. **Parse → Model:** `parseStaad(text)` normalizes version-drifted command names, applies `UNIT` changes to a running unit context, and produces a version-agnostic `StaadModel`. Warnings (unknown commands, missing sections, dangling member references) are collected, not thrown — tolerant parsing is a first-class output.
2. **Model → Scene:** SceneBuilder walks sections → creates one instanced layer per profile; walks members → writes instance matrices (oriented box/cylinder between node coords) + base colors; walks supports/loads → creates instanced markers/arrows; fits camera to `model.bounds`.
3. **Pick → Inspect:** raycaster → `instanceId` → `memberId` → store → InfoPanel + highlight repaint. No re-parse, no re-build.
4. **Color mode switch (by section / group / material):** UI writes `viewerStore.colorMode` → MemberLayers recomputes the instanceColor buffer from the model (keeps a base color buffer to restore from on deselect). This is a buffer write, not a scene rebuild.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–500 members (typical small/medium frame) | Plain `InstancedMesh` per profile is already sufficient. Native raycast is fine (O(N) over instances). |
| 500–10k members (large buildings, industrial) | Switch to `InstancedMesh2` (@three.ez/instanced-mesh): per-instance frustum culling (`perObjectFrustumCulled = true`, default), BVH spatial index for raycasting, `addLOD()` for distant members. Parse in a Web Worker to keep UI responsive. |
| 10k–100k+ members (very large industrial) | Per-instance frustum culling + LOD is mandatory (whole-model bounding-box culling is useless for a spread-out frame). Consider GPU color-picking for selection (async readback) if CPU raycast becomes the bottleneck; keep instance↔member maps in typed arrays, not Maps. |

### Scaling Priorities

1. **First bottleneck — draw calls:** solved from day one by instancing (never one mesh per member). This is a "from the start" constraint in the milestone, so SceneBuilder must be instanced-only architecture; no refactor path needed later.
2. **Second bottleneck — per-frame culling/picking on mobile:** iOS/Android WebViews are slower CPUs/GPUs than desktop; per-instance frustum culling + LOD + a BVH for picking keeps the frame budget. Parse in a worker so multi-MB `.std` files don't freeze the UI thread.

## Anti-Patterns

### Anti-Pattern 1: Parser Emitting Render Objects

**What people do:** The parser directly creates Three.js meshes or returns `{ mesh: BoxGeometry }` for each member.
**Why it's wrong:** Couples format parsing to rendering; cannot unit-test headlessly, cannot run in a worker, and a renderer change (instancing!) forces parser changes.
**Do this instead:** Parser returns plain typed data (`StaadModel`); the renderer builds scene objects. Proven by OpenBuilding's `BaseParseResult` contract.

### Anti-Pattern 2: One `Mesh` per Member

**What people do:** `members.map(m => <mesh geometry={...} position={...} />)` — 10k draw calls.
**Why it's wrong:** Instant frame-rate death on mobile; R3F per-object React reconciliation overhead for 10k+ objects.
**Do this instead:** Instanced layers per distinct section profile with `instanceId`-based picking (Pattern 2).

### Anti-Pattern 3: Line-Number-Based Parsing (Non-Tolerant)

**What people do:** Splitting on `\n` and assuming "line 3 = member property header", or failing hard on any unexpected line.
**Why it's wrong:** STAAD files vary by version (`LOADING` vs `LOAD`, `INCIDENCE` vs `INCIDENCES`, optional Z coordinate in plane frames, comments, blank lines). One unexpected line bricks the whole model.
**Do this instead:** Tokenize (semicolons = entry separators within a line), dispatch on normalized command names, collect warnings instead of throwing, skip unknown blocks gracefully.

### Anti-Pattern 4: Using Capacitor Filesystem to Read User Files on Android

**What people do:** `Filesystem.readFile({ path: userPickedPath })` on Android 11+.
**Why it's wrong:** Scoped storage forbids reading files not created by the app; it throws or returns nothing. Official guidance: use `@capacitor/file-picker`, which returns a `File` with `.text()`.
**Do this instead:** `@capacitor/file-picker` on native; `showOpenFilePicker`/`<input type="file">` on web — all behind `FileService` returning `{ name, text }`.

### Anti-Pattern 5: Model Data in React Component State

**What people do:** `useState<StaadModel>` in the viewer component, passing it down through props; Three.js objects held in component state.
**Why it's wrong:** Every interaction re-renders the whole tree; the scene and React fight over ownership of mutable state.
**Do this instead:** Model in `useModelStore` (write-once per file), view state in `useViewerStore` with selector subscriptions; Three.js objects owned imperatively by the renderer, referenced via refs.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| (None — offline-first, no backend) | — | Privacy/offline is a selling point; do not introduce telemetry that requires network for v1 |
| iOS Files app | `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` = YES in Info.plist | Required for Files app to expose documents; confirm during Capacitor shell phase |
| Android storage | No manifest permission needed with `@capacitor/file-picker` | Avoid `Directory.Documents`/`ExternalStorage` Filesystem APIs entirely (scoped storage) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `FileService ↔ parser` | `openFile(): Promise<{name, text}>` → `parseStaad(text)` | The only place file bytes cross; keeps parser platform-agnostic |
| `parser ↔ modelStore` | `ParseResult` (StaadModel + warnings) | Write-once; store is the single source of truth for the model |
| `modelStore ↔ SceneBuilder` | Store subscription / direct read after set | SceneBuilder rebuilds only when a new model is set, never per interaction |
| `renderer ↔ viewerStore` | Pointer events up; color/visibility/highlight commands down | No direct React↔Three object sharing; Picker is the only renderer→store path |
| `viewerStore ↔ panels` | Zustand selector subscriptions | InfoPanel derives member detail from selectedId + modelStore lookup |

### Suggested Build Order (architecture-first sequencing)

1. **Parser + model types (pure, headless):** `types.ts`, tokenizer, command handlers, fixtures of real `.std` files, unit tests. Nothing renders yet. — *Foundational; everything consumes the model.*
2. **FileService + minimal open flow:** open a file in browser, run parser, show parse status/warnings. Validates the tolerance contract early against real files.
3. **SceneBuilder + instanced member rendering:** members as oriented boxes/cylinders, color-by-section, camera fit to bounds. — *Core value milestone: "load a file and see the structure."*
4. **Picking + InfoPanel:** raycast → instanceId → memberId → inspect panel (section/group/length/nodes).
5. **Markers (supports + loads) + SummaryPanel + color modes (group/material).**
6. **Capacitor shell:** `@capacitor/file-picker`, iOS/Android packaging, offline verification. — *Pure integration; web code unchanged, only `platform/` added.*
7. **Performance pass for large models:** Web Worker parse, `InstancedMesh2` culling/LOD/BVH, (if needed) GPU picking.

## Sources

- [Three.js InstancedMesh docs (setColorAt, instanceColor, raycast instanceId)](https://threejs.org/docs/pages/InstancedMesh.html) — HIGH (official docs)
- [three.js issue #17906 / PR #17961 — InstancedMesh raycast returns instanceId](https://github.com/mrdoob/three.js/issues/17906) — HIGH (merged)
- [three.js forum: Best way to do Instanced Mesh picking in 2024](https://discourse.threejs.org/t/best-way-to-do-instanced-mesh-picking-in-2024/59917) — MEDIUM (community, corroborated by docs)
- [InstancedMesh2 (@three.ez/instanced-mesh) — frustum culling, LOD, BVH raycasting, sorting](https://github.com/agargaro/instanced-mesh) — MEDIUM (library docs)
- [three-mesh-bvh — InstancedMesh raycast fix PR #685 (merged 2024-07)](https://github.com/gkjohnson/three-mesh-bvh/pull/685) — HIGH (merged by maintainer)
- [pascalorg/editor — production R3F + Zustand architecture: stores, selection manager, scene registry](https://github.com/pascalorg/editor/blob/main/wiki/architecture/selection-managers.md) — MEDIUM (real-world reference, published 2025)
- [React Three Fiber architecture guidance (Zustand vs refs vs store boundaries)](https://www.intelligentgraphicandcode.com/development/threejs-interfaces/react-three-fiber) — MEDIUM (community, matches official R3F guidance)
- [DannCarlo/OpenBuilding — browser-only STAAD `.std` viewer: parser folder, SectionProfile polygons, AISC db, no backend](https://github.com/DannCarlo/OpenBuilding) — HIGH (direct reference implementation, MIT)
- [Bentley STAAD.Pro Technical Reference of STAAD Commands (JOINT COORDINATES, MEMBER INCIDENCES, MEMBER PROPERTY, SUPPORTS, LOAD syntax)](https://docs.bentley.com/LiveContent/web/STAAD.Pro%20Help-v21/en/STD_COMMANDS_SECTION.html) — HIGH (official vendor docs, multiple versions checked)
- [Bentley STAAD.Pro tutorials T.1–T.3 — full `.std` command-file examples](https://docs.bentley.com/LiveContent/web/STAAD.Pro-v2025.0.1/Help/en/topics/Getting_Started/Tutorial%20Problem%201/c-stpst_TUT01_Creating_the_model_using_the_command_file.html) — HIGH (official)
- [Capacitor Filesystem plugin docs (Android 11+ scoped storage limits)](https://capacitorjs.com/docs/apis/filesystem) — HIGH (official)
- [capacitor-plugins issue #1838 — Filesystem cannot read other apps' files; use FilePicker](https://github.com/ionic-team/capacitor-plugins/issues/1838) — MEDIUM (official maintainer guidance)
- [MDN: showOpenFilePicker / File System Access API — Chromium-only, secure context, user gesture](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) + [caniuse 74.6% global, no iOS Safari](https://caniuse.com/mdn-api_window_showopenfilepicker) — HIGH (MDN + caniuse)
- [Ionic: How Capacitor Works — WebView, Native Bridge, plugin web implementations](https://ionic.io/blog/how-capacitor-works-2) — HIGH (official vendor)

---
*Architecture research for: STAAD Online (client-side .std parser + 3D renderer + Capacitor shell)*
*Researched: 2026-08-15*