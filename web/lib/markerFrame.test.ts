/**
 * markerFrame pure placement tests (03-08 Task 1, D-05/D-06/D-09/D-10).
 * Builds a mini 2-node / 1-member model and asserts transform positions,
 * midpoint centering, distributed segment counts, and finite labels.
 */
import { describe, expect, it } from "vitest";
import type { LoadItem, StaadModel, Support } from "@staad-online/parser";
import { distributedSegmentCount } from "./markerGeometry";
import {
  isDistributedItem,
  isMomentItem,
  labelPoints,
  loadItemTransforms,
  supportTransforms,
  type LoadTransform,
} from "./markerFrame";

function miniModel(): StaadModel {
  const supports: Support[] = [
    { nodeId: 1, type: "PINNED", releases: { FX: false, FY: false, FZ: false, MX: true, MY: true, MZ: true }, line: 10 },
  ];
  return {
    nodes: [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 8, y: 0, z: 0 },
    ],
    elements: [],
    members: [{ id: 1, startNode: 1, endNode: 2, sectionKey: "PRIS" }],
    sections: new Map(),
    supports,
    loadCases: [],
    groups: new Map(),
    units: { length: "M", force: "KN" },
    bounds: { min: [0, 0, 0], max: [8, 0, 0] },
  };
}

/** Rebased coords with identity origin (model is already centered at 0). */
function coords(model: StaadModel): { nodeCoords: Float64Array } {
  const nodeCoords = new Float64Array(model.nodes.length * 3);
  model.nodes.forEach((n, i) => {
    nodeCoords[i * 3] = n.x;
    nodeCoords[i * 3 + 1] = n.y;
    nodeCoords[i * 3 + 2] = n.z;
  });
  return { nodeCoords };
}

function item(partial: Partial<LoadItem> & Pick<LoadItem, "kind">): LoadItem {
  return {
    axis: "Y",
    axisRef: "GLOBAL",
    magnitude: -10,
    targets: [],
    line: 15,
    ...partial,
  };
}

function allFinite(t: LoadTransform): boolean {
  return t.position.every(Number.isFinite) && t.quaternion.every(Number.isFinite);
}

describe("supportTransforms", () => {
  it("places one transform per support at the node rebased position", () => {
    const model = miniModel();
    const t = supportTransforms(model, coords(model));
    expect(t).toHaveLength(1);
    expect(t[0].support.nodeId).toBe(1);
    expect(t[0].position).toEqual([0, 0, 0]);
    expect(t[0].quaternion).toEqual([0, 0, 0, 1]);
  });

  it("skips supports whose node id is missing from coords", () => {
    const model = miniModel();
    model.supports.push({
      nodeId: 999,
      type: "FIXED",
      releases: { FX: false, FY: false, FZ: false, MX: false, MY: false, MZ: false },
      line: 11,
    });
    const t = supportTransforms(model, coords(model));
    expect(t).toHaveLength(1);
  });
});

describe("loadItemTransforms", () => {
  it("JOINT_LOAD → one arrow per target node position", () => {
    const model = miniModel();
    const items = [item({ kind: "JOINT_LOAD", axis: "Y", targets: [2], loadType: "FY" })];
    const t = loadItemTransforms(model, coords(model), items);
    expect(t).toHaveLength(1);
    expect(t[0].position).toEqual([8, 0, 0]);
    expect(allFinite(t[0])).toBe(true);
  });

  it("MEMBER_LOAD concentrated → arrow at the member midpoint", () => {
    const model = miniModel();
    const items = [item({ kind: "MEMBER_LOAD", axis: "Y", targets: [1], loadType: "CON" })];
    const t = loadItemTransforms(model, coords(model), items);
    expect(t).toHaveLength(1);
    expect(t[0].position).toEqual([4, 0, 0]);
    expect(allFinite(t[0])).toBe(true);
  });

  it("distributed MEMBER_LOAD → distributedSegmentCount arrows across the span", () => {
    const model = miniModel();
    const a = 1;
    const n = distributedSegmentCount(8, a);
    const items = [item({ kind: "MEMBER_LOAD", axis: "Y", targets: [1], loadType: "UNI" })];
    const t = loadItemTransforms(model, coords(model), items, a);
    expect(t).toHaveLength(n);
    expect(t[0].position[0]).toBeCloseTo(0, 5);
    expect(t[n - 1].position[0]).toBeCloseTo(8, 5);
    t.forEach((tr) => expect(allFinite(tr)).toBe(true));
  });

  it("moment item → single transform at the midpoint", () => {
    const model = miniModel();
    const items = [item({ kind: "MEMBER_LOAD", axis: "Y", targets: [1], loadType: "MOM" })];
    const t = loadItemTransforms(model, coords(model), items);
    expect(t).toHaveLength(1);
    expect(t[0].position).toEqual([4, 0, 0]);
  });

  it("SELFWEIGHT → single −Y arrow at the origin", () => {
    const model = miniModel();
    const items = [item({ kind: "SELFWEIGHT", magnitude: -1, targets: [] })];
    const t = loadItemTransforms(model, coords(model), items);
    expect(t).toHaveLength(1);
    expect(t[0].position).toEqual([0, 0, 0]);
    expect(t[0].quaternion).toEqual([1, 0, 0, 0]); // +Y → −Y
  });
});

describe("isMomentItem / isDistributedItem", () => {
  it("detects MOM MEMBER_LOAD and MX/MY/MZ JOINT_LOAD as moments", () => {
    expect(isMomentItem(item({ kind: "MEMBER_LOAD", loadType: "MOM" }))).toBe(true);
    expect(isMomentItem(item({ kind: "JOINT_LOAD", loadType: "MY" }))).toBe(true);
    expect(isMomentItem(item({ kind: "JOINT_LOAD", loadType: "FY" }))).toBe(false);
  });

  it("detects UNI/TRAP MEMBER_LOAD as distributed only", () => {
    expect(isDistributedItem(item({ kind: "MEMBER_LOAD", loadType: "UNI" }))).toBe(true);
    expect(isDistributedItem(item({ kind: "MEMBER_LOAD", loadType: "TRAP" }))).toBe(true);
    expect(isDistributedItem(item({ kind: "MEMBER_LOAD", loadType: "CON" }))).toBe(false);
    expect(isDistributedItem(item({ kind: "JOINT_LOAD", loadType: "FY" }))).toBe(false);
  });
});

describe("labelPoints", () => {
  it("returns one finite anchor per distributed segment (segment-count array length)", () => {
    const model = miniModel();
    const a = 1;
    const items = [item({ kind: "MEMBER_LOAD", axis: "Y", targets: [1], loadType: "UNI" })];
    const t = loadItemTransforms(model, coords(model), items, a);
    const pts = labelPoints(t, a);
    expect(pts).toHaveLength(t.length);
    pts.forEach((p) => {
      p.position.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    });
  });

  it("anchor sits above the member for a +Y arrow", () => {
    const model = miniModel();
    const a = 1;
    const items = [item({ kind: "MEMBER_LOAD", axis: "Y", targets: [1], loadType: "CON" })];
    const t = loadItemTransforms(model, coords(model), items, a);
    const [p] = labelPoints(t, a);
    expect(p.position[1]).toBeGreaterThan(0); // tip pushed +Y from midpoint
  });
});
