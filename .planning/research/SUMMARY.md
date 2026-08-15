# Project Research Summary

**Project:** STAAD Online — milestone v1.0 (`.std` analytical-model viewer)
**Domain:** Client-side 3D structural-model viewer — Capacitor hybrid web/mobile app, no backend, offline
**Researched:** 2026-08-15
**Confidence:** MEDIUM

## Executive Summary

STAAD Online is a client-side viewer for Bentley STAAD `.std` analytical-model files. A structural engineer opens a `.std` (system file picker on mobile, drag-and-drop on desktop) and sees the 3D structure render immediately — on any device, in any browser, without STAAD.Pro, with zero conversion, zero uploads, and zero accounts. The `.std` text deck fully describes the analytical model (joints, members, properties, supports, loads), so the entire product is one pipeline: **open → parse → model → render**. Research confirms the 8 milestone capabilities are exactly this domain's table stakes (every competitor ships them); the differentiators are opening raw `.std` with no conversion, native offline iOS/Android via Capacitor, and a privacy guarantee — files never leave the device.

The recommended approach is a proven stack: **React 19 + three.js 0.185 + @react-three/fiber v9 + drei + Zustand + Vite 8**, packaged by **Capacitor 8.5** (pin 8.5 — it adopts the UIScene lifecycle Xcode 27/iOS 27 requires). Critically, **no STAAD parser exists on npm** — a custom tolerant parser is mandatory. OpenBuilding (MIT) is the only open-source JS reference and covers most of the grammar, but it does *not* parse LOAD blocks, which this project requires. The architecture is a strictly one-way pipeline: a pure, headless parser module (unit-testable, worker-runnable) produces a typed `StaadModel`; the renderer consumes only that model and draws all members via **one `InstancedMesh` per distinct section profile** (never one `Mesh` per member); a thin `platform/` service boundary isolates all Capacitor code.

Three risks dominate. **(1) Parser correctness is the product's foundation:** `UNIT` is stateful (it can switch mid-file — coordinates in feet, section properties in inches), and the grammar is free-format (semicolon-packed lines, `" -"` continuations, `*` comments, abbreviations, version-drifted command names) — a naive line parser fails on the second real file. **(2) Mobile rendering reality:** the draw-call wall hits at ~2k members on phones, so instancing must be the architecture from day one; iOS caps pages at ~2–3 GB with WebGL context loss and WKWebView process kill — the parsed model must be persisted and the scene rebuilt idempotently. **(3) Float32 precision:** raw engineering coordinates collapse above ~1e5 — the model must be rebased to its centroid at parse time.

**Recommendation:** build in 4 phases that mirror the dependency chain — Parser & Model Loading → 3D Rendering & Interaction → Native Packaging & Offline → Performance & UX Polish. Phase 1 (parser) is the highest-risk, highest-leverage piece and everything depends on it; validate against real STAAD.Pro-generated files in a golden-file corpus before any rendering exists. Capacitor is pure integration at the end — the web app must be fully working in-browser first. Do not optimize for scale (worker parse, LOD, BVH) until real user files justify it.

## Key Findings

### Recommended Stack

**One-liner:** React 19 + three.js 0.185 + R3F v9 + drei + Zustand + Vite 8, packaged with Capacitor 8.5 — plus a mandatory custom tolerant `.std` parser (no npm package exists; OpenBuilding is the MIT reference but lacks LOAD parsing).

