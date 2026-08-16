/**
 * SectionDB contract tests (02-03 Task 2 — REND-01 via D-13/D-14/D-07).
 * Pure data + async lazy index (no three.js) → node env is fine.
 */
import { describe, expect, it } from "vitest";
import { lookupSection, nearestShape, upgradeProfile } from "./sectionDb";
import type { SectionProfile } from "@staad-online/parser";

describe("lookupSection (D-13/D-14 exact DB resolution)", () => {
  it("(1) 'W14X90' resolves to a >= 6-point exact polygon", async () => {
    const res = await lookupSection("W14X90");
    expect(res).not.toBeNull();
    expect(res!.points.length).toBeGreaterThanOrEqual(6);
    expect(res!.approximate).toBe(false);
  });

  it("(2) case-insensitive match: 'w14x90' resolves the same entry", async () => {
    const lower = await lookupSection("w14x90");
    const upper = await lookupSection("W14X90");
    expect(lower).not.toBeNull();
    expect(lower!.points).toEqual(upper!.points);
    expect(lower!.family).toBe(upper!.family);
  });

  it("(3) unknown name 'ZZZ999' → null (never fabricated)", async () => {
    expect(await lookupSection("ZZZ999")).toBeNull();
  });
});

describe("nearestShape (D-07 nearest-family fallback)", () => {
  it("(4) unknown name returns approximate:true with a >= 4-point polygon", () => {
    const near = nearestShape("ZZZ999");
    expect(near.approximate).toBe(true);
    expect(near.points.length).toBeGreaterThanOrEqual(4);
  });

  it("(5) family prefix routing: W→I, C→channel (points differ from W), L→angle", async () => {
    const w = await lookupSection("W14X90");
    expect(w!.family).toBe("W");

    const c = await lookupSection("C12X30");
    expect(c).not.toBeNull();
    expect(c!.family).toMatch(/^C/);
    expect(c!.points).not.toEqual(w!.points);

    const l = await lookupSection("L4X4X1/4");
    expect(l).not.toBeNull();
    expect(l!.family).toBe("L");
  });
});

describe("upgradeProfile (Phase-1 profile → real DB outline)", () => {
  it("(6) an exact PRIS profile is returned unchanged (same reference)", async () => {
    const exact: SectionProfile = {
      label: "PRIS_1",
      points: [
        [-0.05, -0.05],
        [0.05, -0.05],
        [0.05, 0.05],
        [-0.05, 0.05],
      ],
      approximate: false,
    };
    await expect(upgradeProfile(exact)).resolves.toBe(exact);
  });

  it("(7) an approximate profile with a known DB label resolves to exact", async () => {
    const approx: SectionProfile = {
      label: "W14X90",
      points: [
        [-0.1, -0.1],
        [0.1, -0.1],
        [0.1, 0.1],
        [-0.1, 0.1],
      ],
      approximate: true,
    };
    const upgraded = await upgradeProfile(approx);
    expect(upgraded.approximate).toBe(false);
    expect(upgraded.points).toEqual((await lookupSection("W14X90"))!.points);
  });

  it("(8) an approximate profile with an unknown label stays approximate", async () => {
    const approx: SectionProfile = {
      label: "ZZZ999",
      points: [
        [-0.1, -0.1],
        [0.1, -0.1],
        [0.1, 0.1],
        [-0.1, 0.1],
      ],
      approximate: true,
    };
    const upgraded = await upgradeProfile(approx);
    expect(upgraded.approximate).toBe(true);
  });
});