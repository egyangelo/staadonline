---
phase: 02-file-opening-3d-rendering
plan: 6
subsystem: ui
tags: [react, css-modules, zustand, ui-spec, a11y]

# Dependency graph
requires:
  - phase: 02-file-opening-3d-rendering
    provides: viewerStore (exaggeration default 15) + modelStore (model/warnings/fileName) + FileService error codes — all from 02-02
  - phase: 01-parser-model
    provides: StaadModel/ParseWarning types (sections approximate flag, units, bounds)
provides:
  - Five presentational viewer-chrome components + five CSS Modules (OpenControl, ExaggerationSlider, StatsSummary, ErrorToast, LoadingOverlay)
  - Retention of the D-11 parse-stats card, D-07 approximate chip, D-02 slider default 15
  - Presentational-only components ready for 02-07 page integration
affects: [02-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - React client components + per-component CSS Modules (no shared module — 02-07 owns global tokens)
    - zustand selectors (useViewerStore / useModelStore) for store reads
    - Apple-style motion: commit continuously (no debounce), press-scale 0.97 on :active, spring damped 1.0 with prefers-reduced-motion overrides
    - All rendered values are React text nodes — no HTML injection (T-02-01/T-02-02)

key-files:
  created:
    - web/components/OpenControl.tsx
    - web/components/OpenControl.module.css
    - web/components/ExaggerationSlider.tsx
    - web/components/ExaggerationSlider.module.css
    - web/components/StatsSummary.tsx
    - web/components/StatsSummary.module.css
    - web/components/ErrorToast.tsx
    - web/components/ErrorToast.module.css
    - web/components/LoadingOverlay.tsx
    - web/components/LoadingOverlay.module.css
  modified:
    - (none)

key-decisions:
  - "StatsSummary reads model only (not fileName); 'Clean parse — no warnings.' chip shows only when warnings.length === 0; approximate chip counts sections with approximate === true (D-07)"
  - "Slider track fill driven by a --fill CSS custom property computed from value (1–100 range), accent-filled portion + 20px accent thumb with white inner dot via box-shadow inset"
  - "ErrorToast is typed presentational (WRONG_TYPE/TOO_LARGE/UNREADABLE/PARSE union matching fileService + parser failures); dismiss + next-open reset both clear it (owned by page.tsx)"
  - "LoadingOverlay is presentational; repeat-open-during-LOADING abort logic is owned by 02-07 page.tsx per UI-SPEC"
  - "OpenControl owns the hidden input + value reset; onOpen wiring stays in 02-07"

patterns-established:
  - "Cancel-safe hidden-input picker: onChange only fires on a selected file; input.value reset after forward so re-pick re-fires (FILE-03 by construction)"
  - "No dangerouslySetInnerHTML anywhere in web/components (grep-gated)"
  - "Fixed UI-SPEC copy per error code; wrapped parse message appended as React text with 200-char cap (T-02-02)"
  - "Approximate count derived from booleans only — no string parsing (T-02-05)"

requirements-completed: []  # UI requirement closes in 02-07; this plan delivers presentational surface only

# Metrics
duration: 40min
completed: 2026-08-17
---

# Phase 02: Plan 6 Summary

**Delivered the presentational viewer chrome — five components and five CSS Modules (OpenControl, ExaggerationSlider, StatsSummary, ErrorToast, LoadingOverlay) matching the approved UI-SPEC tokens, colors, copy, and motion, ready for 02-07 page integration.**

## Performance

- **Duration:** 40 min
- **Completed:** 2026-08-17
- **Tasks:** 4
- **Files modified:** 10 (10 created, 0 modified)

## Accomplishments
- **OpenControl** (Task 1, D-12): primary accent "Open STAAD File" CTA with inline folder-open SVG, radius 12, min-height 44 (touch `pointer:coarse`) / 36 (desktop), padding `0 24px`, 16px/600 white label, `transform: scale(0.97)` on `:active` (commit on up, cancel by drag-away — Apple §1), 2px accent focus ring. Cancel-safe hidden `<input type="file" accept=".std">`; `input.value` reset after every forward so re-selecting the same file re-fires; picker cancel never fires onChange (FILE-03 by construction).
- **ExaggerationSlider** (Task 2, D-02/REND-04): "SIZE EXAGGERATION" caption (12px uppercase +0.06em tracking) + `{value}×` detail readout (14px mono secondary). `<input type="range" min=1 max=100 step=1>` reads/writes `useViewerStore` continuously (Apple §1: no debounce; 1:1 with the pointer). Default 15× from the store initial. Track 4px radius 999 with accent filled portion (via `--fill` custom property) + lighter remainder; thumb 20px accent with white inner dot. 44px hit area.
- **StatsSummary** (Task 3, D-11/D-07): retained glass card, bottom-left 16px inset, radius 20, `rgba(255,255,255,0.65)` light / `rgba(28,28,30,0.72)` dark + `blur(20px) saturate(180%)`. 6-cell stat grid (Joints/Members/Sections/Supports/Load cases/Groups, 24px 600 + uppercase 12px labels), mono UNITS line (`length / force`), mono BOUNDS line (`X -a..b  Y …  Z …`, 2 decimals from `model.bounds`), warnings-count chip + `N approximate` chip (warning tint) counting `approximate === true` sections (D-07), "Clean parse — no warnings." success chip when `warnings` empty; collapse/expand chevron (expanded after load, collapse is user action). All values rendered as React text nodes.
- **ErrorToast** (Task 4, FILE-04): bottom-center 16px inset, glass surface, 2px destructive border (`#FF3B30`/`#FF453A`), typed union `WRONG_TYPE | TOO_LARGE | UNREADABLE | PARSE`. Exact UI-SPEC copy: WRONG_TYPE → "Not a STAAD file" / "This file isn't a `.std` input deck…"; TOO_LARGE → "File too large or unreadable" / "STAAD Online reads `.std` decks up to 64 MB…"; UNREADABLE/PARSE → title with the wrapped message (200-char cap, React text). A11y dismiss affordance; cleared by page.tsx on next open.
- **LoadingOverlay** (Task 4, UI-SPEC LOADING): dimmed full-viewport overlay (`rgba(0,0,0,0.25/0.4)`), centered "Opening…" 16px secondary + border-based spinner; blocks pointer input; presentational (02-07 owns repeat-open-during-LOADING abort per UI-SPEC); honors `prefers-reduced-motion`.

## Task Commits

Not committed yet — pending user request (branch `master`).

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | OpenControl primary CTA | — | feat |
| 2 | ExaggerationSlider | — | feat |
| 3 | StatsSummary retained stats card | — | feat |
| 4 | ErrorToast + LoadingOverlay | — | feat |

## Files Created
- `web/components/OpenControl.tsx` / `.module.css` — primary CTA + cancel-safe hidden input + accent press-scale styling
- `web/components/ExaggerationSlider.tsx` / `.module.css` — 1–100 slider writing viewerStore continuously, `--fill` accent track
- `web/components/StatsSummary.tsx` / `.module.css` — retained stats grid, mono UNITS/BOUNDS, warning + approximate chips, collapse
- `web/components/ErrorToast.tsx` / `.module.css` — typed error toast with exact FILE-04 copy + 2px destructive border
- `web/components/LoadingOverlay.tsx` / `.module.css` — dim overlay + spinner, reduced-motion aware

## Decisions Made
- Slider filled-track accent implemented with a `--fill` custom property set inline from the value (browser-native `::part`/accent-color can't style the filled 4px track cross-browser); WebKit + Mozilla pseudo-element styling with dark-mode variant.
- StatsSummary stays model-only (derives everything from `model` + `warnings`); fileName is unused here (02-07 uses it).
- ErrorToast shows FIXED copy per code; the wrapped thrown message is appended as a capped React text node ending the body — never interpolated as HTML, satisfying T-02-02.
- LoadingOverlay exposes no user control — the UI-SPEC "repeat-open during LOADING aborts the in-flight open" behavior belongs to page.tsx in 02-07, keeping this component presentational.

## Deviations from Plan

### Auto-fixed Issues

**1. [Scope] `ErrorToast` extra optional `detail` prop**
- **Found during:** Task 4
- **Issue:** The plan's Task 4 copy says UNREADABLE/PARSE body includes "the thrown message", but the specified props `{ code, onDismiss }` carried no channel for it.
- **Fix:** Added `detail?: string` (optional) and a `copyFor()` mapper: WRONG_TYPE/TOO_LARGE use the fixed COPY table; UNREADABLE/PARSE use the fixed title with the wrapped message appended (`.slice(0, 200)`) or a generic fallback when absent.
- **Files modified:** web/components/ErrorToast.tsx
- **Verification:** `cd web && npx tsc --noEmit` clean; grep absent `dangerouslySetInnerHTML`.

**2. [Rule 4 - Lint] `styles.wrapper` renaming in ExaggerationSlider**
- **Found during:** Task 2 (self-review while writing)
- **Issue:** The first draft (Apple-inspired for the opencode session flow) used `wrapper`; the final CSS module uses `row` for the flex row.
- **Fix:** Rewrote the component to use `styles.row`, aligned label/input/value keys with the module; added the `--fill` inline style for the accent track.
- **Files modified:** web/components/ExaggerationSlider.tsx
- **Verification:** `cd web && npx tsc --noEmit` clean.

---

**Total deviations:** 2 auto-fixed (1 scope mesh, 1 self-review consistency)
**Impact on plan:** None — both kept the UI-SPEC contract intact.

## Issues Encountered
- `rtk` is not installed on this machine (documented in 02-02 summary) — ran native `git`/`npx` equivalents.
- `dangerouslySetInnerHTML` first appeared only inside a JSDoc comment in StatsSummary (self-grep caught it); reworded so the verification grep is cleanly ABSENT across the whole `web/components`.

## Known Stubs
- **Slider min/max/step** (1–100/1) are provisional per UI-SPEC ("min/max/step are Claude's discretion"); D-02 locked only the default 15×.
- **StatsSummary** is informational-only in Phase 2 — the Phase 3 INSP-03 panel owns click-through from the stat cells (D-11/UI-SPEC "Full summary panel is Phase 3").
- **ErrorToast** rendering path is unwired — page.tsx (02-07) decides when and how to mount it against the typed union.

## Threat Flags
None — presentational-only components. The two trust boundaries in the plan (`model store strings → StatsSummary`, `FileService errors → ErrorToast`) are both mitigated by React-text rendering (T-02-01), fixed-per-code copy + 200-char cap (T-02-02), boolean-only approximate count (T-02-05), structural picker cancel (T-02-03), and zero network (T-02-04). No new surfaces introduced.

## User Setup Required
None.

## Next Phase Readiness
- All five components + CSS Modules pass `tsc --noEmit`; grep gates green (no `dangerouslySetInnerHTML`, no `web/components.json`).
- 02-07 can now import OpenControl/ExaggerationSlider/StatsSummary/ErrorToast/LoadingOverlay into page.tsx, wire the OpenControl `onOpen` to FileService + modelStore via try/catch, own the LOADING abort-on-repeat-open rule, and land global tokens/fonts.

## Self-Check: PASSED

- Files on disk: 10 component/CSS module files in `web/components/` — FOUND
- Verification ran: `cd web && npx tsc --noEmit` clean; `dangerouslySetInnerHTML` count 0; `web/components.json` NOT created
- STATE.md / ROADMAP.md: NOT modified by this plan

---

*Phase: 02-file-opening-3d-rendering*
*Completed: 2026-08-17*