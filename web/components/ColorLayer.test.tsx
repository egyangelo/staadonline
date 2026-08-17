/**
 * ColorLayer node tests — pure selection/hover buffer math (03-07 Task 2).
 * The R3F component is thin; its decision logic (computeSelectionState,
 * locateInstance) is node-tested here without a canvas (vitest env: node).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeSelectionState, locateInstance } from "./ColorLayer";

function makeMeshes(counts: number[]): THREE.InstancedMesh[] {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  return counts.map((c) => new THREE.InstancedMesh(geo, mat, c));
}

describe("computeSelectionState", () => {
  it("brightens the selected member instance and dims all others", () => {
    const instanceToMember = new Map<number, number>([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    const { brighten, dim } = computeSelectionState(instanceToMember, 3, 2, "member");
    expect(brighten).toEqual([1]);
    expect(dim).toEqual([0, 2]);
  });

  it("returns empty dim/brighten when no member selection", () => {
    const instanceToMember = new Map<number, number>([[0, 1]]);
    const { brighten, dim } = computeSelectionState(instanceToMember, 1, null, null);
    expect(brighten).toEqual([]);
    expect(dim).toEqual([]);
  });

  it("support selection dims nothing (member ids only)", () => {
    const instanceToMember = new Map<number, number>([[0, 1]]);
    const { brighten, dim } = computeSelectionState(instanceToMember, 1, 7, "support");
    expect(brighten).toEqual([]);
    expect(dim).toEqual([]);
  });
});

describe("locateInstance", () => {
  it("resolves a global instance index across multiple meshes", () => {
    const meshes = makeMeshes([2, 3]);
    const loc = locateInstance(meshes, 3);
    expect(loc?.mesh).toBe(meshes[1]);
    expect(loc?.slot).toBe(1);
  });

  it("returns null for out-of-range indices", () => {
    const meshes = makeMeshes([2]);
    expect(locateInstance(meshes, 5)).toBeNull();
  });

  it("maps slot 0 of the first mesh to global 0", () => {
    const meshes = makeMeshes([2]);
    const loc = locateInstance(meshes, 0);
    expect(loc?.mesh).toBe(meshes[0]);
    expect(loc?.slot).toBe(0);
  });
});
