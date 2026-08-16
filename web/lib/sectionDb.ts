/**
 * Section database lookups — on-demand AISC section resolution (02-03 Task 2,
 * REND-01 / D-13 / D-14 / D-07).
 *
 * Consumes the vendored `web/data/sections.json` (MIT, OpenBuilding commit
 * 7b72284e) LAZILY: the full 1,223-row table is never pre-loaded (D-14). A
 * module-level `Map<string, SectionEntry>` is built once on first access by
 * `ensureIndexed()` — the map is a real `Map`, never a plain `{}` keyed by an
 * attacker-controlled section name (a malicious key like `__proto__` cannot
 * pollute, T-02-01 in 02-03-PLAN.md).
 *
 * Lookup contract mirrors `packages/parser/src/staad/steel-resolver.ts`
 * (steel section resolver / fallbackProfile): exact names resolve to the real
 * outline polygon; unknown names degrade to a nearest-family approximate shape
 * ALWAYS flagged `approximate: true` (D-07) — exact geometry is never
 * fabricated for an unresolvable name.
 */

import type { SectionProfile } from "@staad-online/parser";

/** One row of the vendored DB: real AISC outline in meters (CCW, [x,z]). */
export interface SectionEntry {
  name: string;
  family: string;
  points: [number, number][];
}

/** A resolved section outline — exact when from the DB, approximate otherwise. */
export interface SectionResolution {
  points: [number, number][];
  family: string;
  approximate: true | false;
}

/** Half-extent of the fixed 0.2 × 0.2 m default fallback box (steel-resolver parity). */
const FALLBACK_HALF = 0.1;

/** Fixed I-shape polygon (D-07 nearest-family): nominal W with d 0.3 m, bf 0.22 m. */
const I_SHAPE: [number, number][] = [
  [-0.11, 0.15], [0.11, 0.15],
  [0.11, 0.13], [0.006, 0.13],
  [0.006, -0.13], [0.11, -0.13],
  [0.11, -0.15], [-0.11, -0.15],
  [-0.11, -0.13], [-0.006, -0.13],
  [-0.006, 0.13], [-0.11, 0.13],
];

/** Fixed channel polygon: nominal C with d 0.2 m, bf 0.075 m. */
const CHANNEL_SHAPE: [number, number][] = [
  [0, 0.1], [0.075, 0.1],
  [0.075, 0.085], [0.006, 0.085],
  [0.006, -0.085], [0.075, -0.085],
  [0.075, -0.1], [0, -0.1],
  [0, -0.085], [-0.006, -0.085],
  [-0.006, 0.085], [0, 0.085],
];

/** Fixed angle polygon: nominal L with leg 0.15 m, t 0.012 m. */
const ANGLE_SHAPE: [number, number][] = [
  [-0.075, -0.075], [0.075, -0.075],
  [0.075, -0.063], [-0.063, -0.063],
  [-0.063, 0.075], [-0.075, 0.075],
];

/** Fixed tube polygon: nominal HSS 0.2 × 0.1 m. */
const TUBE_SHAPE: [number, number][] = [
  [-0.05, -0.1], [0.05, -0.1],
  [0.05, 0.1], [-0.05, 0.1],
];

/** Fixed fallback box: 0.2 × 0.2 m (matches steel-resolver fallbackProfile). */
const BOX_SHAPE: [number, number][] = [
  [-FALLBACK_HALF, -FALLBACK_HALF],
  [FALLBACK_HALF, -FALLBACK_HALF],
  [FALLBACK_HALF, FALLBACK_HALF],
  [-FALLBACK_HALF, FALLBACK_HALF],
];

let indexPromise: Promise<Map<string, SectionEntry>> | null = null;

/**
 * Build the name → entry index once, on first access (D-14: never at import
 * time). The JSON's leading `_meta_*` header row (points.length 0) and any
 * malformed row are skipped.
 */
function ensureIndexed(): Promise<Map<string, SectionEntry>> {
  indexPromise ??= (async () => {
    const mod = (await import("../data/sections.json")) as unknown as {
      default: unknown[];
    };
    const rows = Array.isArray(mod.default) ? mod.default : [];
    const map = new Map<string, SectionEntry>();
    for (const item of rows) {
      const row = item as {
        name?: unknown;
        family?: unknown;
        points?: unknown;
      };
      if (typeof row.name !== "string" || typeof row.family !== "string") continue;
      if (!Array.isArray(row.points) || row.points.length === 0) continue;
      map.set(row.name.toUpperCase(), {
        name: row.name,
        family: row.family,
        points: row.points as [number, number][],
      });
    }
    return map;
  })();
  return indexPromise;
}

/**
 * Exact, case-insensitive AISC lookup ('W14X90', 'HSS6X6X1/4'). Returns the
 * real outline polygon (approximate: false) or null when the DB has no match.
 */
export async function lookupSection(name: string): Promise<SectionResolution | null> {
  const index = await ensureIndexed();
  const entry = index.get(name.toUpperCase());
  if (!entry) return null;
  return { points: entry.points, family: entry.family, approximate: false };
}

/**
 * Nearest-family approximate shape for an unresolvable name (D-07). Family
 * detection order: W/M/S/HP → I-shape, C/MC → channel, L → angle,
 * HSS/TUBE/PIPE → tube, else → 0.2 × 0.2 m box. ALWAYS approximate: true.
 */
export function nearestShape(name: string): SectionResolution {
  const up = name.toUpperCase();
  if (/^(W|M|S|HP)/.test(up)) {
    return { points: I_SHAPE, family: up[0], approximate: true };
  }
  if (/^(MC|C)/.test(up)) {
    return { points: CHANNEL_SHAPE, family: up.startsWith("MC") ? "MC" : "C", approximate: true };
  }
  if (/^L/.test(up)) {
    return { points: ANGLE_SHAPE, family: "L", approximate: true };
  }
  if (/^(HSS|TUBE|PIPE)/.test(up)) {
    return { points: TUBE_SHAPE, family: "HSS", approximate: true };
  }
  return { points: BOX_SHAPE, family: "UNKNOWN", approximate: true };
}

/**
 * Upgrade a Phase-1 (01-06) `SectionProfile` to a real outline when the DB
 * knows the section:
 * - exact incoming profiles (`approximate === false`) → returned unchanged;
 * - approximate profiles carrying a real TABLE section name in `.label` →
 *   exact DB profile when found, else `nearestShape(label)` (stays
 *   approximate: true — never fabricated, T-02-04 warn-don't-throw parity).
 */
export async function upgradeProfile(
  profile: SectionProfile,
): Promise<SectionProfile & { family: string }> {
  if (profile.approximate === false) return profile as SectionProfile & { family: string };
  const exact = await lookupSection(profile.label);
  if (exact) {
    return { ...profile, points: exact.points, approximate: false, family: exact.family };
  }
  const near = nearestShape(profile.label);
  return { ...profile, points: near.points, approximate: true, family: near.family };
}