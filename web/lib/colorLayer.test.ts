import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Color, Matrix4 } from "three";
import {
  applyModeColors,
  applyHoverDim,
  applyHoverBrighten,
  modeColorCache,
  clearModeColorCache,
} from "./colorLayer";

function tinyMesh(count: number): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), count);
  for (let i = 0; i < count; i++) {
    mesh.setMatrixAt(i, new Matrix4().makeTranslation(0, i, 0));
  }
  return mesh;
}

const colors = new Map([
  [1, { r: 1, g: 0, b: 0 }],
  [2, { r: 0, g: 1, b: 0 }],
  [3, { r: 0, g: 0, b: 1 }],
  [4, { r: 0.5, g: 0.5, b: 0.5 }],
]);

const instanceToMember = new Map([
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
]);

describe("applyModeColors", () => {
  it("(1) writes each instance [r,g,b] from memberColors into instanceColor and marks the buffer dirty", () => {
    clearModeColorCache();
    const mesh = tinyMesh(4);
    applyModeColors([mesh], instanceToMember, colors, "section:light");

    expect(mesh.instanceColor).not.toBeNull();
    const arr = mesh.instanceColor!.array;
    expect(arr[0]).toBeCloseTo(1, 3);
    expect(arr[1]).toBeCloseTo(0, 3);
    expect(arr[2]).toBeCloseTo(0, 3);
    expect(arr[3]).toBeCloseTo(0, 3);
    expect(arr[4]).toBeCloseTo(1, 3);
    expect(arr[5]).toBeCloseTo(0, 3);
    expect(arr[6]).toBeCloseTo(0, 3);
    expect(arr[7]).toBeCloseTo(0, 3);
    expect(arr[8]).toBeCloseTo(1, 3);
    expect(arr[11]).toBeCloseTo(0.5, 3);
    // three 0.185: needsUpdate is a write-only setter that bumps `version`
    expect(mesh.instanceColor!.version).toBeGreaterThan(0);
  });

  it("(2) second call with the same mode+theme returns cached colors (identity)", () => {
    clearModeColorCache();
    const mesh = tinyMesh(4);
    applyModeColors([mesh], instanceToMember, colors, "section:light");
    const cached = modeColorCache.get("section:light");
    expect(cached).toBeInstanceOf(Map);
    applyModeColors([mesh], instanceToMember, colors, "section:light");
    expect(modeColorCache.get("section:light")).toBe(cached); // same reference, no recompute
  });

  it("(2b) cache keyed by mode:theme — group:dark is a separate entry", () => {
    clearModeColorCache();
    const mesh = tinyMesh(4);
    applyModeColors([mesh], instanceToMember, colors, "section:light");
    applyModeColors([mesh], instanceToMember, colors, "group:dark");
    expect(modeColorCache.size).toBe(2);
  });

  it("(4) never mutates mesh.matrix, geometry, or material", () => {
    clearModeColorCache();
    const mesh = tinyMesh(4);
    const geometryBefore = mesh.geometry;
    const materialBefore = mesh.material;
    const matrixBefore = mesh.instanceMatrix.clone();
    const mat0 = mesh.getMatrixAt(0, new Matrix4()).clone();
    applyModeColors([mesh], instanceToMember, colors, "section:light");
    expect(mesh.geometry).toBe(geometryBefore);
    expect(mesh.material).toBe(materialBefore);
    expect(mesh.instanceMatrix.array).toEqual(matrixBefore.array);
    expect(mesh.getMatrixAt(0, new Matrix4()).elements).toEqual(mat0.elements);
  });
});

describe("applyHoverDim / applyHoverBrighten", () => {
  it("(3) dim lerps toward #6E6E73 by the dim factor; brighten toward #FFFFFF", () => {
    const mesh = tinyMesh(2);
    const base = new Color(1, 1, 1);
    mesh.setColorAt(0, base);
    mesh.setColorAt(1, base);
    mesh.instanceColor!.needsUpdate = true;

    applyHoverDim(mesh, 0, 0.48);
    const dimmed = mesh.instanceColor!.array.slice(0, 3);
    expect(dimmed[0]).toBeCloseTo(1 - (1 - 0x6e / 255) * 0.48, 3);
    expect(dimmed[1]).toBeCloseTo(1 - (1 - 0x6e / 255) * 0.48, 3);
    expect(dimmed[2]).toBeCloseTo(1 - (1 - 0x73 / 255) * 0.48, 3);

    applyHoverBrighten(mesh, 1, 0.25);
    const brightened = mesh.instanceColor!.array.slice(3, 6);
    // base white already at 1; brightening toward white is a no-op shift
    expect(brightened[0]).toBeCloseTo(1, 3);
    expect(brightened[1]).toBeCloseTo(1, 3);
    expect(brightened[2]).toBeCloseTo(1, 3);
  });

  it("(3b) dim from a mid color moves toward the grey target (not to black)", () => {
    const mesh = tinyMesh(1);
    mesh.setColorAt(0, new Color(1, 0.5, 0.25));
    mesh.instanceColor!.needsUpdate = true;

    applyHoverDim(mesh, 0, 0.48);
    const arr = mesh.instanceColor!.array;
    expect(arr[0]).toBeGreaterThan(0.7); // stays well above the dim target 0.43
    expect(arr[2]).toBeCloseTo(0.25 + (0x73 / 255 - 0.25) * 0.48, 3);
  });
});