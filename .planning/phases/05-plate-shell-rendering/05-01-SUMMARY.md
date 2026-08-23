---
phase: 05-plate-shell-rendering
plan: 01
subsystem: parser
tags: [staad, plates, shells, threejs, buffergeometry, tolerance]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: tolerant .std block segmentation, ParseContext/finalize pipeline, SKIPPED_ELEMENT warning code
  - phase: 02-rendering
    provides: SceneBuilder instanced-mesh architecture, rebaseModel, dispose hygiene
provides:
  - typed Plate { id, nodes[4], thickness? } records on StaadModel.elements
  - ELEMENT INCIDENCES / ELEMENT PROPERTIES handlers (tolerant, quads-only)
  - merged double-sided plate surface mesh in the viewer scene
  - Plates count cell in StatsSummary (> 0 only)
affects: [selection-inspection, loads-rendering, export-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tolerant per-row skip with ONE SKIPPED_ELEMENT warning per offending row (never expand ranges)"
    - "one merged non-indexed BufferGeometry for all plates; defensive quad filtering before buffer allocation"
    - "first-record-wins duplicate handling with warn"

key-files:
  created:
    - packages/parser/src/staad/elements.ts
    - packages/parser/test/staad/elements.test.ts
    - packages/parser/test/types.test.ts
  modified:
    - packages/parser/src/types.ts
    - packages/parser/src/core.ts
    - packages/parser/src/index.ts
    - packages/parser/src/staad/skipped.ts
    - packages/parser/test/golden.test.ts
    - packages/parser/test/types-smoke.test.ts
    - web/lib/scene.ts
    - web/lib/scene.test.ts
    - web/lib/summaryData.ts
    - web/lib/colorModes.test.ts
    - web/lib/loadCases.test.ts
    - web/lib/markerFrame.test.ts
    - web/lib/parseModel.test.ts
    - web/lib/summaryData.test.ts
    - web/components/StatsSummary.tsx
    - web/components/ViewerCanvas.tsx

key-decisions:
  - "D-05-01: quads only — range rows and _GROUP refs warn SKIPPED_ELEMENT per row, never expanded (T-05-03)"
  - "D-05-02: one merged non-indexed BufferGeometry for all plates, DoubleSide ~0.85 opacity"
  - "D-05-03: plates are true-surface — cross-section exaggeration never rescales them"
  - "D-05-04: thickness optional, resolved from ELEMENT PROPERTIES via bounded list expansion"
  - "STAAD true triangles (4-token rows) normalized to repeated-node quads to satisfy the Plate[4] contract"

patterns-established:
  - "Plate parsing mirrors member-incidences tolerance contract (per-row warn, no throw)"
  - "SceneBuildResult.meshes is a (InstancedMesh | Mesh)[] union; picking/color path filters to InstancedMesh"

requirements-completed: [PLATE-01, PLATE-02, PLATE-03]

# Metrics
duration: 19min
completed: 2026-08-23
---

# Phase 5 Plan 1: Plate & Shell Rendering Summary

**Typed STAAD plate/shell elements parsed tolerantly from real decks (938 golden-count proven) and rendered as one merged double-sided surface mesh with a Plates summary count**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-23T22:10:20+03:00
- **Completed:** 2026-08-23T22:29+03:00
- **Tasks:** 4
- **Files modified:** 17

## Accomplishments
- `ELEMENT INCIDENCES` / `ELEMENT PROPERTIES` moved out of SKIPPED_ELEMENT_BLOCKS into new typed handlers producing `Plate { id, nodes: [4], thickness? }` records on `StaadModel.elements`
- Golden fixture end-to-end proof: HPP_Main_Building_2.std parses exactly 938 plates matching the manifest's computed countElementRows
- Renderer adds ONE merged non-indexed BufferGeometry mesh (2 tris/quad, DoubleSide, opacity 0.85), ignores exaggeration, drops unresolved quads defensively; empty elements arrays add zero overhead
- StatsSummary shows a "Plates" cell only when the model carries elements

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Plate contract on StaadModel** - `9b5c6f6` (test RED) / `d071643` (feat GREEN)
2. **Task 2: Tolerant ELEMENT handlers** - `0fb7f5d` (test RED) / `17646df` (feat GREEN)
3. **Task 3: Merged double-sided plate mesh** - `e85607d` (test RED) / `b8e9b34` (feat GREEN)
4. **Task 4: Plates count + end-to-end verification** - `b2359ab` (feat)

**Plan metadata:** (see final docs commit)

_Note: Task 1's RED gate was verified via `tsc --noEmit` because vitest transpiles TS without typechecking._

## Files Created/Modified
- `packages/parser/src/staad/elements.ts` - elementIncidencesHandler + elementPropertiesHandler (tolerant, registered via module side effect)
- `packages/parser/src/types.ts` - Plate interface + StaadModel.elements
- `packages/parser/src/core.ts`, `src/index.ts` - elements threaded through ParseContext/finalize/emptyModel; Plate re-exported
- `packages/parser/src/staad/skipped.ts` - both element commands removed from SKIPPED_ELEMENT_BLOCKS
- `web/lib/scene.ts` - buildPlates helper, widened SceneBuildResult.meshes union, plate material dispose
- `web/components/ViewerCanvas.tsx` - member picking/color path filters InstancedMesh only
- `web/lib/summaryData.ts` + `web/components/StatsSummary.tsx` - Plates count cell

## Decisions Made
- Accepted STAAD true-triangle rows (`elemId j1 j2 j3`) alongside repeated-node triangles — the HPP corpus contains 20 such rows; normalized to `[j1, j2, j3, j3]` so every plate satisfies the 4-tuple contract and the 938 golden count holds.
- Plate meshes stay OUT of the instance-color/picking path: ViewerCanvas passes an `instanceof THREE.InstancedMesh`-filtered array to ColorLayer/PickingController, preserving selection semantics exactly (PLATE-02).
- ELEMENT PROPERTIES list expansion uses the bounded listItemLength scanner + LIST_HARD_CAP (zip-bomb safe, T-05-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] True-triangle rows in the real corpus**
- **Found during:** Task 2 (golden count failed 918 vs 938)
- **Issue:** Plan behavior described triangles as "quad with repeated node", but the HPP fixture contains genuine 3-joint rows (`1261 92 76 77`)
- **Fix:** Accept strict-numeric 4-token rows as triangles, normalize to repeated-node quads
- **Files modified:** packages/parser/src/staad/elements.ts, test updated (wrong-arity case changed to 6 tokens)
- **Verification:** Golden test asserts 938 === manifest countElementRows end-to-end
- **Committed in:** 17646df

**2. [Rule 3 - Blocking] Widened mesh typing ripple**
- **Found during:** Task 3 (tsc errors in ViewerCanvas + 5 web test model literals)
- **Issue:** SceneBuildResult.meshes union broke InstancedMesh-typed consumers; StaadModel literal tests lacked `elements`
- **Fix:** Filtered memberMeshes in ViewerCanvas; added `elements: []` to test literals; cast getMatrixAt call
- **Files modified:** web/components/ViewerCanvas.tsx, 5 web test files
- **Verification:** web vitest 122 passed, tsc clean
- **Committed in:** b8e9b34

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes required for the golden-count must_have and type safety. No scope creep.

## Issues Encountered
None beyond the deviations above; full battery green on first complete pass after fixes.

## User Setup Required

None - no external service configuration required.

## Known Stubs
None.

## Next Phase Readiness
- `model.elements` available downstream (loads rendering can target element ids; groups.elementIds now resolvable against real records)
- Plate meshes intentionally excluded from selection — click-through inspection of plates is future work
- Manual dev-server check (HPP plates visible) noted as pending visual verification by the verifier

---
*Phase: 05-plate-shell-rendering*
*Completed: 2026-08-23*

## Self-Check: PASSED

