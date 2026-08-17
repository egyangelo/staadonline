# Plan 03-02 Summary: Load-case union resolution + axis refs + magnitude formatting + summary dataset

**Phase:** 03-interaction-visualization
**Plan:** 03-02
**Status:** Complete
**Requirements:** MARK-03, MARK-04, SUMR-01, SUMR-02, SUMR-03

## Objective

Pure data-resolution layer for the loads chrome and the expanded summary: resolve any load case (primary, combination, or repeated) to the union of the load items it renders (D-12, weights ignored), compute the effective global/local axis label for the legend chip (D-11), format magnitudes with parsed force/length units (D-10, SUMR-02), and derive the full model-summary dataset for the Phase-2 StatsSummary extension (SUMR-01/02/03).

## Work Done

### Task 1 — `web/lib/loadCases.ts` union resolution (D-12, 7 tests)
- `resolveLoadCaseItems(model, caseId)`:
  - PRIMARY (and repeated-load) cases → their own items unchanged.
  - COMBINATION → transitively walks terms; numeric refs resolve by `id`, string refs by exact `title` (parser 01-08: GUI emits case names); union collected with factors/weights discarded.
  - Combo-of-combo resolves; visited-set guard terminates on cycles and self-references.
  - Unmatchable refs skipped silently (never a throw); unknown case id → `[]`.
  - Output in first-referenced order, de-duplicated by item identity (kind/axis/axisRef/magnitude/targets/line).

### Task 2 — axis refs + magnitude formatting (D-11/D-10, 4 tests)
- `effectiveAxisRefs(model, caseId)` → distinct `axisRef` values in encounter order: `['GLOBAL']` / `['LOCAL']` / `['GLOBAL','LOCAL']` (mixed) / `[]` (empty). The LegendChip (03-05) renders the joined label.
- `formatMagnitude(magnitude, forceUnit)` → `Number(n.toFixed(2))` + unit (`12.5 KN`, `1234.57 KN`).
- `formatDistributedMagnitude(magnitude, forceUnit, lengthUnit)` → adds `/{lowercased length unit}` via a `LENGTH_SUFFIX` map (`KN/m`, `KIP/ft`, `KN/mm`).

### Task 3 — `web/lib/summaryData.ts` model-summary dataset (SUMR-01/02/03, 5 tests)
- `buildSummaryData(model, warnings)` → one typed object: counts (nodes/members/sections/supports/loadCases/groups), `groupList` (`{name, count}` from `model.groups`, `memberIds.length`), `boundingBoxRows` (per-axis `X/Y/Z` min→max + `extent = max - min`), `units` verbatim from `model.units` (SUMR-02), `warningsTotal`, `warningsList` (first 12), `warningsTruncated` (SUMR-03).
- Data contract only — nothing renders HTML.

## Files Changed
- `web/lib/loadCases.ts` (new), `web/lib/loadCases.test.ts` (new, 11 tests)
- `web/lib/summaryData.ts` (new), `web/lib/summaryData.test.ts` (new, 5 tests)

## Verification
- `cd web && npx vitest run lib/loadCases.test.ts lib/summaryData.test.ts` — 16/16 green
- `cd web && npx tsc --noEmit` — clean
- Grep `loadCases.ts` for `innerHTML|dangerouslySetInnerHTML|document\.` — absent (pure data module)
- Grep `summaryData.ts` for `while(true)|for(;;)` — absent (visited-set bounds the walk)

## Notes
- Consumed by 03-04 (LoadCaseSelector/MagnitudeLabelToggle), 03-05 (LegendChip), 03-06 (ExpandedSummary), 03-08 (MarkersLayer labels).
