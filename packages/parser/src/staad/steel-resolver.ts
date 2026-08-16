/**
 * Steel section resolver (01-06 Task 1, PARSE-01 / D-05).
 *
 * Turns MEMBER PROPERTY tokens into typed `SectionProfile & SectionMeta`
 * geometry consumed by the renderer (Phase 2+).
 *
 * D-05 section-geometry decision:
 * - PRIS YD/ZD → a rectangular polygon at parse time: a 4-corner rectangle
 *   centered on the origin in the [x, z] section plane, half-extents zd/2 and
 *   yd/2. YD alone (no ZD) is a CIRCULAR section (PITFALLS P3) — we never
 *   fabricate exact geometry for it, so it resolves to the approximate
 *   fallback instead.
 * - TABLE ST (quoted `TABLE 'IPE' ST 'IPE 300'` and legacy `TABLE ST W12X35`)
 *   → an approximate FALLBACK shape (fixed default box) flagged
 *   approximate=true with the section label preserved. The full bundled
 *   section database is DEFERRED to Phase 2 (D-05 boundary) — there is NO
 *   database lookup or bundled table here, by design.
 *
 * Security:
 * - T-06-03: YD/ZD are converted to METERS through the running unit state
 *   (PITFALLS P1 — `UNIT INCH` before MEMBER PROPERTY) BEFORE the polygon is
 *   built, so geometry is always meter-normalized.
 * - T-06-04: section sizes are NEVER inferred from name strings (PITFALLS P3);
 *   PRIS uses explicit YD/ZD only, TABLE is always approximate.
 * - T-06-02: profiles are plain data objects (no prototype chain) — they are
 *   stored in Map containers, never plain-object-keyed records.
 *
 * Headless + worker-ready: zero DOM/Three imports (ARCHITECTURE.md Pattern 1);
 * points are plain [number, number][] pairs.
 */

import { toMeters, type UnitState } from '../resolve-units';
import type { SectionMeta, SectionProfile } from '../types';

/** A section profile enriched with metadata (family / dims / area). */
export type ResolvedSection = SectionProfile & SectionMeta;

/** Half-extent of the fixed 0.2 × 0.2 m default fallback box. */
const FALLBACK_HALF = 0.1;

/** Parse a numeric dimension value (floats allowed — dims are not integer ids). */
function parseDimValue(s: string | undefined): number | null {
  if (s === undefined || s.length === 0) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return v;
}

/** Find the value following the `KEY` token in `tokens` (case-insensitive). */
function dimAfter(tokens: readonly string[], key: string): number | null {
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].toUpperCase() === key) return parseDimValue(tokens[i + 1]);
  }
  return null;
}

/**
 * PRIS YD/ZD → rectangular polygon (D-05).
 *
 * `yd`/`zd` are raw values in the CURRENT unit state and are converted to
 * meters here (T-06-03). Points are [x, z] pairs: x = ±zd/2, z = ±yd/2.
 */
export function prisProfile(label: string, yd: number, zd: number, units: UnitState): ResolvedSection {
  const y = toMeters(yd, units);
  const z = toMeters(zd, units);
  return {
    label,
    points: [
      [-z / 2, -y / 2],
      [z / 2, -y / 2],
      [z / 2, y / 2],
      [-z / 2, y / 2],
    ],
    approximate: false,
    family: 'PRISMATIC',
    dims: `YD ${yd} ZD ${zd}`,
  };
}

/**
 * Approximate fallback shape for unresolved sections (D-05): a fixed
 * 0.2 × 0.2 m default box centered on the origin, flagged approximate=true.
 * The label (section name from TABLE, or the property name) is preserved for
 * the inspector's "dimensions approximate" display (PITFALLS P3).
 */
export function fallbackProfile(label: string): ResolvedSection {
  return {
    label,
    points: [
      [-FALLBACK_HALF, -FALLBACK_HALF],
      [FALLBACK_HALF, -FALLBACK_HALF],
      [FALLBACK_HALF, FALLBACK_HALF],
      [-FALLBACK_HALF, FALLBACK_HALF],
    ],
    approximate: true,
    family: 'STEEL',
  };
}

/**
 * Dispatch a property row's tokens to the right profile builder.
 *
 * `kind` is the property keyword (PRIS / TABLE / PIPE / TUBE / USER /
 * TAPERED — case-insensitive). `label` is the section label computed by the
 * caller (table section name, or '_' + property text for unnamed rows).
 *
 * Returns null for an unknown kind or a PRIS row without any usable YD — the
 * caller warns MALFORMED_LINE. PRIS YD-only returns the circular fallback
 * (approximate). TABLE and the other name-only kinds always return the
 * approximate fallback (D-05 — no section-DB lookup in Phase 1).
 *
 * `SectionMeta.dims` is recorded as the raw property token string.
 */
export function resolveSectionProfile(
  kind: string,
  label: string,
  tokens: readonly string[],
  units: UnitState,
): ResolvedSection | null {
  switch (kind.toUpperCase()) {
    case 'PRIS': {
      const yd = dimAfter(tokens, 'YD');
      if (yd === null) return null; // no dimensions at all → malformed
      const zd = dimAfter(tokens, 'ZD');
      if (zd === null) {
        // YD alone = circular (P3): approximate fallback, never fabricated.
        const circular = fallbackProfile(label);
        circular.dims = tokens.join(' ');
        return circular;
      }
      const pris = prisProfile(label, yd, zd, units);
      pris.dims = tokens.join(' '); // raw string (plan contract)
      return pris;
    }
    case 'TABLE':
    case 'PIPE':
    case 'TUBE':
    case 'USER':
    case 'TAPERED': {
      // Name-only sections: approximate fallback (D-05). No DB lookup.
      const fb = fallbackProfile(label);
      fb.dims = tokens.join(' ');
      return fb;
    }
    default:
      return null;
  }
}
