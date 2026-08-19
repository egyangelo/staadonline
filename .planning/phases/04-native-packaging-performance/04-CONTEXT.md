# Phase 4: Native Packaging & Performance - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 ships the proven in-browser STAAD viewer as a **native Android app via Capacitor** and makes large-file opening + parsing performant. The app packages the existing Next.js web build as a **signed release APK + AAB (Play Store bundle)** that works **fully offline**; native file opening uses the Capacitor file-picker **blob path (no base64 reads)**; files above ~2 MB parse in a **Web Worker off the main thread** with **determinate progress feedback** for large files. This is the web viewer from Phases 2–3 (same one-way parse → model → render pipeline, same FileService platform boundary, same minimal floating chrome) extended with a native shell and a worker-parsing path. iOS native packaging remains out of scope for v1 (deferred decision).

Explicitly OUT of scope: iOS packaging, service-worker offline caching for the web path (Android-only for this phase), analysis results (`.OUT`), multi-format import.

</domain>

<decisions>
## Implementation Decisions

### Native File Opening (PLAT-03)
- **D-01:** On Android, file opening uses the **Capacitor file-picker → content URI → `fetch()` blob → `blob.text()`** path — **no base64 reads** anywhere (satisfies PLAT-03 and success criterion 3). This becomes the native branch of the existing **FileService** platform boundary (Phase 2 D-10, ARCHITECTURE Pattern 4).
- **D-02:** The native path reuses the existing FileService guards and error semantics: FILE-03 cancel is a strict no-op (picker dismiss never mutates parse/model state), FILE-04 extension + `MAX_INPUT_LENGTH` (64 MB) size guard fires before any read/parse, with the same stable `FileServiceError` codes (`WRONG_TYPE` / `TOO_LARGE` / `UNREADABLE`).