**Core technologies:**
- **React 19.2.8** — UI shell; the only framework with a first-class declarative Three.js renderer (R3F v9 pairs specifically with React 19); validated by the OpenBuilding reference implementation
- **three.js 0.185.1** — WebGL2 renderer; `InstancedMesh` renders 10k–100k+ members in one draw call per profile with per-instance color (`setColorAt`); native `instanceId` raycast picking; ships its own math (no separate math lib)
- **@react-three/fiber 9.7.0** — declarative React renderer for Three.js; imperative scene code stays in refs/`useFrame`, UI state stays in React
- **@react-three/drei 10.7.8** — `OrbitControls`, declarative `<Instances>`, optional GizmoHelper/Grid; peer-verified against react 19 / three 0.185
- **Zustand 5.0.15** — three small stores (model / viewer / ui), selector-based subscriptions avoid re-render storms for high-frequency viewer state
- **Vite 8.2.1** — static build to `dist/` for `cap sync`; `base: './'` required for WebView asset resolution; Node 22 LTS satisfies Vite + Capacitor 8 requirements
- **Capacitor 8.5.0** — pin 8.5 (breaking minor adopting UIScene/Xcode 27 requirement); same web codebase served in-browser untouched
- **TypeScript** — as scaffolded by create-vite (TS 7 line is npm `latest`); do not hand-pin old 5.x
- **Custom parser module** (own code, not npm) — tolerant STAAD `.std` parser with unit-state machine, command dispatch, section resolver; Web Worker-ready
- **Optional:** Tailwind v4 + lucide-react (UI); `@capacitor/filesystem` deferred (not needed for v1 open flow)

**What NOT to use:** Babylon.js, glTF/asset pipelines, postprocessing/EffectComposer, Ionic UI kit, react-router, WebGPURenderer (not reliable in Android WebView), Redux/MobX, `readData: true` base64 reads.

### Expected Features

The 8 milestone capabilities are exactly the domain's table stakes. Two extra UX expectations surfaced from competitor analysis and must be treated as required: **camera auto-fit to model bounds with a size-exaggeration factor** (~10–20× default; STAAD.Pro itself exaggerates member sizes) and a **per-load-case selector** for load arrows (arrows are meaningless without choosing which case to display).

**Must have (table stakes):**
- Open `.std` via file picker (mobile, `@capawesome/capacitor-file-picker` — never `readData:true`) + drag-drop (desktop)
- Tolerant parse of JOINT COORDINATES / MEMBER INCIDENCES / MEMBER PROPERTY / SUPPORTS / LOAD with running unit state; warnings collected, never crashes
- Procedural instanced 3D render of members with real cross-section shapes; auto-fit + size exaggeration
- Color members by section (default), group, material — mode switch is a per-instance buffer rewrite, not a scene rebuild
- Supports + loads as instanced 3D markers/arrows with magnitude labels; per-load-case selector
- Tap/click member → info panel (section, group, length, node coordinates); hover highlight
- Model summary panel (units, counts, bounds, groups, warnings)
- Capacitor iOS/Android packaging + offline

**Should have (differentiators):**
- Zero-conversion raw `.std` open (competitors require i-model conversion, cloud accounts, or desktop)
- Native iOS/Android *and* same-codebase web (competitors are one or the other)
- Truly client-side — files never leave the device (the privacy guarantee is the product)
- Mobile-first inspection UX (thumb-reachable bottom bar, overlay panels)

**Defer (v2+):** `.OUT` results viewer (natural next milestone), plates/solids, `.e2k`/`.s2k` formats, cloud share, editing/analysis, recent-files (P2), Web Worker parse + progress (P2 — P1 only if targeting 100k-member decks from day one), persisted model restore (P2, buildable during Phase 3).

### Architecture Approach

**One-liner:** strictly one-way pipeline `file → parse → model → render` — a pure headless parser decoupled from the renderer, one InstancedMesh per section profile, and a thin Capacitor platform boundary.

**Major components:**
1. **FileService** (`platform/` boundary) — web `showOpenFilePicker` → `<input type="file">` fallback vs native `@capacitor/file-picker`; returns unified `{ name, text }`; the only place platform code lives
2. **Parser** (pure TS, zero DOM/Three imports) — tokenizer (semicolons, continuations, comments, abbreviations) + per-command dispatch table + running unit-state machine + section resolver; returns typed `StaadModel` + warnings; unknown commands skipped with warnings, never thrown
3. **StaadModel** (typed data) — nodes, members, sections (`SectionProfile` polygons), supports, load cases, groups, units, bounds; version-agnostic
4. **SceneBuilder / MemberLayers** (renderer) — one InstancedMesh per distinct section profile; parallel `instanceId ↔ memberId` maps; Markers layer (supports + loads); Picker (raycast → instanceId → memberId); renderer knows only the model, never the format
5. **Stores** (Zustand) — `modelStore` (write-once per file), `viewerStore` (selection/colorMode/visibility), `uiStore` (panels); scene is a view, not a data source
6. **Capacitor shell** — packaging only, no business logic; iOS `Info.plist` document-sharing entitlements

