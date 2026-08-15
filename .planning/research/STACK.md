# Stack Research

**Domain:** Browser-based STAAD `.std` analytical model viewer packaged as a Capacitor hybrid iOS/Android app (client-side only, no backend)
**Researched:** 2026-08-15
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2.8 | Frontend framework / UI shell | The only framework with a first-class declarative Three.js renderer (React Three Fiber v9 pairs specifically with React 19). Component model fits the viewer UI (toolbar, panels, summary) and the 3D scene as the same declarative tree. Validated by the OpenBuilding reference implementation (React 19 + same stack, rendering `.std` client-side). |
| Three.js | 0.185.1 | WebGL 3D rendering | De-facto standard WebGL library. `InstancedMesh` renders all members sharing a section profile in a single draw call (10k–100k+ instances at 60fps on mobile with per-instance color via `setColorAt`). `Raycaster` supports instance picking since r126 → tap-to-inspect works without GPU-picking machinery. Ships `Vector3/Matrix4` math — no separate math lib needed. Requires WebGL2 (r163+), available in iOS 15+ WKWebView and modern Android System WebView — consistent with Capacitor 8 platform minimums. |
| @react-three/fiber | 9.7.0 | Declarative React renderer for Three.js | Zero-overhead React binding (components render outside React's reconciliation). v9 is the React 19 compatibility line; imperative scene code stays inside `useFrame`/refs, UI state stays in React — the exact split this app needs. |
| @react-three/drei | 10.7.8 | R3F helper components | `OrbitControls` (pan/orbit/zoom with touch gestures), `<Instances>/<Instance>` declarative InstancedMesh wrapper, `GizmoHelper`/`Grid` optional niceties. Peers: `react ^19, three >=0.159, @react-three/fiber ^9` — verified compatible. |
| Vite | 8.2.1 | Build tool / dev server | Standard for Capacitor web layer: static output to `dist/`, `npx cap sync` copies it into native projects. React 19 + plugin-react 6.0.5 officially supported. Requires Node `^20.19 || >=22.12` (matches Capacitor 8's Node 22+ requirement). |
| Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`) | 8.5.0 | Native iOS/Android shell | Current line (8.x, Node 22+, iOS SPM default, Android SDK 36/min 24). 8.5 (Jul 2026) is the breaking minor that adopts the UIScene lifecycle required for Xcode 27/iOS 27 — start on 8.5 so you're not blocked at App Store submission. Same web codebase served in-browser untouched. Capacitor 9 (late 2026, multi-window) will be a later, optional migration. |
| TypeScript | 7.0.2 (as scaffolded by create-vite 9.1.2) | Types for parser + viewer | Pin whatever `npm create vite@latest` (react-ts) installs — guaranteed compatible with Vite 8 + plugin-react. TS 7 is the native (Go) line now npm `latest`; do not hand-pin an old 5.x. |
| Zustand | 5.0.15 | Client state (model, selection, view toggles, coloring mode) | The pmndrs ecosystem standard — selector-based subscriptions avoid re-render storms for high-frequency viewer state (selection changes, coloring mode, loaded model). No React Context/Redux boilerplate. Used by the OpenBuilding reference. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Custom STAAD `.std` parser (own module, not npm) | — | Parse joints/members/properties/supports/**loads**/units/ranges | **Required.** No maintained JS/TS STAAD parser exists on npm (verified). OpenBuilding (DannCarlo/OpenBuilding, MIT, TypeScript) is the only open-source JS parser — a strong structural reference covering JOINT COORDINATES, MEMBER INCIDENCES, MEMBER PROPERTY (PRIS/TABLE), MEMBER OFFSET, SUPPORTS, CONSTANTS (BETA/MATERIAL), GROUP DEFINITION, UNIT lines, continuation lines, `TO` ranges — but it does **not** parse LOAD blocks, which this project requires. Write our own tolerant parser; optionally vendor its MIT steel-database JSON (1,223 AISC sections + staad-to-aisc mapping) in a later phase. |
| @capacitor/filesystem | 8.1.2 | Persist picked files into app storage | Only for a "recent files" feature. **Not needed for v1 open flow** — `<input type="file">` works in both WebViews and browsers with zero plugins. Defer. |
| @types/three | 0.185.4 | Three.js types | Dev dependency; tracks three 0.185.x. |
| Tailwind CSS (v4) | 4.x | Styling toolbar/panels | Optional but recommended — matches reference implementation; fastest path to a clean responsive UI (mobile bottom bar / desktop toolbar). Plain CSS is an acceptable fallback if the team prefers zero deps. |
| lucide-react | latest | Icons | Optional; tiny tree-shakeable icon set for toolbar (open, zoom, view modes). |
| Web Worker (platform built-in) | — | Parse large `.std` files off the main thread | Large industrial decks (100k+ members) parse in tens-to-hundreds of ms; worker keeps UI responsive. No library needed — plain `postMessage` with a typed parse result. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Node.js 22 LTS+ | Runtime for Vite/Capacitor | Hard requirement: Vite 8 needs `^20.19 || >=22.12`; Capacitor 8 needs Node 22+. Use the LTS. |
| Xcode 26+ (27 for UIScene) | iOS builds | Capacitor 8.5 requires UIScene adoption for Xcode 27 / iOS 27; run `npx cap migrate` after upgrade. |
| Android Studio (Otter / 2025.2.1+) | Android builds | AGP 8.13.0, Gradle wrapper 8.14.3, Kotlin 2.2.20, compile/target SDK 36, min SDK 24 — all managed by Capacitor 8 templates. |
| `@capacitor/cli` | Project init / sync / build | `npx cap init`, `npx cap add ios|android`, `npx cap sync`, `npx cap open`. `webDir: 'dist'` in `capacitor.config.ts`. |

## Installation

```bash
# Scaffold web app (React + TS + Vite)
npm create vite@latest staad-online -- --template react-ts
cd staad-online

# Core 3D + framework
npm install three @react-three/fiber @react-three/drei zustand
npm install -D @types/three

# Native shell (pin ^8.5.0)
npm install @capacitor/core
npm install -D @capacitor/cli @capacitor/ios @capacitor/android

# Optional UI
npm install tailwindcss @tailwindcss/vite lucide-react

# Init native projects (after first build)
npx cap init "STAAD Online" com.example.staadonline --web-dir dist
npm run build && npx cap add ios && npx cap add android
```

**Vite config integration point:** set `base: './'` in `vite.config.ts` so bundled assets resolve under the WebView's `capacitor://localhost` / `https://localhost` scheme. Then `npm run build && npx cap sync`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| React + R3F | Vanilla Three.js (no framework) | If the team refuses React; acceptable for a minimal viewer but you rebuild UI state, event handling, and scene diffing by hand. R3F's declarative scene + Zustand is strictly less code for the same result. |
| React + R3F | Babylon.js | Babylon is a heavier game-engine-scoped library with no first-class React renderer (`react-babylonjs` is far less maintained than R3F). Choose only if you needed its built-in physics/collision/asset pipeline — this app does not. |
| React | Vue 3 / Svelte 5 | No Vue/Svelte declarative Three.js binding approaches R3F's maturity. Both are viable UI-only, but the 3D layer is the hard part — pick the framework the 3D ecosystem supports best. |
| Vite | Next.js / CRA | Next.js adds SSR complexity that a static local app doesn't need; CRA is deprecated. Static Vite build is the Capacitor-documented path. |
| Zustand | Redux Toolkit / MobX | Redux is ceremony for a single-view app; MobX works but adds an extra paradigm. Zustand is the R3F-ecosystem default with zero boilerplate. |
| `<input type="file">` + drag-drop | File System Access API (`showOpenFilePicker`) | FSA API is desktop Chrome/Edge-only and unavailable in WebViews. Use it only as a progressive enhancement on desktop; the input element is the primary cross-platform path. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Babylon.js | Heavier, game-oriented, weaker React integration; InstancedMesh-equivalent API is fine but the ecosystem (R3F/drei) is built around three.js. | three.js + @react-three/fiber |
| gl-matrix / mathjs / glm | Three.js ships its own `Vector3`/`Matrix4`/`Quaternion`; adding a second math system invites unit/convention bugs (column-major vs row-major). | three's built-in math |
| Redux / MobX | Overkill for viewer state; high-frequency 3D state updates fight Redux's strictness. | zustand |
| react-dnd / dnd-kit | Native HTML5 drag-and-drop is sufficient for file drop; drag libs add bundle weight and WebView quirks for one feature. | Native `onDrop` handler |
| glTF / Draco / KTX2 / asset pipeline | No external assets exist — the model is procedural from the parser. Any loader pipeline is dead weight. | Procedural `BufferGeometry` + InstancedMesh |
| postprocessing / bloom / EffectComposer | Post-processing is the #1 mobile frame-budget killer; a structural viewer needs none of it. | Plain `MeshStandardMaterial`/`MeshLambertMaterial` |
| @capacitor/filesystem (v1) | Unneeded for open-file flow (input element covers it); only justified by recent-files persistence. | `<input type="file">` |
| THREE.WebGPURenderer | WebGPU is not reliably available in Android System WebView; WebGL2 (r163+ default) is the universal baseline for Capacitor WebViews. | `THREE.WebGLRenderer` |
| react-router | Single-view application; screen transitions are state toggles, not routes. | Zustand view-state flag |
| Ionic UI kit / Framework | Ionic's components fight the custom viewer UI (canvas + floating panels) and add a large dependency for a 3D-first app. | Tailwind (or plain CSS) |
| Cesium / mapbox-gl / other heavy 3D | Engineered for geospatial scenes, not analytical member models; order-of-magnitude more bundle than needed. | three.js |
| d3 / chart libs for summary | Summary panel is a table of counts/bounds — plain markup. | React components |

## Stack Patterns by Variant

**If a specific large `.std` file reveals member counts > ~100k:**
- Use per-section InstancedMesh (one draw call per unique section) — do NOT create individual meshes per member.
- Add per-instance frustum culling (three.js culls the whole InstancedMesh as one bounding box; reorder/compact the instance matrix array by visibility) and GPU-picking for selection instead of `Raycaster`.
- Move parsing to a Web Worker; pass results as typed arrays (no structured-clone of giant object graphs).

**If models are small (< 5k members):**
- Skip worker and LOD complexity; one InstancedMesh per section still applies (it's simpler than individual meshes anyway).

**If WebGL2 is unavailable (very old iOS < 15 / ancient Android WebView):**
- Show a friendly "device too old" screen with the model summary panel still available from the parsed data. Do not attempt WebGL1 fallback — three.js r163+ dropped it and supporting it means pinning ancient three.

**If the team later wants a "recent files" or file-sharing feature:**
- Add `@capacitor/filesystem` + `@capacitor/share`; both are official plugins, v8-compatible.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @react-three/fiber@9.7.0 | react@19.x | v9 pairs with React 19 (v8 pairs with React 18) — do not mix majors. |
| @react-three/drei@10.7.8 | react ^19, three >=0.159, @react-three/fiber ^9 | Verified peerDependencies. |
| three@0.185.1 | @types/three@0.185.x | Types track three minors; keep in sync. |
| three@0.185.1 | WebGL2 | r163+ dropped WebGL1. iOS 15+ WKWebView and Android System WebView (Chromium 56+) provide WebGL2 — matches Capacitor 8 minimums (iOS 15 target, Android min SDK 24). |
| vite@8.2.1 | Node ^20.19.0 \|\| >=22.12.0 | Capacitor 8 requires Node 22+ — Node 22 LTS satisfies both. |
| @capacitor/cli@8.5.0 | @capacitor/core@8.5.0, ios/android@8.5.0 | Keep all @capacitor/* packages on the same version. |
| @capacitor/ios@8.5.0 | Xcode 26+ (Xcode 27 requires UIScene — 8.5 adopted it; run `npx cap migrate`) | Breaking minor; published apps on Xcode 26 keep working. |
| @capacitor/android@8.5.0 | Android SDK 36 (compile/target), min SDK 24, AGP 8.13.0, Gradle 8.14.3, Kotlin 2.2.20 | Managed by Capacitor's template — don't downgrade. |
| TypeScript | Vite 8 (esbuild transpile) + tsc type-check | Use the version create-vite scaffolds; TS 7 (native) is npm `latest` and the emerging standard. |

## Sources

- npm registry (`npm view`) — authoritative current versions: three 0.185.1, @react-three/fiber 9.7.0, drei 10.7.8, react 19.2.8, vite 8.2.1, zustand 5.0.15, @capacitor/* 8.5.0, @types/three 0.185.4, typescript 7.0.2 — HIGH confidence
- Ionic blog "Announcing Capacitor 8" (2025-12-08) and "Capacitor 8.5 Released" (2026-07-31) — 8.x lifecycle, UIScene/Xcode 27 — HIGH
- capacitorjs.com updating/8-0 — Node 22+, SPM default, SDK 36, Kotlin 2.2.20, breaking changes — HIGH
- r3f.docs.pmnd.rs v9 Migration Guide + R3F GitHub README — v9↔React 19 pairing — HIGH
- threejs.org/docs InstancedMesh + R3F drei discussions — InstancedMesh/LOD/picking — HIGH
- OpenBuilding (github.com/DannCarlo/OpenBuilding, MIT) — reference implementation stack + STAAD parser structure; npm searches confirm no STAAD parser package — HIGH
- webglfundamentals.org / threejs discourse — WebGL2-in-WebView baselines, instancing guidance — MEDIUM
- Ionic discussions #5562 — three.js + Capacitor WebView rendering verified working — MEDIUM
- Research digests cached via `gsd-tools research-store` (8 items, keys in research cache)

---
*Stack research for: STAAD Online viewer (Capacitor hybrid web/mobile .std viewer)*
*Researched: 2026-08-15*