# Phase 4: Native Packaging & Performance — Pattern Mapping

**Mapped:** 2026-08-19
**Phase:** 4 — Native Packaging & Performance (PLAT-01/02/03, PERF-01/02)
**Decisions locked:** D-01..D-09 (`04-CONTEXT.md`) · **Definitive file-change list:** RESEARCH §8 (Table: "Integration points & files that change")

This doc gives the planner/implementer, for each target file: the **closest existing analog**, the **conventions to follow**, and **concrete excerpts** to replicate. Landmines are flagged inline and summarized in §5.

---

## 1. Target files → analog mapping (from RESEARCH §8)

| # | Target file | Role / data flow | Closest existing analog |
|---|-------------|------------------|-------------------------|
| 1 | `packages/parser/src/index.ts` | parse entry; add optional `onProgress` to `parseStaad` | itself (`index.ts:76`) — non-breaking 2nd param |
| 2 | `packages/parser/src/types.ts` | export `ParseProgress` (optional) | itself (`types.ts:185`) |
| 3 | `web/lib/fileService.ts` | add native `readNativeFile` branch | itself — the platform boundary (`fileService.ts:67`) |
| 4 | `web/lib/parseModel.ts` (NEW) | threshold branch sync vs worker; singleton worker; typed messages | `web/app/page.tsx:55` `openFile` parse portion; `page.tsx:66` |
| 5 | `web/lib/staad.worker.ts` (NEW) | module worker, typed protocol, calls `parseStaad` | (none in repo — pattern from RESEARCH §4.2/§5.2) |
| 6 | `web/components/LoadingOverlay.tsx` + `.module.css` | determinate progress bar + % | itself (`LoadingOverlay.tsx:12`) + `StatsSummary` glass card |
| 7 | `web/store/modelStore.ts` | optional `progress` field | itself (`modelStore.ts:15`) + `viewerStore.ts` |
| 8 | `web/app/page.tsx` | route open through `parseModel`; reuse commit | itself (`page.tsx:55` `openFile`) |
| 9 | `web/next.config.ts` | add `output: 'export'` | itself (`next.config.ts:1`) |
| 10 | `web/capacitor.config.ts` (NEW) | appId/appName/webDir | (none — new config file) |
| 11 | `web/android/` (generated) + `assets/` + `web/package.json` | signing, icon/splash, deps/scripts | `web/package.json` scripts pattern |

---

## 2. Per-file pattern excerpts

### 2.1 `packages/parser/src/index.ts` — add optional `onProgress` (D-06)

Closest analog: the existing `parseStaad` (`index.ts:76`). It is pure, headless, zero-DOM — the callback MUST stay pure too (never capture `postMessage` or React; the worker wraps it, §2.5).

Conventions to follow:
- The parser **never throws** — unknown input degrades to warnings. The size-guard early return (`index.ts:77`) must remain BEFORE any callback; the whole call is gated by `if (onProgress)` (cheap guard per RESEARCH §5.1).
- Doc-comment style: each public symbol has a `/** ... */` header citing the phase/decision id (e.g. `(01-04, ARCHITECTURE.md Pattern 1)`). Add `(D-06)` references.
- Progress hook points per RESEARCH §5.1: tokenize (0→~0.15 by input length), the `for (const block of blocks)` loop (`index.ts:91` → ~0.15→~0.95, per block count), finalize (→1.0). The block loop is the natural per-block granularity (hundreds–thousands, not millions of messages).

Existing signature to extend non-breaking:
```ts
export function parseStaad(text: string): ParseResult { ... }
```
Target (add optional 2nd param — existing callers/tests compile unchanged):
```ts
export function parseStaad(
  text: string,
  onProgress?: (fraction: number) => void,
): ParseResult { ... }
```
Replicate the loop-shape from `index.ts:91`:
```ts
for (const block of blocks) {
  // ...existing handler dispatch...
  onProgress?.(startFrac + (i / blocks.length) * span); // per-block cadence
}
```

