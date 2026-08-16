/**
 * Section outline → extruded 3D geometry (02-03 Task 3, REND-01 / D-05).
 *
 * Turns a `SectionProfile.points` polygon ([x,z] section plane, meters) into a
 * shared, cached `THREE.ExtrudeGeometry` — the 02-04 SceneBuilder instantiates
 * one geometry per distinct section key (never one Mesh per member).
 *
 * Mapping (STAAD Y-up, D-03): profile [x, z] → THREE.Shape local coords, so
 * the shape's XY plane is the section plane and extrusion pushes along the
 * member axis (shape-local Z, unit length 1.0 — SceneBuilder scales per
 * member). Bevel disabled: flat, cheap, mobile-friendly (PITFALLS P5).
 *
 * Pure three — no React/R3F imports, so it is testable in node.
 *
 * Exaggeration (D-04 changes once, app-wide): `applyUniformScale` rewrites the
 * shared geometry's position attribute relative to its cached base and
 * recomputes normals — NOT a per-frame transform.
 */

import * as THREE from "three";
import type { SectionProfile } from "@staad-online/parser";

/** Shared cache: one ExtrudeGeometry per distinct section label. */
export const geometryCache = new Map<string, THREE.ExtrudeGeometry>();

/** Base (exaggeration-1.0) positions captured at first build / first scale. */
const basePositions = new WeakMap<THREE.BufferGeometry, Float32Array>();

/** Build a THREE.Shape from a SectionProfile outline polygon ([x,z]). */
function makeShape(points: readonly [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  const [x0, z0] = points[0];
  shape.moveTo(x0, z0);
  for (let i = 1; i < points.length; i++) {
    const [x, z] = points[i];
    shape.lineTo(x, z);
  }
  shape.closePath();
  return shape;
}

/**
 * Build (or fetch from cache) the extruded geometry for a section keyed by
 * `profile.label`. One shared geometry per distinct profile (bounded by the
 * distinct section keys in the parsed model, T-02-02).
 */
function getOrCreateGeometry(profile: SectionProfile): THREE.ExtrudeGeometry {
  const cached = geometryCache.get(profile.label);
  if (cached) return cached;

  const shape = makeShape(profile.points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    bevelSegments: 0,
    steps: 1,
  });
  geometry.computeVertexNormals();
  geometryCache.set(profile.label, geometry);
  return geometry;
}

/** Public entry point — cached extruded geometry for any SectionProfile. */
export function buildSectionGeometry(profile: SectionProfile): THREE.ExtrudeGeometry {
  return getOrCreateGeometry(profile);
}

/**
 * Apply the uniform exaggeration factor to a shared geometry (D-04: one call
 * on exaggeration change, never per frame). Positions are recomputed from a
 * captured base so repeated calls compound correctly; normals are rebuilt.
 * Mutates the cached instance in place so rebuilds reuse the scaled geometry.
 *
 * `geometryCache` is accepted for API parity with the plan contract; the scale
 * is applied directly to the shared instance it holds.
 */
export function applyUniformScale(
  geometry: THREE.ExtrudeGeometry,
  factor: number,
  _geometryCache: Map<string, THREE.ExtrudeGeometry> = geometryCache,
): void {
  const attr = geometry.attributes.position as THREE.BufferAttribute;
  let base = basePositions.get(geometry);
  if (!base) {
    base = new Float32Array(attr.array as Float32Array);
    basePositions.set(geometry, base);
  }
  const arr = attr.array as Float32Array;
  for (let i = 0; i < arr.length; i++) arr[i] = base[i] * factor;
  attr.needsUpdate = true;
  geometry.computeVertexNormals();
}