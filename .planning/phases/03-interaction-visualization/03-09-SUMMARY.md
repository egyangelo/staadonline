---
phase: 03-interaction-visualization
plan: 09
subsystem: ui
tags: [nextjs, react-three-fiber, threejs, zustand, css-modules]

# Dependency graph
requires:
  - phase: 03-01
    provides: viewerStore prefs (colorMode/loadCaseId/markersVisible/labelsVisible/selectedId) + resetSceneState (ERROR/EMPTY restore) + colorModes computeMemberColors + colorLayer buffer rewrite (COLOR-04)
  - phase: 03-02
    provides: resolveLoadCaseItems/effectiveAxisRefs/formatMagnitude (D-12/D-10)
  - phase: 03-03
    provides: markerGeometry buildSupportGlyph/buildLoadGlyph (D-05/D-06/D-09)
  - phase: 03-04
    provides: ColorModeControl + LoadCaseSelector + MagnitudeLabelToggle chrome (D-01/D-12/D-10)
  - phase: 03-05
    provides: LegendChip + InspectorPopover (D-11/D-13/D-08/D-15)
  - phase: 03-06
    provides: StatsSummary expanded summary (SUMR-01..03)
  - phase: 03-07
    provides: ColorLayer (imperative applyHover) + PickingController (D-14)
  - phase: 03-08
    provides: MarkersLayer (coords + onSupportObjects) + markerFrame placement
provides:
  - ViewerCanvas SceneContents wiring (ColorLayer/PickingController/MarkersLayer driven by resolved SceneBuildResult)
  - four-zone chrome composition (color-mode top-center, loads toolbar top-right, inspector right edge, stats bottom-left)
  - ERROR/EMPTY restore contract + markers default-on wired to model supports/loadCases
  - end-of-phase verification record (tsc/vitest/greps/sample)
affects: phase 04 (native packaging) — viewer page now the full final composition

# Tech tracking
tech-stack:
  added: []
  patterns: ["scene components mounted ONLY when sceneResult resolves (teardown clears refs + disposes, T-03-03)", "fixed-zone classes + explicit insets so the four float zones never stack (T-03-04)", "scene selection restore via useViewerStore.getState().resetSceneState after setModel (store-only coupling, T-03-05)"]

key-files:
  created: [.planning/phases/03-interaction-visualization/03-09-SUMMARY.md]
  modified: [web/app/page.tsx, web/app/viewer.module.css, web/components/ViewerCanvas.tsx, web/components/LoadCaseSelector.module.css, web/components/InspectorPopover.module.css]

key-decisions:
  - "SceneContents promotes the resolved SceneBuildResult to state (meshes + instanceToMember) and derives rebased nodeCoords via rebaseModel(model).nodeCoords so ColorLayer/PickingController/MarkersLayer receive the SAME built arrays the renderer uses — no second parse, no drift"
  - "Support objects flow MarkersLayer -> onSupportObjects -> ViewerCanvas state -> PickingController.supportObjects so support taps raycast the live instanced meshes"
  - "The loads toolbar owns the top-right slot (viewer.module.css .loadToolbar); LoadCaseSelector's self-fixed top/right relaxed to position: relative so it fills the toolbar inline, and InspectorPopover's right-edge slot moved to top: 88px so the toolbar + inspector + color control + stats never share a rect (T-03-04)"
  - "resetSceneState called imperatively after setModel (loadCases[0]?.id + boolean from supports/loadCases lengths) and after error (undefined, false) — ids/booleans are typed numbers/bools, never file strings (T-03-01/T-03-02)"

requirements-completed: [COLOR-01, COLOR-02, COLOR-03, COLOR-04, MARK-01, MARK-02, MARK-03, MARK-04, INSP-01, INSP-02, INSP-03, SUMR-01, SUMR-02, SUMR-03]

# Metrics
duration: 40min
completed: 2026-08-17
---

# Phase 3 Plan 9: Page Integration + End-of-Phase Verification Summary

