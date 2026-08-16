/**
 * SceneBuilder (02-04, REND-02/REND-03/REND-04/REND-06): parsed StaadModel →
 * instanced 3D scene.
 *
 * - `rebaseModel`: centroid rebase (REND-06 / P8) — survey-scale node
 *   coordinates recentered to the model centroid so Float32 buffers never
 *   collapse precision. Input model is never mutated (write-once modelStore).
 *   Y-up is shared with three.js (D-03) — no axis remap.
 * - `SceneBuilder`: one `THREE.InstancedMesh` per distinct section profile
 *   (REND-02 / P4), per-member instance matrices (including D-06 axial
 *   rotation), uniform exaggeration geometry-scale, dispose hygiene.
 * - `computeCameraFit`: pure framing math for the 02-05 ViewerCanvas (D-01 /
 *   REND-03) — plain tuples, no three objects, no WebGL needed.
 *
 * Imperative three.js only — no React/R3F imports.
 */

import * as THREE from "three";
import type { Bounds, Member, SectionProfile, StaadModel } from "@staad-online/parser";
import { buildSectionGeometry, applyUniformScale } from "./sectionShape";
import { upgradeProfile, nearestShape } from "./sectionDb";

/** Section key assigned to members with no resolved profile (D-07 fallback). */
export const UNRESOLVED_PROFILE = "UNRESOLVED";

/** Result of a centroid rebase (REND-06). */
export interface RebaseResult {
  /** Model centroid (offset subtracted from every node). */
  origin: [number, number, number];
  /** Dense node coords indexed by array position (3 × nodes.length). */
  nodeCoords: Float64Array;
}

/** Result of a SceneBuilder.build() pass (REND-02). */
export interface SceneBuildResult {
  /** One InstancedMesh per distinct section profile. */
  meshes: THREE.InstancedMesh[];
  /** instanceId → memberId (parallel, REND-02 Pattern 2). */
  instanceToMember: Map<number, number>;
  /** memberId → instanceId (parallel, REND-02 Pattern 2). */
  memberToInstance: Map<number, number>;
  /** Min/max of rebased node coords (camera-fit input for 02-05). */
  rebasedBounds: Bounds;
  /** Number of distinct section profiles instantiated. */
  profileCount: number;
}

/** Camera framing result — pure tuples (D-01 / REND-03 source). */
export interface CameraFit {
  target: [number, number, number];
  position: [number, number, number];
  near: number;
  far: number;
}

const DEG2RAD = Math.PI / 180;

function boundsMidpoint(bounds: Bounds): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function isZeroBounds(bounds: Bounds): boolean {
  return (
    bounds.min[0] === 0 && bounds.min[1] === 0 && bounds.min[2] === 0 &&
    bounds.max[0] === 0 && bounds.max[1] === 0 && bounds.max[2] === 0
  );
}

/**
 * Rebase every node to the model centroid (REND-06 / P8). Returns the centroid
 * offset and a dense Float64Array indexed by array position (3 per node).
 * Falls back to a nodes walk when bounds are all-zero (mirrors core.ts
 * finalize()). Never mutates the input model (write-once modelStore rule).
 */
export function rebaseModel(model: StaadModel): RebaseResult {
  const origin: [number, number, number] = isZeroBounds(model.bounds)
    ? centroidByNodes(model)
    : boundsMidpoint(model.bounds);

  const nodeCoords = new Float64Array(model.nodes.length * 3);
  for (let i = 0; i < model.nodes.length; i++) {
    const n = model.nodes[i];
    nodeCoords[i * 3 + 0] = n.x - origin[0];
    nodeCoords[i * 3 + 1] = n.y - origin[1];
    nodeCoords[i * 3 + 2] = n.z - origin[2];
  }
  return { origin, nodeCoords };
}

function centroidByNodes(model: StaadModel): [number, number, number] {
  if (model.nodes.length === 0) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const n of model.nodes) {
    x += n.x;
    y += n.y;
    z += n.z;
  }
  return [x / model.nodes.length, y / model.nodes.length, z / model.nodes.length];
}

