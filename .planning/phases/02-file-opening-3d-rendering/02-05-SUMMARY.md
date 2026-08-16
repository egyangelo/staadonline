---
phase: 02-file-opening-3d-rendering
plan: 5
subsystem: rendering
tags: [threejs, react-three-fiber, drei, orbit-controls, camera-fit, canvas]

# Dependency graph
requires:
  - phase: 02-file-opening-3d-rendering
    provides: SceneBuilder (build/dispose/setExaggeration) + computeCameraFit from 02-04 scene.ts; modelStore + viewerStore from 02-02; parser StaadModel contract
provides:
  - ViewerCanvas R3F Canvas host: SceneBuilder subscription, camera auto-fit on load + resize, drei OrbitControls (touch + mouse)
affects: [02-07]

# Tech tracking
tech-stack:
  added: [no new npm packages — @react-three/fiber@9.7.0 + @react-three/drei@10.7.8 pinned in 02-02]
  patterns:
    - One-way pipeline: modelStore (write-once) → SceneBuilder (imperative three) → R3F group — no reverse writes
    - SceneBuilder instance created once per model identity; dispose-on-replace + dispose-on-unmount (P5)
    - D-01 auto-fit via computeCameraFit on load AND debounced window resize (rAF), never inside user gestures (T-02-05)
    - PITFALLS P5 caps: dpr ≤ 2, no shadows, no extra MSAA, flat MeshStandardMaterial

key-files:
  created:
    - web/components/ViewerCanvas.tsx
  modified: []

key-decisions:
  - "R3F <Canvas> is chrome-free scene-only (D-12); page.tsx 02-07 owns layout/chrome/state machine"
  - "OrbitControls mounted makeDefault + enableDamping (0.08) with min/max distance derived from fit radius (soft-stop rubber-band feel, UI-SPEC reduce-motion/§Motion)"
  - "Canvas stays transparent — 02-07 page container paints the UI-SPEC dominant color (#F5F5F7/#0A0A0C) via CSS"

requirements-completed: [REND-03, REND-05]

# Metrics
duration: 18min
completed: 2026-08-17
---

# Phase 02: Plan 5 Summary

**Created the R3F `<Canvas>` host (`web/components/ViewerCanvas.tsx`): fixed full-viewport canvas, write-once model subscription rebuilding a single SceneBuilder instance only when a new model lands, camera auto-fit from `computeCameraFit` on every load and window resize, and drei `OrbitControls` (damped 0.08, clamped min/max distance, touch + mouse) — all within PITFALLS P5 mobile caps (dpr ≤ 2, no shadows, no MSAA).**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-17T02:05:00Z
- **Completed:** 2026-08-17T02:23:00Z
- **Tasks:** 3
- **Files modified:** 1 (created)

## Accomplishments
- Task 1 — **Canvas scaffold + render caps:** framed `<Canvas>` full-viewport (`position: fixed; inset: 0`), `camera={{ fov: 45, near: 0.1, far: 10000, position: [10,10,10] }}`, `dpr = min(devicePixelRatio, 2)`, `gl={{ antialias: false }}` and no `shadows` — member layer stays MSAA-free with flat `MeshStandardMaterial` (P5). Hemisphere + directional light pair light the extruded profiles flat and soft. No UI chrome inside (D-12); page-owned styling deferred to 02-07.
- Task 2 — **Model subscription + SceneBuilder lifecycle (D-11):** a `SceneContents` component subscribes to `useModelStore` via status/model selectors and to `useViewerStore.exaggeration`. `sceneRef` holds one `SceneBuilder` per model identity (created once in a `useRef`); on a new model the old builder is `dispose()`d and the previous group children removed before rebuilding (P5 dispose-on-replace). `build(model, exaggeration)` runs async (section-DB upgrades) and appends the returned meshes to a `<group>`; empty/loading status tears the group down and never invokes build with `model === null`. Exaggeration changes call `setExaggeration(n)` (geometry-scale path, D-04) — never a rebuild.
- Task 3 — **Auto-fit camera + OrbitControls (D-01/REND-05):** after a successful build, `computeCameraFit(rebasedBounds)` sets camera position/near/far and the OrbitControls target; a `useResizeFit` hook re-fires the fit on window resize through a debounced rAF (T-02-05). `OrbitControls` `makeDefault`, `enableDamping` true, `dampingFactor={0.08}`, `minDistance`/`maxDistance` clamped from the fit radius so zoom soft-stops without clipping the far plane; pan enabled; drei supplies touch (single-finger orbit, pinch zoom) + mouse natively. Y-up needs no remap (D-03).

