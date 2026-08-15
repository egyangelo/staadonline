# Feature Research

**Domain:** STAAD `.std` analytical-model viewer — Capacitor hybrid web/mobile app, fully client-side (no backend, no accounts, offline)
**Researched:** 2026-08-15
**Confidence:** MEDIUM (web findings cross-checked against official Bentley docs, the OpenBuilding reference implementation, and sibling research files STACK/ARCHITECTURE/PITFALLS)

## Feature Landscape

### Table Stakes (Users Expect These)

Features structural engineers assume exist in a `.std` viewer. Missing these = product feels broken. **All eight map 1:1 to the milestone's target capabilities** — this milestone's feature set *is* the table-stakes baseline for the domain, plus the color-by-section mode that every competitor ships by default.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Open `.std` via file picker (mobile) + drag-drop (desktop) | Every competitor opens files this way (OpenBuilding, STAAD·VIEW); drag-drop is the desktop norm, system picker the mobile norm | LOW | Mobile: `@capawesome/capacitor-file-picker` (never `readData:true` — base64 OOM). Desktop: `<input type="file" accept=".std,.txt">` as baseline + native HTML5 `onDrop` overlay; `showOpenFilePicker` only as Chromium progressive enhancement. Cancel handling required (Safari first-call bug fixed in v5.1.1+, PR #111). |
| Parse joints/members/properties/supports/loads from `.std` | The `.std` *is* the model — JOINT COORDINATES (X,Y,Z; Z optional in PLANE), MEMBER INCIDENCES (start/end joint; REPEAT/REPEAT ALL generation), MEMBER PROPERTY (PRIS YD/ZD, TABLE ST key, PIPE/TUBE/USER), SUPPORTS (PINNED/FIXED/FIXED BUT/DOF/SPRING), LOAD/LOADING (MEMBER LOAD UNI, JOINT LOAD FX/FY/FZ/MX/MY/MZ, SELFWEIGHT, LOAD COMBINATION) | HIGH | Free-format: `;` multi-entry lines, `*` comments, blank+hyphen continuation, ≤24-char tokens, abbrev. `UNIT` is **stateful** (default FEET KIPS; can switch mid-file — must track running unit context per PITFALLS P1). GROUP DEFINITION (`_NAME`) groups members. Tolerant parser required: unknown commands skipped with warnings, not fatal. |
| Render 3D analytical model procedurally | Instant 3D render with real cross-section shapes is the core promise (OpenBuilding: "renders instantly… wide flanges, channels, angles, HSS, pipes rendered with accurate cross-section polygons, not generic cylinders") | MEDIUM | Instanced rendering per distinct section profile (never one Mesh per member). Camera must auto-fit to model bounds on load — engineers expect to see the whole structure immediately (PITFALLS UX: "Frame the model from the rebased bounding box on load"). **Size exaggeration factor** default ~10–20× for thin members (STAAD.Pro renders 3D sections with adjustable display; a 14-in column in a 300-ft frame is a sub-pixel sliver at true scale). Y-up = STAAD convention, same as three.js. |
| Color members by section, group, or material | "Color By" is a first-class display mode in STAAD.Pro, SCIA (by material/cross-section/layer), Midas (member type/group), and OpenBuilding. Engineers use color to read member roles at a glance | LOW | Per-instance color buffer (`setColorAt`) — a buffer write, not a scene rebuild. Requires parsing GROUP definitions for group coloring and material (CONSTANTS) for material coloring. Group coloring needs a stable color palette for arbitrary group counts. |
| Display supports and loads as 3D markers/arrows | STAAD.Pro (Supports display + Load Values + Display Floor Loading), Midas (Support constrained-DOF display, load arrows per load case), GSA (restraint labels) — support icons and load arrows with direction + magnitude are universal | MEDIUM | Supports: restraint icons at supported nodes (toggleable; PINNED vs FIXED distinguishable). Loads: arrows with **direction + magnitude labels**, per-load-case selection (STAAD.Pro/Midas pattern). **Direction conventions matter**: `UNI GY` = global axis, bare `UNI Y` = local axis — label magnitude + reference in inspector (PITFALLS UX). Deferred: INCLINED load axes, REPEAT LOAD expansion can wait. |
| Tap/click member to inspect section, group, length, node coordinates | Click-to-inspect info panel is the universal pattern: OpenBuilding (section, dims, start/end nodes, group), Structural Navigator (interactively query members for all property values), STAAD.Pro (beam spec/labels) | MEDIUM | Raycaster on InstancedMesh returns `instanceId` → `memberId` map. Show: section label + dims, group, length (in file's units, labeled), start/end node coordinates. Section from `TABLE ST` is a **lookup key, not geometry** — flag "dimensions approximate" when no bundled DB match (PITFALLS P3). Hover highlight + tap-target tolerance on dense models. |
| Model summary panel (units, counts, bounds, groups) | STAAD.Pro Info tab shows counts (nodes/beams/plates, highest #) + file info; engineers check "did the whole model load?" via counts vs their known model | LOW | Computed at parse time: node count, member count, group list + sizes, bounding box, units in force. **Always label units** (PITFALLS UX: bare "bounds 304.8 × 457.2" is meaningless). Show parse warnings count (tolerant-parse transparency). |
| Capacitor iOS/Android native packaging + offline | The product's core value is "view on any device without STAAD.Pro" — native shell + offline is the delivery mechanism, not a feature | MEDIUM | Same web codebase served in-browser; `platform/` boundary isolates Capacitor imports. `@capacitor/file-picker` for native pick. Info.plist: `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` for Files-app visibility (confirm in shell phase). WebView is ephemeral: persist parsed model for restore after iOS WebContent kill (PITFALLS P7). |

### Differentiators (Competitive Advantage)

Features that set STAAD Online apart. All align with the Core Value (open a `.std` and see the structure, anywhere, no STAAD.Pro).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Opens **raw `.std` directly, zero conversion** | Bentley's own mobile viewer (Structural Navigator) requires ISM → i-model conversion via Structural Synchronizer + often ProjectWide/cloud; SAP2000 Cloud Viewer requires a CSI Cloud account. STAAD Online opens the file an engineer already has on their phone — email attachment, Files app, AirDrop, drag onto browser | MEDIUM | The entire file-picker + parser pipeline IS this differentiator. "No conversion, no account, no cloud" is the marketing story that matches PROJECT.md's privacy positioning. |
| Native iOS/Android via Capacitor **plus** same-codebase web | Competitors are either desktop (STAAD.Pro), conversion-required mobile (Structural Navigator), or web-only (OpenBuilding, STAAD·VIEW). STAAD Online is installable on-device *and* works in any browser from the same build | MEDIUM | `npx cap sync` after web build; `base: './'` for WebView asset resolution. Web offline via PWA/service worker is progressive enhancement only — native shell is the offline guarantee (PITFALLS: never cache huge `.std` in SW). |
| Truly client-side — files never leave the device | Privacy as a selling point (PROJECT.md). OpenBuilding is also client-side; STAAD·VIEW is web-only; Structural Navigator is project-server oriented | LOW | Zero network calls with model data; no telemetry on model contents (PITFALLS security: "the privacy guarantee is the product"). |
| Mobile-first inspection UX (thumb-reachable bottom bar) | Field review is the use case (Structural Navigator, MiTek Mobile Viewer: walk the job, inspect framing, query members). OpenBuilding uses a mobile bottom bar (TradingView-style) — the pattern to match | MEDIUM | Touch-first orbit/zoom/pan (multitouch "arguably better than a mouse for inspecting 3D" — CalcSteel); tap-target sizing for dense models; panels as overlay sheets, not sidebars. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Editing / re-running analysis in the viewer | "While I'm here, let me fix that member" | Viewer scope creep; `.std` write-back is a second product (round-trip fidelity, unit/format drift). PROJECT.md explicitly out of scope | Read-only viewer + clear "viewer, not modeler" positioning. Capture "edit later" requests as backlog |
| Multiple format support (ETABS `.e2k`, SAP2000 `.s2k`, RFEM) | OpenBuilding markets this roadmap; one viewer for all files | Each format is a full parser + section-resolver + test corpus — a project on its own. Dilutes the STAAD milestone | Defer to v2; keep the parser format-isolated so a second format slots in (ARCHITECTURE pattern 1) |
| Cloud upload / account / share-link | "Send this model to a client" | Kills the privacy/offline value proposition and adds a backend (explicit out of scope) | Later phase can add optional share (with explicit user consent), not v1 |
| Rendering plates/solids (physical model geometry) | Real industrial models include plates/solids; engineers notice them missing | Physical-model data lives in sidecar files, not the analytical `.std`; plate meshing is a different rendering domain (surface tessellation, stress contours) | v1 = analytical members only; summary panel can note "N plates skipped" from parse warnings; results (.OUT) phase is the next milestone |
| Analysis results overlay (diagrams, deformed shape) | STAAD.Pro's post-processing is what engineers ultimately want | Results are NOT in `.std` — they live in `.OUT`/`.ANL` files (PROJECT.md). Would require a second file parser + result-state model | Deferred milestone: parse `.OUT` alongside `.std`, reuse the same renderer |
| `readData: true` base64 file reads | Simplest code path ("just give me the bytes") | OOM crash on industrial files (10–60+ MB); documented by Capawesome maintainers; `android:largeHeap` does not fix it | `fetch(path).then(r => r.text())` streaming reads; size guard at pick time |
| Save-as / export / re-parse round-trip | "Let me keep a copy in app storage" | Filesystem writes to app storage invite stale-URI bugs and storage-management UI; out of scope for v1 | v1: file is re-picked each session. Recent-files list = later phase (`@capacitor/filesystem`) |
| i-model import (Structural Navigator's format) | Interop with Bentley ecosystem | i-model is a completely different container format (ISM repository); conversion tooling is Bentley-proprietary workflow | Compete on "no conversion" instead |
| Real-time collaboration / shared cursors | Sounds modern | Backend + accounts + sync — triple anti-pattern for this product | Single-device review; client shows the model to a client on one screen |

## Feature Dependencies

```
[Open .std (picker/drag-drop)]
    └──requires──> [Parse .std (tolerant parser + unit state)]
                       └──requires──> [StaadModel (typed nodes/members/sections/supports/loads/groups/bounds)]
                                          ├──requires──> [Render 3D members (instanced layers)]
                                          │                 └──enhances──> [Camera auto-fit to bounds]
                                          ├──requires──> [Color by section/group/material]
                                          │                 └──requires──> [GROUP DEFINITION parsing]
                                          │                 └──requires──> [CONSTANTS/material parsing]
                                          ├──requires──> [Supports + loads as 3D markers/arrows]
                                          │                 └──requires──> [LOAD/LOADING parsing]
                                          │                 └──enhances──> [Load-case selector (per-case display)]
                                          ├──requires──> [Tap/click member to inspect]
                                          │                 └──requires──> [instanceId ↔ memberId mapping]
                                          └──requires──> [Model summary panel (counts/bounds/units)]

[Parse .std]
    └──enhances──> [Web Worker parse + progress]     (required for >~2 MB files / >~5k members)

[Render 3D members]
    └──requires──> [Section geometry resolution]
                       ├──PRIS YD/ZD → rectangular polygon (parse-time)
                       └──TABLE ST W14X90 → bundled section DB lookup (fallback flagged "approximate")

[Color by group]
    └──conflicts──> [Color by section]   (one active color mode at a time; switching = instanceColor buffer rewrite, not rebuild)

[Capacitor native shell]
    └──requires──> [Web app fully working in-browser first]
    └──requires──> [@capacitor/file-picker + platform/fileService abstraction]
    └──enhances──> [Offline guarantee]
```

### Dependency Notes

- **Open → Parse → Model → Render is strictly one-way** (ARCHITECTURE): parser never touches Three.js; renderer never parses. This ordering drives phase structure — parse/model before any rendering exists.
- **Color by group requires GROUP DEFINITION parsing** (added parser scope beyond the core commands); **color by material requires CONSTANTS parsing**. These are small additions to the same command-dispatch table, not new subsystems.
- **Loads visualization requires LOAD parsing AND a load-case selector** — arrows are meaningless without choosing which case to display (STAAD.Pro/Midas pattern: select case, show that case's arrows + magnitudes).
- **Supports + loads markers share one markers layer architecture** (instanced cones/arrows) — build together.
- **Summary panel and camera-fit both need parse-time bounds** — compute once in `finalize()`, consume twice.
- **Inspection needs the instance↔member map** that instanced rendering already builds — no extra pass; the info panel is a store lookup, not a second raycast.
- **Size exaggeration depends on section geometry resolution** — you can't exaggerate a section you don't know; TABLE-only members use the fallback shape regardless.

## MVP Definition

### Launch With (v1)

Mapped to the milestone's 8 target capabilities — these ARE the launch set:

- [ ] Open `.std` via file picker (native + web) and drag-drop (desktop) — the entry point; nothing else matters without it
- [ ] Tolerant parse of JOINT COORDINATES / MEMBER INCIDENCES / MEMBER PROPERTY / SUPPORTS / LOAD, with running unit state — the whole model; warnings collected, never crashes
- [ ] Procedural 3D render of members (instanced, per-section profile), camera auto-fit to bounds, default size exaggeration — the core value: "load a file and see the structure"
- [ ] Color by section (default), then group, then material — mode switching as buffer rewrite
- [ ] Supports + loads as instanced 3D markers/arrows, per-load-case selector, magnitude labels
- [ ] Tap/click member → info panel (section, group, length, node coordinates) with hover highlight
- [ ] Summary panel (units, counts, bounds, groups, warnings)
- [ ] Capacitor iOS/Android packaging, offline, `@capacitor/file-picker` native path

### Add After Validation (v1.x)

- [ ] Web Worker parse + staged progress for large files — trigger: first real 10+ MB industrial deck janks the UI (main-thread parse OK below ~2 MB / ~5k members)
- [ ] Persisted model restore (iOS WebView kill / context loss resilience) — trigger: real-device background/resume tests show white screen (PITFALLS P5/P7; can be built during the Capacitor phase)
- [ ] Recent-files list via `@capacitor/filesystem` — trigger: users reopen the same models repeatedly
- [ ] Show node/member number labels (toggle) — engineers use numbers for coordination; cheap label pass
- [ ] "Open with…" from iOS Files app / Android share sheet (`appUrlOpen` handling) — trigger: field users want to open email attachments directly
- [ ] Section DB for non-AISC tables (Eurocode, British, Indian) — trigger: regional users complain about approximate sections; extend the bundled DB pattern

### Future Consideration (v2+)

- [ ] `.OUT` results viewer (deformed shape, diagrams) — the natural next milestone; reuses parser pattern + renderer
- [ ] Plates/solids rendering (analytical plates from `.std` ELEMENT INCIDENCES SHELL) — needs surface tessellation layer
- [ ] Additional formats (`.e2k`, `.s2k`) — parser isolation makes this additive; OpenBuilding is the proof
- [ ] Optional cloud share with explicit consent — only after privacy-first positioning is established
- [ ] Mobile "walkthrough"/flyover mode — Structural Navigator parity; purely a camera-controls feature, cheap later

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Open `.std` (picker + drag-drop) | HIGH | LOW | P1 |
| Tolerant parse (units state, warnings) | HIGH | HIGH | P1 |
| Procedural 3D render (instanced, auto-fit, exaggeration) | HIGH | MEDIUM | P1 |
| Color by section / group / material | HIGH | LOW | P1 |
| Supports + loads markers + load-case selector | HIGH | MEDIUM | P1 |
| Tap/click member inspect (info panel) | HIGH | MEDIUM | P1 |
| Model summary panel | MEDIUM | LOW | P1 |
| Capacitor shell + offline | HIGH | MEDIUM | P1 |
| Web Worker parse + progress | MEDIUM | LOW | P2 (P1 if targeting 100k-member decks from day one) |
| Persisted model restore | HIGH | MEDIUM | P2 (during Capacitor phase) |
| Recent files | MEDIUM | LOW | P2 |
| Node/member number labels | MEDIUM | LOW | P2 |
| iOS "Open with…" / share sheet | MEDIUM | LOW | P2 |
| Non-AISC section DBs | MEDIUM | MEDIUM | P2 |
| `.OUT` results, plates, extra formats, share | HIGH | HIGH | P3 (defer) |

**Priority key:**
- P1: Must have for launch — the 8 milestone capabilities
- P2: Should have, add when possible — resilience + field-use niceties
- P3: Nice to have, future consideration — next milestones

## Competitor Feature Analysis

| Feature | STAAD.Pro (Bentley) | OpenBuilding (OSS web) | Structural Navigator (Bentley mobile) | SAP2000 Cloud Viewer (CSI) | STAAD Online (ours) |
|---------|---------------------|------------------------|---------------------------------------|----------------------------|---------------------|
| Opens raw `.std` directly | Yes (native) | Yes (web) | No — i-model conversion required | No — `.s2k` + CSI Cloud account | **Yes (native + web, zero conversion)** |
| Client-side / no account | No (licensed desktop) | Yes | No (project/server oriented) | No (cloud account) | **Yes — the privacy guarantee** |
| iOS/Android native app | No | No (web only, PWA-able) | Yes (i-model only) | Yes (cloud-dependent) | **Yes (Capacitor, offline)** |
| 3D member rendering w/ real sections | Yes (Full Sections/Sections Outline) | Yes (polygon-extruded, AISC db) | Yes (i-model geometry) | Yes | Yes (procedural instanced) |
| Color by section/group/material | Yes (Color By) | Section colors; group in info panel | Yes (color-code by property) | Yes | Yes (3 modes, buffer-switch) |
| Supports + load visualization | Yes (icons, load arrows + values, load-case selection) | Supports shown; loads not parsed | Yes (i-model data) | Yes (load cases) | Yes (markers + arrows + case selector) |
| Tap/click member inspect | Yes (beam spec/labels) | Yes (section, dims, nodes, group) | Yes (query all property values) | Yes | Yes (section, group, length, node coords) |
| Model summary/counts | Yes (Info tab: counts, file info) | Partial (info panel per member) | Yes | Partial | Yes (counts, bounds, units, groups, warnings) |
| Size exaggeration for thin members | Yes (3D sections display) | Default render at scale | i-model native | — | **Default ~10–20× with slider** |
| Mobile field workflow (view + query, no edit) | No | Partial (responsive web) | Yes | Partial (cloud) | **Yes — mobile-first** |

## Sources

- Bentley STAAD.Pro Technical Reference — TR.1.2 Command Formats, TR.2 Problem Initiation, TR.11 Joint Coordinates, TR.12 Member Incidences (+REPEAT generation), TR.20 Member Property, TR.16.1 Group Definition, TR.32 Joint Load, TR.32.x Member Load; Tutorials T.1–T.3 (full `.std` command-file walkthroughs); GS. Limits on Models (400k joints / 500k members / 10,101 cases; ~20k practical guidance); STAAD.Pro User Manual — Diagrams dialog, View ribbon, Info tab, "Viewing the model in 3D" — https://docs.bentley.com/LiveContent/web/STAAD.Pro%20Help-v2024/ — HIGH (official vendor docs; format grammar, viewer display options, model limits)
- DannCarlo/OpenBuilding — README + repo (browser `.std` viewer: polygon-extruded sections, AISC db, click-to-inspect, view modes, responsive mobile bottom bar, client-side, format-roadmap) — https://github.com/DannCarlo/OpenBuilding — HIGH (direct reference implementation, MIT)
- Bentley Structural Navigator — App Store listing + Engineering.com article (mobile 3D review: navigate, color-code, filter, query members, measure; i-model conversion requirement; site-visit workflow) — https://apps.apple.com/us/app/structural-navigator/id479978190 + https://www.engineering.com/see-building-structural-models-on-an-ipad-for-free/ — MEDIUM-HIGH
- STAAD·VIEW (Iwal Islamuddin, LinkedIn 2026-07) — browser `.std` viewer, installable PWA, inspect members/plates/supports/loads/materials — MEDIUM (independent confirmation of the viewer-market pattern)
- SAP2000 Cloud Viewer — CNET listing (cloud-account requirement; view models + results on phone/tablet; field decision-making) — MEDIUM
- SCIA Engineer Help — "Overview of view parameters" (color by layer/material/cross-section/structural type; draw cross-section mid-member; support labels; load display by action/force type) — MEDIUM (competitor display-options convention)
- Midas Gen Manual — Display options (section shape, support constrained DOF, load-case selection + load values, member direction, display by group) — MEDIUM
- Oasys GSA — Model Data Display Options (restraints/supports labels, section descriptions, member axes) — MEDIUM
- CalcSteel blog — "Can I run CalcSteel on a mobile phone or tablet?" (mobile = viewing/reviewing/light edits; multitouch inspection "arguably better than a mouse"; phone = field companion) — MEDIUM
- Capawesome File Picker docs + npm + CHANGELOG — `pickFiles()` metadata/path/blob semantics, `readData:true` OOM warning, no runtime permissions, Safari first-call fix (PR #111), Mac Catalyst entitlement — https://capawesome.io/docs/sdks/capacitor/file-picker/ — HIGH (official plugin docs)
- capawesome-team/skills file-handling.md — picker + `convertFileSrc()` + fetch-blob pattern for large files — HIGH
- Stack Overflow #77436539 — capacitor file-picker blob vs base64 on native mobile (readData anti-pattern confirmation) — LOW-MEDIUM
- Sibling research: STACK.md (React 19 + R3F + drei + three 0.185 + Capacitor 8.5 + Zustand; custom parser; OpenBuilding as reference), ARCHITECTURE.md (one-way parse→model→render pipeline; instanced layers; FileService platform abstraction; section resolver), PITFALLS.md (unit-state machine P1, tolerant tokenizer P2, section-syntax drift P3, instancing P4, iOS context loss P5, base64 OOM P6, WebView kill P7, float32 rebasing P8; UX pitfalls incl. camera framing, size exaggeration, units labeling, load-arrow direction conventions)
- Research digests cached via `gsd-tools research-store` (5 keys: `fd4845…`, `783f2c…`, `9c7c01…`, `6d59cb…`, `fecbf6…`), all MEDIUM confidence (websearch sources cross-checked against official docs + reference implementation)

---
*Feature research for: STAAD Online — Capacitor hybrid .std analytical-model viewer*
*Researched: 2026-08-15*