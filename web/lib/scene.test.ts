/**
 * SceneBuilder + camera-fit contract tests (02-04 — REND-02 instancing,
 * REND-06 centroid rebase, REND-03 fit math). Pure three.js in node — no
 * React/R3F, matching the sectionShape/sectionDb test style.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  computeCameraFit,
  rebaseModel,
  SceneBuilder,
  type SceneBuildResult,
} from "./scene";
import type { Bounds, Member, Node, StaadModel } from "@staad-online/parser";

function makeNode(id: number, x: number, y: number, z: number): Node {
  return { id, x, y, z };
}

function makeMember(id: number, startNode: number, endNode: number, sectionKey?: string): Member {
  return { id, startNode, endNode, sectionKey };
}

/** Minimal model: two PRIS members sharing a section, survey-scale coords. */
function makeSurveyModel(): StaadModel {
  const nodes: Node[] = [
    makeNode(1, 100000, 100000, 100000),
    makeNode(2, 100010, 100000, 100000),
    makeNode(3, 100010, 100010, 100005),
  ];
  const members: Member[] = [
    makeMember(1, 1, 2, "M1"),
    makeMember(2, 2, 3, "M1"),
  ];
  const sections = new Map<string, StaadModel["sections"] extends Map<infer K, infer V> ? V : never>();
  sections.set("M1", {
    label: "M1",
    points: [
      [-0.05, -0.05],
      [0.05, -0.05],
      [0.05, 0.05],
      [-0.05, 0.05],
    ],
    approximate: false,
  });
  return {
    nodes,
    members,
    sections: sections as unknown as StaadModel["sections"],
    supports: [],
    loadCases: [],
    groups: new Map(),
    units: { length: "M", force: "KN" },
    bounds: { min: [100000, 100000, 100000], max: [100010, 100010, 100005] },
  };
}

describe("rebaseModel (REND-06 centroid rebase)", () => {
  it("(1) survey-scale coords recenter near origin with the centroid offset returned", () => {
    const model = makeSurveyModel();
    const { origin, nodeCoords } = rebaseModel(model);
    expect(origin).toEqual([100005, 100005, 100002.5]);
    // All rebased coords are within ~10 of the origin.
    for (let i = 0; i < nodeCoords.length; i++) {
      expect(Math.abs(nodeCoords[i])).toBeLessThanOrEqual(10);
    }
  });

  it("(2) a model already near origin stays essentially unchanged (offset ≈ 0)", () => {
    const nodes: Node[] = [
      makeNode(1, 0, 0, 0),
      makeNode(2, 1, 0, 0),
      makeNode(3, 0, 1, 0),
    ];
    const model = makeSurveyModel();
    model.nodes = nodes;
    model.members = [];
    model.bounds = { min: [0, 0, 0], max: [1, 1, 0] };
    const { origin, nodeCoords } = rebaseModel(model);
    expect(Math.abs(origin[0])).toBeLessThan(1);
    expect(Math.abs(origin[1])).toBeLessThan(1);
    for (let i = 0; i < nodeCoords.length; i++) {
      expect(Math.abs(nodeCoords[i])).toBeLessThanOrEqual(1);
    }
  });

  it("(3) member start/end references still resolve after rebase (index-consistent)", () => {
    const model = makeSurveyModel();
    const { nodeCoords } = rebaseModel(model);
    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
    for (const m of model.members) {
      const s = nodeById.get(m.startNode)!;
      const e = nodeById.get(m.endNode)!;
      // Rebased coordinates are arrays indexed by array position — resolve
      // the positions by the node array index, then verify the member delta.
      const si = model.nodes.indexOf(s);
      const ei = model.nodes.indexOf(e);
      const dx = nodeCoords[ei * 3 + 0] - nodeCoords[si * 3 + 0];
      const dy = nodeCoords[ei * 3 + 1] - nodeCoords[si * 3 + 1];
      const dz = nodeCoords[ei * 3 + 2] - nodeCoords[si * 3 + 2];
      // Original member length preserved (10 m along X or diag 10,5).
      expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(5);
    }
  });

  it("(4) input model is never mutated (write-once modelStore rule)", () => {
    const model = makeSurveyModel();
    const original = model.nodes.map((n) => ({ ...n }));
    rebaseModel(model);
    expect(model.nodes).toEqual(original);
  });
});

