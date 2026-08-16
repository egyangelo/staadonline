---
phase: 02-file-opening-3d-rendering
plan: 3
subsystem: rendering
tags: [threejs, aisc, steel-sections, extrudegeometry, geometry-cache, vitest]

# Dependency graph
requires:
  - phase: 01-parser-model
    provides: SectionProfile/SectionMeta types + steel-resolver prisProfile/fallbackProfile [x,z] polygon contract
  - phase: 02-file-opening-3d-rendering
    provides: web vitest harness (02-02) + three@0.185.1 pinned in the web workspace
provides:
  - Vendored MIT AISC section DB (web/data/sections.json, 1,223 entries) normalized to meters/CCW positional array with provenance header
  - sectionDb.ts: on-demand Map-indexed exact lookup + nearest-family fallback (D-13/D-14/D-07) + upgradeProfile for Phase-1 approximations
  - sectionShape.ts: SectionProfile polygon → cached ExtrudeGeometry + uniform exaggeration scaling (D-05, D-04 input)
affects: [02-04, 02-05, 02-07]

# Tech tracking
tech-stack:
  added: [no new npm packages — three@0.185.1 reused from 02-02]
  patterns:
    - Positional JSON array + leading _meta header element (never object-keyed section data — prototype-pollution-safe)
    - Lazy dynamic-import index: Map<string, SectionEntry> built on first access via ensureIndexed()
    - Nearest-family fallback polygon constants (I/C/L/tube/box) always flagged approximate:true
    - Shared geometry cache keyed by section label; base positions WeakMap for reapplicable uniform scale

key-files:
  created:
    - web/data/sections.json
    - web/lib/sectionDb.ts
    - web/lib/sectionDb.test.ts
    - web/lib/sectionShape.ts
    - web/lib/sectionShape.test.ts
  modified: []

key-decisions:
  - "Vendored the upstream OpenBuilding AISC DB (commit 7b72284e) at 1,223 entries — exact match for the STACK.md '1,223 AISC sections' citation; all geometry built from dims already in meters, so no unit conversion risk at vendor time"
  - "sections.json is a positional ARRAY (no name-keyed object): first element is a _meta header carrying source/commit/license/normalization; entries themselves are {name, family, points} — prototype-pollution-safe per T-02-01"
  - "Three 0.185 ExtrudeGeometry is non-indexed (positions/3 = triangle count) — tests assert triangles via position.count/3 instead of geo.index"
  - "applyUniformScale captures a base copy in a module WeakMap so repeated exaggeration changes compound correctly on the shared cached instance (D-04: one call per change, never per frame)"
  - "nearestShape family routing order is fixed: W/M/S/HP → I, MC/C → channel, L → angle, HSS/TUBE/PIPE → tube, else → 0.2×0.2 box (FALLBACK_HALF 0.1 parity with steel-resolver)"

patterns-established:
  - "Extrude from SectionProfile.points [x,z] directly (no type dispatch in the renderer — ARCHITECTURE Pattern 'every section is a polygon')"
  - "DB lookup is on-demand and never pre-loads the full 1,223-row table (D-14 lazy dynamic import)"
  - "upgradeProfile never fabricates exact geometry for unknown names — warn-don't-throw, unknown label stays approximate"

requirements-completed: [REND-01]

# Metrics
duration: 34min
completed: 2026-08-16
---

# Phase 02: Plan 3 Summary

**Vendored the MIT OpenBuilding AISC steel database (1,223 sections) as a meters/CCW positional array and built the on-demand lookup + nearest-family fallback layer (sectionDb.ts) plus the SectionProfile→cached-ExtrudeGeometry extrusion factory with uniform exaggeration scaling (sectionShape.ts) — real W/C/L/HSS/PIPE outline geometry the SceneBuilder consumes.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-16T22:02:00Z
- **Completed:** 2026-08-16T22:36:30Z
- **Tasks:** 3
- **Files modified:** 5 (all created)

