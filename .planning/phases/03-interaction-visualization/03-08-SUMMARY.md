---
phase: 03-interaction-visualization
plan: 08
subsystem: ui
tags: [react-three-fiber, threejs, instancing, drei-html, zustand]

# Dependency graph
requires:
  - phase: 03-02
    provides: resolveLoadCaseItems (D-12 union) + formatMagnitude/formatDistributedMagnitude (D-10)
  - phase: 03-03
    provides: buildSupportGlyph/buildLoadGlyph/markerUnit/modelDiagonal/distributedSegmentCount (D-05/D-06/D-09)
  - phase: 03-07
    provides: PickingController support-tap raycast contract (userData.supportNodeId)
  - phase: 02-04
    provides: rebaseModel nodeCoords (all glyph placement rebased)
provides:
  - markerFrame pure placement lib (supportTransforms/loadItemTransforms/labelPoints/isMomentItem/isDistributedItem)
  - MarkersLayer R3F combined support+load instanced layer + magnitude chips (D-07/D-09/D-10)
  - parser LoadItem.loadType preserved (moment/distributed source of truth)
affects: 03-09 page.tsx integration (mounting + applyHover/pick wiring)

# Tech tracking
tech-stack:
  added: []
  patterns: ["one InstancedMesh per glyph bucket (type/kind) with dispose-first rebuild effects (P5)", "pure markerFrame placement math (node-testable) separated from the R3F renderer", "drei Html zIndexRange [0,0] chip overlay + CSS module glass tokens"]

key-files:
  created: [web/lib/markerFrame.ts, web/lib/markerFrame.test.ts, web/components/MarkersLayer.tsx, web/components/MarkersLayer.module.css, web/components/MarkersLayer.test.tsx]
  modified: [packages/parser/src/types.ts, packages/parser/src/staad/loads.ts]

key-decisions:
  - "LoadItem gains optional loadType (verbatim CON/UNI/MOM/TRAP/FY/MX… token) — the parser already parsed the member-load type token but dropped it; without it the renderer cannot distinguish moments/distributed glyphs (D-09). Additive optional field; parser tests use toMatchObject so 182/182 stay green"
  - "Moment detection = loadType MOM OR JOINT_LOAD MX/MY/MZ; distributed = MEMBER_LOAD UNI/TRAP — closed checks, no string plumbing into geometry"
  - "SELFWEIGHT glyph anchored at the rebased bounds centroid (= origin after rebase), pointing −Y"
  - "Distributed arrows oriented along the member span (dir = normalized start→end) so the array reads along the loaded element"
  - "Support mesh userData.supportNodeId set per mesh so PickingController resolves support taps without extra maps"

patterns-established:
  - "Pattern 1: placement math is pure (three Vector3/Quaternion only) and node-tested; the R3F layer only composes matrices and renders"
  - "Pattern 2: every rebuild disposes prior geometry+material in the same effect (P5); labels use drei Html with zIndexRange [0,0] and CSS glass chips"

requirements-completed: [MARK-01, MARK-02, MARK-03, MARK-04]

# Metrics
duration: 32min
completed: 2026-08-17
---

# Phase 3 Plan 8: Markers Layer Summary

**Combined instanced support + load marker layer: six support glyph types at u-scale and the selected case's load glyphs (moments/distributed/SELFWEIGHT included) at a-scale, placed purely in markerFrame from rebased coords, with disposal-hygienic rebuilds and mono magnitude chips via drei Html.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-17T09:15:00Z
- **Completed:** 2026-08-17T09:47:00Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- markerFrame: `supportTransforms` (per-support node placement, identity quiver), `loadItemTransforms` (JOINT at node, concentrated at midpoint, distributed segment arrays at i/(n-1), moment at midpoint, SELFWEIGHT at centroid −Y), `labelPoints` (tip anchors + 2px push-back), `isMomentItem`/`isDistributedItem`
- MarkersLayer: one InstancedMesh per support type + per load-glyph type, colored #636366/#A1A1A6 (supports, theme) / #F5A623 (loads), dispose-first rebuild effect keyed on [markersVisible, loadCaseId, model, exaggeration]; exposes support meshes via onSupportObjects for picking
- Label chips: drei Html at labelPoints, mono 12px glass; SELFWEIGHT / formatMagnitude / formatDistributedMagnitude / (forceUnit + lengthUnit) text; hidden with the layer (all-or-nothing)
- Parser fix: LoadItem.loadType preserved (member CON/UNI/MOM/TRAP + joint force/moment token) — additive, 182 parser tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: markerFrame pure placement** - `a090d95` (feat)
2. **Parser loadType fix (requirement for D-09)** - `13611b8` (feat)
3. **Task 2+3: MarkersLayer + label chips** - `52f04f2` (feat)

**Plan metadata:** (committed with this SUMMARY)

## Files Created/Modified
- `web/lib/markerFrame.ts` - pure placement transforms + label anchors + moment/distributed predicates
- `web/lib/markerFrame.test.ts` - 11 tests (transforms, midpoint, segment counts, finite, moment/distributed)
- `web/components/MarkersLayer.tsx` - instanced support+load layer + Html chip overlay
- `web/components/MarkersLayer.module.css` - label chip glass tokens + a11y blocks
- `web/components/MarkersLayer.test.tsx` - node smoke test (renders null internals without canvas)
- `packages/parser/src/types.ts` - LoadItem.loadType?: string
- `packages/parser/src/staad/loads.ts` - memberLoadHandler/jointLoadHandler set loadType

## Decisions Made
- loadType preservation is the single source of truth for moment/distributed (D-09) — a minimal additive parser change that 182 tests confirm is non-breaking
- Distributed segment orientation follows the member span (reads as "this element carries the load")
- SELFWEIGHT anchored at rebased centroid; support picks via mesh.userData.supportNodeId

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing Critical] LoadItem lacks moment/distributed signal**
- **Found during:** Task 1 (markerFrame design)
- **Issue:** loadItemTransforms / buildLoadGlyph must distinguish moments (curved double-arrow) and distributed (segmented arrays) per D-09, but the parser normalizes M-prefix moments to bare axes and discards the MEMBER LOAD `type` token (CON/UNI/MOM/TRAP) — LoadItem could not express either, and 03-03's `buildLoadGlyph(opts.moment)` needs a caller-side source of truth
- **Fix:** Added optional `LoadItem.loadType` preserving the verbatim token in memberLoadHandler/jointLoadHandler; markerFrame exports isMomentItem/isDistributedItem closed predicates; MarkersLayer passes `moment` to buildLoadGlyph
- **Files modified:** packages/parser/src/types.ts, packages/parser/src/staad/loads.ts
- **Verification:** full parser suite 182/182 green; markerFrame 11/11; web suite 106/106; tsc clean
- **Committed in:** 13611b8

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for D-09 correctness. Additive optional field — no existing test shape breaks. No scope creep.

## Issues Encountered
- markerFrame distributed test initially failed (segment-count mismatch) because `loadItemTransforms` defaults `a` to modelDiagonal-derived and the test passed `a` only to `distributedSegmentCount` first; passing `a` to the transforms call fixed the assertion

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 03-09 Page Integration mounts MarkersLayer with coords from rebaseModel, wires onSupportObjects into PickingController's supportObjects, composes the four-zone chrome, and runs real-file verification on HPP_Main_Building_2.std

---
*Phase: 03-interaction-visualization*
*Completed: 2026-08-17*