### Web Worker Architecture (PERF-01)
- **D-03:** Parsing runs in a Web Worker only for files **above ~2 MB** (the PERF-01 threshold); small files parse synchronously on the main thread (zero worker overhead for the common case).
- **D-04:** Worker uses **raw typed `postMessage`** with a dependency-free request/response protocol — no Comlink, no runtime dependency (matches the parser's zero-dependency philosophy). A dedicated singleton Worker instance is reused across opens.
- **D-05:** The parsed `StaadModel` returns to the main thread via **structured clone** of the full typed model (nodes, members, sections Map, supports, loads, groups, units, bounds) — the same shape the R3F scene and Zustand stores already consume. No transferable-buffer decomposition for v1.

### Parse Progress Reporting (PERF-02)
- **D-06:** Add a **non-breaking optional progress callback** to the parser (`parseStaad`) that fires periodically (per N lines/segments), wired through the worker → main thread. This provides real, smooth progress during the expensive parse stage — not just read progress.
- **D-07:** Progress UI **enhances the existing `LoadingOverlay`** ("Opening…") with a **determinate progress bar + percentage**, keeping the established glass/minimal-floating-chrome language (02-UI-SPEC tokens). Progress applies to the worker (>2 MB) path.

### Android Packaging & Offline (PLAT-01, PLAT-02)
- **D-08:** Produce a **signed release APK build + config and an AAB package (Android App Bundle for Play Store)** — a real distributable artifact, not debug-only. Includes Capacitor Android project, release signing config (keystore), app id / display name / icon / splash.
- **D-09:** Offline (PLAT-02) is guaranteed via **Capacitor-served bundled static export**: the Next.js `output: 'export'` build is copied into the Android `assets/` bundle and served by Capacitor's local WebView server — offline by construction, no service worker. Scope is the Android app (PLAT-02), not the browser path.

### Claude's Discretion
- Exact Android applicationId / package name (e.g. `com.staadonline.viewer`) and display name (e.g. "STAAD Online"), Capacitor package version, icon/splash asset specifics, worker progress-callback granularity, progress-bar visual details, release signing details (keystore path handling — must not be committed). `npm run build` static-export wrangling (basePath, asset paths) where the Next.js export requires it. Whether the progress callback fires per line, per token, or per segmentation chunk.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research (project-level)
- `.planning/research/ARCHITECTURE.md` — Pattern 4 (FileService platform boundary: web vs native branches — the web branch exists, the native branch is stubbed for Phase 4), §Data Flow (parse → model → scene), §WebGL/large coordinates (P8 rebase).
- `.planning/research/PITFALLS.md` — **P6 file-read memory (avoid base64; use File.text()/blob reader — Phase 4 pickup)**, P4 draw-call explosion, P5 iOS context loss (Android WebView context-loss still worth noting), P8 float32 precision.
- `.planning/research/STACK.md` — Recommended versions note (Vite recommendation superseded by Phase 2 D-08: keep Next.js 16; Capacitor is the native shell for this phase).

### Phase Contexts (decisions to respect)
- `.planning/phases/02-file-opening-3d-rendering/02-CONTEXT.md` — D-08 (keep Next.js 16; static export achievable via `output: 'export'` in a later phase), D-10 (FileService platform boundary; native path stubbed for Phase 4), D-11/D-12 (viewer replaces home page; minimal floating chrome).
- `.planning/phases/03-interaction-visualization/03-CONTEXT.md` — D-12 (minimal floating chrome language to extend for the progress overlay), D-16 (StatsSummary glass card base).

### Requirements
- `.planning/REQUIREMENTS.md` — PLAT-01, PLAT-02, PLAT-03, PERF-01, PERF-02 (Phase 4 scope), traceability section. Note the explicit "without base64 reads (streaming path)" in PLAT-03.

### Roadmap / Project
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, depends-on (Phase 3).
- `.planning/PROJECT.md` — Key decisions (Capacitor hybrid app iOS/Android; same web codebase), Constraints (offline; client-side only; no backend), Context (analytical model; format tolerance). Deferred item: iOS native packaging → later milestone.

### Code (types/contracts Phase 4 consumes)
- `packages/parser/src/index.ts` — `parseStaad(text): ParseResult`, `MAX_INPUT_LENGTH = 64_000_000` size guard — the only public parser API; this is where the optional progress callback (D-06) is added (non-breaking).
- `packages/parser/src/types.ts` — `StaadModel` (nodes, members, sections Map, supports, loadCases, groups, units, bounds) — the typed model that structured-clones back from the worker (D-05) and feeds the existing scene/stores.
- `web/lib/fileService.ts` — the FileService platform boundary; `readStdFile`, `assertValidStdFile`, `FileServiceError` / `FileServiceErrorCode` — the native (Capacitor) branch (D-01) lands here.
- `web/components/LoadingOverlay.tsx` / `.module.css` — the "Opening…" overlay to enhance with a determinate progress bar (D-07).
- `web/next.config.ts` — currently only `transpilePackages: ["@staad-online/parser"]`; will need `output: 'export'` for the static export (D-09).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/parser` — zero-dependency, worker-ready `parseStaad` (STATE.md decision); `StaadModel` type carries everything the native app renders. Only addition: optional progress callback (D-06).
- `web/lib/fileService.ts` — web file-read path with guards + typed errors; the native (Capacitor) branch extends this with the picker→URI→blob path (D-01), reusing `FileServiceError` codes (D-02).
- `web/components/LoadingOverlay` + its CSS Module — glass "Opening…" overlay to extend into a determinate progress overlay (D-07).
- `web/store/modelStore.ts` / `viewerStore.ts` — read-only model + viewer state the worker's parsed model feeds on the main thread (structured clone, D-05).

### Established Patterns
- One-way pipeline (parse → model → render); renderer never owns parsing — preserved with the worker path (worker produces the same `StaadModel`, main thread consumes it).
- Platform boundary at FileService (ARCHITECTURE Pattern 4) — web branch exists, native branch is the Phase 4 stub.
- Apple-style glass chrome: `rgba(255,255,255,0.65)` + `blur(20px) saturate(180%)`, radius 20, mono readouts, 44px touch targets (02-UI-SPEC) — progress overlay must match.

### Integration Points
- FileService native branch → picker → `fetch(URI)` blob → `blob.text()` → dispatch to parse path (worker if >2 MB, else main thread).
- Parser progress callback → worker `postMessage` → main thread → `LoadingOverlay` progress bar state.
- Worker returns structured-cloned `StaadModel` → `modelStore` (same commit path as synchronous parse).

</code_context>

<specifics>
## Specific Ideas

- The real sample `HPP_Main_Building_2.std` must open, parse, and render correctly in the native Android app — the same primary manual acceptance check as Phases 2–3, but running from the Capacitor-served bundle.
- Large-file path (PERF-01/02) must be verifiable: open a >2 MB `.std` and confirm the UI stays responsive (main thread not blocked) with a smooth progress bar.
- PLAT-03 is verified by confirming no base64 path is used in the native read (blob fetch, not `Filesystem.readFile` base64).

</specifics>

<deferred>
## Deferred Ideas

- **Service-worker offline caching for the web (browser) path** — PLAT-02 is Android-only; web offline is not scoped here. Future if the web product needs offline.
- **iOS native packaging** — pre-existing project deferral to a later milestone (web + Android only for v1.0).
- **Transferable-buffer model transfer** — only relevant if models outgrow the 64 MB input cap; structured clone (D-05) suffices for v1.

None — discussion stayed within phase scope (items above are pre-existing roadmap/phase deferrals).

</deferred>

---

*Phase: 4-Native Packaging & Performance*
*Context gathered: 2026-08-19*
