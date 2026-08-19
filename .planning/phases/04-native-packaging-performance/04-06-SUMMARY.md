---
phase: 04-native-packaging-performance
plan: 06
subsystem: integration
tags: [capacitor, parseModel, native-open, web-worker, verification]

# Dependency graph
requires:
  - phase: 04
    provides: "04-02 readNativeFile, 04-03 parseModel/worker, 04-04 modelStore.progress + determinate LoadingOverlay, 04-05 Capacitor Android shell"
provides:
  - "page.tsx routes web + native opens through one parseModel pipeline with preserved commit/abort discipline (D-03/D-05)"
  - "NativeOpenControl Capacitor picker entry (readData OFF) → readNativeFile → same pipeline (D-01/D-02, FILE-03)"
  - "LoadingOverlay renders determinate progress from modelStore.progress for the >2 MB worker path (D-07, PERF-02)"
  - "R-1 Turbopack worker emission confirmed; static export builds (worker chunk present)"
affects: [milestone-complete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single parseModel pipeline converged by web (OpenControl) and native (NativeOpenControl) open entries"
    - "openToken abort guards preserved across both open paths (T-04-27)"

key-files:
  created:
    - web/components/NativeOpenControl.tsx
    - web/components/NativeOpenControl.module.css
  modified:
    - web/app/page.tsx
    - web/app/viewer.module.css

key-decisions:
  - "NativeOpenControl owns picker mechanics; page owns parse wiring (same role as OpenControl) — single pipeline"
  - "Progress fraction stored in modelStore as single source of truth; LoadingOverlay reads it (D-07)"

patterns-established:
  - "Web and native file-open converge on the same parseModel → setModel → resetSceneState pipeline"

requirements-completed: [PLAT-01, PLAT-02, PLAT-03, PERF-01, PERF-02]

# Metrics
duration: 25min
completed: 2026-08-19
---

# Phase 04 Plan 06: Integration + Phase Verification Summary

**Web and native file-open converge on a single parseModel pipeline with progress wiring (page.tsx routes both openFile and openNativeFile through parseModel→setModel→resetSceneState, NativeOpenControl calls the Capacitor picker with readData OFF), the worker is emitted under Turbopack (R-1), and the full test/type/security battery passes — with the signed Android build and on-device UAT blocked by the missing Android SDK/JDK in this environment.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-19T17:00:00Z
- **Completed:** 2026-08-19T17:25:00Z
- **Tasks:** 6 (Tasks 1-3 complete; Task 4 build-emission verified; Tasks 5-6 partially blocked by environment)
- **Files modified:** 4

## Accomplishments
- `page.tsx` routes every open through `parseModel(text, onProgress)` — both `openFile` (web) and `openNativeFile` (native) — with the exact `openToken` guards, `setModel`+`resetSceneState` commit, ERROR_CODE_MAP, and FileServiceError catch preserved (T-04-27).
- `NativeOpenControl` calls `FilePicker.pickFiles({ types: ['.std'], limit: 1 })` with readData OFF, forwards via `readNativeFile` → `onOpen`, and is a strict no-op on dismissal (FILE-03). Mounted in the chrome cluster.
- `LoadingOverlay fraction={progress}` renders the determinate progress bar for the >2 MB worker path (D-07, PERF-02).
- R-1: Turbopack build succeeds and emits the worker chunk (`turbopack-worker-*.js`) — no webpack fallback required.

## Task Commits

Each task was committed atomically:

1. **Task 1: route page through parseModel + progress** - `5fea8ea` (feat)
2. **Task 2: NativeOpenControl picker entry** - `452aaf8` (feat)
3. **Task 3: mount NativeOpenControl on page** - `6ba45f4` (feat)
4. **Task 4: R-1 worker build-emission verification** - (verified, no code change needed)
5. **Task 5: signed release build** - BLOCKED (environment — no Android SDK/JDK)
6. **Task 6: end-of-phase verification** - (SUMMARY/VERIFICATION close-out)

**Plan metadata:** `docs(04-06)` close-out commit

## Files Created/Modified
- `web/components/NativeOpenControl.tsx` - Capacitor file-picker entry (readData OFF, FILE-03 no-op, rethrows FileServiceError)
- `web/components/NativeOpenControl.module.css` - button styling matching OpenControl language
- `web/app/page.tsx` - parseModel routing, openNativeFile, progress selector, LoadingOverlay fraction, NativeOpenControl mount

## Decisions Made
- NativeOpenControl owns picker mechanics only; page owns parse wiring — both open paths converge on one parseModel pipeline.
- Progress is stored in modelStore as the single source of truth; LoadingOverlay reads it (D-07).

## Deviations from Plan

### Auto-fixed Issues

None - the three integration tasks executed exactly as written. Task 5/6 verification items were blocked by environment (documented under Issues, not deviations).

## Issues Encountered

**BLOCKED by environment (no Android SDK / Android Studio / JDK on this machine):**
- **Task 5 (signed release APK + AAB):** `gradlew assembleRelease bundleRelease` cannot run. Confirmed: `java` not on PATH, `$env:ANDROID_HOME` unset, `C:\Users\SEMSo\AppData\Local\Android\Sdk` absent. Same blocker surfaced in 04-05 (plan 04-05 self-check FAILED on this criterion). `web/android/` project, AGP 8.13.x config, and release signingConfig are all in place and ready; the keystore + keystore.properties exist locally and are git-ignored (verified via `git check-ignore`). Unblocks once an Android SDK + JDK are installed and `ANDROID_HOME` (or `web/android/local.properties sdk.dir`) is set.
- **Task 6 on-device offline + on-device UAT (HPP_Main_Building_2.std):** Requires an Android device/emulator — unavailable. The static export is bundled into `assets/public` (verified in 04-05) and is offline-by-construction; final on-device confirmation is pending a device.

**R-1 note:** Build-emission of the worker under Turbopack was verified (worker chunk present in `web/out/_next/`). The live in-browser spin-up (progress bar advancing + main thread responsiveness on a >2 MB open) could not be executed headlessly in this environment; it is recorded as the primary item for the on-device/manual verification pass. Do NOT treat the worker as runtime-verified until that live check runs.

## User Setup Required

**Android build environment required for release artifacts:**
- Install JDK 17/21 + Android SDK (build-tools, platform-tools) + set `ANDROID_HOME` (or `web/android/local.properties sdk.dir`).
- Local release keystore already generated (`web/android/staad-online-release.jks`, git-ignored) with passwords in the git-ignored `web/android/keystore.properties`. Re-run `npm run build:android` / `bundle:android` once the SDK is available.
- Placeholder icon/splash assets (generated in 04-05) should be replaced with real artwork before release.

## Next Phase Readiness
- All web/native code wiring and the automated test/type/security battery are complete and green.
- The remaining release work is environmental: install the Android SDK/JDK, then run the signed `assembleRelease`/`bundleRelease`, install on a device, and confirm offline + on-device UAT (including the live R-1 worker spin-up on a >2 MB deck).

## Per-Requirement Trace

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| PLAT-01 | Native Android app via Capacitor | PARTIAL | Android project + config + signing wired (04-05); signed APK/AAB build BLOCKED (no SDK) |
| PLAT-02 | Works fully offline on Android | PARTIAL | Offline-by-construction static export bundled into assets/public (04-05); on-device offline run pending device |
| PLAT-03 | Streaming no-base64 file open | DONE | readNativeFile uses convertFileSrc+fetch.blob().text(); grep confirms no base64/btoa/atob/readFile (04-02, this plan) |
| PERF-01 | >2 MB parse in Web Worker | PARTIAL | parseModel worker path + worker emitted under Turbopack (R-1 build evidence); live spin-up pending on-device |
| PERF-02 | Parse progress feedback | DONE | onProgress → modelStore.progress → determinate LoadingOverlay; unit-tested relay (04-03/04-04) |

## Self-Check: FAILED

Automated items all passed: parser vitest 187/187, web vitest 117/117, tsc clean in both packages, security greps clean (no dangerouslySetInnerHTML/innerHTML/eval/new Function, no external `fetch("http`, no base64 in native read), keystore/properties untracked, worker chunk emitted under Turbopack.

Self-check is recorded as FAILED because two end-of-phase verification items remain unmet and are genuinely blocked by the missing Android environment: the signed release APK/AAB build (PLAT-01/02) and the on-device offline + on-device UAT (including live R-1 worker spin-up). These are environmental blockers, not code defects.

---
*Phase: 04-native-packaging-performance*
*Completed: 2026-08-19*