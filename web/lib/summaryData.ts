/**
 * Model-summary data derivation (03-02, SUMR-01/02/03).
 * Pure TS - a data contract only, nothing renders HTML.
 *
 * The Phase 3 ExpandedSummary (03-06) consumes one call: node/member/section/
 * support/load-case/group counts, group list with member counts, per-axis
 * bounding-box rows with extent, the units verbatim (SUMR-02), and a capped
 * first-12 warnings list (SUMR-03).
 *
 * Security (T-03-01..04): returns data only; group names / warning strings
 * are rendered as React text nodes by the consumer; warnings are capped at 12
 * to bound surface area; counts are derived from length/.size only.
 */
import type { Bounds, ParseWarning, StaadModel } from "@staad-online/parser";

export interface SummaryGroupRow {
  name: string;
  count: number;
}

export interface BoundingBoxRow {
  axis: "X" | "Y" | "Z";
  min: number;
  max: number;
  extent: number;
}

export interface SummaryData {
  nodes: number;
  members: number;
  sections: number;
  supports: number;
  loadCases: number;
  groups: number;
  groupList: SummaryGroupRow[];
  boundingBoxRows: BoundingBoxRow[];
  units: { length: string; force: string };
  warningsTotal: number;
  warningsList: ParseWarning[];
  warningsTruncated: boolean;
}

const WARNINGS_CAP = 12;

function axisRows(bounds: Bounds): BoundingBoxRow[] {
  const labels = ["X", "Y", "Z"] as const;
  return labels.map((axis, i) => ({
    axis,
    min: bounds.min[i],
    max: bounds.max[i],
    extent: bounds.max[i] - bounds.min[i],
  }));
}

export function buildSummaryData(model: StaadModel, warnings: ParseWarning[]): SummaryData {
  const groupList: SummaryGroupRow[] = [];
  for (const g of model.groups.values()) {
    groupList.push({ name: g.name, count: g.memberIds.length });
  }

  const warningsTotal = warnings.length;
  const warningsTruncated = warningsTotal > WARNINGS_CAP;

  return {
    nodes: model.nodes.length,
    members: model.members.length,
    sections: model.sections.size,
    supports: model.supports.length,
    loadCases: model.loadCases.length,
    groups: model.groups.size,
    groupList,
    boundingBoxRows: axisRows(model.bounds),
    units: { length: model.units.length, force: model.units.force },
    warningsTotal,
    warningsList: warnings.slice(0, WARNINGS_CAP),
    warningsTruncated,
  };
}