### 2.2 `packages/parser/src/types.ts` — optional `ParseProgress` type (D-06)

Closest analog: `ParseResult` (`types.ts:185`). Follow the existing pure-contract convention ("must NEVER import from DOM/Three/React"), the header doc citing the decision, and the `export interface` naming.

Target (RESEARCH §5.1):
```ts
export interface ParseProgress { fraction: number; stage?: string }
```
Keep it minimal; `fraction: number` in [0,1] is the only required field. Only export if used; the worker protocol (§2.5) may define its own `{ fraction }` inline and not need this type at all (Claude discretion).

### 2.3 `web/lib/fileService.ts` — native `readNativeFile` branch (D-01/D-02)

Closest analog: the existing web branch (`fileService.ts`). **The native branch is the stub this file already documents** (`fileService.ts:8`: "the native branch (Capacitor file-picker) is stubbed here for Phase 4"). Land here.

Conventions to replicate (all in `fileService.ts`):
- Keep `OpenedFile` (`{ name, text }`, line 22) as the shared return — `readNativeFile(picked)` returns the same shape so `page.tsx` is branch-agnostic.
- Reuse `FileServiceError` + `FileServiceErrorCode` unchanged (`WRONG_TYPE` / `TOO_LARGE` / `UNREADABLE`, lines 28–39). Do NOT add new codes.
- Reuse `assertValidStdFile` (`fileService.ts:46`) unchanged — same guards, same error copy.
- Follow the existing try/catch→`UNREADABLE` pattern (`fileService.ts:69–77`) and the header doc style citing decision ids (`(D-10, ARCHITECTURE.md Pattern 4, web branch)`).