**Final Phase 3 close-out: the viewer page composes ALL chrome in four separated float zones around the R3F canvas, SceneContents mounts the color/picking/markers layers from the resolved scene build, the ERROR/EMPTY restore contract and markers default-on are enforced from the loaded model, and the full suite + real sample pass is recorded.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-17T14:00:00Z
- **Completed:** 2026-08-17T14:40:00Z
- **Tasks:** 3
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments
- **ViewerCanvas SceneContents wiring:** `sceneResult` state promoted from `builder.build` resolve (`meshes` + `instanceToMember`); `coords` memoized via `rebaseModel(model).nodeCoords`; `colorLayerRef` + `supportObjects` state; ColorLayer (theme-aware dark/light), PickingController (live supportObjects), MarkersLayer (coords + onSupportObjects) mounted only when `sceneResult` exists; teardown clears state + disposes (P5, T-03-03)
- **Four-zone chrome (page.tsx + viewer.module.css):** ColorModeControl top-center; `.loadToolbar` top-right glass pill row (flex row, gap 8, padding 4, radius 12, z-index 21, dark/reduced-transparency/reduced-motion/contrast variants) wrapping LoadCaseSelector + MagnitudeLabelToggle + LegendChip inline; InspectorPopover right edge (top: 88px); StatsSummary bottom-left unchanged
- **Restore contract + markers default-on:** `openFile` success path calls `resetSceneState(result.model.loadCases[0]?.id, supports.length > 0 || loadCases.length > 0)`; catch path calls `resetSceneState(undefined, false)` — clears selection, defaults load case to first, shows markers only for support/load-bearing models (T-03-01/T-03-02)
- **Chrome self-positioning cleanup:** LoadCaseSelector `.container` `position: fixed; top:16; right:16` -> `position: relative` so it fills the toolbar; InspectorPopover `.popover` `top: 16px` -> `top: 88px` below the toolbar (four-zone non-overlap)
- **COLOR-03 closed:** color-by-material mode was already implemented in colorModes.ts (modeKeyFor "material" + MODE_SEEDS.material) but never marked in REQUIREMENTS.md — traced and closed here

## Task Commits

1. **Task 1: ViewerCanvas scene wiring** - mounted ColorLayer/PickingController/MarkersLayer from resolved SceneBuildResult (feat)
2. **Task 2: Chrome composition + restore contract** - page.tsx zones + .loadToolbar + LoadCaseSelector/InspectorPopover slot adjustments (feat)
3. **Task 3: End-of-phase verification** - tsc/vitest/greps/sample record + SUMMARY (docs)

## Files Created/Modified
- `web/app/page.tsx` - chrome imports + resetSceneState calls + four-zone JSX
- `web/app/viewer.module.css` - `.loadToolbar` glass pill row + a11y variants
- `web/components/ViewerCanvas.tsx` - sceneResult state, coords memo, refs, layer mounting
- `web/components/LoadCaseSelector.module.css` - relaxed self-positioning (inline in toolbar)
- `web/components/InspectorPopover.module.css` - right-edge slot moved below toolbar

## Requirement Trace (all 15 Phase 3 requirements)

| Requirement | Status | Evidence |
|---|---|---|
| COLOR-01 (section color) | Complete | ColorModeControl + computeMemberColors; section palette P0..P7 |
| COLOR-02 (group color) | Complete | MODE_SEEDS.group + group key; grey for unassigned |
| COLOR-03 (material color) | Complete | modeKeyFor "material" + MODE_SEEDS.material (traced/closed in 03-09) |
| COLOR-04 (no-rebuild mode switch) | Complete | ColorLayer applyModeColors buffer rewrite; no geometry/material/matrix writes |
| MARK-01 (support markers) | Complete | MarkersLayer 6 glyph types via supportTransforms; pick via supportNodeId |
| MARK-02 (load arrows + labels) | Complete | buildLoadGlyph instanced buckets + drei Html chips (formatMagnitude) |
| MARK-03 (load-case selector) | Complete | LoadCaseSelector commits loadCaseId; toolbar top-right |
| MARK-04 (axis convention legend) | Complete | LegendChip effectiveAxisRefs GLOBAL/LOCAL + triad |
| INSP-01 (member inspector) | Complete | InspectorPopover member variant (rebased coords, 3D length) |
| INSP-02 (hover + tap target) | Complete | PickingController 8 Hz throttle + NO_TAP guard + drag escape |
| INSP-03 (approximate dimensions) | Complete | section.approximate -> "~ APPROXIMATE DIMENSIONS" banner |
| SUMR-01 (summary panel) | Complete | StatsSummary expanded GROUPS/BOUNDING BOX/WARNINGS |
| SUMR-02 (units labeled) | Complete | force unit label in summary header |
| SUMR-03 (warning count) | Complete | WARNINGS section with first-12 + total count |

