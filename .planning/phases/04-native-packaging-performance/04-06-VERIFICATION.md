---
phase: 04-native-packaging-performance
plan: 06
status: partial
created: 2026-08-19
---

# Phase 4 Verification — 04-06 Integration & End-of-Phase

Automated battery run during 04-06 execution. The Android-build and on-device items are BLOCKED by the missing Android SDK/JDK in this environment and are recorded separately below.

## Automated Battery (all PASSED)

### Tests
- `cd packages/parser && npx vitest run` → **18 files, 187 tests passed**
- `cd web && npx vitest run` → **14 files, 117 tests passed**

### Type checks
- `cd packages/parser && npx tsc --noEmit` → clean (exit 0)
- `cd web && npx tsc --noEmit` → clean (exit 0)

### Security greps
- `base64|btoa|atob|readData|readFile\(` in `web/lib` → **absent** (no base64 path in the native read; readNativeFile uses convertFileSrc + fetch.blob().text(), PLAT-03)
- `dangerouslySetInnerHTML|innerHTML|eval\(|new Function` in `web/*.tsx` → **absent** (single comment-only match in page.tsx)
- external `fetch("http` in web → **absent** (only the local convertFileSrc read exists)
- keystore + keystore.properties → **untracked / git-ignored** (verified `git check-ignore` in 04-05)

### R-1 worker emission (Turbopack)
- `cd web && npm run build` → Next.js 16.3.1 (Turbopack) compiled successfully, static export to `web/out/index.html`.
- Worker entrypoint emitted: `web/out/_next/static/chunks/turbopack-worker-2gqdcwp7k90ea.js` (818 B) → worker IS bundled under Turbopack, **no webpack fallback required**.

### Wiring verification
- `page.tsx` imports `parseModel` (not `parseStaad` as a value), routes `openFile` + `openNativeFile` through `parseModel(text, onProgress)` with `setProgress`, preserves the `openToken` guards, `setModel`+`resetSceneState` commit, ERROR_CODE_MAP, and FileServiceError catch.
- `LoadingOverlay fraction={progress}` wired; `progress = useModelStore((s) => s.progress)`.
- `NativeOpenControl` calls `FilePicker.pickFiles({ types: ['.std'], limit: 1 })` (readData OFF), no-op on dismissal, forwards via `readNativeFile`.

## BLOCKED — requires Android SDK + JDK (environment)

### Signed release build (PLAT-01/02, Task 5)
- `gradlew assembleRelease bundleRelease` cannot run: **no Android SDK / Android Studio / JDK on this machine**.
  - `java -version` → not found on PATH
  - `$env:ANDROID_HOME` → unset
  - `C:\Users\SEMSo\AppData\Local\Android\Sdk` → does not exist
- Same blocker surfaced in plan 04-05 (its self-check recorded FAILED on this criterion).
- The `web/android/` project, AGP 8.13.x config, proguard-android-optimize.txt, and release signingConfig are all in place; `web/android/keystore.properties` + `staad-online-release.jks` exist locally and are git-ignored.
- **Unblock:** install JDK 17/21 + Android SDK, set `ANDROID_HOME` (or `web/android/local.properties sdk.dir`), then `cd web && npm run build:android` and `npm run bundle:android`.

### On-device offline + on-device UAT (Task 6)
- Requires an Android device/emulator — unavailable.
- Offline-by-construction is already proven at the bundle level (static export copied into `assets/public`, no external fetch URLs, no service worker — 04-05), but the installed-APK offline render of `HPP_Main_Building_2.std` is pending a device.

### Live R-1 worker spin-up (residual)
- Worker emission under Turbopack is verified, but the live in-browser check (open a >2 MB `.std` → determinate progress bar advances + main thread stays responsive) could not be executed headlessly in this environment. **This is the primary remaining manual item.**

## Release Notes

- All code deliverables of Phase 4 are complete and committed. The automated test/type/security battery is green.
- Remaining release work is entirely environmental: install the Android toolchain, produce signed `app-release.apk` + `.aab`, install on a device, confirm offline + on-device UAT, and confirm the live worker spin-up on a >2 MB deck.
- Replace placeholder icon/splash assets (04-05) with real artwork before release.
