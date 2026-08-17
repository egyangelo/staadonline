/**
 * Marker + load glyph geometry builders (03-03, D-05/D-06/D-09).
 * Pure three-geometry — no React/R3F, node-testable like sectionShape.
 *
 * D-05: support markers use shape to encode restraint type — FIXED cube,
 * PINNED pyramid, FIXED_BUT notched cube, SPRING coil, ENFORCED octahedron,
 * PLATE disc.
 * D-06: marker size scales with the size-exaggeration factor via
 * `u = clamp(0.08 * exaggeration, 0.20, 2.5)`.
 * D-09: all load kinds render as 3D glyphs — joint/member arrows,
 * distributed segmented/array arrows, moments as curved double-arrows,
 * SELFWEIGHT included.
 *
 * Security (T-03-01..03): switches on closed SupportType/LoadKind unions;
 * fixed tessellation (bounded triangle counts); no free-form strings reach
 * geometry; every geometry is a fresh allocation the caller disposes on
 * rebuild (no module-level mutable cache).
 */
import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Bounds, LoadItem, SupportReleases, SupportType } from "@staad-online/parser";

/** D-06: marker unit `u = clamp(0.08 * exaggeration, 0.20, 2.5) * avgWidth`. */
export function markerUnit(exaggeration: number, avgWidth = 1): number {
  return Math.min(Math.max(0.08 * exaggeration, 0.2), 2.5) * avgWidth;
}

/** Diagonal of the model's bounding box (LoadGlyphs `a = diagonal * 0.035`). */
export function modelDiagonal(bounds: Bounds): number {
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** D-09: distributed-arrow segment count clamp. */
export function distributedSegmentCount(span: number, a: number): number {
  const n = Math.round(span / (1.4 * a));
  return Math.min(Math.max(n, 2), 12);
}

type Axis = "X" | "Y" | "Z";

function releasedAxes(releases: SupportReleases): Axis[] {
  const out: Axis[] = [];
  if (releases.FX) out.push("X");
  if (releases.FY) out.push("Y");
  if (releases.FZ) out.push("Z");
  return out;
}

/**
 * FIXED_BUT cube: a `size` cube with a `0.3u-deep x 0.5u-wide` groove cut on
 * each released axis face. Decomposed into a bounded set of axis-aligned
 * boxes (no CSG); vertex count grows with released axes.
 */
function buildNotchedCube(size: number, releases: SupportReleases, grooveDepth: number, grooveWidth: number): BufferGeometry {
  const axes = releasedAxes(releases);
  const half = size / 2;
  const geos: BufferGeometry[] = [];

  const addBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void => {
    const box = new BoxGeometry(sx, sy, sz);
    box.translate(cx, cy, cz);
    geos.push(box);
  };

  const rx = axes.includes("X") ? half - grooveDepth : half;
  const ry = axes.includes("Y") ? half - grooveDepth : half;
  const rz = axes.includes("Z") ? half - grooveDepth : half;

  // Core: the interior that is never carved.
  addBox(0, 0, 0, rx * 2, ry * 2, rz * 2);

  // For each released axis, rebuild the two carved face slabs as strips
  // flanking a centered groove of `grooveWidth`.
  if (axes.includes("X")) {
    const side = half - rx;
    const halfGroove = grooveWidth / 2;
    const stripW = half - halfGroove;
    const xc = half - side / 2;
    addBox(xc, 0, -halfGroove - stripW / 2, side, ry * 2, stripW);
    addBox(xc, 0, halfGroove + stripW / 2, side, ry * 2, stripW);
    addBox(-xc, 0, -halfGroove - stripW / 2, side, ry * 2, stripW);
    addBox(-xc, 0, halfGroove + stripW / 2, side, ry * 2, stripW);
  }
  if (axes.includes("Y")) {
    const side = half - ry;
    const halfGroove = grooveWidth / 2;
    const stripW = half - halfGroove;
    const yc = half - side / 2;
    addBox(0, yc, -halfGroove - stripW / 2, rx * 2, side, stripW);
    addBox(0, yc, halfGroove + stripW / 2, rx * 2, side, stripW);
    addBox(0, -yc, -halfGroove - stripW / 2, rx * 2, side, stripW);
    addBox(0, -yc, halfGroove + stripW / 2, rx * 2, side, stripW);
  }
  if (axes.includes("Z")) {
    const side = half - rz;
    const halfGroove = grooveWidth / 2;
    const stripW = half - halfGroove;
    const zc = half - side / 2;
    addBox(0, -halfGroove - stripW / 2, zc, stripW, ry * 2, side);
    addBox(0, halfGroove + stripW / 2, zc, stripW, ry * 2, side);
    addBox(0, -halfGroove - stripW / 2, -zc, stripW, ry * 2, side);
    addBox(0, halfGroove + stripW / 2, -zc, stripW, ry * 2, side);
  }

  return mergeGeometries(geos)!;
}

/** FIXED cube: axis-aligned cube `1.2u` on a side, sitting on the node (Y-up). */
function buildCube(u: number): BufferGeometry {
  const box = new BoxGeometry(1.2 * u, 1.2 * u, 1.2 * u);
  box.translate(0, 0.6 * u, 0);
  return box;
}

/** PINNED pyramid: tetrahedron, base `1.2u`, apex +Y at `1.5u`. */
function buildPyramid(u: number): BufferGeometry {
  const r = 0.6 * u; // circumradius of the equilateral base
  const h = 1.5 * u;
  const a1 = (2 * Math.PI) / 3;
  const base: [number, number][] = [
    [r, 0],
    [r * Math.cos(a1), r * Math.sin(a1)],
    [r * Math.cos(2 * a1), r * Math.sin(2 * a1)],
  ];
  const apex: [number, number] = [0, h];

  const positions: number[] = [];
  const indices: number[] = [];

  const face = (p: [number, number][], reverse: boolean): void => {
    const start = positions.length / 3;
    for (const [x, z] of p) positions.push(x, 0, z);
    if (reverse) indices.push(start, start + 2, start + 1);
    else indices.push(start, start + 1, start + 2);
  };

  // Base face (flat).
  face([base[0], base[1], base[2]], true);
  // Side faces apex up.
  face([base[0], apex, base[1]], false);
  face([base[1], apex, base[2]], false);
  face([base[2], apex, base[0]], false);

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  return geo;
}

/** SPRING coil: 4-coil helix radius `0.55u`, height `1.8u`, tube `0.12u`. */
function buildSpring(u: number): BufferGeometry {
  const radius = 0.55 * u;
  const height = 1.8 * u;
  const tube = 0.12 * u;
  const points: Vector3[] = [];
  const coils = 4;
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * coils * Math.PI * 2;
    points.push(new Vector3(radius * Math.cos(angle), t * height, radius * Math.sin(angle)));
  }
  const curve = new CatmullRomCurve3(points);
  return new TubeGeometry(curve, 96, tube, 8, false);
}