function rebasedBounds(clone: Float64Array, count: number): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      const v = clone[i * 3 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  // Degenerate/zero-size input → unit box fallback so camera framing is finite.
  if (!Number.isFinite(min[0])) {
    return { min: [-1, -1, -1], max: [1, 1, 1] };
  }
  return { min, max };
}

/**
 * Build the per-member instance matrix: position the extruded profile (unit
 * length along shape-local +Z) so the member axis maps to shape-local Z, then
 * apply D-06 axial rotation about the member axis when present.
 */
function buildInstanceMatrix(
  start: [number, number, number],
  end: [number, number, number],
  rotationDegrees: number | undefined,
  out: THREE.Matrix4,
): void {
  const s = new THREE.Vector3(...start);
  const e = new THREE.Vector3(...end);
  const axis = e.clone().sub(s);
  const length = axis.length();

  // Zero-length member (degenerate input) — identity placement, no NaNs.
  if (!(length > 0)) {
    out.identity();
    return;
  }
  axis.normalize();

  const quat = new THREE.Quaternion().setFromUnitVectors(UNIT_Z, axis);
  if (rotationDegrees !== undefined && Number.isFinite(rotationDegrees)) {
    // Rotate the profile about the member axis before placing (D-06).
    const beta = new THREE.Quaternion().setFromAxisAngle(UNIT_Z, rotationDegrees * DEG2RAD);
    quat.multiply(beta);
  }
  // Geometry is unit-extruded (depth 1); Z scale stretches it to member length.
  out.compose(s, quat, new THREE.Vector3(1, 1, length));
}

const UNIT_Z = new THREE.Vector3(0, 0, 1);

/**
 * Imperative scene builder: one InstancedMesh per distinct section profile.
 */
