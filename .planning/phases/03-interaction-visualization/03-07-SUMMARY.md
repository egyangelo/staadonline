---
phase: 03-interaction-visualization
plan: 07
subsystem: ui
tags: [react-three-fiber, threejs, zustand, vitest, picking]

# Dependency graph
requires:
  - phase: 03-01
    provides: colorLayer pure helpers (applyModeColors/applyHoverDim/applyHoverBrighten, modeColorCache) + computeMemberColors + HOVER/SELECT factor constants
  - phase: 03-03
    provides: createHoverThrottle, createNoTapGuard, shouldRegisterTap, dragDistanceExceeded, pointDistance
  - phase: 02-04
    provides: SceneBuildResult (meshes + instanceToMember)
provides:
  - ColorLayer R3F component + imperative applyHover handle
  - PickingController R3F component (8 Hz hover raycast + tap/drag/NO_TAP selection)
  - computeSelectionState/locateInstance pure helpers (node-tested)
affects: 03-08 MarkersLayer (supportObjects source), 03-09 page.tsx integration (mounting in ViewerCanvas)

# Tech tracking
tech-stack:
  added: []
  patterns: ["forwardRef imperative handle for hover (applyHover) driven from a sibling controller", "global-instance-index → (mesh, slot) resolution across multi-mesh InstancedMesh sets", "@/* alias mirrored in vitest.config for component tests"]

key-files:
  created: [web/components/ColorLayer.tsx, web/components/ColorLayer.test.tsx, web/components/PickingController.tsx]
  modified: [web/vitest.config.ts]

key-decisions:
  - "ColorLayer exposes hover through a forwardRef handle (applyHover) rather than shared store state — hover is high-frequency and must never write the store per-frame (03-01 store contract)"
  - "Selection overlay (brighten selected / dim others) is computed per global instance index and applied through the same two pure lerp helpers as hover"
  - "PickingController attaches pointer handlers to gl.domElement with touch fallbacks; hover cleared on leave/wheel/selection-change per UI-SPEC"
  - "vitest.config gained the @/ alias (mirroring tsconfig paths) so component tests import stores/libs like Next.js does"

patterns-established:
  - "Pattern 1: COLOR-04 — every color interaction is setColorAt + instanceColor.needsUpdate; nothing touches matrix/geometry/material (grep-verified)"
  - "Pattern 2: all decision math (computeSelectionState, locateInstance) is pure and node-tested; R3F components are thin subscribers"

requirements-completed: [COLOR-04, INSP-02, INSP-03]

# Metrics
duration: 25min
completed: 2026-08-17
---

# Phase 3 Plan 7: ColorLayer + PickingController Summary

**R3F scene interaction layer: ColorLayer rewrites instanced color buffers on mode/selection/hover (COLOR-04, never a rebuild), and PickingController raycasts at 8 Hz with NO_TAP + drag-distance guards before committing member/support selection (D-14).**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-17T08:45:00Z
- **Completed:** 2026-08-17T09:10:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 created + 1 modified)

## Accomplishments
- ColorLayer: subscribes to colorMode/selection via useViewerStore, memoizes computeMemberColors per `${mode}:${theme}` (modeColorCache replay), rewrites buffers on mode change; selection brightens the selected member (SELECT_BRIGHTEN 0.40) and dims others (SELECT_DIM 0.62); forwardRef handle `applyHover(instanceId|null)` for hover dim/brighten
- PickingController: 8 Hz hover raycast via createHoverThrottle(125); pointer-up tap path checks dragDistanceExceeded(>6px) then shouldRegisterTap(NO_TAP guard); raycasts member meshes + support objects → select(id, 'member'|'support') or clearSelection(); hover cleared on leave/wheel/selection-change
- Pure decision math (computeSelectionState, locateInstance) extracted and node-tested (6 tests) — component tests run in node env without a canvas
- vitest.config.ts aliased `@/` so component tests resolve stores/libs like Next.js

## Task Commits

Each task was committed atomically:

1. **Task 1: colorLayer pure helpers** - already shipped in 03-01 `57f956c` (6 tests green, verified here)
2. **Task 2: ColorLayer R3F + tests** - `660d3bd` (feat)
3. **Task 3: PickingController** - `660d3bd` (feat)
4. **vitest alias fix** - `a36be5a` (fix)

**Plan metadata:** (committed with this SUMMARY)

## Files Created/Modified
- `web/components/ColorLayer.tsx` - memoized R3F color-buffer layer with forwardRef applyHover handle
- `web/components/ColorLayer.test.tsx` - node tests for computeSelectionState/locateInstance (6 tests)
- `web/components/PickingController.tsx` - throttled hover + tap/drag/NO_TAP selection controller
- `web/vitest.config.ts` - added `@/` resolve alias (deviation)

## Decisions Made
- Hover via imperative handle (not store) to respect the no-per-frame-store-writes rule
- Selection overlay applied through the same lerp helpers as hover — one code path for all dim/brighten
- Component tests target pure decision helpers in node env (vitest is node-only; no jsdom/testing-library installs per T-03-SC)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@/` alias unresolvable in vitest component tests**
- **Found during:** Task 2 (ColorLayer.test.tsx import)
- **Issue:** vitest could not resolve `@/store/viewerStore` imported by ColorLayer.tsx — the vite native config loader does not read tsconfig paths; lib tests previously passed only because they use relative imports
- **Fix:** Added `resolve.alias['@']` to vitest.config.ts mirroring tsconfig `paths`
- **Files modified:** web/vitest.config.ts
- **Verification:** `npx vitest run components/ColorLayer.test.tsx lib/colorLayer.test.ts` → 12/12 green; tsc clean
- **Committed in:** a36be5a

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to make the component tests runnable at all. No scope creep.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 03-08 MarkersLayer consumes the same instance→member maps and builds `supportObjects` (with userData.supportNodeId) that PickingController raycasts for support taps
- 03-09 wires ColorLayer + PickingController into SceneContents with meshes/instanceToMember from the SceneBuilder build result

---
*Phase: 03-interaction-visualization*
*Completed: 2026-08-17*
