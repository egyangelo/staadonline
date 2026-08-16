---
phase: 02-file-opening-3d-rendering
plan: 4
subsystem: rendering
tags: [threejs, instancing, float64, rebase, camera-fit, vitest]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: StaadModel/Node/Member/Bounds types; Member.rotation (02-01); centroid-rebase provenance in core.ts finalize()
  - phase: 02-file-opening-3d-rendering
    provides: sectionShape.ts buildSectionGeometry/geometryCache/applyUniformScale (02-03) + sectionDb.ts upgradeProfile/nearestShape (02-03) + parser bounds contract
provides:
  - SceneBuilder: centroid-rebasing instanced layer build (one InstancedMesh per distinct section) with parallel instanceId↔memberId maps, per-member matrices incl. D-06 axial rotation, exaggeration geometry-scale, dispose hygiene
  - computeCameraFit: pure framing math (target/position/near/far) for ViewerCanvas (02-05)
affects: [02-05, 02-07, 03-interaction-visualization]

# Tech tracking
tech-stack:
  added: [no new npm packages — three@0.185.1 reused]
  patterns:
    - Centroid rebase into Float64Array (REND-06 / P8) before any float32 buffer; input model never mutated
    - One THREE.InstancedMesh per distinct section key (profileCount === meshes.length), never one Mesh per member
    - Parallel Map<instanceId→member>, Map<memberId→instance> (REND-02 Pattern 2) — no object-keyed lookups
    - Matrix composition via setFromUnitVectors + setFromAxisAngle for D-06 BETA rotation (deg→rad)
    - Pure camera-fit (plain tuples, no three in signature) so 02-05 can call without WebGL

key-files:
  created:
    - web/lib/scene.ts
    - web/lib/scene.test.ts
  modified: []

key-decisions:
  - "rebaseModel returns a dense Float64Array indexed by array position (not node id) — node id stays the 1-based D-04 source of truth on Node.id; SceneBuilder keeps a Map<nodeId, arrayIndex> merely to map member start/end references"
  - "Centroid is bounds-midpoint per axis (mirrors core.ts finalize()); fallback to a nodes walk when bounds are all-zero, so a degenerate model still rebases"
  - "dispose() clears internal arrays in place and disposes shared geometry + material (T-02-03 / P5) — build results keep referencing the live arrays so the test can assert emptiness"
  - "computeCameraFit falls back to a unit box for zero-radius bounds and always returns finite near/far (T-02-02) — near = radius/1000, far = radius*4"
  - "UNRESOLVED members (no sectionKey) route to a nearestShape fallback profile so the whole member layer always renders (D-07 warn-don't-throw parity)"

requirements-completed: [REND-02, REND-03, REND-04, REND-06]

# Metrics
duration: 25min
completed: 2026-08-17
---

# Phase 02: Plan 4 Summary

**Built the render heart of the phase: `scene.ts` delivers centroid rebase (REND-06/P8), an instanced layer builder — one `THREE.InstancedMesh` per distinct section profile with parallel instance↔member maps, per-member matrices (incl. D-06 axial rotation), exaggeration geometry-scale and disposal — plus pure `computeCameraFit` framing math for the 02-05 ViewerCanvas.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-17T01:36:00Z
- **Completed:** 2026-08-17T02:01:00Z
- **Tasks:** 3
- **Files modified:** 2 (both created)

## Accomplishments
- `rebaseModel(model)` (REND-06 / P8): computes the centroid from `model.bounds` midpoint per axis (nodes-walk fallback when bounds are all-zero, mirroring `core.ts finalize()`), subtracts it from every node coordinate, and returns `{ origin, nodeCoords: Float64Array }` indexed by array position. Survey-scale inputs (100000–100010 m) recenter to ≤ ~10 of origin, so downstream Float32 GPU buffers never collapse precision. Input model is never mutated (write-once modelStore rule); Y-up is shared with three.js (D-03), so no axis remap.
- `SceneBuilder` (REND-02 / P4 / P5): `build(model, exaggeration): Promise<SceneBuildResult>` walks the model's sections once, upgrades approximate profiles via `sectionDb.upgradeProfile`, builds one shared `ExtrudeGeometry` per distinct key through `sectionShape.buildSectionGeometry`/`geometryCache`, applies the uniform exaggeration via `sectionShape.applyUniformScale`, then creates ONE `THREE.InstancedMesh` per distinct section profile (never one Mesh per member). Per-member `instanceMatrix` composition orients the unit-extruded profile along the member axis (`setFromUnitVectors`) and then applies D-06 `member.rotation` in radians about the member local axis (`setFromAxisAngle`); scale Z = member length. Returns parallel `instanceToMember` / `memberToInstance` plain Maps. `setExaggeration(factor)` re-scales all shared geometries in one pass. `dispose()` disposes geometry + material and drops references (T-02-03).
- `computeCameraFit(rebasedBounds, opts?)` (REND-03 / D-01): pure framing math — target = bounds midpoint, position = target + oblique [1, 0.6, 1] direction × radius (half-diagonal), near = radius/1000, far = radius*4, with a unit-box fallback for degenerate/zero-size bounds so near/far are always finite. Plain-tuple signature (no three objects) so 02-05 can call it without a WebGL context.

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 TDD red | rebaseModel contract (spanning/origin/near-origin/index/unmutated) | `7c90907` | test |
| 2 TDD red | exaggeration/dispose/attach coverage | `f442bb2` | test |
| 3 green | SceneBuilder/rebase/camera-fit implementation | `8b04ab1` | feat |

