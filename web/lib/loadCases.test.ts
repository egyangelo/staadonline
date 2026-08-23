import { describe, expect, it } from "vitest";
import type { LoadCase, LoadItem, StaadModel } from "@staad-online/parser";
import {
  resolveLoadCaseItems,
  effectiveAxisRefs,
  formatMagnitude,
  formatDistributedMagnitude,
} from "./loadCases";

function item(overrides: Partial<LoadItem> = {}): LoadItem {
  return {
    kind: "MEMBER_LOAD",
    axis: "Y",
    axisRef: "GLOBAL",
    magnitude: 10,
    targets: [1],
    line: 10,
    ...overrides,
  };
}

function model(loadCases: LoadCase[]): StaadModel {
  return {
    nodes: [],
    members: [],
        elements: [],
    sections: new Map(),
    supports: [],
    loadCases,
    groups: new Map(),
    units: { length: "M", force: "KN" },
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  };
}

const itemA = item({ kind: "MEMBER_LOAD", magnitude: 5, targets: [1], line: 11 });
const itemB = item({ kind: "JOINT_LOAD", magnitude: 6, targets: [2], line: 12 });

describe("resolveLoadCaseItems (D-12)", () => {
  it("(1) PRIMARY case returns its own items unchanged", () => {
    const cases = [{ id: 1, title: "DL", items: [itemA, itemB], kind: "PRIMARY" as const }];
    const got = resolveLoadCaseItems(model(cases), 1);
    expect(got).toHaveLength(2);
    expect(got[0]).toBe(itemA);
    expect(got[1]).toBe(itemB);
  });

  it("(2) COMBINATION resolves to the union of referenced case items (factors discarded)", () => {
    const cases: LoadCase[] = [
      { id: 1, title: "DL", items: [itemA], kind: "PRIMARY" },
      { id: 2, title: "LL", items: [itemB], kind: "PRIMARY" },
      { id: 10, title: "COMBO", items: [], kind: "COMBINATION", terms: [{ factor: 1, ref: 1 }, { factor: -1, ref: 2 }] },
    ];
    const got = resolveLoadCaseItems(model(cases), 10);
    expect(got.map((i) => i.magnitude).sort()).toEqual([5, 6]);
  });

  it("(3) string refs resolve via case title; unknown names are skipped (no throw)", () => {
    const cases: LoadCase[] = [
      { id: 1, title: "DL", items: [itemA], kind: "PRIMARY" },
      { id: 2, title: "LL", items: [itemB], kind: "PRIMARY" },
      { id: 10, title: "C", items: [], kind: "COMBINATION", terms: [{ factor: 1, ref: "DL" }, { factor: 1, ref: "NOTHERE" }] },
    ];
    const got = resolveLoadCaseItems(model(cases), 10);
    expect(got).toHaveLength(1);
    expect(got[0]).toBe(itemA);
  });

  it("(4) combo-of-combo resolves transitively; a self-reference terminates with the visited guard", () => {
    const cases: LoadCase[] = [
      { id: 1, title: "DL", items: [itemA], kind: "PRIMARY" },
      { id: 2, title: "LL", items: [itemB], kind: "PRIMARY" },
      { id: 10, title: "C1", items: [], kind: "COMBINATION", terms: [{ factor: 1, ref: 1 }] },
      { id: 20, title: "C2", items: [], kind: "COMBINATION", terms: [{ factor: 1, ref: 10 }, { factor: 1, ref: 2 }] },
      { id: 30, title: "SELF", items: [], kind: "COMBINATION", terms: [{ factor: 1, ref: 30 }] },
    ];
    const trans = resolveLoadCaseItems(model(cases), 20);
    expect(trans.map((i) => i.magnitude).sort()).toEqual([5, 6]);
    const self = resolveLoadCaseItems(model(cases), 30);
    expect(self).toHaveLength(0);
  });

  it("(5) repeated loads (items-bearing PRIMARY-kind cases) resolve as primary", () => {
    const cases: LoadCase[] = [
      { id: 1, title: "DL", items: [itemA], kind: "PRIMARY" },
      { id: 11, title: "REPEAT 1", items: [item({ magnitude: 7 })], kind: "PRIMARY" },
    ];
    const got = resolveLoadCaseItems(model(cases), 11);
    expect(got).toHaveLength(1);
    expect(got[0].magnitude).toBe(7);
  });

  it("(6) union de-duplicates by identity (same kind/axis/axisRef/magnitude/targets/line)", () => {
    const same = item({ kind: "MEMBER_LOAD", magnitude: 5, targets: [1], line: 11 });
    const cases: LoadCase[] = [
      { id: 1, title: "DL", items: [itemA], kind: "PRIMARY" },
      { id: 2, title: "LL", items: [same], kind: "PRIMARY" },
      { id: 10, title: "C", items: [], kind: "COMBINATION", terms: [{ factor: 1, ref: 1 }, { factor: 1, ref: 2 }] },
    ];
    const got = resolveLoadCaseItems(model(cases), 10);
    expect(got).toHaveLength(1);
  });

  it("(7) unknown case id returns [] without throwing", () => {
    const cases = [{ id: 1, title: "DL", items: [itemA], kind: "PRIMARY" as const }];
    expect(resolveLoadCaseItems(model(cases), 999)).toEqual([]);
  });
});

describe("effectiveAxisRefs (D-11)", () => {
  it("all GLOBAL -> ['GLOBAL']; all LOCAL -> ['LOCAL']; mix -> ['GLOBAL','LOCAL']", () => {
    const m = model([
      { id: 1, title: "G", items: [item({ axisRef: "GLOBAL" }), item({ axisRef: "GLOBAL" })], kind: "PRIMARY" },
      { id: 2, title: "L", items: [item({ axisRef: "LOCAL" })], kind: "PRIMARY" },
      { id: 3, title: "MIX", items: [item({ axisRef: "GLOBAL" }), item({ axisRef: "LOCAL" })], kind: "PRIMARY" },
    ]);
    expect(effectiveAxisRefs(m, 1)).toEqual(["GLOBAL"]);
    expect(effectiveAxisRefs(m, 2)).toEqual(["LOCAL"]);
    expect(effectiveAxisRefs(m, 3)).toEqual(["GLOBAL", "LOCAL"]);
  });

  it("empty case (no items) returns []", () => {
    const m = model([{ id: 1, title: "E", items: [], kind: "PRIMARY" }]);
    expect(effectiveAxisRefs(m, 1)).toEqual([]);
  });
});

describe("formatMagnitude / formatDistributedMagnitude (D-10)", () => {
  it("formatMagnitude rounds to 2 decimals and appends the force unit", () => {
    expect(formatMagnitude(12.5, "KN")).toBe("12.5 KN");
    expect(formatMagnitude(1234.567, "KN")).toBe("1234.57 KN");
    expect(formatMagnitude(300, "KIP")).toBe("300 KIP");
  });

  it("formatDistributedMagnitude appends the lowercased length unit", () => {
    expect(formatDistributedMagnitude(12.5, "KN", "M")).toBe("12.5 KN/m");
    expect(formatDistributedMagnitude(300, "KIP", "FT")).toBe("300 KIP/ft");
    expect(formatDistributedMagnitude(1, "KN", "MM")).toBe("1 KN/mm");
  });
});