## Task Commits

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | Canvas scaffold + render caps | `f58d12e` | feat (combined) |
| 2 | Model subscription + SceneBuilder lifecycle | `f58d12e` | feat (combined) |
| 3 | Auto-fit camera + OrbitControls | `f58d12e` | feat (combined) |

**Plan metadata:** single-file plan — all three tasks landed in one atomic feature commit; SUMMARY.md committed at execution end.

## Files Created/Modified
- `web/components/ViewerCanvas.tsx` — `ViewerCanvas` (Canvas wrapper: dpr, fixed layout, light rig, no shadows) + `SceneContents` (SceneBuilder lifecycle, exaggeration re-scale, camera fit, OrbitControls).

## Decisions Made
- Used the drei `OrbitControls` forwarded ref typed via `three-stdlib`'s `OrbitControls` class (drei re-exports the same control instance) so `target`/`minDistance`/`maxDistance` updates are type-safe without adding a package.
- `useResizeFit` wraps the refit in `requestAnimationFrame`, so a resize storm coalesces to one fit per frame (T-02-05 "resize listener debounced via rAF").
- Camera `far` is recomputed as `max(fit.far, distance-to-target × 2)` after positioning so the fitted frame never clips the model (degenerate/far models stay visible).
- Group children are removed and any `InstancedMesh` group children disposed on teardown, in addition to the builder's own `dispose()` (belt-and-braces P5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Type] three-stdlib `OrbitControls` type import**
- **Found during:** Task 3 (typecheck)
- **Issue:** `useRef<OrbitControls | null>` failed — in this runtime the bare `OrbitControls` identifier is the drei React component (a value, not a type). TS2749.
- **Fix:** Imported the underlying control class type from `three-stdlib` (`import type { OrbitControls as OrbitControlsImpl }`) — drei's forwarded ref holds that instance. No new dependency (three-stdlib is already drei's transitive dep).
- **Files modified:** web/components/ViewerCanvas.tsx
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `f58d12e`

---

**Total deviations:** 1 auto-fixed (1 Rule 2 type)
**Impact on plan:** Mechanical type fix; plan semantics unchanged.

## Issues Encountered
- No runtime/browser available in this environment for the animated canvas — visual acceptance (fit, orbit/zoom/pan, slider-live, transparency passes) is deferred to the 02-07 end-of-phase `<human-check>` gates.

## Threat Flags
None. Draw calls bounded by one InstancedMesh per profile (T-02-01); dispose-on-replace/unmount caps GPU memory (T-02-02); `webglcontextlost` is handled by the scene being static/rebuildable — recovery = next model reload (T-02-03, P5); geometry only, no DOM/HTML (T-02-04); fit only on load/resize with rAF debounce (T-02-05); zero network calls (T-02-06); no installs (T-02-SC).

## Known Stubs
- No context-loss listener yet in ViewerCanvas — the plan assigns recovery to "next model reload"; wiring an explicit `webglcontextlost` handler (preventDefault + stopLoop) can be a 03-xx hardening item.
- Initial camera positional `[10,10,10]` placeholder is overridden immediately by fit on every model load — empty state simply shows a flat background.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 02-07 (page integration): `ViewerCanvas` composes under the viewer container above the chrome; `OpenControl`/`ExaggerationSlider`/`StatsSummary`/`ErrorToast`/`LoadingOverlay` (02-06) wait for the page controller wiring.
- Web typecheck clean (includes ViewerCanvas + scene.ts).

## Self-Check: PASSED

- Files on disk: `web/components/ViewerCanvas.tsx` — FOUND
- Commits in git: `f58d12e` — FOUND in `git log --all`
- STATE.md / ROADMAP.md: NOT modified by this plan

---
*Phase: 02-file-opening-3d-rendering*
*Completed: 2026-08-17*