/** ENFORCED octahedron `0.9u`. */
function buildOctahedron(u: number): BufferGeometry {
  return new OctahedronGeometry(0.9 * u);
}

/** PLATE disc: thin square `0.85u` x `0.15u`, oriented at the node. */
function buildPlate(u: number): BufferGeometry {
  const plate = new BoxGeometry(0.85 * u, 0.15 * u, 0.85 * u);
  plate.translate(0, 0.075 * u, 0);
  return plate;
}

/**
 * Build a D-05 support glyph geometry at unit `u`, Y-up. Returns a fresh
 * geometry per call (caller disposes on rebuild).
 */
export function buildSupportGlyph(type: SupportType, releases: SupportReleases, u: number): BufferGeometry {
  switch (type) {
    case "FIXED":
      return buildCube(u);
    case "PINNED":
      return buildPyramid(u);
    case "FIXED_BUT":
      return buildNotchedCube(1.2 * u, releases, 0.3 * u, 0.5 * u);
    case "SPRING":
      return buildSpring(u);
    case "ENFORCED":
      return buildOctahedron(u);
    case "PLATE":
      return buildPlate(u);
  }
}

/** Single arrow (shaft cylinder + head cone), default along +Y. */
function buildArrow(u: number, dir: 1 | -1): BufferGeometry {
  const shaft = new CylinderGeometry(0.02 * u, 0.02 * u, 0.6 * u, 8, 1, true);
  const head = new ConeGeometry(0.08 * u, 0.2 * u, 8);
  shaft.translate(0, dir * 0.3 * u, 0);
  head.translate(0, dir * 0.7 * u, 0);
  const merged = mergeGeometries([shaft, head])!;
  if (dir === -1) merged.rotateX(Math.PI);
  return merged;
}

/** Curved double-arrow: arc radius `0.4a`, thickness `0.06a`, swept π. */
function buildMoment(a: number): BufferGeometry {
  const radius = 0.4 * a;
  const tube = 0.06 * a;
  const points: Vector3[] = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI;
    points.push(new Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0));
  }
  const curve = new CatmullRomCurve3(points);
  const arc = new TubeGeometry(curve, segments, tube, 6, false);
  const head1 = new ConeGeometry(0.1 * a, 0.22 * a, 6);
  const head2 = new ConeGeometry(0.1 * a, 0.22 * a, 6);
  const p0 = points[0];
  const p1 = points[points.length - 1];
  const mid = points[Math.floor(segments / 2)];
  head1.translate(p0.x, p0.y, 0);
  head1.lookAt(mid);
  head2.translate(p1.x, p1.y, 0);
  head2.lookAt(mid);
  return mergeGeometries([arc, head1, head2])!;
}

export interface LoadGlyphResult {
  geometry: BufferGeometry;
  count: number;
  kind: string;
  labelHint?: string;
}

/**
 * Build a D-09 load glyph at unit `a`. JOINT/MEMBER loads → single arrow;
 * moments (opts.moment) → curved double-arrow; SELFWEIGHT → −Y arrow with the
 * SELFWEIGHT label hint. `dir` is the caller-resolved world/local unit axis
 * for the load direction (the layer rotates the instanced glyph).
 */
export function buildLoadGlyph(item: LoadItem, a: number, opts?: { moment?: boolean; dir?: Vector3 }): LoadGlyphResult {
  switch (item.kind) {
    case "SELFWEIGHT":
      return { geometry: buildArrow(a, -1), count: 1, kind: "SELFWEIGHT", labelHint: "SELFWEIGHT" };
    case "JOINT_LOAD":
    case "MEMBER_LOAD":
      if (opts?.moment) {
        return { geometry: buildMoment(a), count: 1, kind: item.kind };
      }
      return { geometry: buildArrow(a, 1), count: 1, kind: item.kind };
    case "ELEMENT_LOAD":
    case "GENERATED":
      // out-of-scope kinds: never reach geometry (defensive).
      return { geometry: buildArrow(a, 1), count: 1, kind: item.kind };
  }
}
