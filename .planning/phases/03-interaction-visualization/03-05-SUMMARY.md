---
phase: 03-interaction-visualization
plan: 05
subsystem: ui
tags: [react, nextjs, css-modules, zustand, a11y]

# Dependency graph
requires:
  - phase: 03-01
    provides: viewerStore selection state (selectedId/selectedKind/clearSelection)
  - phase: 03-02
    provides: effectiveAxisRefs (D-11 per-case axis resolution)
  - phase: 02-04
    provides: rebaseModel (REND-06 centroid-rebased nodeCoords matching rendered geometry)
provides:
  - LegendChip per-load-case axis-convention chip (GLOBAL/LOCAL/mixed, triad SVG)
  - InspectorPopover member + support inspector with rebased coords and releases grid
affects: 03-07 PickingController (drives selection), 03-09 page.tsx integration (mounting + toolbar)

# Tech tracking
tech-stack:
  added: []
  patterns: ["useMemo-keyed rebaseModel for popover coordinate lookups (T-03-05)", "data-inspector-popover closest() guard for outside-tap dismissal"]

key-files:
  created: [web/components/LegendChip.tsx, web/components/LegendChip.module.css, web/components/InspectorPopover.tsx, web/components/InspectorPopover.module.css]
  modified: []

key-decisions:
  - "LegendChip label keyed on the refs string so React remounts the span → CSS legendFade animation (150ms) fires on every load-case change; reduced-motion kills it"
  - "Triad SVG is three colored strokes (X red / Y green / Z blue) radiating from a common origin, aria-hidden — the only inline SVG in the chip per UI-SPEC"
  - "Support releases grid: types contract `releases[AXIS] true = released` → released axis renders an OPEN (outline-only) dot, restrained axis a FILLED dot"
  - "Outside-tap dismissal uses a document mousedown checking `closest('[data-inspector-popover]')` so any click not inside the popover (canvas, chrome, empty area) clears selection"

patterns-established:
  - "Pattern 1: InspectorPopover subscribes only to model + selection — never loadCaseId — and memoizes the heavy rebaseModel lookup (T-03-05 no re-render churn)"
  - "Pattern 2: coords always come from rebaseModel nodeCoords (array-position indexed via nodeId map), never raw model node coords — matches rendered geometry (REND-06)"

requirements-completed: [MARK-04, INSP-01, INSP-02, INSP-03]

# Metrics
duration: 20min
completed: 2026-08-17
---

# Phase 3 Plan 5: Legend Chip + Inspector Popover Summary

**Read-only presentation surfaces for Phase 3 inspection: LegendChip showing the per-load-case GLOBAL/LOCAL axis convention with a triad glyph, and a slide-in InspectorPopover rendering member/support detail (releases grid, stiffness, approximate-dimensions banner) from centroid-rebased coordinates.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-17T08:05:00Z
- **Completed:** 2026-08-17T08:25:00Z
- **Tasks:** 3
- **Files modified:** 4 (created)

## Accomplishments
- LegendChip: mono GLOBAL / LOCAL / `GLOBAL / LOCAL` label computed from `effectiveAxisRefs`, hidden when the case has no items; 3-axis colored triad SVG; cross-fade on load-case change (keyed remount + 150ms legendFade)
- InspectorPopover member variant: `MEMBER n` title + Section/Group/Material/Length rows + Nodes row `n1 → n2` with per-node coords from rebaseModel (matches rendered geometry); missing fields render "—"
- InspectorPopover support variant: `SUPPORT n` + type label map + 6-dot releases grid (released = open dot per types contract) + Stiffness row when spring `note` present
- Approximate banner (D-15): full-width orange `~ APPROXIMATE DIMENSIONS` when `section.approximate === true`, exact UI-SPEC tokens
- Dismissal: 44px close button, Escape key, outside-tap (closest() guard) → clearSelection(); slide-in translateX 24→0 400ms, reduced-motion `transform: none !important`

## Task Commits

Each task was committed atomically:

1. **Task 1: LegendChip (D-11)** - `ed65fc6` (feat)
2. **Task 2: InspectorPopover (D-13/D-08/D-15)** - `8124587` (feat)
3. **Task 3: CSS modules + motion tokens** - part of `8124587`

**Plan metadata:** (committed with this SUMMARY)

## Files Created/Modified
- `web/components/LegendChip.tsx` - axis-convention chip (mono label + triad SVG, null on empty)
- `web/components/LegendChip.module.css` - glass chip, legendFade keyframes, all media blocks
- `web/components/InspectorPopover.tsx` - member/support popover, rebaseModel coords, releases grid, approx banner, dismissal handlers
- `web/components/InspectorPopover.module.css` - glass popover (radius 20, heavy shadow), slide-in motion, media blocks

## Decisions Made
- Triad as three colored strokes from a common origin (X red / Y green / Z blue), aria-hidden
- Releases dot polarity follows the types contract verbatim: released (true) = open outline dot, restrained (false) = filled dot
- Popover memoizes rebaseModel keyed on model; subscribes to selection only (no loadCaseId) — T-03-05
- Outside-tap uses `closest('[data-inspector-popover]')` — single attribute selector covers the whole popover subtree

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 03-06 (StatsSummary extension) can reuse the same glass/detail row token language
- 03-07 PickingController commits `select(id, kind)` which this popover consumes; 03-09 mounts both components and wraps LegendChip in the loads toolbar

---
*Phase: 03-interaction-visualization*
*Completed: 2026-08-17*