**Plan metadata:** (no separate completion commit — SUMMARY.md committed at execution end)

## Files Created/Modified
- `web/lib/scene.ts` — SceneBuilder (build/setExaggeration/dispose), rebaseModel, computeCameraFit, SceneBuildResult/CameraFit types, UNRESOLVED_PROFILE routing.
- `web/lib/scene.test.ts` — 15 vitest tests: 4 rebase (survey-scale recenter, near-origin identity, member index resolution, no mutation), 6 SceneBuilder (one InstancedMesh per profile, map round-trip, matrix endpoint placement, exaggeration ×15, dispose dispatch+empties, Object3D attach), 5 camera-fit (10³ box, oblique position, 1e-6 near/far, zero-size fallback, doubling scale).

## Decisions Made
- `rebaseModel` returns node positions by **array index** rather than node id, and the builder keeps a `Map<nodeId, arrayIndex>` only to resolve member start/end — matches D-04 (1-based id on `Node.id` preserved, 0-based internal indexes by array position).
- Camera-fit distance uses a constant heading factor (k = 2.2) on the normalized oblique direction × radius; clip planes clamped from radius so nothing artifacts on the rebased model.
- `dispose()` disposes the **shared** geometry and material (cached instances reused across builds) but never mutates the module `geometryCache` contents — re-builds keep reuse, guaranteeing one draw call per profile (P4).
- Profile resolution completes asynchronously (`async build`) because upgrades can hit the lazy-loaded section DB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Step and object-keyed assumptions — unit-box/zero-length guard refinement**
- **Found during:** Task 3 (green implementation + tsc)
- **Issue:** Two edge cases surfaced while making tests pass under actual values: (a) `computeCameraFit` test (12) needs the target scale-invariant while position length doubles — the constant heading factor had to be applied on `radius`, not on the raw half-diagonal; (b) matrices for zero-length/undefined-node members must not emit NaN (T-02-02) — identity placement chosen.
- **Fix:** Camera position = target + (oblique-normalized × radius × k); degenerate members get an identity matrix (never NaN into GPU buffers).
- **Files modified:** web/lib/scene.ts
- **Verification:** web vitest green (15/15), `tsc --noEmit` clean, verification greps clean (no `new THREE.Mesh\b`, no object-keyed lookups).
- **Committed in:** `8b04ab1`

**2. [Rule 2 - Type] Test fixture `sections` Map missing `family` (SectionMeta)**
- **Found during:** web typecheck (Task 3)
- **Issue:** `StaadModel.sections` is `Map<string, SectionProfile & SectionMeta>`; `family` is required — `tsc` rejected the fixture.
- **Fix:** Added `family: "PRISMATIC"` to the test fixture section entry.
- **Files modified:** web/lib/scene.test.ts
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `8b04ab1` (green commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 type)
**Impact on plan:** Mechanical correctness fixes required for the tests to pass and typecheck; plan semantics unchanged.

## Issues Encountered
- `rg` is not installed in this environment — used the OpenCode grep tool for the verification greps instead (equivalent result: zero `new THREE.Mesh\b`, zero `Record<number`).
- No other blocks.

## Threat Flags
None. Strings/values derive from the parser model (never DOM — T-02-05); all numeric paths guarded for NaN/Infinity (T-02-02); GPU resources disposed on replace/unmount (T-02-03); instance count bounded by distinct section keys (T-02-01, P4 budget); rotation is a pre-validated finite number clamped to radians (T-02-04); matrices built once, `needsUpdate` only on change (T-02-06); no installs (T-02-SC).

## Known Stubs
- Member layer has no shadows (PITFALLS P5 mobile budget); `flatShading` is enabled on the shared `MeshStandardMaterial` — fine-tuning is a 03-xx concern, not this plan.
- UNRESOLVED-profile members (no `sectionKey`) render via `nearestShape` fallback; exact cross-section fidelity for those is best-effort by design (D-07).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 02-05 (ViewerCanvas): `SceneBuilder.build()` returns the instanced meshes + `rebasedBounds`, and `computeCameraFit` supplies target/position/near/far for the R3F canvas — both consumable without WebGL context in tests.
- Web vitest suite green (36/36 across fileService/sectionDb/sectionShape/scene).

## Self-Check: PASSED

- Files on disk: `web/lib/scene.ts`, `web/lib/scene.test.ts` — FOUND
- Commits in git: `7c90907`, `f442bb2`, `8b04ab1` — FOUND in `git log --all`
- STATE.md / ROADMAP.md: NOT modified by this plan

---
*Phase: 02-file-opening-3d-rendering*
*Completed: 2026-08-17*