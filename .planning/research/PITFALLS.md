# Pitfalls Research

**Domain:** Browser/mobile 3D viewer for Bentley STAAD `.std` text input decks (Capacitor hybrid app, three.js-style WebGL rendering, fully on-device)
**Researched:** 2026-08-15
**Confidence:** MEDIUM (HIGH for format-grammar and Capacitor facts sourced from official Bentley/Capacitor docs; MEDIUM for rendering/precision guidance from corroborated community sources; LOW for anything marked ⚠)

## Critical Pitfalls

Mistakes that cause wrong geometry, crashes, or rewrites.

---

### Pitfall 1: Treating units as a file-global constant

**What goes wrong:**
Members render at the wrong physical size — a 300 ft tower drawn with 14-inch-deep members rendered 12× too thick, or a metric model rendered at 3.28× scale — or the summary panel reports lengths in the wrong unit. Users immediately lose trust; a structural viewer that lies about dimensions is useless.

**Why it happens:**
The `UNIT` command is **stateful, not global**. It can appear any number of times and every value read after it is interpreted in the *most recent* unit declaration (Bentley TR.3: "All data is assumed to be in the most recent unit specification preceding that data"). When `UNIT` is absent the default is **FEET + KIPS**. Files routinely mix units: `JOINT COORDINATES` in feet, then `UNIT INCH` before `MEMBER PROPERTY`, so prismatic section depths (`PRIS YD ZD`) are in *inches* while node coordinates are in *feet*. A parser that normalizes coordinates to meters but reads section dimensions without consulting the unit state at that point in the file produces nonsense proportions.

**How to avoid:**
- Make the parser track a running unit state (length + force) that changes as `UNIT` lines are consumed; apply it to every numeric token that carries physical dimension.
- Store the model in one canonical internal unit (meters is standard for three.js) and convert at parse time using Bentley's factor table (TR.3): IN=0.0254, FT/FE=0.3048, ME=1, DM=0.1, CM=0.01, MM=0.001, KM=1000 (meters as base); force units (KIP/PO/KN/DN/NE/MN/MT/KG) matter only for load magnitude display, not geometry.
- Accept unit-token abbreviations and variants: `IN`/`INCH`/`INCHES`, `FT`/`FEET`/`FE`, `ME`/`METER`, `MM`/`MMS` (the official tutorial writes `UNIT MMS`), etc.
- Show the model's *declared* unit context in the summary panel and in the inspector ("member length 3.05 m"), and offer a display-unit toggle — never assume.

**Warning signs:**
- A "known-correct" sample model from a colleague renders with obviously wrong proportions; a model with `UNIT INCH` before `MEMBER PROPERTY` renders with members 12× too big/small.
- First real-world test file (not the hand-written demo) shows wrong scale.

**Phase to address:**
Phase 1 (Parser & Model Loading) — the unit-state machine is a core parser design decision; retrofitting later means re-validating every sample.

---

### Pitfall 2: Parsing `.std` as naive line-by-line text

**What goes wrong:**
Valid STAAD files fail to parse, or parse into garbage: joints get swallowed, properties attach to the wrong members, and the "tolerant parser" story dies on the second real file from a different office.

**Why it happens:**
STAAD's grammar is free-format with several structural features that break line-based parsers (Bentley TR.1.2):
- **Multiple statements per line** separated by `;` (`1 0 0 0 ; 2 0 3.5 0 ; 3 6 3.5 0`).
- **Line continuation**: lists continue to the next line when the line ends with a blank + hyphen (`1 TO 7 -`).
- **Comments**: any line whose first non-blank character is `*` is ignored — but only whole lines; a `*` mid-line is data.
- **Command abbreviations**: only the underlined prefix is required (`MEMB` for `MEMBER`, `UNI` for `UNI`...); older hand-written decks are full of abbreviations.
- **Tokens are space-separated, never comma-separated**, and limited to 24 characters.
- **List syntax**: `1 TO 5`, `1 TO 9 BY 2`, `ALL`, `X`/`Y`/`Z` (all members parallel to an axis); `JOINT COORDINATES` for a 2D `STAAD PLANE` model omits the Z coordinate entirely (defaults to 0).
- Optional trailing tokens: `MEMBER INCIDENCE` rows may carry a `BETA` angle; member rows can have extra specifiers — unknown trailing tokens must be tolerated, not fatal.

A split-on-`\n` parser that treats each line as one record will mis-tokenize semicolon files, drop continuation lines, and crash on `*` comments and 24-char abbreviations.