## Accomplishments
- Vendored the actual MIT OpenBuilding AISC section database (commit `7b72284e`, upstream `src/data/aisc-sections.json`) into `web/data/sections.json` — 1,223 normalized entries (`{name, family, points}`), dims already in meters, outlines converted to CCW, stored as a positional array with a `_meta` provenance/license header (never object-keyed — prototype-pollution-safe, T-02-01). Families: W 289, C 32, L 137, HSS 714 (rect+round), PIPE 51. Verified `W14X90`/`C12X30`/`L4X4X1/4`/`HSS6X6X1/4`/`Pipe20STD` all resolve with correct family polygons.
- Built `web/lib/sectionDb.ts` (D-13/D-14/D-07): lazy `ensureIndexed()` builds a real `Map` on first access (never at import time), `lookupSection` does case-insensitive exact lookup, `nearestShape` routes unknown families W/M/S/HP→I, MC/C→channel, L→angle, HSS/TUBE/PIPE→tube, else→0.2×0.2 box with `approximate:true` always, and `upgradeProfile` upgrades Phase-1 (01-06) fallback profiles holding a real TABLE name to exact DB outlines without ever fabricating geometry.
- Built `web/lib/sectionShape.ts` (D-05, D-04 input): `buildSectionGeometry` turns any `SectionProfile.points` [x,z] polygon into a shared cached `THREE.ExtrudeGeometry` (unit depth, no bevel — flat/mobile cheap per PITFALLS P5), `geometryCache` keyed by section label, and `applyUniformScale` rewrites the shared geometry's positions from a captured base WeakMap on exaggeration change (never per frame).

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | Vendor MIT AISC DB (1,223 sections, meters/CCW) | `43e68aa` | data |
| 2 | sectionDb on-demand lookup + nearest-family fallback | `c00b5d5` | feat |
| 3 | sectionShape outline extrusion + shared cache | `82f8402` | feat |

**Plan metadata:** (no separate completion commit — SUMMARY.md committed at execution end)

## Files Created/Modified
- `web/data/sections.json` — 1,223-entry vendored AISC DB: `_meta` header (repo/commit/license/normalization) + positional `{name, family, points}` array in meters/CCW. ~506 KB.
- `web/lib/sectionDb.ts` — SectionEntry/SectionResolution types, `ensureIndexed` (lazy Map), `lookupSection`, `nearestShape`, `upgradeProfile`.
- `web/lib/sectionDb.test.ts` — 8 vitest tests: exact/case-insensitive/unknown lookup, family routing, upgradeProfile identity/exact/approximate.
- `web/lib/sectionShape.ts` — `buildSectionGeometry`, `geometryCache`, internal `getOrCreateGeometry`, `applyUniformScale` (base-position WeakMap).
- `web/lib/sectionShape.test.ts` — 5 vitest tests: rect extrusion, cache identity, W14X90 beats rect triangles, scale ×15, no cache leak.

## Decisions Made
- Vendored the genuine upstream DB rather than synthesizing shapes: count matches the research citation exactly (1,223), and geometry is derived from real dims (d/bf/tw/tf, legs/t, Ht/B, od) already normalized to meters — no per-entry unit conversion at vendor time (0.0254 was NOT applied, avoiding a 39.37× sizing bug, PITFALLS P1/P3).
- Wrote the data file as a **positional array** with the first element a `_meta` header holding provenance/commit/license/normalization — JSON has no comments, and the plan's "top-of-file header" requirement is satisfied without creating an object-keyed structure (T-02-01).
- Confirmed `three@0.185.1` `ExtrudeGeometry` emits non-indexed buffers (`geo.index === null`, positions/3 = triangles) — tests use `position.count / 3`, and `getVertexCount`-style indexing is unnecessary.
- `upgradeProfile` returns the exact incoming reference unchanged when already `approximate:false` (caller identity preserved, test asserts `toBe`) — matching the plan's "return it unchanged".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] three 0.185 ExtrudeGeometry is non-indexed — plan tests referenced `geo.index`**
- **Found during:** Task 3 (sectionShape tests)
- **Issue:** Plan test actions asserted `attribute.position + index` and `index.count`; in three 0.185.1 `ExtrudeGeometry` produces no index buffer (`geo.index === null`), so two tests failed on type-level assumptions about geometry shape.
- **Fix:** Rewrote assertions to count triangles as `position.count / 3` (rect = 36 positions / 12 triangles; W14X90 > rect), preserving the plan's intent (real extruded outline, more geometry than a rect, no leak).
- **Files modified:** web/lib/sectionShape.test.ts
- **Verification:** web vitest green (5/5 sectionShape tests); `tsc --noEmit` clean in web.
- **Committed in:** `82f8402` (Task 3 commit)

