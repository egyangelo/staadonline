/**
 * Pure placement math for support + load glyph instances (03-08 Task 1,
 * D-05/D-06/D-09). Zero React/R3F — three.Vector3/Quaternion only, so it
 * unit-tests in node. All positions are in REBASED model coordinates
 * (rebaseModel nodeCoords) so glyphs land exactly where geometry renders.
 *
 * Security (T-03-01..06): every returned number is finite and derived from
 * numeric model fields or closed-union axis/kind switches; target/member
 * lookups are Map-based, never string-keyed object probes; segment counts are
 * clamped by distributedSegmentCount (03-03).
 */
import { Quaternion, Vector3 } from "three";
import type { LoadItem, StaadModel, Support } from "@staad-online/parser";
import { distributedSegmentCount, modelDiagonal } from "./markerGeometry";

export interface RebaseCoords {
  /** Dense node coords indexed by array position (3 × nodes.length). */
  nodeCoords: Float64Array;
}

export interface MarkerTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface SupportTransform extends MarkerTransform {
  support: Support;
}

export interface LoadTransform extends MarkerTransform {
  item: LoadItem;
  /** 1-based member id the transform sits on (for label push-back). */
  memberId?: number;
  /** Index within a distributed segment array (0-based). */
  segmentIndex?: number;
}

/** node id → dense array index (nodeCoords is array-position indexed). */
function nodeIndexMap(model: StaadModel): Map<number, number> {
  const m = new Map<number, number>();
  model.nodes.forEach((n, i) => m.set(n.id, i));
  return m;
}

function nodePos(nodeIdx: Map<number, number>, coords: Float64Array, id: number): [number, number, number] | null {
  const i = nodeIdx.get(id);
  if (i === undefined) return null;
  return [coords[i * 3], coords[i * 3 + 1], coords[i * 3 + 2]];
}

/** Unit vector for a GLOBAL axis letter, X→+X etc. */
function globalAxisDir(axis: "X" | "Y" | "Z"): [number, number, number] {
  switch (axis) {
    case "X":
      return [1, 0, 0];
    case "Y":
      return [0, 1, 0];
    default:
      return [0, 0, 1];
  }
}

const IDENTITY_QUAT: [number, number, number, number] = [0, 0, 0, 1];

/**
 * D-05/D-06 support glyph transforms: one transform per support at the
 * node's rebased position. Shapes are pre-built Y-up, so quaternion is
 * identity (no per-type rotation needed for marker visibility).
 */
export function supportTransforms(model: StaadModel, coords: RebaseCoords): SupportTransform[] {
  const nodeIdx = nodeIndexMap(model);
  const out: SupportTransform[] = [];
  for (const s of model.supports) {
    const pos = nodePos(nodeIdx, coords.nodeCoords, s.nodeId);
    if (!pos) continue;
    out.push({ position: pos, quaternion: IDENTITY_QUAT, support: s });
  }
  return out;
}

/** Quaternion rotating +Y onto the unit direction (arrow glyphs are Y-up). */
function quatToDir(dir: [number, number, number]): [number, number, number, number] {
  const from = new Vector3(0, 1, 0);
  const to = new Vector3(dir[0], dir[1], dir[2]).normalize();
  if (to.lengthSq() === 0) return IDENTITY_QUAT;
  if (from.dot(to) > 0.99999) return IDENTITY_QUAT;
  if (from.dot(to) < -0.99999) {
    // Rotate +Y to -Y: 180° about X.
    return [1, 0, 0, 0];
  }
  const q = new Quaternion().setFromUnitVectors(from, to);
  return [q.x, q.y, q.z, q.w];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function midOn(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5), lerp(a[2], b[2], 0.5)];
}

function memberPoints(
  model: StaadModel,
  nodeIdx: Map<number, number>,
  coords: Float64Array,
  memberId: number,
): { a: [number, number, number]; b: [number, number, number] } | null {
  const member = model.members.find((m) => m.id === memberId);
  if (!member) return null;
  const a = nodePos(nodeIdx, coords, member.startNode);
  const b = nodePos(nodeIdx, coords, member.endNode);
  if (!a || !b) return null;
  return { a, b };
}

/** Is this item a moment (curved double-arrow per D-09)? */
export function isMomentItem(item: LoadItem): boolean {
  // JOINT LOAD MX/MY/MZ and MEMBER LOAD MOM token are the two moment sources.
  const t = (item.loadType ?? "").toUpperCase();
  if (t === "MOM") return true;
  if (item.kind === "JOINT_LOAD" && /^M[XYZ]$/.test(t)) return true;
  return false;
}

