# Phase 4: Native Packaging & Performance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 4-Native Packaging & Performance
**Areas discussed:** Native file-open path, Web Worker architecture, Parse progress reporting, Android packaging & offline

---

## Native File Opening (PLAT-03)

| Option | Description | Selected |
|--------|-------------|----------|
| File-picker → URI → fetch blob | No base64, satisfies PLAT-03, no custom native code | ✓ (after judgment) |
| Custom native streaming plugin | True streaming, native Android code, heavier | |
| Accept base64 via Filesystem.readFile | Simplest, violates PLAT-03, ~1.33x memory blowup | (initially chosen, overridden) |

**User's choice:** Initially "Accept base64 via Filesystem.readFile", then delegated to judgment after the orchestrator flagged that it conflicts with this phase's own PLAT-03 / success criterion #3 ("no base64 reads").
**Notes:** Locked the file-picker → content URI → fetch blob → `blob.text()` path (D-01) — satisfies the no-base64 criterion without custom native code. FileService guards (FILE-03 cancel, FILE-04 size) carry over (D-02).

---

## Web Worker Architecture (PERF-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Threshold: >2MB in worker | Match PERF-01 literally; small files sync | ✓ |
| Always parse in worker | Uniform path, worker overhead for small files | |
| Worker per open | Cleanest isolation, per-open startup cost | |

| Option | Description | Selected |
|--------|-------------|----------|
| Raw postMessage + typing | Dependency-free typed protocol | ✓ |
| Comlink RPC wrapper | Nicer DX, adds dependency + indirection | |

| Option | Description | Selected |
|--------|-------------|----------|
| Structured clone of model | Same typed shape; fine within 64MB cap | ✓ |
| Transferable buffers only | Faster for very large, breaks model apart | |

**User's choice:** Threshold >2MB in worker; raw postMessage + typing; structured clone of the model.
**Notes:** Dedicated singleton Worker reused across opens (D-03, D-04, D-05).

---

## Parse Progress Reporting (PERF-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Add a parser progress callback | Real smooth progress; non-breaking extension | ✓ |
| Read progress + indeterminate parse | No parser change, no progress during parse | |
| Incremental parse in worker | Requires resumable parser API | |

| Option | Description | Selected |
|--------|-------------|----------|
| Enhance LoadingOverlay with progress bar | Consistent with glass chrome | ✓ |
| Separate modal | Distinct from small-file open overlay | |

**User's choice:** Add a parser progress callback; enhance LoadingOverlay with a determinate progress bar + percentage.
**Notes:** Progress applies to the worker (>2 MB) path (D-06, D-07).

---

## Android Packaging & Offline (PLAT-01/02)

| Option | Description | Selected |
|--------|-------------|----------|
| Signed release APK + config | Real distributable artifact | (extended) |
| Debug APK only | Test-only, not distributable | |
| Web/static export only | Defer signing/release | |
| — | — | |
| **Free-text:** single release APK + config + AAB package for Play Store | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Capacitor-served bundled static export | Offline by construction, no SW | ✓ |
| Add a service worker cache (web) | Beyond Android-only scope | |

| Option | Description | Selected |
|--------|-------------|----------|
| You decide | Claude picks id/name, documented as discretion | ✓ |
| Let me specify | User provides id/name now | |

**User's choice:** Single release APK build + config + AAB package for Play Store; Capacitor-served bundled static export for offline; app identity delegated to Claude.
**Notes:** App id/name/icon/splash are Claude's Discretion (D-08, D-09). Release keystore must not be committed.

---

## Claude's Discretion

- Android applicationId / package name, display name, Capacitor version, icon/splash assets.
- Worker progress-callback granularity, progress-bar visual details.
- Next.js static-export wrangling (basePath / asset paths) required for the Capacitor bundle.
- Release signing details (keystore path handling — not committed).

## Deferred Ideas

- Service-worker offline caching for the web (browser) path — beyond Android-only scope.
- iOS native packaging — pre-existing project deferral to a later milestone.
- Transferable-buffer model transfer — only if models outgrow the 64 MB cap.