**2. [Rule 1 - Bug] `SectionProfile` type has no `family` field — upgradeProfile return type adjusted**
- **Found during:** Task 2 (web typecheck)
- **Issue:** `tsc` rejected `{ ...profile, family }` because `family` lives on `SectionMeta` (the parser's `ResolvedSection = SectionProfile & SectionMeta`), not on `SectionProfile` alone.
- **Fix:** Narrowed `upgradeProfile`'s return to `Promise<SectionProfile & { family: string }>` (the union the parser's resolver actually produces) and cast the unchanged-exact branch to preserve reference identity.
- **Files modified:** web/lib/sectionDb.ts
- **Verification:** `tsc --noEmit` clean; 8/8 sectionDb tests pass including the identity `toBe` assertion.
- **Committed in:** `c00b5d5` (Task 3 → Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Mechanical correctness fixes required for the tests to pass and typecheck under the actual three 0.185 API and parser types. No scope creep; plan semantics unchanged.

## Issues Encountered
- The two prior executor-agent spawns for this plan were interrupted before any work (no commits, no files); executed directly in sequential mode instead — the working tree was clean, so no rework was needed.
- `npm test -w parser` fails with "No workspaces found" — the root package.json does not expose that npm flag; ran vitest from `packages/parser` directly instead (equivalent result).
- Vite emits the same advisory `configLoader: 'native'` ESM note on the web vitest config as in 02-02 — non-blocking, left as-is.

## Threat Flags
None. The vendored DB is static third-party data consumed as geometry only (names never rendered as HTML, T-02-04); lookups index into a `Map`, never a plain object (T-02-01); the cache is bounded by distinct section keys (T-02-02); provenance header pins source+commit (T-02-03); polygon sizes are fixed/small (T-02-05); no new installs (T-02-SC).

## Known Stubs
- `applyUniformScale`'s third `_geometryCache` parameter is accepted for plan-contract API parity but the shared instance is scaled in place — the parameter is intentionally unused beyond the default binding.
- Round/pipe outlines use a 24-gon circle polygon (polygon-circle approximation from the upstream `section-profiles.ts` `polygonCircle(r, 24)` pattern) — an exact circle is not representable as a polygon contract.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 02-04 (SceneBuilder): `sectionShape.buildSectionGeometry` + `geometryCache` provide the "one shared extruded geometry per profile → InstancedMesh/config" contract; `sectionDb.upgradeProfile` upgrades Phase-1 approximate `SectionProfile`s to real outlines before extrusion.
- Web vitest suite green (21/21 across fileService/sectionDb/sectionShape); parser regression green (182/182).

## Self-Check: PASSED

- Files on disk: `web/data/sections.json` (1,223 entries + header), `web/lib/sectionDb.ts`, `web/lib/sectionDb.test.ts`, `web/lib/sectionShape.ts`, `web/lib/sectionShape.test.ts` — FOUND
- Commits in git: `43e68aa`, `c00b5d5`, `82f8402` — FOUND in `git log --all`
- STATE.md / ROADMAP.md: NOT modified by this plan

---
*Phase: 02-file-opening-3d-rendering*
*Completed: 2026-08-16*