---
phase: 02-file-opening-3d-rendering
plan: 7
subsystem: ui
tags: [nextjs, page-controller, css-modules, drag-drop, file-service, ui-spec, a11y]

# Dependency graph
requires:
  - phase: 02-file-opening-3d-rendering
    provides: ViewerCanvas (02-05) + chrome components (02-06) + SceneBuilder (02-04) + fileService + modelStore (02-02)
  - phase: 01-parser-model
    provides: parseStaad / registerParsingCommands / MAX_INPUT_LENGTH
provides:
  - The viewer page: full-canvas 3D viewer + chrome overlay + EMPTY→LOADING→LOADED/ERROR state machine wired to FileService
  - viewer.module.css full UI-SPEC token set; globals.css system-ui stack; clock page.module.css retired
affects: [03-interaction-visualization]

# Tech tracking
tech-stack:
  added: [no new npm packages]
  patterns:
    - One-way pipeline: readStdFile → parseStaad → setModel → (ViewerCanvas rebuilds only on new model identity)
    - FILE-04 guards inside FileService; page never re-checks extension/size
    - FILE-03 cancel-safe: picer cancel no-ops; repeat-open token aborts stale in-flight open before commit
    - EMPTY→LOADING→LOADED state machine; ERROR restores EMPTY without touching model/warnings

key-files:
  created:
    - web/app/viewer.module.css
  modified:
    - web/app/page.tsx
    - web/app/globals.css
  removed:
    - web/app/page.module.css

key-decisions:
  - "page.tsx keeps registerParsingCommands() + parseStaad; all file I/O goes through readStdFile (D-10 platform boundary)"
  - "Repeat-open abort implemented with a monotonically increasing openToken ref (not a boolean) so late-arriving stale reads can never incorrectly commit against a newer open"
  - "Error code mapping table FileServiceError.code → toast ErrorCode; PARSE code + wrapped message for non-FileService throws (length-capped in ErrorToast)"
  - "viewer.module.css carries over page.module.css patterns (.grid/.cardValue/.cardLabel, mono .details, error/warnings/clean families) before the old module is deleted"

requirements-completed: [FILE-01, FILE-02, FILE-03, FILE-04]

# Metrics
duration: 30min
completed: 2026-08-17
---

# Phase 02: Plan 7 Summary

**Turned the home page into the viewer: `page.tsx` is now the controller wiring the full-canvas `ViewerCanvas` to a minimal chrome overlay (OpenControl, ExaggerationSlider, StatsSummary, ErrorToast, LoadingOverlay), funnelling every open/drop through `readStdFile → parseStaad → setModel` with the FILE-01..FILE-04 state machine, plus the complete UI-SPEC token system in a new `viewer.module.css` and the `system-ui` stack in `globals.css`. Old `page.module.css` retired.**

## Performance

- **Duration:** 30 min
- **Completed:** 2026-08-17
- **Tasks:** 3
- **Files modified:** 4 (1 created, 2 modified, 1 removed)

## Accomplishments
- **Task 1 — viewer page controller (FILE-01..04):** rewrote `web/app/page.tsx` into the D-11 viewer. Fixed full-canvas `ViewerCanvas` behind a floating chrome cluster (bottom-left: OpenControl + ExaggerationSlider; StatsSummary above; ErrorToast bottom-center; LoadingOverlay while LOADING). `handleOpen` resets error, bumps an `openToken` ref (aborting any in-flight open), `beginLoading()`, awaits `readStdFile(file)` (FILE-04 guards inside the service), `parseStaad(text)`, and commits `setModel(result, name)` — every await point checks the token so a stale read never commits (FILE-03/T-02-06). FileService errors map to toast codes; non-FileService throws map to `PARSE` with the wrapped message. Window-level drag-over/drop with a `dragOver` fill + dashed accent ring. Empty state ("No model loaded" + UI-SPEC copy) shows when `status === empty && !error`.
- **Task 2 — viewer.module.css + globals.css:** manual-tokens CSS module implementing the UI-SPEC contract: dominant canvas background `#F5F5F7`/`#0A0A0C`, spacing scale (4/8/16/24/32/48/64), radii (6/12/20/999), 4-size/2-weight type scale with tracking, carried-over `.grid`/`.cardValue`(24px 600)/`.cardLabel`(12px uppercase) + mono `.details` + error/warnings/clean families, dragover fill `rgba(0,122,255,0.12)`/`rgba(10,132,255,0.16)` + 2px dashed accent ring, ephemeral depth shadows, `will-change` on floating chrome, and the §Reduced-Motion/§Reduced-Transparency/§Contrast blocks (150ms opacity + `transform: none`; solid surfaces + no blur; 1px `#9A9AA0` border). `globals.css` now uses the `system-ui` stack + `color-scheme`. Old `page.module.css` deleted.
- **Task 3 — build wiring + verification seam:** `npm run build` (Next.js 16.3.1, Turbopack) compiles clean; `tsc --noEmit` clean; vitest 36/36 green; greps confirm no `dangerouslySetInnerHTML`, `viewer.module.css` present with `backdrop-filter`, `page.module.css` absent, `components.json` absent, `system-ui` in globals. Visual acceptance recorded as `<human-check>` (below).