### Critical Pitfalls

1. **Units are stateful, not global** (P1) — `UNIT` can appear anywhere and switches the meaning of every subsequent value (coords in FT, `PRIS YD ZD` in INCH); default FEET+KIPS. Track a running unit state, normalize to meters at parse time, always label units in UI. → Phase 1.
2. **`.std` grammar breaks naive line parsers** (P2/P3) — free-format: `;` multi-entry lines, blank+hyphen continuations, `*` comments, abbreviations, version-drifted command names (`LOADING` vs `LOAD`), quoted section-DB names (`TABLE 'W' ST 'W14X90'`), and `TABLE` names are lookup keys, not geometry. Tokenize + dispatch on normalized names + collect warnings; golden-file corpus of 4+ real file shapes. → Phase 1.
3. **Instancing must be first, not retrofitted** (P4) — one `Mesh` per member dies at ~2k members on mobile (<100 draw calls is the mobile budget); instancing is the architecture, not an optimization. → Phase 2 (decided at Phase 1 architecture time).
4. **iOS memory/context reality** (P5/P7) — ~2–3 GB page cap including GPU, context loss on backgrounding, and WKWebView process kill wipes the in-memory parsed model. Persist the parsed model, rebuild the scene idempotently, cap `pixelRatio` at 2, pause the render loop on `visibilitychange`, dispose GPU resources on load. → Phases 2–3.
5. **Float32 precision collapse** (P8) — coordinates ≥ ~1e5 jitter, gap at member ends, z-fight. Rebase to model centroid at parse time (solves 99% of civil models); camera-relative rendering (RTE) as an explicit Phase 2 spike only if spans exceed ~1e5. → Phase 2.

## Implications for Roadmap

Based on combined research (ARCHITECTURE build order + PITFALLS phase mapping + FEATURES dependency graph), a 4-phase structure:

### Phase 1: Parser & Model Loading
**Rationale:** Everything consumes the model; the parser is the highest-risk, highest-leverage component and must be headless + worker-ready from day one. No rendering exists yet — this phase validates the tolerance contract against real files before any geometry is built.
**Delivers:** Pure parser module (tokenizer, command dispatch, unit-state machine, section resolver), typed `StaadModel`, golden-file corpus of real `.std` files (plane frame, space frame, semicolon-packed GUI output, mixed-unit, modern quoted-DB), FileService + minimal open flow, parse status/warnings UI.
**Addresses:** FEATURES "open" + "parse"; bounds/counts computed here feed the summary panel later.
**Avoids:** P1 (unit state), P2 (naive parsing), P3 (section syntax drift), security pitfalls (ReDoS-free tokenizer, size guards, `Map` lookups, capped range expansion).
**Research flag:** Grammar is well-documented (Bentley Technical Reference + OpenBuilding reference) — **skip research-phase**; the real need is gathering validated sample files from STAAD.Pro users early.

### Phase 2: 3D Rendering & Interaction
**Rationale:** The core value moment — "load a file and see the structure." Consumes the Phase 1 model; the renderer never parses.
**Delivers:** SceneBuilder with one InstancedMesh per section profile, camera auto-fit + size exaggeration, origin rebasing, raycast picking → info panel, support/load markers + per-load-case selector, color-by-section/group/material (buffer rewrites), summary panel.
**Addresses:** FEATURES render / color / supports+loads / inspect / summary; the two UX expectations (auto-fit + exaggeration, load-case selector).
**Avoids:** P4 (instancing from day one), P5 (context-loss handlers + dispose discipline), P8 (rebase at parse time).
**Research flag:** Instancing/picking are established patterns — **skip research-phase**; but run a **precision spike** for models spanning >~1e5 units (RTE decision), and prepare context-loss recovery plumbing that Phase 3 validates on device.

