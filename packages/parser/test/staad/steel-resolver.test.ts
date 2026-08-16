/**
 * Steel section resolver tests (01-06 Task 1, TDD RED).
 *
 * Behavior contract (plan + D-05 + PITFALLS P1/P3 + T-06-03):
 * - PRIS YD/ZD resolves to a rectangular polygon at parse time (D-05): a
 *   4-corner rectangle centered on the origin in the [x, z] section plane,
 *   half-extents zd/2 and yd/2 — e.g. YD 0.4 ZD 0.5 → points
 *   [[-0.25,-0.2],[0.25,-0.2],[0.25,0.2],[-0.25,0.2]].
 * - YD/ZD are converted to METERS through the running unit state FIRST
 *   (PITFALLS P1: `UNIT INCH` before MEMBER PROPERTY; threat T-06-03).
 * - TABLE ST (quoted and legacy) resolves to an approximate FALLBACK shape
 *   flagged approximate=true with the section label preserved (D-05) — the
 *   full section database is DEFERRED to Phase 2, so no lookup happens here.
 * - PRIS with only YD (no ZD) is a CIRCULAR section (P3) — approximate
 *   fallback, never fabricated exact geometry.
 * - Section sizes are NEVER inferred from name strings (T-06-04); PRIS uses
 *   explicit YD/ZD only, TABLE is always approximate.
 */
import { describe, expect, it } from 'vitest';
import { fallbackProfile, prisProfile, resolveSectionProfile } from '../../src/staad/steel-resolver';
import { createUnitState } from '../../src/resolve-units';
import type { UnitState } from '../../src/resolve-units';

const meters: UnitState = { length: 'M', force: 'KN' };
const feet: UnitState = createUnitState(); // P1 default FT/KIP

describe('steel-resolver (01-06 Task 1)', () => {
  it('(1) prisProfile builds a 4-point rectangle polygon from YD/ZD (D-05)', () => {
    const s = prisProfile('_C1', 0.4, 0.5, meters);
    expect(s.label).toBe('_C1');
    expect(s.points).toEqual([
      [-0.25, -0.2],
      [0.25, -0.2],
      [0.25, 0.2],
      [-0.25, 0.2],
    ]);
    expect(s.approximate).toBe(false);
    expect(s.family).toBe('PRISMATIC');
  });

  it('(2) prisProfile converts FEET units to meters before building the polygon (P1 / T-06-03)', () => {
    const s = prisProfile('_C1', 1, 2, feet);
    // 1 ft = 0.3048 m, 2 ft = 0.6096 m → half-extents 0.1524 / 0.3048.
    expect(s.points[0][0]).toBeCloseTo(-0.3048, 10);
    expect(s.points[0][1]).toBeCloseTo(-0.1524, 10);
    expect(s.points[2][0]).toBeCloseTo(0.3048, 10);
    expect(s.points[2][1]).toBeCloseTo(0.1524, 10);
    expect(s.approximate).toBe(false);
  });

  it('(3) fallbackProfile returns an approximate default box with the label preserved (D-05)', () => {
    const s = fallbackProfile('W14X90');
    expect(s.label).toBe('W14X90');
    expect(s.approximate).toBe(true);
    // Fixed default box 0.2 × 0.2 m centered on the origin.
    expect(s.points).toEqual([
      [-0.1, -0.1],
      [0.1, -0.1],
      [0.1, 0.1],
      [-0.1, 0.1],
    ]);
  });

  it('(4) resolveSectionProfile dispatches PRIS tokens to prisProfile and TABLE tokens to fallbackProfile', () => {
    const pris = resolveSectionProfile('PRIS', '_X', ['PRIS', 'YD', '0.4', 'ZD', '0.5'], meters);
    expect(pris).not.toBeNull();
    expect(pris!.approximate).toBe(false);
    expect(pris!.points).toEqual([
      [-0.25, -0.2],
      [0.25, -0.2],
      [0.25, 0.2],
      [-0.25, 0.2],
    ]);

    const table = resolveSectionProfile('TABLE', 'IPE 300', ['TABLE', 'IPE', 'ST', 'IPE 300'], meters);
    expect(table).not.toBeNull();
    expect(table!.approximate).toBe(true);
    expect(table!.label).toBe('IPE 300');
  });

  it('(5) PRIS with only YD (no ZD) is a circular section → approximate fallback (P3)', () => {
    const s = resolveSectionProfile('PRIS', '_CIRC', ['PRIS', 'YD', '0.3'], meters);
    expect(s).not.toBeNull();
    expect(s!.label).toBe('_CIRC');
    expect(s!.approximate).toBe(true);
  });

  it('(6) unknown kind returns null (caller warns, never guesses)', () => {
    const s = resolveSectionProfile('FROBNICATE', 'x', ['FROBNICATE'], meters);
    expect(s).toBeNull();
  });
});
