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

/** Shared key when member extrusion is off — one slim centerline mesh. */
const CENTERLINE_PROFILE = "__CENTERLINE__";
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
  /** One InstancedMesh per distinct section profile + one merged plate Mesh. */
  meshes: (THREE.InstancedMesh | THREE.Mesh)[];
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
  private meshes: (THREE.InstancedMesh | THREE.Mesh)[] = [];
  private geometries: THREE.ExtrudeGeometry[] = [];
  private material: THREE.MeshStandardMaterial;
  private plateMaterial: THREE.MeshStandardMaterial;
  private nodeById: Map<number, number> = new Map();
  private nodeCoords: Float64Array = new Float64Array(0);
  private instanceToMember: Map<number, number> = new Map();
  private memberToInstance: Map<number, number> = new Map();

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      flatShading: true,
      side: THREE.DoubleSide,
    });
    // Plate surfaces (05-01, D-05-02): double-sided, slightly transparent so
    // interior members stay readable. Separate material — dispose hygiene.
    this.plateMaterial = new THREE.MeshStandardMaterial({
      flatShading: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
  }

  /**
   * Build the instanced layer for a model. Async because approximate sections
   * are upgraded through the (async) section DB. Returns the meshes plus
   * parallel instance↔member maps. One InstancedMesh per distinct section
   * key (REND-02 / P4) — never one Mesh per member.
   */
  async build(
    model: StaadModel,
    exaggeration: number,
    opts?: { plateThickness?: boolean; memberExtrusion?: boolean },
  ): Promise<SceneBuildResult> {
    this.reset();

    const { origin, nodeCoords } = rebaseModel(model);
    this.nodeCoords = nodeCoords;
    this.nodeById = new Map();
    model.nodes.forEach((node, index) => this.nodeById.set(node.id, index));

    // Group members by section key; members with no key → UNRESOLVED profile.
    // With memberExtrusion OFF, all members collapse into ONE centerline
    // bucket rendered with a shared slim square — a wireframe read of the
    // structure (quick task 20260823-member-extrusion-toggle).
    const byKey = new Map<string, Member[]>();
    const centerline = opts?.memberExtrusion === false;
    for (const member of model.members) {
      const key = centerline ? CENTERLINE_PROFILE : member.sectionKey ?? UNRESOLVED_PROFILE;
      const bucket = byKey.get(key);
      if (bucket) bucket.push(member);
      else byKey.set(key, [member]);
    }

    // Resolve a section profile for every distinct key (async upgrade).
    const profiles = new Map<string, SectionProfile>();
    for (const key of byKey.keys()) {
      if (centerline && key === CENTERLINE_PROFILE) {
        profiles.set(key, {
          label: "Centerline",
          points: [
            [-0.03, -0.03],
            [0.03, -0.03],
            [0.03, 0.03],
            [-0.03, 0.03],
          ],
          approximate: true,
        });
        continue;
      }
      profiles.set(key, await this.resolveProfile(model, key));
    }

    const meshes: (THREE.InstancedMesh | THREE.Mesh)[] = [];
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
    const memberMeshCount = meshes.length;

    // Plates (05-01, PLATE-02/D-05-02): ONE merged double-sided surface mesh
    // for the whole model — no plate mesh at all for member-only decks.
    const plateMesh = this.buildPlates(model, nodeCoords, {
      thickness: opts?.plateThickness === true,
    });
    if (plateMesh) meshes.push(plateMesh);

    const rebaseB = rebasedBounds(Float64Array.from(nodeCoords), model.nodes.length);
    this.meshes = meshes;
    this.instanceToMember = instanceToMember;
    this.memberToInstance = memberToInstance;

    return {
      meshes,
      instanceToMember,
      memberToInstance,
      rebasedBounds: rebaseB,
      profileCount: memberMeshCount,
    };
  }

  /**
   * Build the merged non-indexed plate surface mesh (D-05-02): two triangles
   * per quad, positions from node coordinates looked up by joint id. Quads
   * referencing unknown nodes are dropped defensively — never NaN into the
   * position buffer (T-05-02). Returns null when the model has no plates.
   * Plates ignore cross-section exaggeration (true-surface, D-05-03).
   */
  private buildPlates(
    model: StaadModel,
    nodeCoords: Float64Array,
    opts?: { thickness?: boolean },
  ): THREE.Mesh | null {
    if (model.elements.length === 0) return null;

    const coordOf = (jointId: number): [number, number, number] | null => {
      const idx = this.nodeById.get(jointId);
      if (idx === undefined) return null;
      return [nodeCoords[idx * 3], nodeCoords[idx * 3 + 1], nodeCoords[idx * 3 + 2]];
    };

    // Resolve quads first (drop unresolved ones so the buffer is sized from
    // real data only — T-05-01/T-05-02), keeping each plate's thickness for
    // the extruded mode.
    const resolved: { pts: [number, number, number][]; thickness: number }[] = [];
    for (const plate of model.elements) {
      const pts = plate.nodes.map(coordOf);
      if (pts.some((p) => p === null)) continue;
      resolved.push({
        pts: pts as [number, number, number][],
        thickness: opts?.thickness ? Math.max(plate.thickness ?? 0, 0) : 0,
      });
    }
    if (resolved.length === 0) return null;

    const positions: number[] = [];
    const push = (p: [number, number, number]): void => {
      positions.push(p[0], p[1], p[2]);
    };
    const tri = (
      p0: [number, number, number],
      p1: [number, number, number],
      p2: [number, number, number],
    ): void => {
      push(p0); push(p1); push(p2);
    };

    for (const { pts, thickness } of resolved) {
      const [a, b, c, d] = pts;
      if (thickness > 0) {
        // Extruded prism (12 tris): offset ±h along the quad normal. A
        // degenerate normal falls back to +Y so the buffer never gets NaN
        // (T-05-02).
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        let n = [
          ab[1] * ad[2] - ab[2] * ad[1],
          ab[2] * ad[0] - ab[0] * ad[2],
          ab[0] * ad[1] - ab[1] * ad[0],
        ];
        const len = Math.hypot(n[0], n[1], n[2]);
        n = len > 1e-12 ? n.map((v) => (v / len) * (thickness / 2)) : [0, thickness / 2, 0];
        const off = (p: [number, number, number]): [number, number, number] => [
          p[0] - n[0], p[1] - n[1], p[2] - n[2],
        ];
        const lift = (p: [number, number, number]): [number, number, number] => [
          p[0] + n[0], p[1] + n[1], p[2] + n[2],
        ];
        const b0 = off(a), b1 = off(b), b2 = off(c), b3 = off(d);
        const t0 = lift(a), t1 = lift(b), t2 = lift(c), t3 = lift(d);
        // top face
        tri(t0, t1, t2); tri(t0, t2, t3);
        // bottom face
        tri(b0, b2, b1); tri(b0, b3, b2);
        // side walls
        tri(b0, b1, t1); tri(b0, t1, t0);
        tri(b1, b2, t2); tri(b1, t2, t1);
        tri(b2, b3, t3); tri(b2, t3, t2);
        tri(b3, b0, t0); tri(b3, t0, t3);
      } else {
        // Zero-thickness surface (D-05-02): two triangles per quad.
        tri(a, b, c);
        tri(a, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    return new THREE.Mesh(geometry, this.plateMaterial);
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
    this.plateMaterial.dispose();
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