### Phase 3: Native Packaging, File Handling & Offline
**Rationale:** Pure integration — the web app must be fully proven first; Capacitor adds only `platform/` files and generated native projects.
**Delivers:** `@capacitor/file-picker` native path (never `readData:true`; read via `fetch(path).text()`), iOS/Android shells (`npx cap sync`), offline verification, persisted parsed model to `Directory.Data` with "Restore last model" on startup, iOS `Info.plist` document-sharing entitlements.
**Addresses:** FEATURES Capacitor packaging + offline; the native/offline/privacy differentiators.
**Avoids:** P6 (base64 OOM — copy picked files to app storage immediately; Android `content://` grants expire), P7 (WebView kill → persist + idempotent rebuild).
**Research flag:** **NEEDS research-phase** — Capacitor 8.5 UIScene/Xcode 27 specifics, iOS Files-app "Open with…" entitlements, Android `content://` copy semantics, and mandatory real-device validation (context loss via `forceContextLoss()`, background/resume with large model).

### Phase 4: Performance & UX Polish
**Rationale:** Scales and polishes what Phases 1–3 built; triggered by real-world model sizes rather than speculation.
**Delivers:** Web Worker parse + staged progress (trigger ~2 MB / ~5k members), `InstancedMesh2` per-instance frustum culling + LOD + BVH picking at 10k+ members, GPU picking if CPU raycast bottlenecks, display-unit toggle, error/empty states with failing-line reporting, resize/orientation re-render handling, load-arrow direction labeling (global vs local axes).
**Addresses:** FEATURES P2 items + the "Looks Done But Isn't" checklist (UX pitfalls).
**Avoids:** P4/P5 at scale (culling/LOD/memory discipline), UX pitfalls (framing, units labeling, arrow conventions, load feedback).
**Research flag:** Worker + instancing + LOD are standard patterns — **skip research-phase**; scale decisions should be data-driven from real user models collected during UAT.

### Phase Ordering Rationale
- **Open → Parse → Model → Render is strictly one-way** (ARCHITECTURE Pattern 1) — parse/model must precede any rendering, hence Phase 1 first; the parser's headless purity is what makes the worker, tests, and future `.OUT` parser possible.
- **Unit-state, instancing, and rebasing are "from the start" decisions** — retrofitting any of them is a rewrite (P1, P4, P8). They land in Phases 1–2, never later.
- **Capacitor is pure shell** — no business logic; FEATURES dependency graph requires the web app fully working in-browser first. Phase 3 is the last, easiest phase (modulo device validation).
- **Resilience spans Phases 2–3** — context-loss plumbing (P5) starts in the renderer, persistence (P7) lands in the native phase; they share one root cause and one restore path.
- **Phase 4 is data-driven** — don't build worker parsing/LOD/BVH until real user files demonstrate the need; the research gives clear triggers (~2 MB / ~5k members / 10k+ instances).

### Research Flags
- **Needs research:** Phase 3 (Capacitor 8.5 UIScene/Xcode 27 migration, iOS Files-app entitlements, Android `content://` copy semantics, real-device context-loss & background-kill validation); Phase 2 precision spike (RTE for >~1e5 unit spans).
- **Standard patterns (skip research-phase):** Phase 1 (grammar well-documented; real files matter more than research); Phase 4 (worker parse, instancing, culling, LOD are established patterns).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry authoritative versions; official docs (Ionic/Capacitor, R3F v9, three.js); verified against OpenBuilding reference implementation |
| Features | MEDIUM | Official Bentley docs + competitor analysis + reference impl; market-feature mapping is sound inference, UX expectations (exaggeration, load-case selector) validated against STAAD.Pro/Midas/SCIA conventions |
| Architecture | MEDIUM | Component split corroborated by OpenBuilding and pascalorg/editor; three stores and instanced-layer design follow established R3F/Zustand guidance |
| Pitfalls | MEDIUM | HIGH for format grammar + Capacitor facts (official Bentley/Capacitor docs); MEDIUM for rendering/precision/context-loss (community consensus, multiple corroborating sources); device-specific behavior (context loss, WebView kill) needs real-device validation |