export class SceneBuilder {
  private meshes: THREE.InstancedMesh[] = [];
  private geometries: THREE.ExtrudeGeometry[] = [];
  private material: THREE.MeshStandardMaterial;
  private nodeById: Map<number, number> = new Map();
  private nodeCoords: Float64Array = new Float64Array(0);
  private instanceToMember: Map<number, number> = new Map();
  private memberToInstance: Map<number, number> = new Map();

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      flatShading: true,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Build the instanced layer for a model. Async because approximate sections
   * are upgraded through the (async) section DB. Returns the meshes plus
   * parallel instance↔member maps. One InstancedMesh per distinct section
   * key (REND-02 / P4) — never one Mesh per member.
   */
  async build(model: StaadModel, exaggeration: number): Promise<SceneBuildResult> {
    this.reset();

    const { origin, nodeCoords } = rebaseModel(model);
    this.nodeCoords = nodeCoords;
    this.nodeById = new Map();
    model.nodes.forEach((node, index) => this.nodeById.set(node.id, index));

    // Group members by section key; members with no key → UNRESOLVED profile.
    const byKey = new Map<string, Member[]>();
    for (const member of model.members) {
      const key = member.sectionKey ?? UNRESOLVED_PROFILE;
      const bucket = byKey.get(key);
      if (bucket) bucket.push(member);
      else byKey.set(key, [member]);
    }

    // Resolve a section profile for every distinct key (async upgrade).
    const profiles = new Map<string, SectionProfile>();
    for (const key of byKey.keys()) {
      profiles.set(key, await this.resolveProfile(model, key));
    }

    const meshes: THREE.InstancedMesh[] = [];
    const instanceToMember = new Map<number, number>();
    const memberToInstance = new Map<number, number>();
    let instanceId = 0;

    for (const key of byKey.keys()) {
      const members = byKey.get(key)!;
      const profile = profiles.get(key)!;
      const geometry = buildSectionGeometry(profile);
      applyUniformScale(geometry, exaggeration);
      this.geometries.push(geometry);

      const mesh = new THREE.InstancedMesh(geometry, this.material, members.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      members.forEach((member, slot) => {
        const si = this.nodeById.get(member.startNode);
        const ei = this.nodeById.get(member.endNode);
        const s: [number, number, number] =
          si === undefined ? [0, 0, 0] : [nodeCoords[si * 3], nodeCoords[si * 3 + 1], nodeCoords[si * 3 + 2]];
        const e: [number, number, number] =
          ei === undefined ? [1, 0, 0] : [nodeCoords[ei * 3], nodeCoords[ei * 3 + 1], nodeCoords[ei * 3 + 2]];
        const matrix = new THREE.Matrix4();
        buildInstanceMatrix(s, e, member.rotation, matrix);
        mesh.setMatrixAt(slot, matrix);
        instanceToMember.set(instanceId, member.id);
        memberToInstance.set(member.id, instanceId);
        instanceId++;
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    }

    const rebaseB = rebasedBounds(Float64Array.from(nodeCoords), model.nodes.length);
    this.meshes = meshes;
    this.instanceToMember = instanceToMember;
    this.memberToInstance = memberToInstance;

    return {
      meshes,
      instanceToMember,
      memberToInstance,
      rebasedBounds: rebaseB,
      profileCount: meshes.length,
    };
  }

  /**
   * Re-apply the uniform exaggeration factor to every shared geometry — one
   * pass on change, never per frame (D-04 / REND-04).
   */
  setExaggeration(factor: number): void {
    for (const geometry of this.geometries) {
      applyUniformScale(geometry, factor);
    }
  }

  /**
   * Dispose all GPU resources (P5 / T-02-03) — geometry + shared material —
   * and drop per-model references so replacing a model never accumulates
   * buffers/canvases.
   */
  dispose(): void {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
    this.reset();
  }

  /** Drop all per-model references (no GPU work). */
  private reset(): void {
    this.meshes.length = 0;
    this.geometries.length = 0;
    this.nodeById.clear();
    this.memberToInstance.clear();
    this.instanceToMember.clear();
    this.nodeCoords = new Float64Array(0);
  }

  /**
   * Return a SectionProfile for a key: the model's own profile (upgraded
   * through the section DB when approximate) or a nearest-shape fallback for
   * members with no key (D-07).
   */
  private async resolveProfile(model: StaadModel, key: string): Promise<SectionProfile> {
    const existing = model.sections.get(key);
    if (existing) {
      return await upgradeProfile(existing);
    }
    const near = nearestShape(key);
    return {
      label: key,
      points: near.points,
      approximate: near.approximate,
    } as SectionProfile;
  }
}

/**
 * Pure camera-fit math (D-01 / REND-03 source): frame the rebased bounds along
 * a standard oblique axis. Plain tuples so 02-05 can call it without WebGL.
 */
export function computeCameraFit(
  rebasedBounds: { min: [number, number, number]; max: [number, number, number] },
  _opts?: { coefficient?: number },
): CameraFit {
  const target: [number, number, number] = boundsMidpoint(rebasedBounds);

  const size: [number, number, number] = [
    rebasedBounds.max[0] - rebasedBounds.min[0],
    rebasedBounds.max[1] - rebasedBounds.min[1],
    rebasedBounds.max[2] - rebasedBounds.min[2],
  ];
  let radius = Math.hypot(size[0], size[1], size[2]) / 2;
  if (!(radius > 0) || !Number.isFinite(radius)) radius = 1; // unit-box fallback

  const k = _opts?.coefficient ?? 2.2;
  const direction = new THREE.Vector3(0.866, 0.5, 0.866).normalize();
  const offset = direction.multiplyScalar(radius * k);
  const position: [number, number, number] = [
    target[0] + offset.x,
    target[1] + offset.y,
    target[2] + offset.z,
  ];

  // Clip planes clamped from radius so nothing artifacts on the rebased model.
  const near = radius / 1000;
  const far = Math.max(radius * 4, 1);

  return { target, position, near, far };
}