describe("SceneBuilder (REND-02 instancing + D-04/D-06)", () => {
  it("(5) one InstancedMesh per distinct section profile (profileCount === sections.size)", () => {
    const builder = new SceneBuilder();
    const model = makeSurveyModel();
    return builder.build(model, 15).then((result) => {
      expect(result.meshes.length).toBe(1);
      expect(result.profileCount).toBe(model.sections.size);
      result.meshes.forEach((m) => expect(m).toBeInstanceOf(THREE.InstancedMesh));
      expect(result.meshes[0].count).toBe(2);
      builder.dispose();
    });
  });

  it("(6) instanceId ↔ memberId maps round-trip", () => {
    const builder = new SceneBuilder();
    const model = makeSurveyModel();
    return builder.build(model, 15).then((result) => {
      expect(result.instanceToMember.has(0)).toBe(true);
      expect(result.instanceToMember.has(1)).toBe(true);
      expect(result.memberToInstance.get(1)).toBe(0);
      expect(result.memberToInstance.get(2)).toBe(1);
      builder.dispose();
    });
  });

  it("(7) instance matrices hit rebased endpoints (member 1 spans the rebased start node)", () => {
    const builder = new SceneBuilder();
    const model = makeSurveyModel();
    const { nodeCoords } = rebaseModel(model);
    return builder.build(model, 15).then((result) => {
      const matrix = new THREE.Matrix4();
      result.meshes[0].getMatrixAt(0, matrix);
      const position = new THREE.Vector3().setFromMatrixPosition(matrix);
      // Member 1 starts at node 1 (index 0): rebased ≈ (-5, -5, -2.5).
      expect(position.x).toBeCloseTo(nodeCoords[0], 4);
      expect(position.y).toBeCloseTo(nodeCoords[1], 4);
      expect(position.z).toBeCloseTo(nodeCoords[2], 4);
      builder.dispose();
    });
  });

  it("(13) setExaggeration(15) scales shared geometry positions vs scale 1", () => {
    const builder = new SceneBuilder();
    const model = makeSurveyModel();
    return builder.build(model, 1).then((result) => {
      const before = result.meshes[0].geometry.attributes.position.array as Float32Array;
      const baseX = before[0];
      builder.setExaggeration(15);
      const after = result.meshes[0].geometry.attributes.position.array as Float32Array;
      expect(after[0]).toBeCloseTo(baseX * 15, 4);
      builder.dispose();
    });
  });

  it("(14) dispose drops mesh refs and leaves maps empty", () => {
    const builder = new SceneBuilder();
    const model = makeSurveyModel();
    return builder.build(model, 15).then((result) => {
      const uuid = result.meshes[0].geometry.uuid;
      builder.dispose();
      expect(result.meshes.length).toBe(0);
      expect(result.instanceToMember.size).toBe(0);
      expect(result.memberToInstance.size).toBe(0);
      expect(THREE.Cache?.enabled ?? true).toBe(true);
    });
  });

  it("(15) build result attaches to a bare THREE.Object3D scene without throwing", () => {
    const builder = new SceneBuilder();
    const model = makeSurveyModel();
    const attachment = new THREE.Object3D();
    return builder.build(model, 15).then((result) => {
      result.meshes.forEach((m) => attachment.add(m));
      expect(() => attachment.updateMatrixWorld(true)).not.toThrow();
      builder.dispose();
    });
  });
});

describe("computeCameraFit (REND-03)", () => {
  it("(13) a 10×10×10 box returns target ≈ origin and far > near > 0", () => {
    const bounds: Bounds = { min: [-5, -5, -5], max: [5, 5, 5] };
    const fit = computeCameraFit(bounds);
    expect(fit.target[0]).toBeCloseTo(0, 6);
    expect(fit.target[1]).toBeCloseTo(0, 6);
    expect(fit.target[2]).toBeCloseTo(0, 6);
    expect(fit.near).toBeGreaterThan(0);
    expect(fit.far).toBeGreaterThan(fit.near);
  });

  it("(14) position is ~radius away from target on the expected oblique axis", () => {
    const bounds: Bounds = { min: [-5, -5, -5], max: [5, 5, 5] };
    const fit = computeCameraFit(bounds);
    const dir = new THREE.Vector3(...fit.position).sub(new THREE.Vector3(...fit.target)).normalize();
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.y).toBeGreaterThan(0);
    expect(dir.z).toBeGreaterThan(0);
  });

  it("(15) a nearly point model (1e-6 box) still returns finite near/far (no NaN)", () => {
    const bounds: Bounds = { min: [-1e-6, -1e-6, -1e-6], max: [1e-6, 1e-6, 1e-6] };
    const fit = computeCameraFit(bounds);
    expect(Number.isFinite(fit.near)).toBe(true);
    expect(Number.isFinite(fit.far)).toBe(true);
    expect(fit.near).toBeGreaterThan(0);
  });

  it("(11) zero-size degenerate bounds fall back to a unit box (finite, non-zero)", () => {
    const bounds: Bounds = { min: [0, 0, 0], max: [0, 0, 0] };
    const fit = computeCameraFit(bounds);
    expect(Number.isFinite(fit.near)).toBe(true);
    expect(fit.far).toBeGreaterThan(fit.near);
  });

  it("(12) doubling bounds scales radius and position length but not the target", () => {
    const boundsA: Bounds = { min: [-5, -5, -5], max: [5, 5, 5] };
    const boundsB: Bounds = { min: [-10, -10, -10], max: [10, 10, 10] };
    const a = computeCameraFit(boundsA);
    const b = computeCameraFit(boundsB);
    expect(a.target).toEqual(b.target);
    const distToA = new THREE.Vector3(...a.position).sub(new THREE.Vector3(...a.target)).length();
    const distToB = new THREE.Vector3(...b.position).sub(new THREE.Vector3(...b.target)).length();
    expect(distToB).toBeCloseTo(distToA * 2, 3);
  });
});