**Overall confidence:** MEDIUM — HIGH on stack and grammar facts, MEDIUM on UX assumptions and mobile-device behavior until Phase 3 device testing.

### Gaps to Address
- **Real `.std` corpus:** no validated sample files in-repo yet — must gather STAAD.Pro-GUI-generated (semicolon-packed), plane/space frames, mixed-unit, modern quoted-DB, and survey-coordinate files. Highest-priority gap; flag for early user validation in Phase 1.
- **Section database:** decision pending — bundle an AISC edition (which?), vendor OpenBuilding's MIT steel DB (1,223 sections), or ship fallback-only with "approximate" flags? Affects Phase 2 fallback rendering and inspector accuracy claims.
- **Size exaggeration default:** ~10–20× recommended; exact default + slider range needs engineer UAT.
- **Load-case selector UX:** confirmed as needed; exact mobile placement (bottom bar) needs design decisions in Phase 2.
- **Precision at scale:** RTE implementation only if real models span >~1e5 units — spike decision deferred to Phase 2 with real data.
- **Worker parse trigger:** ~2 MB / ~5k members is guidance; whether Phase 4 is pre-launch (P1) or post-launch (P2) depends on real user files.
- **Persistence format:** JSON vs binary/typed-array for restore of large models — decide in Phase 3 (models can be 100s of MB).
- **Telemetry policy:** privacy is the product — any analytics must be model-content-free; document explicitly in milestone UAT.
- **PWA/service-worker offline:** native shell is the offline guarantee; web SW is progressive enhancement only, and `.std` files must never be SW-cached (Safari eviction).

## Sources

### Primary (HIGH confidence)
- Bentley STAAD.Pro Technical Reference (docs.bentley.com) — command grammar, UNIT statefulness (TR.3), MEMBER PROPERTY syntax, REPEAT/range generation, model limits
- npm registry (`npm view`) — authoritative current versions: three 0.185.1, R3F 9.7.0, drei 10.7.8, react 19.2.8, vite 8.2.1, zustand 5.0.15, Capacitor 8.5.0
- Ionic blog ("Announcing Capacitor 8", "Capacitor 8.5 Released") + capacitorjs.com updating/8-0 — lifecycle, UIScene/Xcode 27, Node 22+, SDK 36
- r3f.docs.pmnd.rs v9 migration guide — React 19 pairing
- threejs.org — InstancedMesh docs (setColorAt, instanceColor, raycast instanceId); optimize-lots-of-objects
- MDN + caniuse — showOpenFilePicker / File System Access API (Chromium-only, no iOS Safari)
- Capacitor Filesystem docs + Capawesome File Picker docs — readData/base64 OOM, Android scoped storage, content:// support
- Capacitor GitHub (#7793, #7097, #6680, PR #7905) — WKWebView WebContent process death
- three.js GitHub (#17906/#17961 instanceId raycast; #16324 large-coordinate shake) + webgl-dev-list — iOS ~2–3 GB page cap, context loss

### Secondary (MEDIUM confidence)
- DannCarlo/OpenBuilding (MIT) — direct reference implementation: parser structure, SectionProfile polygons, AISC DB, responsive mobile bottom bar, client-side
- Speckle, Re:Earth, mlightcad — spatial jitter, RTC/RTE precision recipes
- three.js forum, MasterAllArts, RapidMade — draw-call budgets, InstancedMesh vs BatchedMesh, CAD-viewer optimization
- Bentley Structural Navigator, STAAD·VIEW, SAP2000 Cloud Viewer, SCIA Engineer, Midas Gen, Oasys GSA — competitor feature landscape
- pascalorg/editor — production R3F + Zustand architecture (selection manager, store split)
- Wonderland Engine, Apple Developer Forums, Playwright/issues — iOS WebGL context-loss bugs and fixes

### Tertiary (LOW confidence)
- Community threads on WebView memory behavior and context-loss prevalence (Ash Kyd dev-log, CalcSteel blog) — needs real-device validation in Phase 3
- Stack Overflow #77436539 — capacitor file-picker blob vs base64 (anti-pattern confirmation, low-moderate)

---
*Research completed: 2026-08-15*
*Ready for roadmap: yes*