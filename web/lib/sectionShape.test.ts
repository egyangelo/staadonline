/**
 * sectionShape contract tests (02-03 Task 3 — D-05 extrusion, cached geometry).
 * Pure three.js in node — no React/R3F. Uses sectionDb for a real W14X90
 * outline to prove extrusion of a genuine 12-point AISC profile.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyUniformScale, buildSectionGeometry, geometryCache } from "./sectionShape";
import { lookupSection } from "./sectionDb";
import type { SectionProfile } from "@staad-online/parser";

const RECT: SectionProfile = {
  label: "RECT_TEST",
  points: [
    [-0.05, -0.05],
    [0.05, -0.05],
    [0.05, 0.05],
    [-0.05, 0.05],
  ],
  approximate: false,
};

describe("buildSectionGeometry (D-05 outline extrusion)", () => {
  it("(1) a PRIS rectangle extrudes to real 3D geometry (positions > 6, triangles > 0)", () => {
    const geo = buildSectionGeometry(RECT);
    expect(geo).toBeInstanceOf(THREE.ExtrudeGeometry);
    expect(geo.attributes.position.count).toBeGreaterThan(6);
    // three 0.185 ExtrudeGeometry is non-indexed; triangles = positions / 3.
    expect(geo.attributes.position.count / 3).toBeGreaterThan(0);
  });

  it("(2) same label twice returns the SAME geometry instance (shared cache)", () => {
    const a = buildSectionGeometry(RECT);
    const b = buildSectionGeometry(RECT);
    expect(b).toBe(a);
  });

  it("(3) a W-shaped 12-point polygon extrudes without throwing and beats the rect in triangles", async () => {
    const w = await lookupSection("W14X90");
    expect(w).not.toBeNull();
    const profile: SectionProfile = {
      label: "W14X90",
      points: w!.points,
      approximate: false,
    };
    const geo = buildSectionGeometry(profile);
    const rect = buildSectionGeometry(RECT);
    expect(geo.attributes.position.count).toBeGreaterThan(rect.attributes.position.count);
    expect(geo.attributes.position.count / 3).toBeGreaterThan(rect.attributes.position.count / 3);
  });
});

describe("geometry cache", () => {
  it("(4) applyUniformScale(geom, 15) scales position magnitudes by 15 vs base", () => {
    const rect = buildSectionGeometry(RECT);
    const before = rect.attributes.position.array as Float32Array;
    const baseMag = Math.hypot(before[0], before[1], before[2]);
    applyUniformScale(rect, 15);
    const after = rect.attributes.position.array as Float32Array;
    const scaledMag = Math.hypot(after[0], after[1], after[2]);
    expect(scaledMag).toBeCloseTo(baseMag * 15, 6);
  });

  it("(5) cache instance count stays 1 across duplicate label calls (no leak)", () => {
    geometryCache.clear();
    const FIRST = { ...RECT, label: "LEAK_TEST" };
    buildSectionGeometry(FIRST);
    buildSectionGeometry(FIRST);
    buildSectionGeometry({ ...RECT, label: "LEAK_TEST" });
    expect(geometryCache.get("LEAK_TEST")).toBeDefined();
    let matching = 0;
    for (const v of geometryCache.values()) {
      if (v === geometryCache.get("LEAK_TEST")) matching++;
    }
    expect(matching).toBe(1);
  });
});