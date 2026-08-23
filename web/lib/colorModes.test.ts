import { describe, expect, it } from "vitest";
import type { Member, StaadModel } from "@staad-online/parser";
import {
  MODE_SEEDS,
  neutralGrey,
  modeKeyFor,
  computeMemberColors,
  MEMBER_PALETTE,
  HOVER_DIM,
  HOVER_BRIGHTEN,
  SELECT_DIM,
  SELECT_BRIGHTEN,
} from "./colorModes";

function near(actual: number, expected: number, tol = 0.003): boolean {
  return Math.abs(actual - expected) <= tol;
}

function member(id: number, overrides: Partial<Member> = {}): Member {
  return { id, startNode: 1, endNode: 2, ...overrides };
}

function model(members: Member[]): StaadModel {
  return {
    nodes: [],
    elements: [],
    members,
    sections: new Map(),
    supports: [],
    loadCases: [],
    groups: new Map(),
    units: { length: "M", force: "KN" },
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  };
}

describe("colorModes palette", () => {
  it("MEMBER_PALETTE has exactly 8 fixed hues (P0..P7)", () => {
    expect(MEMBER_PALETTE).toHaveLength(8);
    expect(MEMBER_PALETTE[0]).toBe("#2FA45C");
    expect(MEMBER_PALETTE[7]).toBe("#7BC043");
  });

  it("MODE_SEEDS: section 0, group 3, material 5", () => {
    expect(MODE_SEEDS.section).toBe(0);
    expect(MODE_SEEDS.group).toBe(3);
    expect(MODE_SEEDS.material).toBe(5);
  });
});

describe("modeKeyFor", () => {
  it("section mode keys on sectionKey, empty string for missing (still gets a slot)", () => {
    expect(modeKeyFor(member(1, { sectionKey: "W10X30" }), "section")).toBe("W10X30");
    expect(modeKeyFor(member(1), "section")).toBe("");
  });

  it("group mode returns null when group missing → grey, no slot consumed", () => {
    expect(modeKeyFor(member(1, { group: "G1" }), "group")).toBe("G1");
    expect(modeKeyFor(member(1), "group")).toBeNull();
  });

  it("material mode returns null when material missing → grey, no slot consumed", () => {
    expect(modeKeyFor(member(1, { material: "CONCRETE" }), "material")).toBe("CONCRETE");
    expect(modeKeyFor(member(1), "material")).toBeNull();
  });
});

describe("computeMemberColors", () => {
  it("(1) first distinct section gets P0, second distinct section gets P1", () => {
    const colors = computeMemberColors(
      model([member(1, { sectionKey: "W10X30" }), member(2, { sectionKey: "W10X30" }), member(3, { sectionKey: "L4X4" })]),
      "section",
      "light",
    );
    const c1 = colors.get(1)!;
    const c3 = colors.get(3)!;
    // P0 #2FA45C
    expect(near(c1.r, 0x2f / 255) && near(c1.g, 0xa4 / 255) && near(c1.b, 0x5c / 255)).toBe(true);
    // P1 #8B5CF6
    expect(near(c3.r, 0x8b / 255) && near(c3.g, 0x5c / 255) && near(c3.b, 0xf6 / 255)).toBe(true);
    // Same section key → same slot (member 2 == member 1)
    expect(colors.get(2)).toEqual(c1);
  });

  it("(2) 9 distinct sections cycles round-robin: the 9th repeats P0", () => {
    const ms = Array.from({ length: 9 }, (_, i) => member(i + 1, { sectionKey: `S${i}` }));
    const colors = computeMemberColors(model(ms), "section", "light");
    expect(colors.get(9)).toEqual(colors.get(1));
  });

  it("(3) group/material missing → neutral grey #8E8E93; section missing still gets a slot", () => {
    const colours = computeMemberColors(
      model([member(1, { sectionKey: "A" }), member(2, { group: "G1" }), member(3), member(4, { material: "STEEL" }), member(5)]),
      "group",
      "light",
    );
    const g1 = colours.get(1)!;
    const g2 = colours.get(2)!;
    expect(near(g1.r, 0x8e / 255) && near(g1.g, 0x8e / 255) && near(g1.b, 0x93 / 255)).toBe(true);
    expect(g2).not.toEqual(neutralGrey());

    const materials = computeMemberColors(model([member(1, { material: "STEEL" }), member(2)]), "material", "light");
    expect(materials.get(2)).toEqual(colors(neutralGrey()));
  });

  it("(3b) section mode with missing sectionKey still takes a palette slot (never grey)", () => {
    const ms = model([member(1, { sectionKey: "A" }), member(2), member(3, { sectionKey: "B" })]);
    const colors = computeMemberColors(ms, "section", "light");
    const c1 = colors.get(1)!;
    const c2 = colors.get(2)!;
    expect(c2).not.toEqual(c1); // '' is its own distinct key -> own slot
    expect(near(c2.r, 0x8e / 255)).toBe(false); // not the neutral-grey red channel
  });

  it("(4) all mode paints every member the theme accent blue", () => {
    const ms = model([member(1, { sectionKey: "A" }), member(2, { sectionKey: "B" })]);
    const light = computeMemberColors(ms, "all", "light");
    const dark = computeMemberColors(ms, "all", "dark");
    const l = light.get(1)!;
    const d = dark.get(1)!;
    expect(near(l.r, 0x00) && near(l.g, 0x7a / 255) && near(l.b, 1)).toBe(true); // #007AFF
    expect(near(d.r, 0x0a / 255) && near(d.g, 0x84 / 255) && near(d.b, 1)).toBe(true); // #0A84FF
    expect(light.get(2)).toEqual(l);
    expect(dark.get(2)).toEqual(d);
  });

  it("(5) assignment is deterministic; group first key seeds at P3, material first at P5", () => {
    const a = computeMemberColors(model([member(1, { group: "G1" }), member(2, { group: "G2" })]), "group", "light");
    const b = computeMemberColors(model([member(1, { group: "G1" }), member(2, { group: "G2" })]), "group", "light");
    expect(a.get(1)).toEqual(b.get(1));
    // group seed 3 -> first key at palette index 3 = P3 = #0FB5D6
    const g1 = a.get(1)!;
    expect(near(g1.r, 0x0f / 255) && near(g1.g, 0xb5 / 255) && near(g1.b, 0xd6 / 255)).toBe(true);

    const mat = computeMemberColors(model([member(1, { material: "M1" })]), "material", "light");
    const m1 = mat.get(1)!;
    // material seed 5 → first key P5 = #F0B429
    expect(near(m1.r, 0xf0 / 255) && near(m1.g, 0xb4 / 255) && near(m1.b, 0x29 / 255)).toBe(true);
  });

  it("hover/selection lerp factors match UI-SPEC §Motion numbers", () => {
    expect(HOVER_DIM).toBe(0.48);
    expect(HOVER_BRIGHTEN).toBe(0.25);
    expect(SELECT_DIM).toBe(0.62);
    expect(SELECT_BRIGHTEN).toBe(0.40);
  });
});

function colors(c: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  return c;
}