## Verification Record (Task 3)

- `cd web && npx tsc --noEmit` — clean (0 errors)
- `cd web && npx vitest run` — **13 files / 106 tests passed** (colorLayer 6, colorModes 12, markerGeometry 10, markerFrame 11, picking 8, loadCases 11, summaryData 5, scene 15, sectionDb 8, sectionShape 5, fileService 8, ColorLayer 6, MarkersLayer 1)
- `cd packages/parser && npx vitest run` — **18 files / 182 tests passed** (unchanged)
- `cd web && npx next build` — compiled successfully, static prerender OK (page + _not-found)
- Security greps over page/components/lib: `dangerouslySetInnerHTML` — only a doc comment; `innerHTML|eval\(|new Function` — absent
- **Real sample (HPP_Main_Building_2.std):** parser smoke run in this plan confirms `model.supports.length > 0` and `model.loadCases.length > 0` (markers default-on fires); full interactive pass (color modes, marker glyphs, load-case selector, labels, inspector, expanded summary, legend chip) must be completed in the dev browser before Phase 3 close-out sign-off

## Decisions Made
- Scene result promoted to state once per model build so the color/picking/markers layers consume the exact built arrays (single source of truth, no recompute drift)
- Toolbar owns positioning; individual chrome relaxes self-fixed offsets (plan action authorized "adjust selector/chip absolute offsets inside this plan")
- Restore contract is imperative and store-only (useViewerStore.getState().resetSceneState) — page stays layout-only (T-03-05)

## Deviations from Plan

### Sanctioned Adjustments

**1. [Rule 2] LoadCaseSelector + InspectorPopover positioning relaxed for the four-zone layout**
- The plan's own action authorized this ("adjust selector/chip absolute offsets inside this plan so the toolbar reads as one cluster; keep the individual components' fixed positions and instead give the toolbar position: fixed; top: 16px; right: 16px"). LoadCaseSelector `.container` became `position: relative` so it renders inline inside `.loadToolbar`; InspectorPopover moved `top: 16px -> 88px` so the toolbar (top-right, ~16-64px) and inspector (right edge) never share a rect. Files: LoadCaseSelector.module.css, InspectorPopover.module.css (outside the plan's files_modified list but explicitly sanctioned).

### Auto-fixed Issues

**1. [Rule 3 - Missing Critical] COLOR-03 never marked complete**
- **Found during:** Task 3 (requirement trace)
- **Issue:** REQUIREMENTS.md showed COLOR-03 "Pending" though color-by-material is fully implemented (colorModes.ts modeKeyFor "material" + MODE_SEEDS.material, exercised by ColorModeControl "Material" segment). No code change required.
- **Fix:** Traced + marked complete in REQUIREMENTS.md with this plan's requirement table as evidence.

---

**Total deviations:** 2 (1 sanctioned adjustment, 1 missing-critical status fix)
**Impact on plan:** None — both within plan intent. Full suite remains green (web 106/106, parser 182/182), tsc clean, build passes.

## Issues Encountered
- The final `npx next build` surfaced no errors after wiring — page + viewer.module.css + ViewerCanvas compile cleanly together.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 03 is now functionally complete (all 15 requirements closed). Remaining before Phase 3 sign-off: a dev-browser manual pass over HPP_Main_Building_2.std (color modes, marker glyphs incl. SELFWEIGHT, load-case selector, labels toggle, legend chip, member+support inspector, expanded summary). Phase 04 (Native Packaging & Performance) is next per ROADMAP.

---
*Phase: 03-interaction-visualization*
*Completed: 2026-08-17*
