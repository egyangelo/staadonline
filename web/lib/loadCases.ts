/**
 * Load-case data resolution (03-02, D-12/D-11/D-10).
 * Pure TS - zero three/React/DOM - unit-testable in node.
 *
 * D-12: selecting a combination or repeated case renders the union of items
 * from the cases it references (weights/factors ignored - the view shows what
 * is involved, not factored results). Combos can reference numeric case ids
 * or case NAMES (parser 01-08: GUI emits names like DL/H/W/LL).
 * D-11: the global-vs-local axis convention surfaces as a per-case legend
 * chip computed from LoadItem.axisRef.
 * D-10: load magnitudes format with the model's force units + case forceUnit;
 * distributed loads append the length unit.
 *
 * Security (T-03-01..03): the combo walk is guarded by a visited set
 * (terminates on cycles / self-reference, bounded by loadCases.length);
 * unmatchable refs are skipped, never a throw; magnitudes are finite numbers.
 */
import type { LoadAxisRef, LoadCase, LoadItem, StaadModel, UnitForce, UnitLength } from "@staad-online/parser";

/** Item identity for the union de-dup (D-12 - a load appearing in two referenced primaries renders once). */
function itemIdentity(i: LoadItem): string {
  return `${i.kind}|${i.axis}|${i.axisRef}|${i.magnitude}|${i.targets.join(",")}|${i.line}`;
}

/**
 * Resolve a load case id to the effective items it renders (D-12).
 * PRIMARY (and repeated-load) cases return their own items; COMBINATION cases
 * walk their terms transitively collecting the union (factors ignored), with
 * a visited-set guard that terminates on combo-of-combo cycles and
 * self-references. Unmatchable refs are skipped silently. Output is in
 * first-referenced order, de-duplicated by item identity.
 */
export function resolveLoadCaseItems(model: StaadModel, caseId: number): LoadItem[] {
  const byId = new Map<number, LoadCase>();
  const byTitle = new Map<string, LoadCase>();
  for (const c of model.loadCases) {
    byId.set(c.id, c);
    byTitle.set(c.title, c);
  }

  const out: LoadItem[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();

  const visit = (c: LoadCase): void => {
    const key = `${c.id}:${c.title}`;
    if (visited.has(key)) return;
    visited.add(key);

    if (c.kind !== "COMBINATION" || !c.terms || c.terms.length === 0) {
      for (const i of c.items) {
        const id = itemIdentity(i);
        if (!seen.has(id)) {
          seen.add(id);
          out.push(i);
        }
      }
      return;
    }

    for (const term of c.terms) {
      const ref = byId.get(Number(term.ref)) ?? byTitle.get(String(term.ref));
      if (ref) visit(ref);
    }
  };

  const root = byId.get(caseId);
  if (root) visit(root);
  return out;
}

/**
 * Effective global-vs-local axis refs for a case (D-11): distinct axisRef
 * values over the union items, in encounter order. ['GLOBAL'] / ['LOCAL'] /
 * ['GLOBAL','LOCAL'] (mixed) / [] (empty).
 */
export function effectiveAxisRefs(model: StaadModel, caseId: number): LoadAxisRef[] {
  const refs: LoadAxisRef[] = [];
  for (const i of resolveLoadCaseItems(model, caseId)) {
    if (!refs.includes(i.axisRef)) refs.push(i.axisRef);
  }
  return refs;
}

/** Format a magnitude with 2-decimal rounding + the force unit (D-10). */
export function formatMagnitude(magnitude: number, forceUnit: UnitForce): string {
  return `${Number(magnitude.toFixed(2))} ${forceUnit}`;
}

const LENGTH_SUFFIX: Record<UnitLength, string> = {
  M: "m",
  FT: "ft",
  KM: "km",
  MM: "mm",
  CM: "cm",
  IN: "in",
  DM: "dm",
};

/** Distributed-load label: magnitude with force unit + lowercased length unit (D-10). */
export function formatDistributedMagnitude(
  magnitude: number,
  forceUnit: UnitForce,
  lengthUnit: UnitLength,
): string {
  return `${Number(magnitude.toFixed(2))} ${forceUnit}/${LENGTH_SUFFIX[lengthUnit]}`;
}
