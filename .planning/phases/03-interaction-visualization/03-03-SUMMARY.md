# Plan 03-03 Summary: Pick throttle + NO_TAP guard + support/load glyph geometry builders

**Phase:** 03-interaction-visualization
**Plan:** 03-03
**Status:** Complete
**Requirements:** MARK-01, MARK-02, INSP-02

## Objective

Pure interaction and glyph foundation: throttle + NO_TAP guard logic (D-14) that the scene PickingController will drive, and the marker/load glyph geometry builders (D-05/D-06/D-09) that the scene MarkersLayer will instance. Both stay dependency-light (three-geometry and pure state machines) so they are node-unit-testable.

## Work Done

### Task 1 — `web/lib/picking.ts` + tests (8 tests, TDD, D-14)
- `createHoverThrottle(intervalMs = 125)` → `{ shouldFire(now), last }`: clamp where a unique `now` passes only when `now - last >= intervalMs` and `last` updates only on the passing call (8 Hz hover raycast rate).
- `createNoTapGuard(windowMs = 500, maxTicks = 2)` → `{ move(now), up() }`: counts move-ticks through a sliding 500 ms window; more than 2 moves suppresses tap registration; the next pointer-up with NO intervening move re-permits a deliberate still-tap (D-14 recovery). `up()` resets the window.
- `shouldRegisterTap(guard, hadMoveSinceLastUp)`: pure tap decision — veto when a move intervened, else delegate to `guard.up()`.
- `dragDistanceExceeded(pxMoved, thresholdPx = 6)`: pure arithmetic so OrbitControls drags never tap.
- No three/React/DOM imports; fake-timer tests (`vi.useFakeTimers`).

### Task 2 — `web/lib/markerGeometry.ts` marker unit + support glyphs (D-06/D-05, 4 tests)
- `markerUnit(exaggeration, avgWidth = 1)` → `clamp(0.08 * exaggeration, 0.20, 2.5)`: 15 → 1.2, 1 → 0.2 (floor), 100 → 2.5 (ceiling).
- `buildSupportGlyph(type, releases, u)` → fresh `BufferGeometry` per call (no shared mutable cache):
  - FIXED → cube 1.2u³, base at node (Y-up).
  - PINNED → tetrahedron (manual BufferGeometry): base circumradius 0.6u at y=0, apex +Y 1.5u.
  - FIXED_BUT → notched cube: 0.3u-deep × 0.5u-wide grooves cut on each released axis face (box decomposition, no CSG); vertex count rises with released axes.
  - SPRING → 4-coil helix (CatmullRomCurve3 + TubeGeometry), radius 0.55u, height 1.8u, tube 0.12u.
  - ENFORCED → OctahedronGeometry 0.9u.
  - PLATE → thin square 0.85u × 0.15u.
- All bounded fixed tessellation (T-03-03).

### Task 3 — load glyphs for all kinds (D-09, 6 tests)
- `modelDiagonal(bounds)` → bbox diagonal (LoadGlyphs `a = diagonal * 0.035`).
- `distributedSegmentCount(span, a)` → `clamp(round(span/(1.4*a)), 2, 12)`: 10/1 → 7, 1/2 → 2 (floor), 100/1 → 12 (cap).
- `buildLoadGlyph(item, a, opts)` → `{ geometry, count, kind, labelHint? }`:
  - JOINT_LOAD / MEMBER_LOAD → single arrow (shaft cylinder + head cone, merged).
  - `opts.moment` → curved double-arrow (TubeGeometry arc radius 0.4a, thickness 0.06a, swept π, two head cones).
  - SELFWEIGHT → −Y arrow with `labelHint: 'SELFWEIGHT'`.
  - ELEMENT_LOAD / GENERATED → defensive arrow, never reached in practice.
- `dir` accepted for caller-resolved orientation; layer rotates the instance.

## Files Changed
- `web/lib/picking.ts` (new), `web/lib/picking.test.ts` (new, 8 tests)
- `web/lib/markerGeometry.ts` (new), `web/lib/markerGeometry.test.ts` (new, 10 tests)

## Verification
- `cd web && npx vitest run lib/picking.test.ts lib/markerGeometry.test.ts` — 18/18 green
- `cd web && npx tsc --noEmit` — clean
- Grep `markerGeometry.ts` for `new Mesh` — absent (geometry-only module; instancing happens in 03-08)
- Grep `picking.ts` for `eval(|new Function|regex` — absent (state machines only)

## Notes
- Consumed by 03-07 (PickingController) and 03-08 (MarkersLayer instancing).