**How to avoid:**
- Build a proper tokenizer + command-state machine: first normalize line endings (accept CRLF/LF — files travel between Windows workstations and the web), strip `*`-comment lines, split on `;`, then join continuation lines ending in `" -"` before tokenizing.
- Treat every command as a state transition with a defined set of known records; for any *unrecognized* command, skip its records defensively (STAAD has dozens of commands a viewer doesn't need: `CONSTANTS`, `PERFORM ANALYSIS`, `LOAD COMBINATION`, `PRINT`, `PAGE`...) instead of aborting.
- Number parsing must accept `1.`, `0.`, `1E3`, `1.0E-03` (STAAD writes trailing-dot floats).
- Keep a golden-file corpus: at minimum 1 plane-frame file (2 coords/joint), 1 space file, 1 file with semicolons + continuations + comments + abbreviations, 1 hand-typed old-school file, 1 STAAD.Pro-GUI-generated modern file. Parse all four or the parser isn't done.

**Warning signs:**
- The demo file parses but any file generated by STAAD.Pro's GUI (which emits `;`-packed lines) mis-parses.
- Test fixture suite covers only hand-written single-line files.

**Phase to address:**
Phase 1 (Parser & Model Loading).

---

### Pitfall 3: Hard-coding one generation of `MEMBER PROPERTY` / section syntax

**What goes wrong:**
Sections silently come out wrong or missing: modern files (STAAD.Pro v20+ / v2024-v2025) show no geometry for members, or the app treats the section *name* as if it encoded the dimensions and renders nonsense shapes.

**Why it happens:**
Member property syntax has drifted across versions, and the name does not encode geometry:
- Legacy: `MEMBER PROPERTY AMERICAN` / `MEMBER PROPERTY STEEL` + `1 3 TABLE ST W12X35` (built-in tables).
- Modern: `MEMBER PROPERTY 'US (AISC 2023).db3'` + `1 4 TABLE 'W' ST 'W14X90' WP 1 TH 0.183` — the database *filename* and table names are single-quoted, and the database name changes across AISC editions; section availability and even sizes differ between editions.
- Prismatic (concrete/custom): `member-list PRIS YD 300 ZD 275` — **YD alone means circular, YD+ZD means rectangular**; `PIPE`, `TUBE YD ZD TD`, `USER` (full explicit properties), `TAPERED` for haunched members, `MEMBER PROPERTIES SJIJOIST` for joists.
- A `TABLE`-referenced section (`W14X90`) is just a lookup key into an external database that ships with STAAD.Pro — **the `.std` does not contain its geometry**.

**How to avoid:**
- Parse property *syntax* permissively: handle quoted `'...'` tokens, `TABLE <name> ST/TC/...`, `PRIS/YD/ZD/TD`, `PIPE`, `USER`, `TAPERED`, and treat any unknown specifier as non-fatal.
- Distinguish "geometry known" (prismatic `PRIS`/`PIPE`/`TUBE` with dimensions, `USER`) from "name only" (`TABLE`): for name-only members, render with a sane fallback (thin box/cylinder from a bundled compact section database, or a fixed default cross-section) and mark them in the inspector as "section from table 'W14X90' — dimensions approximate". Never claim an unverifiable section size as exact.
- If bundling a section table, be explicit about which edition (e.g., AISC 14th vs 15th) and handle names not found gracefully (degrade to default, don't crash).
- Store the *raw* property line per member so later phases can improve rendering without re-parsing.

**Warning signs:**
- Only legacy `TABLE ST` syntax handled; a modern file with quoted `'US (AISC 2023).db3'` produces no members or a parser abort.
- Section dimensions are inferred from the name string (e.g., parsing "W14X90" as 14×90) — wrong for HSS, channels, C/T shapes.

**Phase to address:**
Phase 1 (Parser & Model Loading) with a Phase 2 (Rendering) decision on the section-database fallback.

---

### Pitfall 4: One `THREE.Mesh` per member (draw-call explosion)

**What goes wrong:**
Small demo models (200 members) run fine; real industrial models (5k–100k members) crawl at 2–10 FPS or the app freezes on load, especially on phones. `renderer.info.render.calls` shows a number roughly equal to the member count.

**Why it happens:**
Every `Mesh` costs at least one draw call per frame; the bottleneck is CPU→GPU command submission, not triangle count (three.js manual; forum consensus: ~**2M triangles** is a healthy desktop ceiling, **~200k** on low-end mobile, but **<100 draw calls mobile / <500 desktop** is the real budget). Creating a `BoxGeometry`+`Material` per member also multiplies GPU buffer memory and shader compiles. The classic CAD-viewer mistake is exactly this (RapidMade: "representing each component as a unique THREE.Mesh is the most common architectural error").

**How to avoid:**
- Render all straight members as **one shared geometry** (unit-length box or cylinder along +Y), placed via **`InstancedMesh`** — one draw call for the whole model, per-instance matrix from node coordinates, per-instance color via `instanceColor` for color-by-section/group/material.
- Keep the **render model decoupled from the data model**: a member is a row in the parsed model (nodes, section, group, length); the renderer builds/rebuilds instances from it (needed anyway when recoloring).
- Selection: raycast the `InstancedMesh` and read `instanceId` — no per-member meshes needed.
- If heterogeneous geometry is ever required (physical model later), use `BatchedMesh` (r164+; note Firefox lacks the multi-draw extension and falls back to slower path), not per-member meshes.
- Budget check in CI/dev: assert `renderer.info.render.calls < 100` on a 10k-member fixture.

**Warning signs:**
- Draw-call count ≈ member count in the performance panel.
- FPS collapses at 1–2k members on a mid-range phone.
- Recoloring by section rebuilds the entire scene (should be a per-instance attribute update).

**Phase to address:**
Phase 2 (3D Rendering & Performance) — decided at architecture time; retrofitting instancing after "it works on my machine" demos is a rewrite.

---

### Pitfall 5: Ignoring iOS WebGL context loss and memory limits

**What goes wrong:**
On iPhone/iPad, backgrounding the app (or locking the screen) and returning shows a frozen/black canvas or the whole tab reloads; after several such cycles WebGL is dead until the user clears Safari's cache or reboots. WebGL apps on iOS are the #1 crash source reported across engines (three.js, Babylon, PlayCanvas, Flutter-web).

**Why it happens:**
- iOS Safari caps a page at **~2–3 GB total memory including GPU memory** (Apple engineer, webgl-dev-list); exceeding it kills the GPU process and reloads the tab.
- iOS 16.7/17.x shipped WebGL context-loss bugs triggered by backgrounding/lock (Apple fixed the main case in 17.1, but memory-pressure losses persist on many devices).
- WebGL1 buffers are lost with the context; a render loop that keeps calling `render()` against a dead context pegs the CPU (known three.js trap: "without webglcontextlost handling the tab maxes a CPU at 100%").
- Mobile fill-rate: default `pixelRatio` of 3 on modern phones multiplies fragment work ~9×; MSAA and shadows amplify it further.

**How to avoid:**
- Handle `webglcontextlost` (call `event.preventDefault()`, stop the animation loop, show a non-blocking notice) and `webglcontextrestored` (rebuild GPU resources — in practice: rebuild the scene or reload the parsed model from persisted data; the pragmatic pattern many production apps use is reload-on-loss).
- **Persist the parsed model** (see Pitfall 7) so restore = re-render, not re-pick.
- Pause the render loop on `visibilitychange`/`pagehide`/`appStateChange` (Capacitor App plugin); never render while hidden.
- Cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`; disable shadows and MSAA on the members layer (member boxes don't need them).
- Keep memory tight: one shared geometry, one material, dispose old geometry/material when loading a new model (`geometry.dispose()`, `material.dispose()`), never accumulate canvases/textures.
- Budget: `renderer.info.render.calls < 100`, triangles ≤ ~200–500k on mobile.

**Warning signs:**
- "WebGL: context lost" in the console after backgrounding the app on a test device.
- Tab reloads when loading larger models.
- `renderer.info.memory.geometries` grows across model loads (leak).

**Phase to address:**
Phase 2 (3D Rendering & Performance); restore/persist plumbing shared with Phase 3 (Native Packaging).

---

### Pitfall 6: Reading picked files as Base64 (OOM on large `.std`)

**What goes wrong:**
The app crashes with out-of-memory on Android, or the WebView dies, when the user picks a real industrial `.std` (10–60+ MB is normal for big plants). Even moderate files jank the UI because the whole file is stuffed into the JS heap as a 33%-inflated string.

**Why it happens:**
`readData: true` / `Filesystem.readFile()` (base64) loads the entire file into the WebView's JS heap as a Base64 string (~1.33× the file size, plus the decoded copy — 2.3×+ peak). The WebView heap is limited (Android OOM at ~60 MB files is a reported issue; `android:largeHeap="true"` does **not** fix it — Capawesome maintainers closed the issue saying size limits vary per device and base64 is simply the wrong path).

**How to avoid:**
- Use a picker plugin (`@capawesome/capacitor-file-picker`) **with `readData` disabled** (default); on native it returns a `path` (web-accessible via `Capacitor.convertFileSrc()`), on web it returns a `Blob`.
- Read as text the memory-sane way: native → `fetch(path).then(r => r.text())` (streams with disk backing); web → `blob.text()` or `FileReader` on the `File`.
- **Copy picked files into app storage immediately after picking** — on Android the returned `content://` URI grant is temporary and can expire; later reads of a stale URI fail with confusing errors (see Integration Gotchas).
- Guard file size up front: refuse > ~100 MB with a clear message, show parse progress for large files.
- For very large files, parse in a **Web Worker** so tokenizing 1M+ lines doesn't freeze the UI thread, and stream the parse from a `Blob` reader where feasible.

**Warning signs:**
- Crash/OOM reproduces with `readData: true` on a 30 MB file.
- UI freezes for seconds on file open (sync main-thread parse).
- Stale-URI errors when reopening a model after the picker session ended.

**Phase to address:**
Phase 3 (Native Packaging & File Handling) — but the "parse in a worker / progress" decision belongs in Phase 1's architecture.

---

### Pitfall 7: Assuming the WebView survives backgrounding (WKWebView process death)

**What goes wrong:**
User opens a 50k-member model, backgrounds the app for a while (or the OS reclaims memory), returns → white screen, model gone, back to the file picker. Reported widely on Capacitor iOS (issues #7793, #7097, #6680) and it also affects Android under pressure.

**Why it happens:**
iOS terminates the WKWebView *WebContent process* under memory pressure while the app is backgrounded (any WebGL-heavy app makes this likely — Pitfall 5's memory budget is the same root cause). On resume, `webViewWebContentProcessDidTerminate` fires, Capacitor reloads the WebView, and **all in-memory JS state (the parsed model!) is gone**. Plugin native→JS listeners can also be silently dropped after a WebContent kill (Capacitor PR #7905 fixed the listener reset, but state loss remains).

**How to avoid:**
- Treat the WebView as **ephemeral**: after parsing, persist the normalized model (JSON) to `Directory.Data`/`Directory.Cache` (not `Library`/iCloud — models can be 100s of MB) with a small metadata record (file name, timestamp).
- On app start, detect a previously-open model and offer "Restore last model" instead of a blank screen; restore must be fast (binary/typed-array serialization, not re-parse of the text).
- Keep the WebView's own memory footprint low (Pitfall 5 measures) to reduce the chance of being killed.
- Rebuild render state idempotently: the app must be able to go "parsed model → scene" at any time, because iOS will make you do it at arbitrary moments.

**Warning signs:**
- White screen after backgrounding/resume on a real device (simulator rarely reproduces).
- "WebProcessProxy::processDidTerminate" in the iOS console logs.
- Restoring requires the user to re-pick the file from the picker.

**Phase to address:**
Phase 3 (Native Packaging & Offline) with Phase 2 restore logic.

---

### Pitfall 8: Rendering engineering coordinates as-is (float32 precision collapse)

**What goes wrong:**
Models positioned on survey/civil coordinates (thousands of meters to 1e6+ from origin, common for plants/roads/pipelines) jitter and shimmer as the camera moves, members show gaps at their ends, thin elements z-fight, and geometry wobbles when zooming — the classic "spatial jitter" reported by Speckle, Cesium-style apps, and countless three.js threads.

**Why it happens:**
The GPU is float32. Once coordinates enter a `Float32Array` the precision is **irreversibly lost** (ULP at 1e6 is ~0.06, at 1e7 ~0.5, at 1e8 ~8 — worse than member dimensions). Three.js keeps matrices float32 on upload; the camera at large distance makes every projection unstable. Changing camera near/far or adding a logarithmic depth buffer does *not* fix it (multiple threads confirm).

**How to avoid:**
- **Rebase the model**: compute the model's bounding box at parse time and subtract the centroid from all node coordinates before building any `BufferGeometry` (store the origin offset for the summary panel). This keeps every coordinate small and typically solves 99% of civil models (ranges up to ~1e5).
- If coordinates *span* >~1e5 units (very large models), add **camera-relative rendering (RTE)**: keep the camera near the origin and feed the GPU `(objectWorld - cameraWorld)` computed in double precision, or split translations out of the model matrix (proven recipes: Speckle, Re:Earth, mlightcad). Do this as an explicit Phase 2 spike, not a firefight.
- Normalize once at parse time, never re-apply raw origin offsets in the scene graph.
- Set the camera `near`/`far` from the *rebased* bounds, and keep the far plane tight; consider `logarithmicDepthBuffer` only for extreme near/far ratios.

**Warning signs:**
- Members visibly "breathe"/jitter when orbiting a model whose coordinates are in the 1e5+ range.
- Gaps appear between a member's end and its node as you zoom in.
- It renders fine in a screenshot but wobbles during live camera motion.

**Phase to address:**
Phase 2 (3D Rendering & Performance) — origin rebasing must be part of the render pipeline from day one; it is not fixable by post-processing later.

---
## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code one STAAD version's grammar (usually the hand-written demo file) | Fast first parse | Every real file from a different version/office breaks; parser is "tolerant" in name only | Never — the tolerance requirement is a project constraint (PROJECT.md) |
| Regex-based line parser | Quick to write | Breaks on `;`-packed lines, continuations, abbreviations, quoted tokens; catastrophic backtracking on malicious lines is a DoS vector | Prototypes only; replace with tokenizer before Phase 1 ships |
| Assume FEET units (the default) | One less code path | All metric and mixed-unit files render wrong size; unit-state refactor touches every numeric read | Never |
| One `THREE.Mesh` per member | Simplest first render | Draw-call wall at ~2k members on mobile; instancing retrofit is a rewrite of the render layer | Demo-only; instancing must be the Phase 2 architecture |
| Parse on the main thread synchronously | Simpler async story | UI freezes for seconds on 10+ MB files; "open file" feels broken | Only for files < ~2 MB; worker + progress is the plan |
| Don't persist the parsed model | Nothing to store | Every WebView kill / context loss loses the user's work; recovery = re-pick + re-parse | Never — persistence is the cheap half of the resilience story |
| Reuse the same `InstancedMesh` instance colors but rebuild instance matrix array on every recolor | One code path | Rebuild cost scales with member count; recolor-by-section on 50k members janks | Acceptable < 10k members; prefer per-instance attribute update otherwise |
| Report all lengths in the model's raw units | No conversion code | Engineers can't compare against their own unit preference; units drift with mixed-unit files | Only while unit-state work is unfinished; display-unit toggle is Phase 4 |

## Integration Gotchas

Common mistakes when connecting the web layer to native/platform services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Capacitor file picker (`@capawesome/capacitor-file-picker`) | Enabling `readData: true` to get file content | Keep `readData: false`; native returns a path, web returns a Blob; read via `fetch(path)` / `blob.text()` |
| Android `content://` URIs | Storing the picked URI and reading it later (after the picker session/grants end) | Copy the file into app storage (`Filesystem.copy` — supported for `content://` since v7.1.0) immediately after picking; read the copy |
| Android scoped storage (Android 11+) | Reading files from `Directory.Documents`/`ExternalStorage` that the app didn't create | Use the file picker — the OS grants per-file access; `Filesystem` cannot read other apps' files anymore |
| iOS "Open in…" / Files.app | Only supporting in-app picker; user taps the app from Files.app and nothing opens | Declare the `std` document type in `Info.plist`; set `UIFileSharingEnabled`/`LSSupportsOpeningDocumentsInPlace`; handle `appUrlOpen` (Capacitor App plugin) and copy the incoming file |
| iOS WKWebView background kill | Relying on in-memory state surviving resume | Persist parsed model to `Directory.Data`; on startup detect restore; never depend on listeners surviving a WebContent kill (Capacitor PR #7905) |
| Web offline (PWA mode) | Assuming service-worker caching behaves like the native shell | Native shell bundles assets (offline free). Web: version your SW cache, never cache huge `.std` files in SW (Safari evicts under pressure), treat SW as progressive enhancement only |
| iOS file temp copies | Leaving picker temp copies around (PHPicker materializes a copy per pick) | Clean up `Cache`/tmp after parsing; users pick repeatedly and temp files accumulate toward the 2–3 GB page budget |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One mesh per member | `renderer.info.render.calls` ≈ member count; FPS tanks | `InstancedMesh` (1 draw call for all members); `BatchedMesh` only if heterogeneous geometry needed | ~2k members on mid-range phone; ~5k on desktop |
| No per-instance frustum culling awareness | Whole instanced model drawn even when camera is inside the structure | Keep one instanced draw for v1 (whole-model culling is fine for single-building views); revisit with spatial buckets/`BatchedMesh` for sprawling industrial layouts | Huge spread-out plants (100k+ members, wide extent) where most instances are behind the camera |
| Per-frame matrix updates on instanced data | CPU frame time spikes when recoloring/animating | Compute instance matrices once at build; only touch `instanceColor`/`setMatrixAt` on change + `instanceMatrix.needsUpdate` | Updating 10k+ matrices per frame |
| Render loop running always | Battery drain, 100% CPU on a dead/lost context | Render on demand (re-render on camera change); pause on `visibilitychange`/`appStateChange`; stop loop on `webglcontextlost` | Any idle app session; iOS context-loss scenarios |
| Default `pixelRatio` (up to 3) | Fill-rate overload, thermal throttling on phones | Cap at 2 (or 1.5 on low-end); disable MSAA on the member layer | Modern phones at default DPR with large models |
| Shadows / standard materials on every member | Massive extra draw passes and shader cost for boxes that don't need it | `MeshBasicMaterial`/flat lambert-style shading, no shadows for member geometry | ~1k+ members with `MeshStandardMaterial` + shadows |
| Loading a new model without disposing old GPU resources | Memory grows across loads → iOS tab reload (2–3 GB cap) | `geometry.dispose()`, `material.dispose()`, drop references; single shared geometry/material | 2–3 model loads on iOS with 50k-member models |
| Synchronous parse of large files | UI freeze on open; ANR on Android | Web Worker + progress; stream from blob | > ~2 MB text; hard freeze > ~5 MB |
| Raw coordinates fed to GPU | Jitter/z-fighting/gaps (float32) | Rebase to model centroid at parse; RTE shader if spans > ~1e5 units | Coordinates > ~1e5 from origin (survey-placed models) |

## Security Mistakes

Domain-specific issues beyond general web security. (No backend, no uploads — the attack surface is the parser and the WebView, which is the point.)

| Mistake | Risk | Prevention |
|---------|------|------------|
| Regex-heavy tokenizer on untrusted input | ReDoS: one malicious `.std` line freezes the app (and the tab) | Hand-written state machine tokenizer; avoid nested-quantifier regex on file content |
| No file-size guard before parsing | Memory-exhaustion DoS: 500 MB file in the JS heap kills the app/tab | Size check at pick time; refuse with a clear message; stream parse |
| Recursive/explosive expansions (nested list ranges like `1 TO 999999999 BY 1`) | Allocating millions of member records from a tiny file (zip-bomb-style) | Cap expansions, validate member/joint indices against model size, bound allocations; parse counts *after* `JOINT COORDINATES` where possible |
| Object-key maps keyed by member/joint numbers | `__proto__`/prototype-pollution style bugs when numbers parse into keys | Use `Map<number, T>` / typed arrays indexed by id; never plain objects for entity lookups |
| Serving/loading remote content in the WebView | XSS surface from any future CDN/CSP misconfiguration | Ship all assets locally; strict CSP; no `eval`/`new Function` in the parser or renderer |
| Exfiltrating model data | **The privacy guarantee is the product** — any code path that uploads or logs model contents breaks the value proposition | No network calls with model data; keep analytics/telemetry model-content-free; document in the milestone UAT |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Camera starts at origin / arbitrary angle | User sees empty space or a fragment and thinks the file failed to load | Frame the model from the (rebased) bounding box on load: position camera + controls target, then animate orbit in |
| Real section sizes at full scale | A 14-inch-deep column in a 300 ft frame is a sub-pixel sliver when zoomed out; users can't distinguish members | Render with a **size-exaggeration factor** (STAAD.Pro itself exaggerates member sizes by default); default ~10–20× for thin sections, expose a slider; keep true-size option |
| Wrong up-axis / handedness | Structure appears mirrored or lying on its side; engineers notice instantly | STAAD global **Y is up** (gravity −Y) — same as three.js, no flip needed; but verify with a known model and document the convention; handle 2D plane frames (Z=0) gracefully |
| Tap-target confusion on dense models | Can't select the member they want when thousands overlap on screen | Raycast against the instanced mesh (instanceId) and pick nearest; enlarge hit tolerance; show hover/picked highlight (instance color override) |
| Units shown raw or assumed | Summary "bounds 304.8 × 457.2 × 30.5" with no unit label is meaningless | Always label units; derive from the file's unit state; provide display-unit toggle (Phase 4) |
| No feedback on big-model load | 10 MB parse + 50k instance build with a spinner-less dead UI feels like a crash | Progress bar + worker parse; "parsing joints… members… building scene…" stages; cancelable |
| Blank/black frames after resize or chrome collapse (iOS) | Flicker and black flashes when the browser chrome shows/hides | Re-render immediately after resize (the classic Safari resize-bug fix: call `render()` in the resize handler), debounce, and re-check canvas size on `visualViewport`/orientation change |
| No empty/error state for unparseable files | "File failed" with no explanation kills trust in a niche tool | Report the line/command that failed ("unexpected token near line 1,234 in `MEMBER PROPERTY`") and suggest that the file may be from an unsupported STAAD feature/version |
| Load arrows with unexplained direction conventions | Arrows point the wrong way; engineers distrust the model | `MEMBER LOAD UNI GY -10` uses **local axes by default** unless `G` prefix (global); render arrows consistently and label magnitude + direction reference in the inspector |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Parser:** Handles semicolon-packed lines, `" -"` continuations, `*` comments, and abbreviations — verify with a STAAD.Pro-GUI-generated file, not just the hand-written demo.
- [ ] **Units:** Handles mid-file `UNIT` switches and the FEET/KIPS default — verify with a mixed-unit file (coords in FT, properties in INCH) and check rendered proportions against STAAD.Pro.
- [ ] **2D models:** `STAAD PLANE` files with two coordinates per joint parse with Z defaulted to 0 — verify a plane-frame fixture renders flat, not skewed.
- [ ] **Section fallback:** `TABLE ST W14X90` and quoted `TABLE 'W' ST 'W14X90'` both render with *some* geometry and are flagged "approximate" in the inspector when no DB matches.
- [ ] **Color by section/group/material:** Changes are per-instance attribute updates, not a scene rebuild — verify no stutter on a 20k-member model.
- [ ] **Context loss:** Simulate with `renderer.forceContextLoss()` on a real iPhone/iPad — verify the app recovers (or cleanly reloads) instead of freezing.
- [ ] **Background/resume:** Background the app 10 minutes with a large model open on a real device — verify the model restores from persisted state, not a white screen.
- [ ] **Android content://:** Re-open a picked model after a full app restart — verify it reads from the copied file, not the dead URI.
- [ ] **Precision:** Open a survey-coordinate model (coords ~1e6) — verify no jitter and that rebasing is applied.
- [ ] **Large model:** Open a 50k-member fixture on a mid-range Android phone — verify `render.calls < 100` and usable FPS.
- [ ] **Load direction conventions:** Verify `GY` (global) vs local-axis load arrows point correctly in a known model.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WebGL context lost (iOS backgrounding) | MEDIUM | Pause loop on `webglcontextlost` (preventDefault); on restore, rebuild GPU resources — in practice reload the persisted model → rebuild scene → re-frame camera. If restore never fires, offer "Reload model" |
| WKWebView WebContent process killed (white screen) | MEDIUM | Persisted model + startup restore screen ("Restore last model?"); rebuild scene idempotently. This is designed-in (Pitfall 7), so recovery is automatic |
| OOM tab reload on iOS (2–3 GB cap) | HIGH | Reduce footprint (single geometry/material, no base64, pixelRatio cap, dispose on load); reload restores last model from storage; consider telling the user the model is too large for this device |
| Wrong units parsed (unit-state bug) | HIGH (data wrong) | Re-parse with corrected unit handling — this is why the golden-file corpus exists; add the failing file to the suite before fixing |
| Spatial jitter on survey coordinates | LOW–MEDIUM | Rebase centroid at parse (cheap); if spans are huge, implement camera-relative (RTE) shader path as a Phase 2 follow-up |
| Corrupt/unparseable user file | LOW | Report the failing line/command with context; never crash; suggest the file may use an unsupported feature (e.g., physical-model data) |
| Stale Android content:// URI | LOW | Copy-on-pick means this never happens; if it does, re-pick from picker with an explanatory message |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Units treated as file-global (P1) | Phase 1 — Parser & Model Loading | Golden-file corpus includes a mixed-unit file; rendered proportions match STAAD.Pro |
| Naive line parsing (P2) | Phase 1 — Parser & Model Loading | Corpus of 4+ real file shapes parses identically to a reference |
| Member-property version drift (P3) | Phase 1 — Parser & Model Loading (+ Phase 2 fallback rendering) | Modern quoted-DB and legacy `TABLE ST` files both render; unknown sections flagged "approximate" |
| Draw-call explosion (P4) | Phase 2 — 3D Rendering & Performance | `render.calls < 100` on a 10k-member fixture; instancing is the architecture, not an optimization |
| iOS context loss / memory limits (P5) | Phase 2 — 3D Rendering & Performance (+ Phase 3 persistence) | `forceContextLoss()` recovery test on device; memory flat across 3 model loads |
| Base64 file reads (P6) | Phase 3 — Native Packaging & File Handling | 30 MB file opens without OOM on Android; worker parse with progress on the main thread |
| WebView process death (P7) | Phase 3 — Native Packaging & Offline | Background/resume test on real iOS device restores the model |
| Float32 precision / jitter (P8) | Phase 2 — 3D Rendering & Performance | Survey-coordinate fixture shows no jitter; origin rebase unit-tested at parse time |
| Security (ReDoS, size guards, Map lookups) | Phase 1 — Parser & Model Loading | Fuzz corpus of malformed files parses without freeze; size guard test |
| UX (framing, exaggeration, units display) | Phase 4 — Interaction & UX Polish | Manual UAT: engineer opens own model, identifies members, reads correct lengths |

## Sources

- Bentley STAAD.Pro Technical Reference — TR.3 Unit Specification, TR.1.2 Command Formats, TR.20 Member Property Specification, Tutorials T.1/T.2, Editor "I. STAAD Input Files" (official docs; format grammar, units, comments, continuation rules) — https://docs.bentley.com/LiveContent/web/STAAD.Pro%20Help-v2024/en/topics/Commands_TechRef/ (HIGH for stated syntax facts)
- three.js Manual — "Optimize Lots of Objects" (official; merging/instancing guidance) — https://threejs.org/manual/en/optimize-lots-of-objects.html (MEDIUM-HIGH)
- MasterAllArts — "Performance: Instancing, LOD, Draw Calls" (draw-call budgets, InstancedMesh vs BatchedMesh comparison, culling tradeoffs) — https://masterallarts.com/learn/threejs-from-zero/09-performance-instancing-lod/ (MEDIUM)
- RapidMade — "WebGL/Three.js CAD Rendering Optimization" (draw-call analysis for CAD assemblies, iGPU budgets) — https://rapidmade.com/webgl-three-js-cad-rendering-optimization/ (MEDIUM)
- three.js forum — "Optimizing Rendering of 30,000 Procedurally Generated Objects"; "When is InstancedMesh worth it"; "Complex GLTF Performance"; "Large coordinates"; "Camera and floating point origin" — https://discourse.threejs.org/ (MEDIUM)
- three.js GitHub — #16324 "Moving the camera model will shake if the coordinates are large"; #30352 InstancedMesh perf; #30047 WebGL2 context memory on Safari — https://github.com/mrdoob/three.js/issues/ (MEDIUM)
- Speckle — "Rendering Dimensionally Large 3D Models in The Browser: Spatial Jitter" (RTC vs RTE) — https://speckle.systems/blog/speckles-take-on-spatial-jitter-2/ (MEDIUM-HIGH)
- Re:Earth Engineering — "Rendering Models with High Precision in Global Scenes" (RTC/RTE + high/low split) — https://reearth.engineering/posts/high-precision-rendering-en/ (MEDIUM-HIGH)
- mlightcad — "Precision-Safe Rendering of Large-Coordinate CAD Drawings in Three.js" (rebase + split-translation RTE) — https://github.com/mlightcad/large-coordinate-rendering (MEDIUM)
- webgl-dev-list — "Understanding 'GPU Process: DOM Rendering' and 'GPU Process: WebGL' on Safari" (Apple engineer: iOS page memory cap ~2–3 GB) — https://groups.google.com/g/webgl-dev-list/c/gJ8qeoiiTuc (MEDIUM-HIGH)
- Apple Developer Forums — "WebGL: context lost" threads (#737042, #741624) (iOS 16.7/17.x context-loss bugs, 17.1 fix) — https://developer.apple.com/forums/thread/737042 (MEDIUM)
- Wonderland Engine — "WebGL Performance on Safari and Apple Vision Pro" (Safari WebGL limits) — https://wonderlandengine.com/news/webgl-performance-safari-apple-vision-pro/ (MEDIUM)
- Capawesome — Capacitor File Picker docs + Skills "file-handling.md" (readData/base64 OOM, fetch-blob pattern, content:// handling) — https://capawesome.io/docs/sdks/capacitor/file-picker/ and https://github.com/capawesome-team/skills (HIGH for plugin behavior)
- Capawesome file-picker issue #32 (large-file OOM, largeHeap doesn't fix) — https://github.com/capawesome-team/capacitor-file-picker/issues/32 (MEDIUM)
- Capacitor Docs — Filesystem API (directories, Android scoped storage, content:// support) — https://capacitorjs.com/docs/apis/filesystem (HIGH)
- Capacitor GitHub — #7793 "iOS App Shows Blank White Screen After Being in Background"; #7097 WKWebView termination discussion; #6680 webViewWebContentProcessDidTerminate; PR #7905 listener reset — https://github.com/ionic-team/capacitor/issues/ (HIGH for behavior, MEDIUM for prevalence)
- Ash Kyd — "Dev log: Debugging Safari, an ogre with layers" (Safari memory limits, layer-related crashes) — https://ashk.au/2024/02/07/dev-log-debugging-safari-an-ogre-with-layers/ (MEDIUM)
- PlayCanvas engine issue #5742 (iOS 17 Safari context-lost, 17.1 fix confirmation) — https://github.com/playcanvas/engine/issues/5742 (MEDIUM)

---
*Pitfalls research for: STAAD Online — browser/mobile .std analytical-model viewer*
*Researched: 2026-08-15*