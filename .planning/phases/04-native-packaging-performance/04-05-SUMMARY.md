---
phase: 04-native-packaging-performance
plan: 05
subsystem: infra
tags: [capacitor, android, nextjs, static-export, signing, gradle, icons, splash]

# Dependency graph
requires:
  - phase: 02-file-opening-3d-rendering
    provides: Next.js 16 web app (web/) with transpilePackages parser config
provides:
  - Capacitor 8 Android shell (web/android/ generated native project, AGP 8.13.x)
  - Next.js output:'export' static export served by Capacitor local WebView server (offline by construction)
  - Release signingConfig wired from git-ignored keystore.properties/env
  - Icon/splash resources generated via @capacitor/assets (placeholder artwork)
  - build:android / bundle:android scripts (next build -> cap sync -> gradle)
affects: [04-06 integration/verification, native file-picker branch (PLAT-03), worker (PERF-01)]

# Tech tracking
tech-stack:
  added: [@capacitor/core 8.5.0, @capacitor/android 8.5.0, @capacitor/cli 8.5.0, @capacitor/assets 3.0.5, @capawesome/capacitor-file-picker 8.0.4, AGP 8.13.0, Gradle 8.14.3]
  patterns: [static export -> cap sync -> assets/public bundling (offline by construction, no SW), signing secrets via git-ignored keystore.properties/env, proguard-android-optimize.txt with AGP 8.13.x]

key-files:
  created: [web/capacitor.config.ts, web/android/ (generated), web/assets/ (icon/splash sources), web/android/app/src/main/res/ (generated), web/android/keystore.properties (git-ignored), web/android/staad-online-release.jks (git-ignored)]
  modified: [web/next.config.ts, web/package.json, package-lock.json, web/android/app/build.gradle, web/android/app/src/main/AndroidManifest.xml, .gitignore]

key-decisions:
  - "Capacitor 8 stack pinned to ^8.5.0; Capacitor 9 explicitly NOT targeted (R-2/T-04-26)"
  - "@capawesome/capacitor-file-picker pinned to ^8.0.4 (latest current stable matching Capacitor 8), not the plan-example 6.x"
  - "AGP kept at 8.13.0 (NOT 9); release proguard uses proguard-android-optimize.txt (R-2/T-04-22)"
  - "next.config.ts output:'export' with basePath/assetPrefix left '' so the local WebView origin serves it (D-09/T-04-25)"
  - "Signing secrets live only in git-ignored web/android/keystore.properties / env vars (T-04-21)"
  - "Icon/splash sources are generated PLACEHOLDER images (no real artwork available); replace before release"

patterns-established:
  - "Offline Android app: next build (output:'export') -> cap sync android -> assets/public served by local WebView server; no service worker (D-09/PLAT-02)"
  - "Build order enforced in scripts: next build -> cap sync android -> gradlew (R-4/T-04-24)"
  - "Release signing reads git-ignored keystore.properties with env-var fallback; keystore never committed"

requirements-completed: [PLAT-01, PLAT-02]

# Metrics
duration: 36 min
completed: 2026-08-19
---

# Phase 04 Plan 05: Capacitor Android Shell + Offline Static Export Summary

**Capacitor 8 Android shell generated (web/android/, AGP 8.13.x) wired for signed release (git-ignored keystore secrets, proguard-android-optimize.txt) around a Next.js output:'export' static bundle that cap sync copies into the local WebView assets — offline by construction (PLAT-01/PLAT-02 scaffold).**

## Performance

- **Duration:** 36 min
- **Started:** 2026-08-19T12:14:00Z
- **Completed:** 2026-08-19T12:50:41Z
- **Tasks:** 6 (all type="auto", tdd="false")
- **Files modified:** 87

## Accomplishments

