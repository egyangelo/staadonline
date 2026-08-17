import { describe, expect, it } from "vitest";
import type { LoadItem, SupportReleases, SupportType } from "@staad-online/parser";
import {
  markerUnit,
  buildSupportGlyph,
  buildLoadGlyph,
  modelDiagonal,
  distributedSegmentCount,
} from "./markerGeometry";

const ALL_RELEASES: SupportReleases = { FX: false, FY: false, FZ: false, MX: false, MY: false, MZ: false };
const RELEASED_FX: SupportReleases = { ...ALL_RELEASES, FX: true };

describe("markerUnit (D-06)", () => {
  it("(1) markerUnit(15) = clamp(0.08*15, 0.2, 2.5) = 1.2; floor 0.2; ceiling 2.5", () => {
    expect(markerUnit(15)).toBeCloseTo(1.2, 5);
    expect(markerUnit(1)).toBeCloseTo(0.2, 5);
    expect(markerUnit(100)).toBeCloseTo(2.5, 5);
  });
});

describe("modelDiagonal + distributedSegmentCount (D-09)", () => {
  it("modelDiagonal computes the bbox diagonal", () => {
    const bounds = { min: [0, 0, 0] as [number, number, number], max: [3, 4, 0] as [number, number, number] };
    expect(modelDiagonal(bounds)).toBeCloseTo(5, 5);
  });

  it("(2) distributedSegmentCount = clamp(round(span/(1.4*a)), 2, 12)", () => {
    expect(distributedSegmentCount(10, 1)).toBe(7); // round(10/1.4)=7
    expect(distributedSegmentCount(1, 2)).toBe(2); // floor (round(0.36)=0 -> clamp 2)
    expect(distributedSegmentCount(100, 1)).toBe(12); // cap
    expect(distributedSegmentCount(10, 10)).toBe(2); // round(0.71)=1 -> clamp 2
  });
});

describe("buildSupportGlyph (D-05)", () => {
  const TYPES: SupportType[] = ["FIXED", "PINNED", "FIXED_BUT", "SPRING", "ENFORCED", "PLATE"];

  it("(2) builds a positive-vertex geometry for every support type", () => {
    for (const type of TYPES) {
      const geo = buildSupportGlyph(type, ALL_RELEASES, markerUnit(15));
      expect(geo.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it("(3) FIXED and PINNED differ in vertex count; FIXED_BUT grooves change geometry", () => {
    const u = markerUnit(15);
    const fixed = buildSupportGlyph("FIXED", ALL_RELEASES, u);
    const pinned = buildSupportGlyph("PINNED", ALL_RELEASES, u);
    expect(fixed.attributes.position.count).not.toBe(pinned.attributes.position.count);

    const noRelease = buildSupportGlyph("FIXED_BUT", ALL_RELEASES, u);
    const fxReleased = buildSupportGlyph("FIXED_BUT", RELEASED_FX, u);
    expect(fxReleased.attributes.position.count).not.toBe(noRelease.attributes.position.count);
  });

  it("(4) returned geometries are fresh allocations (no shared mutable cache)", () => {
    const u = markerUnit(15);
    const a = buildSupportGlyph("FIXED", ALL_RELEASES, u);
    const b = buildSupportGlyph("FIXED", ALL_RELEASES, u);
    expect(a).not.toBe(b);
    expect(a.attributes.position).not.toBe(b.attributes.position);
  });
});

describe("buildLoadGlyph (D-09)", () => {
  const a = 1;

  function item(kind: LoadItem["kind"], overrides: Partial<LoadItem> = {}): LoadItem {
    return { kind, axis: "Y", axisRef: "GLOBAL", magnitude: 5, targets: [1], line: 9, ...overrides };
  }

  it("(1) JOINT_LOAD returns a single-arrow geometry with positive vertices", () => {
    const g = buildLoadGlyph(item("JOINT_LOAD"), a);
    expect(g.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(g.kind).toBe("JOINT_LOAD");
  });

  it("(1b) MEMBER_LOAD returns a single-arrow geometry", () => {
    const g = buildLoadGlyph(item("MEMBER_LOAD"), a);
    expect(g.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("(3) a moment returns a curved double-arrow with more vertices than a single arrow", () => {
    const arrow = buildLoadGlyph(item("MEMBER_LOAD"), a);
    const moment = buildLoadGlyph(item("JOINT_LOAD", { axis: "X" }), a, { moment: true });
    expect(moment.kind).toBe("JOINT_LOAD");
    expect(moment.geometry.attributes.position.count).toBeGreaterThan(arrow.geometry.attributes.position.count);
  });

  it("(4) SELFWEIGHT returns a -Y arrow with the SELFWEIGHT flag", () => {
    const g = buildLoadGlyph(item("SELFWEIGHT"), a);
    expect(g.kind).toBe("SELFWEIGHT");
    expect(g.labelHint).toBe("SELFWEIGHT");
    // head cone points down -Y: apex vertex y < base vertices y
    const positions = g.geometry.attributes.position.array as Float32Array;
    const counts = g.geometry.attributes.position.count;
    let apexY = Infinity;
    for (let i = 0; i < counts; i++) {
      apexY = Math.min(apexY, positions[i * 3 + 1]);
    }
    expect(apexY).toBeLessThan(0);
  });
});