## Task Commits

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | page.tsx viewer controller + open/drop wiring | `43fbcaa` | feat |
| 2 | viewer.module.css token system + globals.css | `43fbcaa` | feat |
| 3 | Build + typecheck + verification seam | `43fbcaa` | feat (same commit) |

**Plan metadata:** (SUMMARY.md committed after the feature commit)

## Files Created/Modified
- `web/app/page.tsx` — viewer controller: canvas + chrome composition, open/drop pipeline (readStdFile→parseStaad→setModel), token-abort logic, EMPTY/LOADING/LOADED/ERROR state machine.
- `web/app/viewer.module.css` — full UI-SPEC token set + motion/accessibility blocks.
- `web/app/globals.css` — `system-ui` stack, `color-scheme: light dark`, dominant canvas colors.
- `web/app/page.module.css` — removed after patterns carried into viewer.module.css.

## Decisions Made
- **Token-based abort**: an `openToken` ref (incremented per open) replaces a boolean abort flag. This is strictly safer than a single boolean because overlapping opens at different await depths cannot mislabel which open is stale (FILE-03 "repeat-open during LOADING aborts the in-flight open").
- **No drag-cancel stack**: dragenter/dragleave window handling uses `relatedTarget === null` to reset the fill on genuine leaves; drop always `preventDefault`s and forwards `files[0]`, else no-op (empty drops are safe no-ops).
- **visually-chrome-free canvas**: the `<Canvas>` is transparent; the `.page`/`body` backgrounds paint the dominant color, keeping D-12 chrome minimal and scene-owned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Type] `ErrorCode` import unused detail — adapter map added**
- **Found during:** Task 1 (typecheck)
- **Issue:** The plan's constant map said "WRONG_TYPE/TOO_LARGE/UNREADABLE → UI-SPEC copy" with the toast codes being a 4-code union (incl. PARSE). The `errorDetail` channel for the wrapped message on non-FileService throws was also required by FILE-04 copy.
- **Fix:** Added `ERROR_CODE_MAP` (FileServiceError code → `ErrorCode`) and `errorDetail` state threaded to `<ErrorToast detail>`. `ErrorToast` already caps detail at 200 chars (T-02-02).
- **Files modified:** web/app/page.tsx
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `43fbcaa`

**2. [Rule 1 - Bug] truthful empty-state condition**
- **Found during:** Task 3 (self-review)
- **Issue:** Rendering the empty state only on `status === empty` would leave stale chrome visible after an error; plan wants "EMPTY restored on error" visually coherent.
- **Fix:** `empty = status === 'empty' && !error` — a toast error shows its own surface without the misleading "No model loaded" heading.
- **Files modified:** web/app/page.tsx
- **Committed in:** `43fbcaa`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 type)
**Impact on plan:** Mechanical correctness fixes; plan semantics unchanged.

## Issues Encountered
- No browser in this environment for live interaction — visual acceptance deferred to `<human-check>` (human_verify_mode=end-of-phase).

## Threat Flags
None. All file-derived strings render as React text nodes, greps prove `dangerouslySetInnerHTML` absent (T-02-01); oversized/wrong-type rejected inside `readStdFile` before parse — page never allocates the text (T-02-02); cancel-safe picker + token-abort prevent partial commits (T-02-03); drag events only `preventDefault` + single-file `files[0]`, no accumulation (T-02-04); zero network calls incl. drag-drop path (T-02-05); token ensures one `setModel` per completed read (T-02-06); no installs (T-02-SC).

## Known Stubs
- Native (Capacitor) file-picker branch of FileService remains stubbed (Phase 4, D-10) — web branch fully implemented.
- `LoadingOverlay` presentational: repeat-open abort is handled in page.tsx per UI-SPEC (no control of its own inside the overlay).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 2 function-complete. `<human-check>` items for end-of-phase verification (browser session required):

- [ ] Open `staadSample/HPP_Main_Building_2.std` via the picker → Loaded status + camera fits the whole frame in one motion
- [ ] Orbit/zoom/pan respond to mouse AND touch; damping soft-stops at the clamped min/max distance
- [ ] Slider (15× default) changes member width continuously at 1:1 with the pointer
- [ ] Exaggeration change rescales geometry without a rebuild (no scene pop/remount)
- [ ] Stats card expands after load, collapses on chevron; bounds/units/warning chips correct
- [ ] A `.txt` file → "Not a STAAD file" toast; a >64 MB file → "File too large or unreadable" toast
- [ ] Drop a file anywhere on the window → drag-over fill + accent ring appears; drop replaces the previous model non-destructively
- [ ] `prefers-reduced-motion` → chrome settles instantly with 150ms opacity fade; `prefers-reduced-transparency` → solid surfaces

## Self-Check: PASSED

- Files on disk: `web/app/page.tsx`, `web/app/viewer.module.css`, `web/app/globals.css` present; `web/app/page.module.css` ABSENT; `web/components.json` ABSENT — VERIFIED
- Commits in git: `43fbcaa` — FOUND in `git log --all`
- Build: `npm run build` clean (Next 16.3.1); `tsc --noEmit` clean; vitest 36/36
- Greps: `dangerouslySetInnerHTML` absent in `web/app`; `backdrop-filter` + `system-ui` present; `page.module.css` imports cleaned

---
*Phase: 02-file-opening-3d-rendering*
*Completed: 2026-08-17*