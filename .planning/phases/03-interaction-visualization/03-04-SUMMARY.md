---
phase: 03-interaction-visualization
plan: 04
subsystem: ui
tags: [react, nextjs, css-modules, zustand, a11y]

# Dependency graph
requires:
  - phase: 03-01
    provides: viewerStore committed prefs (colorMode, loadCaseId, labelsVisible, markersVisible)
  - phase: 03-02
    provides: resolveLoadCaseItems (D-12 union resolution) + formatMagnitude/formatDistributedMagnitude
provides:
  - ColorModeControl segmented color-mode switcher (commits colorMode, COLOR-04 rewrite downstream in 03-07)
  - LoadCaseSelector full load-case dropdown (primary + combination + repeated, commits loadCaseId)
  - MagnitudeLabelToggle labels pill gated behind markers layer (commits labelsVisible)
affects: 03-07 ColorLayer, 03-08 MarkersLayer, 03-09 page.tsx integration

# Tech tracking
tech-stack:
  added: []
  patterns: ["Roving-tabindex segmented control with ARIA radiogroup + sliding thumb", "Fixed-position chrome components reading zustand stores with selector subscriptions"]

key-files:
  created: [web/components/ColorModeControl.tsx, web/components/ColorModeControl.module.css, web/components/LoadCaseSelector.tsx, web/components/LoadCaseSelector.module.css, web/components/MagnitudeLabelToggle.tsx, web/components/MagnitudeLabelToggle.module.css]
  modified: []

key-decisions:
  - "Thumb slides via transform on a shared absolute-positioned element (width calc(25% - 2px), translateX(index*100%)) — not per-label background — so it can animate; reduced-motion kills the transition"
  - "Arrow keys commit the target mode while moving roving focus (radiogroup pattern)"
  - "Dropdown uses CSS @keyframes open animating max-height 0→320px + opacity + translateY; reduced-motion overrides with max-height:none !important + opacity-only transition"
  - "Outside-tap/Escape listeners attach only while open and detach on unmount/close (T-03-04)"

patterns-established:
  - "Pattern 1: chrome components read committed prefs from useViewerStore via selector subscriptions and render only on committed state — no per-frame store writes"
  - "Pattern 2: all file-derived strings (case titles/ids) render as React text nodes — no dangerouslySetInnerHTML (T-02/T-03-01)"
  - "Pattern 3: glass tokens + reduced-motion/reduced-transparency/dark media blocks mirror OpenControl/ExaggerationSlider (UI-SPEC)"

requirements-completed: [COLOR-01, COLOR-02, MARK-02, MARK-03]

# Metrics
duration: 18min
completed: 2026-08-17
---

# Phase 3 Plan 4: Chrome Interaction Controls Summary

**Three commit-only chrome controls wired to viewerStore committed prefs — segmented color-mode switcher (D-01), full load-case dropdown (D-12), and markers-gated labels pill (D-10) — with no scene work; the color-buffer rewrite and glyph rendering land downstream in 03-07/03-08.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-17T07:45:00Z
- **Completed:** 2026-08-17T08:03:00Z
- **Tasks:** 3
- **Files modified:** 6 (created)

## Accomplishments
- ColorModeControl: fixed top-center glass pill with 4 uppercase Caption-600 segments (Section/Group/Material/All members), sliding solid thumb (light #FFFFFF / dark #1C1C1E, never accent), roving tabindex + ArrowLeft/Right/Home/End committing the target mode, 2px accent focus ring, 44px hit height (36px pointer-fine)
- LoadCaseSelector: top-right glass control (caption LOAD CASE + mono `N — TITLE` value), 320px scrollable glass dropdown listing all `model.loadCases` rows (mono right-aligned id + 16px title, check marker on active), closes on outside-tap/Escape/selection, disabled trigger when zero load cases, `aria-expanded`/`aria-haspopup="listbox"`
- MagnitudeLabelToggle: glass Labels pill rendered only while `markersVisible` AND the effective case (via `resolveLoadCaseItems`) has items; commits `labelsVisible` with `aria-pressed` + tooltip

## Task Commits

Each task was committed atomically:

1. **Task 1: ColorModeControl segmented switcher (D-01)** - `0b1acfa` (feat)
2. **Task 2: LoadCaseSelector dropdown (D-12)** - `c2cad99` (feat)
3. **Task 3: MagnitudeLabelToggle (D-10)** - `43b749d` (feat)

**Plan metadata:** (committed with this SUMMARY)

## Files Created/Modified
- `web/components/ColorModeControl.tsx` - radiogroup segmented control committing colorMode; arrow keys move focus + commit
- `web/components/ColorModeControl.module.css` - glass pill tokens, sliding thumb, reduced-motion/dark/reduced-transparency blocks
- `web/components/LoadCaseSelector.tsx` - dropdown trigger + listbox; outside-tap/Escape close; disabled no-case state
- `web/components/LoadCaseSelector.module.css` - glass trigger + 320px scroll dropdown, @keyframes open animation
- `web/components/MagnitudeLabelToggle.tsx` - markers-gated labels pill committing labelsVisible
- `web/components/MagnitudeLabelToggle.module.css` - compact glass pill tokens + aria-pressed states

## Decisions Made
- Shared absolute-positioned thumb (not per-label backgrounds) so the slide is animatable as one element; width `calc(25% - 2px)` with `translateX(index*100%)` keeps it aligned per segment
- Arrow keys commit the target mode while also moving roving focus — matching the radiogroup/roving-tabindex a11y contract
- Dropdown open animation via `@keyframes open` (max-height/opacity/translateY); reduced-motion forces `max-height: none !important` so content is never clipped for reduced-motion users
- LoadCaseSelector reads `model` from `useModelStore` (model data) and `loadCaseId` from `useViewerStore` (committed prefs) — preserving the two-store split from Phase 2

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 03-05 (LegendChip/InspectorPopover) can reuse the same glass token + fixed-position chrome patterns
- 03-07 ColorLayer consumes `colorMode`; 03-08 MarkersLayer consumes `loadCaseId`/`labelsVisible`/`markersVisible`; 03-09 wires all three components into page.tsx and the four-zone layout
- Components intentionally leave `// Mounted in 03-09` out — mounting is owned by the 03-09 integration plan

---
*Phase: 03-interaction-visualization*
*Completed: 2026-08-17*
