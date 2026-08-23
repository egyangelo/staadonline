# Phase 5 Context — Plate & Shell Rendering

**Goal:** Parse ELEMENT INCIDENCES / ELEMENT PROPERTIES into typed plate records and render plates/shells as double-sided surfaces in the viewer. Pulled forward from v2 OUTP-02 after the Phase 4 demo showed 938 invisible elements in HPP_Main_Building_2.std.

## Background

Phase 1 scoped elements out (D-07): `ELEMENT INCIDENCES` and `ELEMENT PROPERTIES` sit in `SKIPPED_ELEMENT_BLOCKS` (packages/parser/src/staad/skipped.ts:94) and each block warns `SKIPPED_ELEMENT`. Group ELEMENT references already record `elementIds` on groups but resolve nothing.

## Decisions

- **D-05-01: Quads only, tolerant skip otherwise.** Parse clean `elemId j1 j2 j3 j4` rows (triangles = quad with repeated node). Range rows (`TO`), `_GROUP` references, and solids warn `SKIPPED_ELEMENT` per row and are skipped — same tolerance contract as Phase 1, no combinatorial expansion.
- **D-05-02: One merged mesh for all plates.** The renderer adds a single non-indexed BufferGeometry (2 tris/quad), `DoubleSide`, slightly transparent (~0.85 opacity) so interior members stay readable. No InstancedMesh (plates have no shared profile).
- **D-05-03: Plates are true-surface.** Cross-section exaggeration does NOT apply to plates; only member cross-sections scale.
- **D-05-04: Thickness optional.** `Plate.thickness` is set when ELEMENT PROPERTIES resolves it; rendering does not extrude thickness in this phase (surface representation only).

## Requirements

- PLATE-01: typed `Plate { id, nodes: [4], thickness? }` records parsed from real decks
- PLATE-02: plates rendered alongside members/markers without breaking selection or color modes
- PLATE-03: element parsing stays tolerant — malformed forms warn, never crash
