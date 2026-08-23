import { describe, expect, it } from "vitest";
import type { ParseWarning, StaadModel } from "@staad-online/parser";
import { buildSummaryData } from "./summaryData";

function baseModel(): StaadModel {
  return {
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 10, y: 0, z: 0 }],
    elements: [],
    members: [{ id: 1, startNode: 1, endNode: 2, sectionKey: "W10X30" }],
    sections: new Map([["W10X30", { label: "W10X30", points: [[0, 0]], approximate: false, family: "STEEL" }]]),
    supports: [{ nodeId: 1, type: "FIXED", releases: { FX: false, FY: false, FZ: false, MX: false, MY: false, MZ: false }, line: 20 }],
    loadCases: [{ id: 1, title: "DL", items: [], kind: "PRIMARY" }],
    groups: new Map([
      ["G1", { name: "G1", memberIds: [1], jointIds: [], elementIds: [] }],
      ["G2", { name: "G2", memberIds: [1, 2], jointIds: [], elementIds: [] }],
    ]),
    units: { length: "M", force: "KN" },
    bounds: { min: [0, 0, 0], max: [10, 0, 0] },
  };
}

function warning(code: string, line: number): ParseWarning {
  return { code, message: `msg ${code}`, line, severity: "warning" };
}

describe("buildSummaryData (SUMR-01/02/03)", () => {
  it("(1) counts nodes/members/sections/supports/load-cases/groups correctly", () => {
    const d = buildSummaryData(baseModel(), []);
    expect(d.nodes).toBe(2);
    expect(d.members).toBe(1);
    expect(d.sections).toBe(1);
    expect(d.supports).toBe(1);
    expect(d.loadCases).toBe(1);
    expect(d.groups).toBe(2);
  });

  it("(2) groupList returns [{name, count}] with count = memberIds.length; no-groups model returns []", () => {
    const d = buildSummaryData(baseModel(), []);
    expect(d.groupList).toEqual([
      { name: "G1", count: 1 },
      { name: "G2", count: 2 },
    ]);
    const empty = buildSummaryData({ ...baseModel(), groups: new Map() }, []);
    expect(empty.groupList).toEqual([]);
  });

  it("(3) boundingBoxRows returns per-axis {axis,min,max,extent}; extent = max - min", () => {
    const d = buildSummaryData(baseModel(), []);
    expect(d.boundingBoxRows).toEqual([
      { axis: "X", min: 0, max: 10, extent: 10 },
      { axis: "Y", min: 0, max: 0, extent: 0 },
      { axis: "Z", min: 0, max: 0, extent: 0 },
    ]);
  });

  it("(4) warningsTotal counts all; warningsList capped at 12 with truncated flag", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => warning(`W${i}`, i));
    const d = buildSummaryData(baseModel(), fifteen);
    expect(d.warningsTotal).toBe(15);
    expect(d.warningsList).toHaveLength(12);
    expect(d.warningsList[0].code).toBe("W0");
    expect(d.warningsList[11].code).toBe("W11");
    expect(d.warningsTruncated).toBe(true);

    const small = buildSummaryData(baseModel(), [warning("A", 1)]);
    expect(small.warningsList).toHaveLength(1);
    expect(small.warningsTruncated).toBe(false);
  });

  it("(5) units surface verbatim and the force-units label is `${length} / ${force}`", () => {
    const d = buildSummaryData(baseModel(), []);
    expect(d.units).toEqual({ length: "M", force: "KN" });
    expect(`${d.units.length} / ${d.units.force}`).toBe("M / KN");
  });
});
