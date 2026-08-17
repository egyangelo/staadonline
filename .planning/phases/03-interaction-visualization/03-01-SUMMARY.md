# Plan 03-01 Summary: Viewer store prefs + categorical palettes + color-buffer rewrite

**Phase:** 03-interaction-visualization
**Plan:** 03-01
**Status:** Complete
**Requirements:** COLOR-01, COLOR-02, COLOR-03, COLOR-04

## Objective

Color foundation for the interaction phase: extend `viewerStore` with Phase 3 committed interaction prefs, build the pure categorical color-mode logic (fixed 8-hue palette, first-seen cyclic assignment, neutral grey, theme accent for All), and the per-instance `instanceColor` rewrite layer proving COLOR-04 (switch modes via color-buffer rewrite, never a scene rebuild).

## Work Done

### Task 1 — viewerStore Phase 3 prefs (D-01..D-04 store row)
- Extended `web/store/viewerStore.ts` in place, `exaggeration`/`setExaggeration` untouched.
- Added committed prefs: `colorMode` (default `'section'`), `markersVisible` (default `true`), `loadCaseId` (default `null`), `labelsVisible` (default `true`), `selectedId`/`selectedKind` (default `null`).
- One-key atomic setters: `setColorMode`, `setMarkersVisible`, `setLoadCaseId`, `setLabelsVisible`, `select(id, kind)`, `clearSelection`.
- `resetSceneState(loadCaseId?, markersDefaultOn?)` — UI-SPEC ERROR/EMPTY restore: clears selection, resets loadCaseId to first case on next load, marker default-on flag. Two-arg signature satisfies the 03-09 integration call.
- High-frequency state (hover id, pointer samples) deliberately NOT in the store — lives in refs (03-07).

### Task 2 — `web/lib/colorModes.ts` + tests (12 tests, TDD)
- `MEMBER_PALETTE`: the 8 UI-SPEC hues P0..P7 (`#2FA45C #8B5CF6 #F26D21 #0FB5D6 #E5484D #F0B429 #4C63F5 #7BC043`).
- `MODE_SEEDS = { section: 0, group: 3, material: 5 }`, cyclic via `(seed + distinct) % 8` (D-02).
- `neutralGrey()` (#8E8E93) for unassigned group/material members (D-03); `themeAccent(theme)` #007AFF light / #0A84FF dark for All mode (D-04).
- `modeKeyFor(member, mode)`: section → `sectionKey ?? ''` (never grey, still takes a slot); group/material → `?? null` → grey, no slot consumed. File strings verbatim.
- `computeMemberColors(model, mode, theme)` → `Map<memberId, {r,g,b}>` (0..1 floats); first-seen deterministic (D-01); real `Map` key storage (prototype-pollution safe, T-03-01).
- `hoverDim`/`hoverBrighten` rgb targets + `HOVER_DIM`/`HOVER_BRIGHTEN`/`SELECT_DIM`/`SELECT_BRIGHTEN` lerp factors (0.48/0.25/0.62/0.40).
- No plain-object member indexing; no `new Mesh`; no DOM.

### Task 3 — `web/lib/colorLayer.ts` + tests (6 tests, TDD)
- `applyModeColors(meshes, instanceToMember, memberColors, cacheKey?)`: walks each mesh's instances, resolves member via the instance→member map, `setColorAt` per instance, marks buffer dirty. Running per-mesh instance-id offset accounts for SceneBuilder's global instance counter.
- `modeColorCache` keyed `${mode}:${theme}` (bounded — 8 palettes) so a re-selection replays the same buffer (COLOR-04 cache replay).
- `applyHoverDim`/`applyHoverBrighten`: lerp the instance's current color toward #6E6E73 / #FFFFFF by the factor.
- COLOR-04 discipline proven: never touches `mesh.matrix`, geometry, or material (test asserts identity after a write).
- `clearModeColorCache()` helper for tests.
- three 0.185 note: `instanceColor.needsUpdate` is a **write-only setter** that bumps `version`; tests assert via `version`.

## Files Changed
- `web/store/viewerStore.ts` (modified)
- `web/lib/colorModes.ts` (new)
- `web/lib/colorModes.test.ts` (new, 12 tests)
- `web/lib/colorLayer.ts` (new)
- `web/lib/colorLayer.test.ts` (new, 6 tests)

## Verification
- `cd web && npx tsc --noEmit` — clean
- `cd web && npx vitest run lib/colorModes.test.ts lib/colorLayer.test.ts` — 18/18 green
- Grep `web/lib/colorLayer.ts` for `buildGeometry|new Mesh|add(` — absent (no-rebuild discipline, COLOR-04)
- Grep `colorModes.ts` for plain-object member indexing — Map-based only

## Notes
- This plan also front-runs part of 03-07 Task 1 (colorLayer pure helpers) — 03-07 will extend with the R3F ColorLayer component and re-use these helpers.