/** Is this item distributed (segmented/array arrows per D-09)? */
export function isDistributedItem(item: LoadItem): boolean {
  const t = (item.loadType ?? "").toUpperCase();
  return item.kind === "MEMBER_LOAD" && (t === "UNI" || t === "TRAP");
}

/**
 * D-09 load glyph transforms for the effective items. JOINT_LOAD → one arrow
 * per target node; MEMBER_LOAD concentrated → one arrow at the member
 * midpoint; distributed → distributedSegmentCount arrows spread across the
 * member span at i/(n-1) fractions; moments → single transform at midpoint;
 * SELFWEIGHT → one transform at the bounds centroid (gravity pull −Y glyph).
 * `a` is the LoadGlyphs unit (modelDiagonal * 0.035).
 */
export function loadItemTransforms(
  model: StaadModel,
  coords: RebaseCoords,
  items: LoadItem[],
  a = modelDiagonal(model.bounds) * 0.035,
): LoadTransform[] {
  const nodeIdx = nodeIndexMap(model);
  const out: LoadTransform[] = [];

  const push = (item: LoadItem, position: [number, number, number], dir: [number, number, number], memberId?: number, segmentIndex?: number): void => {
    out.push({ position, quaternion: quatToDir(dir), item, memberId, segmentIndex });
  };

  for (const item of items) {
    if (item.kind === "SELFWEIGHT") {
      // Gravity pull −Y; single glyph at the rebased bounds centroid, which
      // IS the origin after rebase (origin = bounds midpoint).
      push(item, [0, 0, 0], [0, -1, 0]);
      continue;
    }

    if (item.kind === "JOINT_LOAD") {
      const dir = globalAxisDir(item.axis);
      for (const target of item.targets) {
        const pos = nodePos(nodeIdx, coords.nodeCoords, target);
        if (!pos) continue;
        push(item, pos, dir, undefined);
      }
      continue;
    }

    // MEMBER_LOAD (concentrated, distributed, or moment).
    const memberIds = item.targets;
    for (const memberId of memberIds) {
      const pts = memberPoints(model, nodeIdx, coords.nodeCoords, memberId);
      if (!pts) continue;

      if (isMomentItem(item)) {
        // Moment glyph is a flat arc rotated to face the member local plane —
        // identity quaternion keeps the XZ arc readable from above.
        push(item, midOn(pts.a, pts.b), [0, 1, 0], memberId);
        continue;
      }

      const spanLen = Math.hypot(pts.b[0] - pts.a[0], pts.b[1] - pts.a[1], pts.b[2] - pts.a[2]);
      if (isDistributedItem(item)) {
        const n = distributedSegmentCount(spanLen, a);
        const dir: [number, number, number] = [
          (pts.b[0] - pts.a[0]) / (spanLen || 1),
          (pts.b[1] - pts.a[1]) / (spanLen || 1),
          (pts.b[2] - pts.a[2]) / (spanLen || 1),
        ];
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : i / (n - 1);
          push(item, [lerp(pts.a[0], pts.b[0], t), lerp(pts.a[1], pts.b[1], t), lerp(pts.a[2], pts.b[2], t)], dir, memberId, i);
        }
      } else {
        const dir = globalAxisDir(item.axis);
        push(item, midOn(pts.a, pts.b), dir, memberId);
      }
    }
  }

  return out;
}

/**
 * D-10 label anchor per load arrow tip: the arrow glyph tip is at
 * `position + quat * (0, +0.7a, 0)` (head cone apex, 03-03 buildArrow dir 1),
 * with a small push-back toward the shaft so the chip reads 2px clear of the
 * tip. Returns one entry per transform, in the same order, so the caller can
 * pair each anchor with its item for magnitude formatting.
 */
export function labelPoints(transforms: LoadTransform[], a: number): { position: [number, number, number]; item: LoadItem }[] {
  const q = new Quaternion();
  const tip = new Vector3();
  return transforms.map((t) => {
    q.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
    tip.set(0, 0.7 * a + 0.05 * a, 0).applyQuaternion(q);
    return {
      position: [t.position[0] + tip.x, t.position[1] + tip.y, t.position[2] + tip.z],
      item: t.item,
    };
  });
}