New entry signature — structural-minimal input (matches `assertValidStdFile`'s minimal `{ name, size }` philosophy) plus the picker's `{ name, path, blob? }` shape:
```ts
// native branch — NO base64 anywhere (D-01 / PLAT-03)
import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";

export async function readNativeFile(
  picked: { name: string; path?: string; blob?: Blob },
): Promise<OpenedFile> {
  if (!picked?.name) return;               // picker dismissed -> strict no-op (FILE-03)
  // size guard BEFORE read (FILE-04): probe blob.size / content-length first (RESEARCH R-5)
  assertValidStdFile({ name: picked.name, size: await probeSize(picked) });
  let blob: Blob;
  if (picked.blob) {
    blob = picked.blob;                       // web branch (real Blob)
  } else {
    const webPath = Capacitor.convertFileSrc(picked.path!); // content:// -> http(s)://localhost/_capacitor_file_/...
    blob = await (await fetch(webPath)).blob();             // streams from disk; NOT base64
  }
  const text = await blob.text();
  return { name: picked.name, text };
}
```
Landmines:
- **FILE-03 cancel = strict no-op**: if `pickFiles` returns no files / `picked` is empty, return `undefined`/`null` WITHOUT `beginLoading`, no store write, no error (matches `OpenControl.tsx:46` hidden-input semantics + `page.tsx` open logic).
- **`fetch('content://…')` raw fails** — MUST go through `Capacitor.convertFileSrc` first (RESEARCH R-3). Document in code.
- **Size guard ordering** — picker file has no reliable `.size` up front; probe (blob.size / HEAD content-length) BEFORE `blob.text()` so `TOO_LARGE` fires before materializing text (RESEARCH R-5 / FILE-04 "before any read").

### 2.4 `web/lib/parseModel.ts` (NEW) — threshold branch + singleton worker + typed protocol (D-03/D-04)

Closest analog for the branch + commit logic: `page.tsx:55` `openFile` (its read→parse→commit body). Centralize the sync-vs-worker branch here so `page.tsx` calls a single helper (RESEARCH §4.3).

Conventions:
- `web/lib` modules are plain TS (no "use client" needed unless imported only by client — safe as pure client lib; mirror `fileService.ts` header-doc style).
- Singleton worker (D-04): module-level `let worker` created lazily, reused; guard with `typeof window !== "undefined"` (worker construction is client-only). Re-create only on error.
- Threshold constant (D-03): `> 2_000_000` characters → worker; else sync. Live in `web/lib` (Claude discretion §Q8).

Replicate the commit path (from `page.tsx:66`):
```ts
const result = parseStaad(text);
// ...token guard...
useModelStore.getState().setModel(result, name);
useViewerStore.getState().resetSceneState(
  result.model.loadCases[0]?.id,
  result.model.supports.length > 0 || result.model.loadCases.length > 0,
);
```
Target shape (RESEARCH §4.3 / §5.4):
```ts
export async function parseModel(
  text: string,
  onProgress?: (fraction: number) => void,
): Promise<ParseResult> {
  if (text.length > 2_000_000) {
    return parseInWorker(text, onProgress);  // singleton module worker
  }
  return parseStaad(text, onProgress);       // synchronous main-thread (small files)
}
```

### 2.5 `web/lib/staad.worker.ts` (NEW) — module worker (D-03/04/05)

No in-repo analog; pattern from RESEARCH §4.2/§5.2. Follow the parser's zero-dependency philosophy (raw `postMessage`, no Comlink).

Worker (client-only; imports the zero-dep parser — `transpilePackages` makes the TS import work; never import `next/server` or Node):
```ts
import { parseStaad } from "@staad-online/parser";

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  if (e.data.type !== "parse") return;
  parseStaad(e.data.text, (p) =>
    self.postMessage({ type: "progress", fraction: p } as ParseMessage),
  );
  // then: self.postMessage({ type: "result", result } as ParseMessage)
};
```
Typed protocol (discriminated union; shared by worker + main — lives in `web/lib`):
```ts
type ParseMessage =
  | { type: "ready" }
  | { type: "progress"; fraction: number }
  | { type: "result"; result: ParseResult }
  | { type: "error"; message: string };
type ParseRequest = { type: "parse"; text: string };
```
Main-thread creation (static path REQUIRED — no variables in `new URL`):
```ts
const worker = new Worker(
  new URL("./staad.worker.ts", import.meta.url),
  { type: "module" },
);
```
Landmines:
- **Static worker path** — `new URL` must be literal (`./staad.worker.ts`), never templated (both webpack and Turbopack require it).
- **`{ type: 'module' }`** is required so the worker can `import` the transpiled parser package.
- **R-1 (HIGH)**: Turbopack `new Worker(new URL(...))` regressed in production Next 16.2+. Verify on `next@16.3.1`; fallback `next build --webpack` for the worker path. Plan MUST include a build+run verification task (open a >2 MB file, confirm progress bar + main thread not blocked).

### 2.6 `web/components/LoadingOverlay.tsx` + `.module.css` — determinate progress (D-07)

Closest analog: the existing overlay itself (`LoadingOverlay.tsx:12`) — **enhance, don't replace**. Keep `aria-live="polite"` / `aria-busy="true"` on the overlay and the spinner for the sync (<2 MB) path; add a determinate bar + % only when `fraction` is available.

Conventions:
- "use client" at top (`LoadingOverlay.tsx:1`) — REQUIRED on any component reading store/local React state.
- Import the CSS module as `import styles from "./LoadingOverlay.module.css"` (matches all components).
- Read progress from the store (recommended `modelStore.progress`, RESEARCH §6) via a selector hook like `useModelStore((s) => s.progress)` — matches `StatsSummary.tsx:25`.
- Props: add optional `fraction?: number | null`; render bar + `{Math.round(fraction * 100)}%` when defined, else spinner.

Target shape:
```tsx
export function LoadingOverlay({ fraction }: { fraction?: number | null }) {
  const determinate = fraction != null;
  const pct = determinate ? Math.round(fraction * 100) : 0;
  return (
    <div className={styles.overlay} aria-live="polite" aria-busy="true">
      {determinate ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className={styles.bar}
          >
            <div className={styles.barFill} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.label}>Opening… {pct}%</p>
        </>
      ) : (
        <>
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.label}>Opening…</p>
        </>
      )}
    </div>
  );
}
```

CSS: match the existing overlay's token language (`LoadingOverlay.module.css`):
- Overlay scrim `rgba(0, 0, 0, 0.25)` (`:3`) / dark `rgba(0, 0, 0, 0.4)` (`:38`).
- For the bar, follow the **glass card** treatment from `StatsSummary.module.css:3` — `background: rgba(255,255,255,0.65); -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255,255,255,0.45); border-radius: 20px;` (radius 20 from UI-SPEC).
- Keep the dark-mode variant (`StatsSummary.module.css:337`: `rgba(28,28,30,0.72)`), `prefers-reduced-motion` (bar width transition → none / opacity only), `prefers-reduced-transparency` (solid bg, no blur), and `prefers-contrast: more` (1px `#9a9aa0` border) blocks — copy these verbatim patterns.
- Mono readout for the % (`ui-monospace, "Cascadia Mono", Consolas, monospace` — `StatsSummary.module.css:155`); 44px-touch-target not needed on a read-only bar.

### 2.7 `web/store/modelStore.ts` — optional `progress` field (D-07)

Closest analog: the store itself (`modelStore.ts`) and `viewerStore.ts`. Follow the established Zustand slice pattern: `create<State>((set) => ({ ... }))` from `"zustand/react"`, plain data + action functions, header doc citing the decision.

Replicate the slice shape (`modelStore.ts:25`):
```ts
export const useModelStore = create<ModelStoreState>((set) => ({
  status: "empty",
  model: null,
  warnings: [],
  fileName: null,
  progress: null,                       // NEW (D-07): number | null
  beginLoading: () => set({ status: "loading", progress: null }),
  setProgress: (progress) => set({ progress }),      // NEW (D-07)
  setModel: (result, fileName) =>
    set({ status: "ready", model: result.model, warnings: result.warnings, fileName, progress: null }),
  setError: () => set({ status: "empty", fileName: null, progress: null }),
}));
```
Conventions: add `progress: number | null` to the `ModelStoreState` interface (line 15); reset to `null` on `beginLoading` / `setModel` / `setError`. Matches the existing FILE-03 reset discipline (each transition nulls transient state).

### 2.8 `web/app/page.tsx` — route through `parseModel` (D-03/D-05)

Closest analog: itself — `openFile` (`page.tsx:55`). Replace the direct `readStdFile`→`parseStaad` block with `parseModel`, keeping the **exact** commit path and the `openToken` abort discipline.

Replicate (do NOT change these — they are the shared commit path):
- `const token = ++openToken.current;` + `if (token !== openToken.current) return;` guards (`page.tsx:58,65,67,79`).
- `useModelStore.getState().beginLoading();` (`:61`).
- Commit: `useModelStore.getState().setModel(result, name);` + `useViewerStore.getState().resetSceneState(result.model.loadCases[0]?.id, supports/loadCases present)` (`:68–77`).
- Error handling: `ERROR_CODE_MAP` (`:42`), `FileServiceError` → `setError(ERROR_CODE_MAP[e.code])`, else `PARSE` + detail; `setError()` + `resetSceneState(undefined, false)` (`:78–91`).

Changes:
- Import `parseModel` from `@/lib/parseModel`; call `const result = await parseModel(text, (f) => useModelStore.getState().setProgress(f))` instead of `parseStaad(text)` (`:66`).
- The `LoadingOverlay` render (`:176`) passes the progress: `<LoadingOverlay fraction={progress} />` reading `useModelStore((s) => s.progress)`.
- Keep the native open entry: for Android, a picker button triggers `readNativeFile` → same `parseModel` path. The `OpenControl` (`onOpen` prop is `(file: File) => void`, `OpenControl.tsx:16`) covers web; the native entry is a new small component/button (matches OpenControl's role: owns picker mechanics, page owns wiring).
- Landmine: `LoadingOverlay` currently takes no props (`page.tsx:176`); make `fraction` optional so the sync path and any other consumer compile unchanged.

### 2.9 `web/next.config.ts` — add `output: 'export'` (D-09)

Closest analog: itself. Minimal edit — preserve `transpilePackages` (REQUIRED — parser ships TS source) and add `output`.
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@staad-online/parser"],
  output: "export",
};

export default nextConfig;
```
Landmines:
- **`basePath` / `assetPrefix` must stay `''` (defaults)** — the export is served by Capacitor's local WebView origin (`http://localhost`); a subpath would break it (RESEARCH §1.3). Root-relative `/` asset paths are correct.
- `trailingSlash`: keep default (false).
- The `images` config is only needed if `next/image` appears — currently none, so leave it (RESEARCH §1.3).
- `next build` now emits to `web/out/` (no Node server / no `next start`).

### 2.10 `web/capacitor.config.ts` (NEW) + `web/android/` + `assets/` + `web/package.json`

Config conventions: a plain TS object at `web/` (recommended ownership, RESEARCH §1.2) with `webDir: 'out'`:
```ts
import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.staadonline.viewer",
  appName: "STAAD Online",
  webDir: "out",
};
export default config;
```
`package.json` — add scripts following the existing `scripts` block style (`web/package.json:5`):
```jsonc
"build:android": "next build && cap sync android && cd android && ./gradlew assembleRelease",
"bundle:android": "next build && cap sync android && cd android && ./gradlew bundleRelease",
```
Landmines:
- **AGP 9 do-not-upgrade** — keep AGP 8.13.x; use `proguard-android-optimize.txt` in `android/app/build.gradle` (RESEARCH R-2). Don't accept Studio's AGP upgrade.
- **Keystore never committed** — git-ignore `*.jks` and `keystore.properties`; secrets via env vars / ignored properties file (RESEARCH §2.2/2.3).
- **`cap sync` staleness** — must `next build` THEN `cap sync` THEN gradle; bake the order into scripts (RESEARCH R-4).
- `cap sync` overwrites `android/` only on `cap add`; subsequent syncs just refresh `assets/public`. Icon/splash edits happen in `android/app/src/main/res/` via `@capacitor/assets` (RESEARCH §1.3/§2.4).
- `AGENTS.md` block is re-added by `next dev` — don't strip it from diffs (RESEARCH §8).

---

## 3. Cross-cutting patterns to preserve

- **One-way pipeline** (parse → model → render): the worker produces the SAME `StaadModel` and the main thread consumes it via the SAME `setModel` commit — never renderer-owned parsing (RESEARCH §5.4).
- **Platform boundary at FileService** (ARCHITECTURE Pattern 4): web branch exists; native branch lands in the same file; `page.tsx` stays branch-agnostic by consuming `OpenedFile`.
- **Token guards**: `openToken` ref + `if (token !== openToken.current) return;` after every `await` — extends to the worker relay (stale worker `result` ignored after a repeat-open; the singleton worker is NOT killed, RESEARCH §5.3).
- **`setModel` is atomic / never incremental** (`modelStore.ts:33`); `setError` restores EMPTY without touching model/warnings (FILE-03).
- **Zustand slice**: `create<State>((set) => ({}))` from `"zustand/react"`, plain data + actions, per-transition reset of transient state.
- **Glass token language**: `rgba(255,255,255,0.65)` + `blur(20px) saturate(180%)`, radius 20, `#1d1d1f`/`#6e6e73` text, mono readouts, 44px touch targets, dark-mode `rgba(28,28,30,0.72)`, `prefers-reduced-motion/transparency/contrast` blocks (02-UI-SPEC).
- **Zero-dependency philosophy** for the parser + worker protocol (raw `postMessage`, no Comlink).
- **Pure/worker-safe**: parser callback must not capture `postMessage` or React; the worker wraps it.

---

## 4. Conventions checklist (style invariants)

- `"use client"` as the FIRST line of every client component (`LoadingOverlay.tsx:1`, `OpenControl.tsx:1`, `StatsSummary.tsx:1`, `page.tsx:1`). `web/lib` TS files do NOT need it (plain modules).
- CSS module import: `import styles from "./X.module.css"` with camelCase class usage (`styles.overlay`).
- JSDoc headers on every public symbol citing phase/decision ids (`(D-06)`, `(D-07)`, `ARCHITECTURE.md Pattern 4`).
- TypeScript strict; `import type` for type-only imports (see `modelStore.ts:13`, `page.tsx:24`).
- Path aliases: `@/lib/...`, `@/store/...`, `@/components/...` (see `page.tsx` imports).
- Text values rendered as React text nodes only — no `dangerouslySetInnerHTML` (T-02-01).
- Never re-check size/extension in `page.tsx` — guards live inside FileService (FILE-04).

---

## 5. Landmine summary

| Landmine | Where it bites | Rule |
|----------|----------------|------|
| R-1 Turbopack `new Worker(new URL())` production regression | `staad.worker.ts` / build | Verify on `next@16.3.1`; fallback `next build --webpack`; add build+run verification task |
| `fetch('content://…')` raw fails | `readNativeFile` | Always `Capacitor.convertFileSrc(path)` first (R-3) |
| Picker file has no `.size` up front | `readNativeFile` guard | Probe size (blob.size / content-length) before `blob.text()` so `TOO_LARGE` fires pre-read (R-5) |
| FILE-03 cancel must be strict no-op | `readNativeFile` | Return without `beginLoading`/store write/error when `pickFiles` empty |
| `transpilePackages` must stay in `next.config.ts` | static export | Do NOT remove when adding `output: 'export'` |
| `basePath`/`assetPrefix` must stay default `''` | static export + Capacitor | A subpath breaks local WebView serving (D-09) |
| `"use client"` directive | `LoadingOverlay.tsx` | Required on any component reading React/store state |
| Static worker path in `new URL` | `staad.worker.ts` | Literal path only — no template variables |
| AGP 9 upgrade temptation | `android/app/build.gradle` | Keep AGP 8.13.x; `proguard-android-optimize.txt` |
| Keystore committed | repo `.gitignore` | Ignore `*.jks`, `keystore.properties`; secrets via env |
| `cap sync` staleness | build scripts | Order: `next build` → `cap sync` → gradle (R-4) |
| CSS module naming | `LoadingOverlay.module.css` | Match existing `<Name>.module.css` + camelCase class access |
| `AGENTS.md` block re-added by `next dev` | diffs | Don't strip it from commits |

---

## 6. Open decisions the planner resolves (from RESEARCH §9)

1. Exact `applicationId` (default `com.staadonline.viewer`) + display name "STAAD Online".
2. Keystore mechanics (local `keystore.properties` git-ignored vs env vars vs CI).
3. `capacitor.config.ts`/`android/` location (recommended: `web/`).
4. Progress granularity (per-block vs per-line/per-token) + throttle cadence.
5. Progress state location (`modelStore.progress` vs local state) — recommended store.
6. Build script shape (`build` → `sync` → `gradle assembleRelease/bundleRelease`).
7. `parseModel` helper vs inline in `page.tsx` — recommended helper (`web/lib/parseModel.ts`).
8. Threshold constant `2_000_000` and its home in `web/lib`.

---

*Phase 4 pattern mapping for: STAAD Online — Capacitor Android packaging (offline, signed release) + worker-based large-file parse with progress.*
*Mapped: 2026-08-19*
