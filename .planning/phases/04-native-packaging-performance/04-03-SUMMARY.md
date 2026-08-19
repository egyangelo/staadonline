---
phase: 04-native-packaging-performance
plan: 03
subsystem: perf
tags: [web-worker, postMessage, parseModel, module-worker, structured-clone]

# Dependency graph
requires:
  - phase: 04
    provides: "04-01 parseStaad(text, onProgress?) — the progress callback the worker relays (D-06)"
provides:
  - "parseModel(text, onProgress?) sync-vs-worker threshold branch (D-03, PERF-01)"
  - "Singleton module Web Worker (web/lib/staad.worker.ts) with raw typed postMessage protocol (D-04)"
  - "Structured-clone ParseResult return path (D-05) — the shape the stores/renderer consume"
affects: [04-04, 04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Web Worker with raw typed postMessage discriminated union (no Comlink)"
    - "Module worker created with static `new URL('./staad.worker.ts', import.meta.url)` + `{type:'module'}` (T-04-15)"
    - "Lazy singleton worker reused across opens, nulled on onerror (T-04-14)"

key-files:
  created:
    - web/lib/parseModel.ts
    - web/lib/staad.worker.ts
    - web/lib/parseModel.test.ts
  modified: []

key-decisions:
  - "Worker URL is a static literal (never templated) to guard the R-1 Turbopack worker-path regression (T-04-15)"
  - "Progress relay throttled to ≥1% fraction delta to bound postMessage spam (T-04-13)"
  - "Discriminated union on `type` with every message checked before cast; worker ignores non-parse, main ignores unknown types (T-04-11)"
  - "Client-only construction guarded by `typeof window !== 'undefined'`; getWorker throws outside browser"

patterns-established:
  - "Raw postMessage worker protocol with zero runtime deps (matches parser zero-dependency philosophy)"

requirements-completed: [PERF-01, PERF-02]

# Metrics
duration: 24min
completed: 2026-08-19
---

# Phase 04 Plan 03: Worker Parse Path Summary

**`parseModel` centralizes the sync-vs-worker threshold branch (>2M chars → singleton module Web Worker; else synchronous) with a raw typed postMessage protocol, throttled progress relay, and structured-clone ParseResult return — zero runtime dependencies.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-19T16:12:00Z
- **Completed:** 2026-08-19T16:36:00Z
- **Tasks:** 3
- **Files modified:** 3 (created)

## Accomplishments
- `parseModel(text, onProgress?)` with `WORKER_THRESHOLD = 2_000_000` — large files dispatch to the worker, small files parse synchronously (D-03, PERF-01).
- `staad.worker.ts` module worker calls `parseStaad`, relays progress via `{ type:'progress', fraction }` (≥1% throttle), posts the structured-cloned `ParseResult` (D-05), and degrades throws to `{ type:'error' }`.
- Typed `ParseMessage`/`ParseRequest` discriminated unions exported from `parseModel.ts` for the 04-04 overlay and 04-06 page to consume.
- Lazy singleton worker reused across opens, nulled on `onerror` (T-04-14); URL is the exact static literal `new URL('./staad.worker.ts', import.meta.url)` (T-04-15).

## Task Commits

Each task was committed atomically:

1. **Task 1: protocol types + threshold constant** - `8337c0c` (feat)
2. **Task 2: module worker** - `10f4523` (feat)
3. **Task 3: threshold branch + singleton + tests** - `7d32b0b` (test), `88e7580` (feat)

**Plan metadata:** `docs(04-03)` close-out commit (final metadata)

## Self-Check: PASSED

## Files Created/Modified
- `web/lib/parseModel.ts` - threshold constant, ParseMessage/ParseRequest protocol, parseModel + singleton getWorker + parseInWorker
- `web/lib/staad.worker.ts` - module worker onmessage handler, progress throttle, result/error post
- `web/lib/parseModel.test.ts` - 5 tests: sync path (no Worker), worker path (module type, progress relay, result resolve), singleton reuse

## Decisions Made
- Static literal worker URL to guard the R-1 Turbopack regression (T-04-15) — webpack fallback verification deferred to 04-06 build task.
- ≥1% fraction-delta throttle in the worker `post()` to bound message spam (T-04-13).

## Deviations from Plan

None - plan executed exactly as written. The worker URL, throttle, singleton-null-on-error, and discriminated-union protocol all match the plan's Task 2/3 action text.

## Issues Encountered

None. Verification passed: `vitest run lib/parseModel.test.ts` (5/5), `npx tsc --noEmit` clean, no `comlink` anywhere, exactly one `new Worker` call site with a literal module path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 04-04 consumes `ParseMessage` progress relay + `modelStore.progress`; 04-06 wires `parseModel` into page.tsx and runs the R-1 Turbopack worker verification (webpack fallback) during the end-of-phase build.

---
*Phase: 04-native-packaging-performance*
*Completed: 2026-08-19*