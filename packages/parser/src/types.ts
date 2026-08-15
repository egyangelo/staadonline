/**
 * Typed model for the STAAD .std parser.
 *
 * Headless + worker-ready: this module must NEVER import from DOM, Three.js,
 * React, or any runtime library (ARCHITECTURE.md Pattern 1). It is a pure
 * compile-time contract consumed by the parser (Phase 1) and the renderer
 * (Phase 2+).
 *
 * Source-of-truth ids (D-04): all `id` / `nodeId` / `startNode` / `endNode`
 * fields preserve the ORIGINAL 1-based numbers from the .std file. Engineers
 * reference member/joint numbers in coordination — never renumber.
 */

/** Length units accepted by the STAAD UNIT command (PITFALLS P1 — units are stateful and change mid-file). */
export type UnitLength = 'MM' | 'CM' | 'DM' | 'M' | 'FT' | 'IN' | 'KM';

/** Force units accepted by the STAAD UNIT command. */
export type UnitForce = 'N' | 'DN' | 'KN' | 'NE' | 'MN' | 'MT' | 'KG' | 'LB' | 'KIP' | 'PO';

export interface UnitSystem {
  length: UnitLength;
  force: UnitForce;
}

/** A joint in the analytical model. Coordinates are normalized to METERS (the 01-04 unit-state machine converts). */
export interface Node {
  /** 1-based joint number from the .std file (D-04 source of truth). */
  id: number;
  x: number;
  y: number;
  z: number;
}

/** A member connecting two joints. */
export interface Member {
  /** 1-based member number from the .std file (D-04 source of truth). */
  id: number;
  /** 1-based source node ids (D-04). */
  startNode: number;
  endNode: number;
  /** Key into StaadModel.sections Map (PRIS label or TABLE section name). */
  sectionKey?: string;
  group?: string;
  material?: string;
}

/**
 * Cross-section outline polygon. The renderer consumes only polygons
 * (ARCHITECTURE.md: "every section is a polygon; no type dispatch in the
 * renderer"). Points are [x, z] pairs in section-local coordinates.
 */
export interface SectionProfile {
  label: string;
  /** Section outline polygon as [x, z] pairs. */
  points: [number, number][];
  /** D-05: true when geometry is an approximate fallback (TABLE ST without section-DB resolution). */
  approximate: boolean;
}

export type SectionFamily = 'STEEL' | 'CONCRETE' | 'PRISMATIC' | 'UNKNOWN';

export interface SectionMeta {
  family: SectionFamily;
  dims?: string;
  area?: number;
  Ix?: number;
  Iy?: number;
}

export type SupportType = 'PINNED' | 'FIXED' | 'FIXED_BUT' | 'ENFORCED' | 'SPRING' | 'PLATE';

/** Six release degrees of freedom — true means the DOF is released. */
export interface SupportReleases {
  FX: boolean;
  FY: boolean;
  FZ: boolean;
  MX: boolean;
  MY: boolean;
  MZ: boolean;
}

export interface Support {
  /** 1-based source node id (D-04). */
  nodeId: number;
  type: SupportType;
  releases: SupportReleases;
  /** Source line number the support was defined on (warning attribution). */
  line: number;
}

export type LoadKind = 'MEMBER_LOAD' | 'JOINT_LOAD' | 'SELFWEIGHT' | 'ELEMENT_LOAD' | 'GENERATED';
export type LoadAxis = 'X' | 'Y' | 'Z';
export type LoadAxisRef = 'GLOBAL' | 'LOCAL';

export interface LoadItem {
  kind: LoadKind;
  axis: LoadAxis;
  axisRef: LoadAxisRef;
  magnitude: number;
  /** 1-based source member/joint ids the load applies to (D-04). */
  targets: number[];
  /** Source line number (warning attribution). */
  line: number;
}

export interface LoadCase {
  /** 1-based load case number from the .std file (D-04). */
  id: number;
  title: string;
  loadtype?: string;
  items: LoadItem[];
}

export interface Group {
  name: string;
  memberIds: number[];
  jointIds: number[];
  elementIds: number[];
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export type WarningSeverity = 'error' | 'warning' | 'info';

/** D-06: structured warning — stable code, message, source line, severity. Tests and UI assert on codes. */
export interface ParseWarning {
  code: string;
  message: string;
  line: number;
  severity: WarningSeverity;
}

/** D-03: the complete typed analytical model (one-way pipeline: parse → model → render). */
export interface StaadModel {
  nodes: Node[];
  members: Member[];
  /** Keyed by sectionKey (PRIS label or TABLE section name). */
  sections: Map<string, SectionProfile & SectionMeta>;
  supports: Support[];
  loadCases: LoadCase[];
  groups: Map<string, Group>;
  units: UnitSystem;
  bounds: Bounds;
}

/** parseStaad(text) → ParseResult (ARCHITECTURE.md Pattern 1). */
export interface ParseResult {
  model: StaadModel;
  warnings: ParseWarning[];
}

/**
 * D-06/D-07: stable machine-readable warning codes.
 * Tests and UI assert on these — never rename or reorder. Covers: unknown
 * commands, skipped plates/solids, unresolved sections, malformed lines,
 * unit changes.
 */
export const WARNING_CODES = {
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  IGNORED_COMMAND: 'IGNORED_COMMAND',
  SKIPPED_ELEMENT: 'SKIPPED_ELEMENT',
  UNRESOLVED_SECTION: 'UNRESOLVED_SECTION',
  MALFORMED_LINE: 'MALFORMED_LINE',
  UNIT_CHANGE: 'UNIT_CHANGE',
} as const;

export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];