- Static export configured: `web/next.config.ts` adds `output: "export"` (keeps `transpilePackages`), basePath/assetPrefix left unset so the Capacitor WebView's local origin serves it (D-09).
- `web/capacitor.config.ts` created (appId `com.staadonline.viewer`, appName "STAAD Online", webDir `out`); `next build` emits `web/out/index.html`.
- Capacitor 8 stack installed (`@capacitor/core`/`android`/`cli` ^8.5.0, `@capacitor/assets` 3.0.5, `@capawesome/capacitor-file-picker` 8.0.4); `npx cap --version` → 8.5.0 (not 9).
- `cap add android` generated `web/android/` (AGP 8.13.0, Gradle 8.14.3); release proguardFiles switched to `proguard-android-optimize.txt` (R-2, avoids the AGP-9-removed form).
- Release `signingConfigs.release` wired reading git-ignored `keystore.properties` (env-var fallback); keystore generated locally, both git-ignored (T-04-21).
- Icon/splash resources generated into `web/android/app/src/main/res/` via `capacitor-assets generate --android` (placeholder artwork; OS-managed splash, no runtime splash plugin).
- `build:android` / `bundle:android` scripts added with the correct `next build -> cap sync android -> gradlew` order (R-4/T-04-24).
- Bundling loop verified: `cap sync android` copied the static export into `web/android/app/src/main/assets/public/index.html`; bundle is self-contained (no external asset/host references, no app-code `fetch`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Capacitor 8 stack + file-picker plugin** - `4873bf3` (chore)
2. **Task 2: Static export config + capacitor.config.ts (D-09, D-08)** - `8b2c238` (feat)
3. **Task 3: Generate Android project + verify AGP 8.13.x (D-08, R-2)** - `4b9a5f9` (feat)
4. **Task 4: Wire release signingConfig + git-ignore secrets (D-08)** - `836c909` (feat)
5. **Task 5: Icon + splash via @capacitor/assets (D-08)** - `4c5ae72` (feat)
6. **Task 6: Verify cap sync bundles the static export (D-09, PLAT-02)** - no tracked changes (cap sync output is gitignored generated assets)

**Plan metadata:** `docs(04-05): complete Capacitor Android shell plan` (final metadata commit below).

## Files Created/Modified

- `web/next.config.ts` - added `output: "export"`, kept `transpilePackages` (D-09)
- `web/capacitor.config.ts` (new) - appId/appName/webDir for the Capacitor shell (D-08)
- `web/package.json` + `package-lock.json` - Capacitor 8 deps, file-picker, assets; build:android/bundle:android scripts
- `web/android/` (generated) - Capacitor 8 native Android project (AGP 8.13.0, Gradle 8.14.3)
- `web/android/app/build.gradle` - release `signingConfigs.release` from git-ignored keystore.properties/env; `proguard-android-optimize.txt`
- `web/android/app/src/main/AndroidManifest.xml` - XML formatting normalized by capacitor-assets (no functional change)
- `web/android/app/src/main/res/` (generated) - icon/splash mipmap/drawable resources
- `web/assets/` (new) - icon-only/foreground/background (1024), splash/splash-dark (2732) placeholder sources
- `.gitignore` - added `out/`, `*.jks`, `keystore.properties` (T-04-21)
- `web/android/staad-online-release.jks` (git-ignored, local only) - release keystore
- `web/android/keystore.properties` (git-ignored, local only) - release signing passwords

## Decisions Made

- **Capacitor 8 pinned ^8.5.0; Capacitor 9 NOT targeted** (R-2/T-04-26) — matches STACK.md and RESEARCH §1.1.
- **`@capawesome/capacitor-file-picker@^8.0.4`** — plan's example said `^6.0.0` but explicitly instructed "verify current major against npm; use the latest current stable". Current stable (8.0.4) peers `@capacitor/core >=8.0.0`, so 8.x was used. This is the intended "current stable" choice, not a deviation.
- **`@capacitor/assets@3.0.5`** — plan pinned `^3.0.0`; installed latest 3.0.5. It pulls a transitive `@capacitor/cli@5.7.8` as an internal dependency of the assets tool only; the app's Capacitor stack (top-level cli/core/android) is 8.5.0.
- **AGP 8.13.0 (NOT 9) + `proguard-android-optimize.txt`** — the generated template used `proguard-android.txt` (the AGP-9-removed form); switched per R-2/T-04-22.
- **Signing secrets git-ignored** (T-04-21) — keystore + keystore.properties committed to neither repo nor tracked state.
- **Placeholder icon/splash artwork** — generated at exact required dimensions (no real art available); documented for replacement before release.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Generated template used `proguard-android.txt` (AGP-9-removed form)**
- **Found during:** Task 3 (Generate Android project + verify AGP)
- **Issue:** Capacitor 8's generated `app/build.gradle` used `getDefaultProguardFile('proguard-android.txt')`, the form AGP 9 removes — this is exactly the R-2/T-04-22 landmine the plan requires avoiding.
- **Fix:** Changed to `getDefaultProguardFile('proguard-android-optimize.txt')` in the release buildType.
- **Files modified:** web/android/app/build.gradle
- **Verification:** Grep confirms `proguard-android-optimize.txt` present; AGP stays 8.13.0 in variables/build.gradle.
- **Committed in:** `4b9a5f9` (Task 3 commit)

**2. [Rule 3 - Blocking] `out/` static export left untracked by the build**
- **Found during:** Task 2 (Static export config)
- **Issue:** `next build` with `output: 'export'` generates `web/out/`, which was not gitignored (commit protocol step 7: never leave generated output untracked).
- **Fix:** Added `out/` to the root `.gitignore` (Task 4 later adds the keystore patterns to the same file).
- **Files modified:** `.gitignore`
- **Verification:** `git status` clean of `web/out/`; build still emits it.
- **Committed in:** `8b2c238` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes required for correctness and clean repo hygiene; no scope creep.

## Issues Encountered

- **Task 6 produced no tracked changes:** `cap sync android` output (bundled `assets/public/`, `capacitor.config.json`, etc.) is intentionally gitignored and regenerated on every build. The bundling was verified directly (index.html present, self-contained) but there was nothing to commit. Task 6's verification is recorded here, not as a code commit.

## Blocked Verification Item (environment — NOT fabricated)

- **`web/android && .\gradlew.bat assembleDebug` (Task 3 / plan verification) FAILED — blocked by environment:**
  - Exact error: `SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable or by setting the sdk.dir path in your project's local properties file at 'E:\Software Development\STAADONLINE\web\android\local.properties'.`
  - Root cause: No Android SDK, no Android Studio, and no `sdkmanager` exist on this machine (checked `ANDROID_HOME`, `C:\Users\SEMSo\AppData\Local\Android\Sdk`, `C:\Android\Sdk`, `D:\Android\Sdk`). The default `java` on PATH is a broken javapath stub (crashes with exit 0xC0000005); a working JDK 20 exists at `C:\Program Files\Java\jdk-20` and Gradle 8.14.3 runs under it, but there is no SDK to compile against.
  - **What was completed despite this:** all config/file tasks that do not require an SDK — cap add android (project generated), AGP 8.13.0 verified, proguard-android-optimize.txt applied, signing wired, assets generated, cap sync bundling verified.
  - **Unblocked when:** an Android SDK (or Android Studio) is installed and `ANDROID_HOME`/`local.properties sdk.dir` is set. The final `assembleRelease`/`bundleRelease` signed-build verification lands in plan 04-06 and depends on this.
  - **Re-run command once the SDK exists:** `$env:JAVA_HOME="C:\Program Files\Java\jdk-20"; cd web/android; .\gradlew.bat assembleDebug`

## Known Stubs

- **Placeholder icon/splash assets** (`web/assets/*.png`) — solid-color placeholders at the exact required dimensions (icon 1024, splash 2732). Generated because no real artwork was available. They render as a solid background + centered block. **Replace with real branding before the 04-06 release build**; re-run `npx capacitor-assets generate --android` to regenerate `res/`. This does not block the plan goal (offline shell + config) but should not ship to production as-is.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Capacitor Android shell scaffold complete: static export, capacitor.config.ts, native project (AGP 8.13.x), release signing wired, icons/splash, build scripts.
- **Blocked for 04-06:** the signed release build (`assembleRelease`/`bundleRelease`), on-device install, and R-1 worker verification require an Android SDK, which is not present on this machine. The native file-picker branch (PLAT-03, `readNativeFile` in `web/lib/fileService.ts`) and worker parsing (PERF-01) can proceed independently of the SDK.
- `.planning/` is NOT gitignored here, so the metadata commit is expected to succeed.

---
## Self-Check: FAILED

- ✅ All 7 created files exist on disk (capacitor.config.ts, next.config.ts, app/build.gradle, assets sources, bundled assets/public/index.html, SUMMARY.md)
- ✅ All 5 task commits exist (4873bf3, 8b2c238, 4b9a5f9, 836c909, 4c5ae72)
- ✅ All plan-level verifications pass EXCEPT the Gradle native build
- ❌ `web/android && .\gradlew.bat assembleDebug` — could NOT be satisfied (blocked by environment): no Android SDK / Android Studio / sdkmanager on this machine → `SDK location not found ... define a valid SDK location ... at 'web/android/local.properties'`. Not a code defect; unblocks once an Android SDK + ANDROID_HOME are installed. See "Blocked Verification Item" above.

Because one plan acceptance criterion remains unmet (the assembleDebug native build, blocked by the environment rather than a fixable issue), this plan self-check is recorded as FAILED. All configuration/file deliverables of the plan are complete and verified.

---
*Phase: 04-native-packaging-performance*
*Completed: 2026-08-19*