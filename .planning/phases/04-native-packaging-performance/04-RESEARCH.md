# Phase 4 Research: Native Packaging & Performance

**Researched:** 2026-08-19
**Phase:** 4 — Native Packaging & Performance (PLAT-01/02/03, PERF-01/02)
**Question answered:** *What do I need to know to PLAN this phase well?*
**Confidence:** HIGH for Capacitor 8 + Next.js 16 static-export + Android signing facts (verified against npm registry, official Capacitor docs, Capawesome guidance, and this repo's installed `next@16.3.1` docs in `node_modules/next/dist/docs/`); MEDIUM where a live `next build` must confirm bundler behavior (see Risk R-1).

This document is **planning input only**. It does not re-litigate the locked decisions (D-01..D-09 in `04-CONTEXT.md`); it tells the planner *how* to satisfy them with current (2026) tooling, what to verify, and where the risk sits.

---

## 0. Locked decisions this research serves (from 04-CONTEXT.md)

| # | Decision | Research section |
|---|----------|------------------|
| D-01 | Android open = Capacitor file-picker → content URI → `fetch()` blob → `blob.text()`, **no base64** | §3 |
| D-02 | Native path reuses FileService guards + `FileServiceError` codes (FILE-03/04, 64 MB) | §3 |
| D-03 | Worker parse only >~2 MB; small files sync on main thread | §4, §5 |
| D-04 | Raw typed `postMessage`, no Comlink, dedicated singleton Worker reused | §4, §5 |
| D-05 | Parsed `StaadModel` returns via structured clone | §5 |
| D-06 | Non-breaking optional progress callback on `parseStaad`, wired worker → main | §5 |
| D-07 | Progress UI enhances `LoadingOverlay` with determinate bar + %, glass tokens | §6 |
| D-08 | Signed release APK + AAB, signing config, app id/name/icon/splash | §2 |
| D-09 | Offline via Capacitor-served bundled static export (`output:'export'`), no SW | §1, §7 |

Scope: **web + Android only** (iOS deferred). Parser is zero-dependency and worker-ready (`packages/parser/src/index.ts:76` `parseStaad(text)` is pure, no DOM/Three). App already has instancing, Zustand stores, glass chrome.

---

## 1. Capacitor shell + Next.js static export → Android assets bundling

### 1.1 Current version (2026-08-19)

- **Capacitor latest stable line is 8.x.** `@capacitor/android@8.5.0` is published (verified on npm). Capacitor 9 is announced/early-cycle ("Capacitor 9 Starts Here", May 2026; multi-window, Scene UI work) — **do NOT target it**. Pin all `@capacitor/*` packages to the same 8.x (STACK.md already pins `8.5.0`).
- **Android build stack managed by the Capacitor 8 template:** AGP **8.13.x**, Gradle wrapper **8.14.3**, Kotlin **2.2.20**, compile/target SDK **36**, **min SDK 24**, Android Studio Otter / 2025.2.1+.
- **⚠ AGP 9 do-not-upgrade (verified 2026):** Android Studio now *suggests* upgrading AGP 8.x → 9.0.0, but AGP 9 removes `getDefaultProguardFile('proguard-android.txt')`, which breaks Capacitor core/plugin builds. Capacitor fixed this by switching to `proguard-android-optimize.txt` (PR #8315). **Planning rule: keep AGP 8.13.x; if a build fails on proguard, ensure the generated `android/variables.gradle` AGP version is 8.13.x and the app `build.gradle` uses `proguard-android-optimize.txt`.** Do not accept Studio's AGP 9 upgrade.
- **Node 22+** required (Capacitor 8). The repo runs `next` — confirm the CI/dev Node is 22 LTS or newer.

### 1.2 Adding the Android platform

```bash
# from repo root (npm workspaces: packages/*, web)
npm install -D @capacitor/cli @capacitor/android @capacitor/core   # pin ^8.5.0
npx cap init "STAAD Online" com.staadonline.viewer --web-dir out
npx cap add android
```

- `cap init` writes `capacitor.config.ts` at the repo root (or `web/` if added there). Decide ownership: the Capacitor shell needs a `webDir` pointing at the static export output. Since the Next app lives in `web/` and exports to `web/out`, put `capacitor.config.ts` in `web/` with `webDir: 'out'` (or root with `webDir: 'web/out'`). **Recommended: `web/capacitor.config.ts`, `webDir: 'out'`**, mirroring how `web` already owns its own build. The `android/` native project is generated at the same level as the config (`web/android/` if config is in `web/`). Note STACK.md's doc examples assume a Vite root; here the static export is `output:'export'` → `out/`, and the web is already a workspace. **This is a real layout decision the plan must lock.**
- The Capacitor app id is the *Android applicationId* (D-08). `com.staadonline.viewer` is a valid default (Claude discretion in CONTEXT).
- **Do not commit `android/` and `ios/`?** Convention is to commit the generated native projects (they hold your signing config, app id, assets) — but the **keystore and any `keystore.properties` must be git-ignored** (§2.3).

### 1.3 The `output:'export'` static-export flow (D-09)

Verified against the installed `next@16.3.1` docs (`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`):

- Set **`output: 'export'`** in `web/next.config.ts`. `next build` then emits static HTML/CSS/JS to **`out/`** (no Node server, no `next start`).
- **This app already qualifies for static export:** `web/app/page.tsx` is a single `"use client"` page; no server actions, no API routes, no rewrites, no cookies, no dynamic segments, no `next/image` (checked — no `<Image>` usage; the app uses a favicon and CSS). The only config change beyond `output: 'export'` is preserving the existing `transpilePackages: ["@staad-online/parser"]` (still required since the parser ships TS source). `images` needs nothing unless `next/image` appears later (`images: { unoptimized: true }` only matters if images are used).
- **`basePath` / `assetPrefix` (the wrinkle):** Capacitor serves the bundle from a **local WebView server at origin `http://localhost`** (Capacitor 8 default; `androidScheme: 'https'` → `https://localhost`). A static export that hard-codes absolute paths starting `/` works fine under a local origin — **the export should use root-relative paths, i.e. leave `basePath: ''` and `assetPrefix: ''` (defaults).** Do **not** add a basePath/subpath — that is only for hosting under `/repo/` (GitHub Pages) and would break Capacitor's local serving. If any asset path ever mis-resolves in the WebView, the fix is relative paths via a static config, never `basePath`.
- **`trailingSlash`:** Capacitor's local server maps `index.html` correctly; for a single-page app `trailingSlash` is cosmetic. Keep default (false) unless routing issues appear.
- **Bundling loop:**
  ```bash
  npm run build            # web: next build  -> web/out
  npx cap sync android     # copies web/out into android/app/src/main/assets/public + runs pod/gradle bits
  ```
  `cap sync` **copies the built static bundle into the Android assets and is the exact step that makes offline "by construction" (D-09)** — the WebView serves those bundled files from the local server. A service worker is NOT required (and is explicitly out of scope).
- **Trap:** `cap sync` overwrites `android/` platform files (app id, variables) only when `cap add` runs; subsequent `cap sync` only refreshes `assets/public` and copies native config. Asset editing (icons/splash) happens in `android/app/src/main/res/`, not via sync. See §2.

### 1.4 Offline behavior (PLAT-02, D-09) — §7 covers gotchas

Because the entire web app is bundled and served from the local server, **the app is offline by construction** — no network is referenced by the app code (verified: no `fetch` of remote URLs in the codebase; the only `fetch` will be the native file read in §3, which is a local `convertFileSrc` URL). This satisfies PLAT-02.

---

## 2. Android release signing, APK + AAB, icon/splash (D-08)

### 2.1 Produce both release artifacts

Gradle Android projects (as generated by `cap add android`) build debug and release variants. The two distributables:

- **Release APK:** `./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk` (signed). Installs directly on devices (side-load / internal testing).
- **AAB (Play Store bundle):** `./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`. Required for Google Play (Play derives per-device APKs from the AAB). **A signed release must exist before either task succeeds — both use the release `signingConfig`.**

### 2.2 Gradle signing config (release buildType)

Capacitor 8's generated `android/app/build.gradle` release block comes with `signingConfig` unset (debug signs with the debug keystore). The plan must wire:

```groovy
// android/app/build.gradle
android {
  signingConfigs {
    release {
      storeFile file('staad-online-release.jks')     // path; do NOT inline secrets
      storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
      keyAlias System.getenv("ANDROID_KEY_ALIAS")
      keyPassword System.getenv("ANDROID_KEY_PASSWORD")
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
      minifyEnabled false
      shrinkResources false
      proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
  }
}
```

Options for secret handling (Claude discretion in CONTEXT: "keystore path handling — must not be committed"):
- **Recommended:** a local `android/keystore.properties` **git-ignored** file read into the build, or env vars (CI-friendly). Keep `storePassword`/`keyPassword` out of the tracked `build.gradle`.
- **CI (optional):** generate keystore, feed via GitHub Actions secrets → env vars. Out of scope unless the plan adds a release pipeline; Phase 4 only needs a locally buildable signed artifact.

### 2.3 Keystore generation + `.gitignore`

```bash
keytool -genkey -v -keystore staad-online-release.jks \
  -alias staad-online -keyalg RSA -keysize 2048 -validity 10000
```
- Place keystore outside tracked source or git-ignore it (`*.jks`, `keystore.properties`). **Never commit.** Back it up separately (Play upload key loss = account lock).
- `android/.gitignore` from the template already ignores build outputs; add the keystore + properties to the repo `.gitignore`.

### 2.4 App id, display name, icon, splash

- **App id / applicationId:** set at `cap init` (`com.staadonline.viewer`), baked into `android/app/build.gradle` (`applicationId`) and `capacitor.config.ts` (`appId`). Changing later is disruptive — lock it.
- **Display name:** `appName` in `capacitor.config.ts` → becomes the Android label (e.g. "STAAD Online").
- **Icon + splash via `@capacitor/assets` (verified official current tool):**
  ```bash
  npm install -D @capacitor/assets
  # provide source images, then:
  npx capacitor-assets generate --android
  ```
  Source assets live in `assets/` next to the config:
  - `icon-only.png` (1024×1024), `icon-foreground.png` (1024×1024, keep glyph in center ~66%), `icon-background.png` (1024×1024) — Android adaptive icon layers.
  - `splash.png` / `splash-dark.png` (2732×2732).
  - It writes `mipmap-*`/`drawable-*` resources into `android/app/src/main/res/`. Run **before** `cap sync` or re-run `cap sync` isn't needed (assets are in res, not assets). **Note:** Android 12+ uses the system splash screen (small icon + colored background), not the full-bleed image — the plan should set the launch background color and accept the OS-managed splash; a runtime `@capacitor/splash-screen` plugin is optional (D-08 only requires the splash be *configured*).
- Splash **hide timing**: the web app hydrates on the local server instantly (offline bundle). No splash plugin needed to coordinate hide; default auto-hide is fine.

### 2.5 Verification of D-08
- `./gradlew assembleRelease` and `./gradlew bundleRelease` both succeed and produce signed artifacts.
- `apksigner verify --print-certs app-release.apk` shows the release cert (not the debug one).
- Install `app-release.apk` on a device → app opens offline, icon/splash/name correct.

---

## 3. Capacitor file-picker: content URI → fetch blob → text (D-01/02/03, PLAT-03)

### 3.1 Plugin choice: `@capawesome/capacitor-file-picker` (NOT `@capacitor/filesystem`)

Verified against official Capawesome docs + the Capawesome file-handling guide (2026):

- **`@capacitor/filesystem` cannot read arbitrary user-picked files on Android 11+** (scoped storage) — PITFALLS Anti-Pattern 4 / P6 already documents this. `Filesystem.readFile` returns **base64** (`readData`) → the exact OOM vector PLAT-03 forbids.
- **`@capawesome/capacitor-file-picker`** is the recommended picker. `pickFiles({ types: [...] , limit })` opens the system picker and returns file descriptors **without reading bytes**:
  - On **web** the returned file is a real `Blob` (`file.blob`).
  - On **Android/iOS** it returns a `path` (a native `content://` URI) and `name`.
- **`readData` stays `false` (default)** — enabling it is the documented cause of large-file OOM. Keep it off → satisfies "no base64" by construction.
- **No Android manifest storage permission is needed** — the system grants per-file access via the picker (PITFALLS Integration Gotchas).

### 3.2 Reading the content URI as text (the D-01 path, precisely)

On native, the returned `path` is a `content://` URI. To fetch it in the WebView you must convert it to a web-accessible URL first:

```ts
// native branch — NO base64 anywhere (D-01 / PLAT-03)
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { Capacitor } from "@capacitor/core";

const { files } = await FilePicker.pickFiles({ types: [".std"], limit: 1 });
if (!files?.length) return;                    // picker dismissed -> strict no-op (FILE-03 / D-02)

const file = files[0];
let blob: Blob;
if (file.blob) {
  blob = file.blob;                            // web branch (already a Blob)
} else {
  const webPath = Capacitor.convertFileSrc(file.path!); // content:// -> http(s)://localhost/_capacitor_file_/...
  blob = await (await fetch(webPath)).blob();  // streams from disk backing; NOT base64
}
const text = await blob.text();                // then to the parser
```

Key facts for the plan:
- **`Capacitor.convertFileSrc(contentUri)`** rewrites `content://…` into a `http://localhost/_capacitor_file_/…` URL that the WebView's own local server serves. `fetch()` on that URL **works in the Android WebView** — this is Capawesome's officially documented "fetch as blob" pattern (it uses the local scheme, so no CORS problem).
- **Does `fetch()` on the *raw* `content://` URI work?** Not reliably/not directly — you must go through `convertFileSrc` first. So D-01's "fetch(contentUri)" is precisely **`fetch(Capacitor.convertFileSrc(contentUri))`**. Document this in the plan so the implementer doesn't `fetch('content://…')` and hit a failure.
- `blob.text()` decodes UTF-8 → the STAAD deck. Use the existing `MAX_INPUT_LENGTH` guard (§3.3).
- **The 2 MB worker switch (D-03) happens AFTER `text` is in hand** (§4), not during the read.

### 3.3 Reusing FileService guards + error codes (D-02)

The native branch lives in `web/lib/fileService.ts` (the platform boundary stubbed for Phase 4). Reuse unchanged:
- `assertValidStdFile({ name, size })` — extension `.std` (→ `WRONG_TYPE`) and `size > MAX_INPUT_LENGTH` (64 MB → `TOO_LARGE`). **But the picker's file object is `{ name, path, blob? }`; it has NO reliable `size` up front.** The size guard must fire **before** reading bytes. Two options:
  1. Get size from the blob (`file.blob.size` on web) or `fetch`-HEAD the converted URL / read `content-length` (native) before `blob.text()`.
  2. Wrap the read in try/catch → `UNREADABLE` on failure (already the `readStdFile` pattern).
  **Planning note:** the guard ordering matters (FILE-04 "before any read/parse"). On native, a cheap size probe (HEAD/`content-length`, or `file.size` if the plugin populates it) should run first; a 64 MB streamed read is fine under the cap. Keep the `TOO_LARGE` code fired *before* materializing text. The existing `readStdFile(file: File)` signature takes a DOM `File`; the native branch needs a parallel entry (e.g. `readNativeFile(picked)`) that returns the same `OpenedFile { name, text }` and reuses the same `FileServiceError` codes — the UI (`page.tsx`) already maps codes → error copy and treats FILE-03 cancel as no-op.
- **FILE-03 cancel:** if `pickFiles` returns no files (user dismissed), return without calling `beginLoading` or mutating anything — strictly a no-op (matches the web hidden-input `onChange` behavior and `page.tsx` open logic). No `setError`, no store write.

### 3.4 Alternatives considered (why the recommended path wins)
- `@capacitor/filesystem` picker-less reads → broken by scoped storage; base64 → forbidden.
- `readData: true` → OOM on large files (P6), violates PLAT-03. Rejected.
- `@capawesome/capacitor-file-picker` + `convertFileSrc` + `fetch` + `blob.text()` → **recommended**: streaming/disk-backed, no base64, works in WebView, officially documented. This is the only path satisfying D-01/PLAT-03.

---

## 4. Web Worker integration with Next.js 16 (D-03/04, PERF-01)

### 4.1 ⚠ HIGH RISK R-1: Turbopack + `new Worker(new URL(...))` production regression (16.2+)

This is the **single most important planning risk** for the worker half:

- Next.js 16 builds with **Turbopack by default** (including `next build`). Local `next dev` often works; **production builds of `new Worker(new URL('./x.worker.ts', import.meta.url))` regressed in 16.2.x**:
  - Issue #94015 — `e.indexOf is not a function` / worker bootstrap failure in production (Monaco/GraphiQL workers); closed by PR #96307.
  - Issue comment — still reproducible on `next@16.2.10` (LiveKit E2EE worker) with `new Worker(new URL(...))`.
  - PR #88602 ("replace blob:// workers with real-URL bootstrap") is the root: workers became real file entrypoints that now inherit `assetPrefix`/chunk-base handling; Turbopack's URL normalizer chokes on a `URL` object in some paths.
- **Mitigations (choose in plan, verify on the actual `next@16.3.1`):**
  1. **Preferred: build the worker path with webpack.** `next build --webpack` (Next 16 supports the flag) uses webpack 5, whose `new Worker(new URL(..., import.meta.url), { type: 'module' })` bundling is mature (official `with-web-worker` example) and emits a same-origin worker under `/_next/static/`. This sidesteps the Turbopack worker regression entirely.
  2. Alternatively pin to a known-good worker bundler combination (16.1.7 worked; 16.3.1 may have the fix — **verify by building**).
  3. Escape hatch `/* turbopackIgnore: true */` / `/* webpackIgnore: true */` + hand-host the worker — only if auto-bundling fails; not preferred (more moving parts).
- **The plan MUST add a verification task:** after building the static export, run it and confirm the worker actually spins up (e.g. open a >2 MB file and observe the progress bar / main thread not blocked). Since the app is a single client page with an offline bundle, the worker is part of the client chunk graph; a broken worker will show as "falls back to main thread" (UI freeze) — exactly what PERF-01 is meant to prevent.
- **Worker + `output:'export'`:** webpack emits the worker as a static file under `/_next/static/media|chunks`, which `output:'export'` copies into `out/` → served by Capacitor's local server → works offline. This satisfies D-04 (raw postMessage, no Comlink).

### 4.2 Worker creation pattern

```ts
// web/lib/parseWorker.ts (client-only; imported lazily / guarded by typeof window)
const worker = new Worker(
  new URL("./staad.worker.ts", import.meta.url),
  { type: "module" },   // ESM worker; keeps the zero-dep parser import clean
);
```
- **Static path** (no variables in `new URL`) is required by both webpack and Turbopack — hard-code the worker file path.
- **Singleton (D-04):** create the worker once (module-level `let` or a ref), reuse across opens; terminate on app teardown (optional). Re-instantiate only if it errors.
- **`{ type: 'module' }`** lets the worker `import` the parser package (transpiled by `transpilePackages`) — clean, zero-DOM, matches "worker-ready". Classic (non-module) workers would need a bundle with no imports; module workers are the right call.
- The worker file itself must be **client-side only**; never import `next/server` or anything Node-ish. `import "@staad-online/parser"` (pure TS) is safe.

### 4.3 Threshold (D-03) lives in the main-thread caller
- If `text.length > ~2 MB (2_000_000)` → dispatch to the singleton Worker; else run `parseStaad(text)` synchronously (current `page.tsx` path). Keep the branch in one place (`web/lib`), so `page.tsx`'s `openFile` calls a single `parseModel(text, onProgress)` helper that chooses sync vs worker. This keeps D-03 testable and centralizes the worker protocol.

---

## 5. Progress callback on a sync parser + worker relay (D-06/07, PERF-02)

### 5.1 Non-breaking optional progress callback (D-06)

`parseStaad(text)` is the only public parser API (`packages/parser/src/index.ts:76`). Add an **optional second parameter** so all existing callers/tests compile unchanged:

```ts
export interface ParseProgress { fraction: number; stage?: string } // optional shape
export function parseStaad(
  text: string,
  onProgress?: (fraction: number) => void,
): ParseResult { ... }
```

Non-breaking guarantees:
- Optional param → existing `parseStaad(text)` calls and `types-smoke` stay valid.
- Must be **worker-safe**: no DOM, no closures over React, pure callback. Call it from the phases of the parse:
  - **tokenize** (0 → ~0.15 by input length)
  - **segment/block loop** (the `for (const block of blocks)` in `index.ts:91` → ~0.15 → ~0.95, per block count)
  - **finalize** (→ 1.0)
  Fraction in [0,1]; the callback is invoked only when provided (cheap `if (onProgress)` guard). **Throttle cadence** to avoid message spam (see 5.3).
- **Worker caution:** the parser must not capture `postMessage` itself (stays pure). The worker wraps `parseStaad(text, p => postMessage({ type:'progress', fraction:p }))`. Caller-throttling can live in the worker.

### 5.2 Typed postMessage protocol (D-04/05/06)

Raw typed messages, no dependency. Define a discriminated union shared by worker + main thread (types live in the parser package or `web/lib`):

```ts
// Worker -> Main
type ParseMessage =
  | { type: "ready" }                          // worker initialized (optional)
  | { type: "progress"; fraction: number }     // D-06 relay
  | { type: "result"; result: ParseResult }    // D-05 structured-cloned StaadModel + warnings
  | { type: "error"; message: string };        // parse throw (shouldn't happen; tolerant)

// Main -> Worker
type ParseRequest = { type: "parse"; text: string };
```

- **D-05 structured clone:** `ParseResult` = `{ model: StaadModel, warnings }`. `StaadModel` uses `Map<string, SectionProfile & SectionMeta>` and `Map<string, Group>`. **Maps structured-clone fine** (Map is cloneable). `StaadModel` has **no `function`/`undefined`/circular refs** (pure data) → clones cleanly. Verified against `packages/parser/src/types.ts` — all fields are plain data. Good; no transferable-buffer decomposition needed (deferred per CONTEXT).
- **Message size:** a large `StaadModel` (e.g. 50k members) structured-clones as a single message — acceptable for v1 (CONTEXT defers transferables). The plan should note clone cost is O(model) once, not per frame.
- **Sending `text` (up to 64 MB) into the worker** is a single structured clone string message. Cheap enough; the alternative (Transferable `ArrayBuffer`) is unnecessary since strings clone by reference-ish copy and the guard caps at 64 MB. Not required by decisions.
- **No Comlink** (D-04) — raw `postMessage` + a `MessagePort`/`onmessage` switch on `message.type`. Zero runtime deps, matches the parser philosophy.

### 5.3 Progress smoothness + throttling

- Fires per block (not per line) to keep `postMessage` count sane for multi-MB decks (block count ≈ hundreds–thousands, not millions). For very fine-grained files, throttle in the worker (e.g. only post when `fraction` delta ≥ 1–2% or every N ms). Claude discretion.
- The main thread handler updates a small Zustand field or local state that `LoadingOverlay` reads (D-07). Use a ref-guarded `postMessage` to avoid stale-callback state after a repeat-open aborts the in-flight parse (mirrors `page.tsx`'s `openToken`). **Cancellation/abort:** D-03's repeat-open aborts by ignoring stale worker results via token — the worker itself isn't killed (singleton reused), just its late `result` messages ignored. Optionally send `{type:'cancel', token}` to the worker (non-essential).

### 5.4 Worker relays → main → LoadingOverlay (D-07)
```
worker: parseStaad(text, p => postMessage({type:'progress', fraction:p}))
   → main thread onmessage({type:'progress', fraction}) → LoadingOverlay state
   → worker finishes → postMessage({type:'result', result}) → main commits setModel (same path as sync)
```
The **result commit reuses the existing synchronous commit path** in `page.tsx` (`useModelStore.getState().setModel(result, name)` + `useViewerStore.resetSceneState`) — one code path for sync and worker parses (CONTEXT "same commit path"). Only the *producing* of `result` differs.

---

## 6. LoadingOverlay determinate progress (D-07)

- **Enhance, don't replace:** `web/components/LoadingOverlay.tsx` currently renders spinner + "Opening…" + `aria-live="polite"` / `aria-busy="true"`. Add a **determinate progress bar + percentage**, keeping the existing glass tokens (`web/components/LoadingOverlay.module.css`).
- **Token language (02-UI-SPEC / 03 CONTEXT D-12):** `rgba(255,255,255,0.65)` + `backdrop-filter: blur(20px) saturate(180%)`, radius 20, mono readouts, 44px touch targets, honors `prefers-reduced-motion`. The overlay already uses a dark scrim + white spinner + dark label (with a dark-mode variant); the bar should match this glass card treatment.
- **Determinate vs indeterminate:** when `fraction` is available (worker path, >2 MB) show the determinate bar + `%`. When parsing synchronously (small files, near-instant) keep the existing spinner — no need to flash a bar. Optional: treat `< ~2 MB` as "show spinner only" to avoid a bar that jumps 0→100 instantly.
- **Accessibility:** keep `aria-live="polite"`, announce percentage on significant changes (or keep the live region minimal to avoid chatter), `role="progressbar"` + `aria-valuenow`/`aria-valuemin/max` on the bar element.
- **UI plumbing:** progress state can live in `modelStore` (`progress: number | null`) or local state in `page.tsx`. Recommend `modelStore.progress` so the overlay and any future UI read one source; reset to `null` on open begin/complete/error. Keep the worker relay updating it only on the >2 MB path.

---

## 7. Capacitor offline gotchas (D-09, PLAT-02)

- **Serving:** Capacitor serves bundled assets from `http://localhost` (or `https://localhost` with `androidScheme:'https'`). All static-asset URLs in the export resolve against this origin → offline by construction.
- **Gotcha — origin checks / absolute URLs:** any code that compares `window.location.origin === 'https://example.com'` or assumes a production host will misbehave in the WebView. Keep code origin-agnostic; the static export's own asset URLs (leading `/`) are correct under the local origin. Avoid hard-coding external hosts.
- **Gotcha — `fetch` of external URLs:** none used; the only `fetch` is the local `convertFileSrc` file read (§3.2). Do not introduce telemetry/CDN fetches in the native build (privacy is the product positioning; PITFALLS security).
- **Gotcha — WebGL/WebView:** Android System WebView (Chromium 60+) provides WebGL2 → three.js r163+ works (STACK.md). Ensure the release WebView is current; offline still needs the bundled WebView renderer, not network.
- **Gotcha — `cap sync` staleness:** after changing `next.config.ts`, **must rebuild web then `cap sync`** before building the APK/AAB, or the app ships stale JS. Bake this into the build scripts (`build` → `sync` → `gradle`).
- **Gotcha — Android 12+ splash (§2.4):** OS-managed splash (icon + background), not a full-bleed image; set the launch background color.
- **Gotcha — AGP 9 (§1.1):** don't accept Studio's AGP upgrade.
- **Gotcha — first-run hydration:** offline bundle hydrates locally; no SW needed. Confirm no `next/preload`/prefetching of non-existent remote endpoints.

---

## 8. Integration points & files that change

| File | Change | Decision |
|------|--------|----------|
| `web/next.config.ts` | add `output: 'export'`; keep `transpilePackages` | D-09 |
| `web/capacitor.config.ts` (new) | appId `com.staadonline.viewer`, appName "STAAD Online", `webDir: 'out'` | D-08 |
| `web/android/` (generated) | signing config in `app/build.gradle`; `keystore.properties` git-ignored | D-08 |
| `assets/` + `@capacitor/assets` | icon/splash source → res | D-08 |
| `web/lib/fileService.ts` | add native branch (`readNativeFile`) reusing `assertValidStdFile`/`FileServiceError` | D-01/02 |
| `packages/parser/src/index.ts` | `parseStaad(text, onProgress?)` non-breaking | D-06 |
| `packages/parser/src/types.ts` | (optional) export `ParseProgress` type | D-06 |
| `web/lib/staad.worker.ts` (new) | module worker, typed protocol, calls `parseStaad` | D-03/04/05 |
| `web/lib/parseModel.ts` (new) | threshold branch sync vs worker; singleton worker; typed messages | D-03/04 |
| `web/components/LoadingOverlay.tsx` + `.module.css` | determinate bar + % | D-07 |
| `web/store/modelStore.ts` | optional `progress` field (or local state in `page.tsx`) | D-07 |
| `web/app/page.tsx` | route open through `parseModel`; reuse `setModel`/`resetSceneState` commit | D-03/05 |
| `web/package.json` | add `@capacitor/*`, `@capawesome/capacitor-file-picker`, `@capacitor/assets`; build/sync scripts | D-08/09 |
| `web/AGENTS.md` block | note re-added by `next dev`; don't remove from diffs | — |

---

## 9. Risks & open questions for the planner

### Risks
- **R-1 (HIGH): Turbopack worker production regression (Next 16.2+).** Verify on `next@16.3.1`; fallback `next build --webpack` for the worker path. Add a build+run verification task (§4.1). **Confirm before committing to Turbopack for the Phase-4 build.**
- **R-2 (MED): AGP 9 upgrade temptation.** Keep AGP 8.13.x; proguard `proguard-android-optimize.txt`.
- **R-3 (LOW): `fetch` raw `content://`.** Use `Capacitor.convertFileSrc(path)` first (§3.2). Document in code so implementer doesn't fetch the raw URI.
- **R-4 (LOW): stale `cap sync`.** Rebuild web before sync before gradle. Script it.
- **R-5 (LOW): size guard before read on native** — picker file has no reliable `.size` up front; probe content-length / use blob.size before `blob.text()` (FILE-04 ordering).

### Open questions (Claude discretion items from CONTEXT — decide in PLAN, not re-litigate here)
1. Exact `applicationId` (default `com.staadonline.viewer`) + display name "STAAD Online".
2. Keystore handling mechanics (local `keystore.properties` git-ignored vs env vars vs CI).
3. Where `capacitor.config.ts`/`android/` live (recommended: `web/`).
4. Progress callback granularity (per-block vs per-line vs per-token) + throttle cadence.
5. Progress state location (`modelStore.progress` vs local state).
6. Build script shape (`build` → `sync` → `gradle assembleRelease/bundleRelease`).
7. Whether to add `parseModel` helper vs inline in `page.tsx`.
8. Whether the >2 MB threshold constant is `2_000_000` characters and whether it lives in `web/lib`.

### Verification to bake into the plan (UAT)
- `HPP_Main_Building_2.std` opens/parses/renders correctly in the native Android app (from the Capacitor-served bundle) — same acceptance as Phases 2–3, on-device.
- >2 MB `.std`: main thread stays responsive, smooth determinate progress bar (PERF-01/02).
- No base64 path in native read — code audit (D-01/PLAT-03).
- `assembleRelease` + `bundleRelease` both sign; APK installs and runs offline (PLAT-01/02, D-08/09).
- Picker cancel = strict no-op, no error/state corruption (FILE-03, D-02).

---

## 10. Sources (2026-current, verified)

- Capacitor 8.5.0 on npm (`@capacitor/android`), Capacitor 9 "Starts Here" (Ionic blog, 2026-05) — line choice §1.1.
- Ionic/Capgo AGP 9 breaking change (`getDefaultProguardFile('proguard-android.txt')` removed; Capacitor PR #8315; switch to `proguard-android-optimize.txt`) — §1.1.
- Capacitor Android docs (API 23+ / WebView Chrome 60+) — §7.
- Next.js 16.3.1 installed docs: `node_modules/next/dist/docs/01-app/02-guides/static-exports.md` (output:'export', `out/`, unsupported features), `basePath.md`, `assetPrefix.md`, `lazy-loading.md` (magic comments on `new Worker()`), `turbopack.md` — §1, §4.
- Next.js 16 Turbopack worker regression: vercel/next.js issues #94015 (closed PR #96307), #92676, discussion #93044 (`workerPublicPath`), comments still failing on 16.2.10; `next build --webpack` path; official `with-web-worker` example — §4.1.
- Capawesome file-picker README + file-handling guide + Capacitor file-handling blog: `readData` off, `fetch(Capacitor.convertFileSrc(path)).blob()` pattern, no base64, picker returns path on native / Blob on web — §3.
- Capawesome `capacitor-plugins` (file-picker, AGP 9 fixes) — §3.
- Capacitor docs + Capawesome skill: `@capacitor/assets generate --android`, source asset requirements, Android 12+ adaptive icon/splash — §2.4.
- Android `keytool` + Gradle `signingConfig` + `assembleRelease`/`bundleRelease` standard workflow — §2.

---

*Phase 4 research for: STAAD Online — Capacitor Android packaging (offline, signed release) + worker-based large-file parse with progress.*
*Researched: 2026-08-19*
