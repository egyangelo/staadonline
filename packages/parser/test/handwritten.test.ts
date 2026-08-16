/**
 * Hand-written exact-tier tests (01-09 Task 3, TDD RED).
 *
 * The D-09 EXACT tier: the five hand-written fixtures (small enough to count
 * by hand) parse through the FULLY WIRED production entry with EXACT counts
 * and SPECIFIC value assertions — unit-state conversions (P1 mixed units),
 * 2D handling (checker #3), section geometry (D-05), continuation merges,
 * abbreviations, and tolerance (PARSE-03 / D-06/D-07).
 *
 * All counts come from manifest.expectedHandwritten (never hand-typed here);
 * values asserted are concrete per the plan: plane z=0, feet→meters factors
 * (0.3048), inch→meters section dims (0.0254), member geometry, warning codes.
 */
import { describe, expect, it } from 'vitest';
import { parseStaad } from '../src/index';
import { WARNING_CODES } from '../src/types';
import { expectedHandwritten } from './fixtures/manifest';
import { loadFixture } from './fixtures/loadFixture';

const EXPECTED = expectedHandwritten;

describe('handwritten exact tier (D-09)', () => {
  it('(1) plane-2d: PLANE structure → z=0 everywhere, exact counts, no warnings', () => {
    const result = parseStaad(loadFixture('handwritten/plane-2d.std'));
    // Exact counts from the manifest (D-09).
    expect(result.model.nodes).toHaveLength(EXPECTED['plane-2d'].joints);
    expect(result.model.members).toHaveLength(EXPECTED['plane-2d'].members);
    expect(result.model.supports).toHaveLength(EXPECTED['plane-2d'].supports);
    // STAAD PLANE (header handler sets ctx.structure = 'PLANE'): 2-coordinate
    // rows are valid and Z defaults to 0 (checker #3 — 2D coverage). An
    // un-wired header handler would leave SPACE and flag MALFORMED_LINE.
    for (const n of result.model.nodes) expect(n.z).toBe(0);
    expect(result.warnings.some((w) => w.code === WARNING_CODES.MALFORMED_LINE)).toBe(false);
    // Concrete member geometry (1-based ids preserved, D-04).
    expect(result.model.members).toEqual([
      { id: 1, startNode: 1, endNode: 2 },
      { id: 2, startNode: 2, endNode: 3 },
    ]);
  });

  it('(2) feet-imperial: FEET coords → meters; INCH PRIS dims → meters (P1 mixed units)', () => {
    const result = parseStaad(loadFixture('handwritten/feet-imperial.std'));
    // Units are STATEFUL (PITFALLS P1): the model carries the FINAL state —
    // UNIT INCH at line 14 switched length to IN after the FEET coords were
    // parsed. The manifest's `unit` field (FEET/KIPS) is the FIRST UNIT line;
    // the model's is the last — this asymmetry is exactly the P1 contract.
    expect(result.model.units).toEqual({ length: 'IN', force: 'KIP' });
    const byId = new Map(result.model.nodes.map((n) => [n.id, n]));
    // 1 ft → 0.3048 m (exact factor assertion — a 1:1 default would show 10).
    expect(byId.get(2)?.x).toBeCloseTo(10 * 0.3048, 9);
    expect(byId.get(3)?.x).toBeCloseTo(10 * 0.3048, 9);
    expect(byId.get(3)?.y).toBeCloseTo(12 * 0.3048, 9);
    // UNIT INCH switched the state before MEMBER PROPERTY: PRIS YD 12 ZD 8
    // (inches) → 12 × 0.0254 = 0.3048 m deep, 8 × 0.0254 = 0.2032 m wide —
    // the section polygon is meter-normalized (T-06-03).
    const sec = result.model.sections.get('_PRIS YD 12 ZD 8');
    expect(sec).toBeDefined();
    expect(sec!.approximate).toBe(false);
    expect(sec!.family).toBe('PRISMATIC');
    expect(sec!.dims).toBe('PRIS YD 12 ZD 8');
    expect(sec!.points).toHaveLength(4);
    const [p0, p1, p2, p3] = sec!.points;
    expect(p0[0]).toBeCloseTo(-(8 * 0.0254) / 2, 9); // -z/2
    expect(p0[1]).toBeCloseTo(-(12 * 0.0254) / 2, 9); // -y/2
    expect(p1[0]).toBeCloseTo((8 * 0.0254) / 2, 9); // +z/2
    expect(p2[1]).toBeCloseTo((12 * 0.0254) / 2, 9); // +y/2
    expect(p3[0]).toBeCloseTo(-(8 * 0.0254) / 2, 9);
    // Both members linked to the ranged section row.
    expect(result.model.members[0]?.sectionKey).toBe('_PRIS YD 12 ZD 8');
    expect(result.model.members[1]?.sectionKey).toBe('_PRIS YD 12 ZD 8');
  });

  it('(3) legacy-table: TABLE ST W12X35 → approximate fallback + UNRESOLVED_SECTION (D-07)', () => {
    const result = parseStaad(loadFixture('handwritten/legacy-table.std'));
    expect(result.model.members).toHaveLength(EXPECTED['legacy-table'].members);
    // Legacy `TABLE ST W12X35`: the section name is a lookup key, NOT
    // geometry (D-05/D-07) → fixed 0.2 × 0.2 m fallback, approximate=true.
    const sec = result.model.sections.get('W12X35');
    expect(sec).toBeDefined();
    expect(sec!.approximate).toBe(true);
    expect(sec!.family).toBe('STEEL');
    expect(sec!.dims).toBe('TABLE ST W12X35');
    for (const m of result.model.members) expect(m.sectionKey).toBe('W12X35');
    expect(result.warnings.some((w) => w.code === WARNING_CODES.UNRESOLVED_SECTION)).toBe(true);
    // Unit state still honored for coordinates (FEET → meters).
    const byId = new Map(result.model.nodes.map((n) => [n.id, n]));
    expect(byId.get(2)?.x).toBeCloseTo(15 * 0.3048, 9);
    expect(byId.get(3)?.x).toBeCloseTo(30 * 0.3048, 9);
  });

  it('(4) continuations: `-` merges rows into members 3 (3→1) and 4 (1→2); MEMB INCI; `*` comment', () => {
    const result = parseStaad(loadFixture('handwritten/continuations.std'));
    // Semicolon-packed JOINT COORDINATES on one physical line → 3 joints.
    expect(result.model.nodes).toHaveLength(EXPECTED['continuations'].joints);
    // Abbreviated MEMB INCI recognized (P2 alias); the `*` comment line
    // between blocks is ignored. 4 member rows total: entries `1 1 2` and
    // `2 2 3`, plus the `" -"` continuation-merged entry `3 3 1 -` + `4 1 2`
    // which defines BOTH member 3 (3→1) and member 4 (1→2).
    expect(result.model.members).toHaveLength(EXPECTED['continuations'].members);
    const byId = new Map(result.model.members.map((m) => [m.id, m]));
    expect(byId.get(1)).toMatchObject({ id: 1, startNode: 1, endNode: 2 });
    expect(byId.get(2)).toMatchObject({ id: 2, startNode: 2, endNode: 3 });
    expect(byId.get(3)).toMatchObject({ id: 3, startNode: 3, endNode: 1 });
    expect(byId.get(4)).toMatchObject({ id: 4, startNode: 1, endNode: 2 });
    // The merged entry must not mis-parse (no duplicate-id MALFORMED_LINE).
    expect(result.warnings.some((w) => w.code === WARNING_CODES.MALFORMED_LINE)).toBe(false);
    // Supports: 3 FIXED rows.
    expect(result.model.supports).toHaveLength(EXPECTED['continuations'].supports);
    expect(result.model.supports.every((s) => s.type === 'FIXED')).toBe(true);
  });

  it('(5) unknown-commands: FROBNICATE warns UNKNOWN_COMMAND; model stays intact (PARSE-03)', () => {
    const result = parseStaad(loadFixture('handwritten/unknown-commands.std'));
    // The unknown block and its body are skipped with a warning — the
    // surrounding valid structure survives (2 joints, 1 member, 2 supports).
    expect(result.model.nodes).toHaveLength(EXPECTED['unknown-commands'].joints);
    expect(result.model.members).toHaveLength(EXPECTED['unknown-commands'].members);
    expect(result.model.supports).toHaveLength(EXPECTED['unknown-commands'].supports);
    const unknown = result.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_COMMAND);
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown[0]?.line).toBe(13); // `FROBNICATE 12 34` header line
  });

  it('(6) warning codes asserted per D-08 for every tolerant case', () => {
    // Tolerant cases carry their documented codes...
    const tolerant: Array<{ fixture: string; code: string }> = [
      { fixture: 'handwritten/legacy-table.std', code: WARNING_CODES.UNRESOLVED_SECTION },
      { fixture: 'handwritten/unknown-commands.std', code: WARNING_CODES.UNKNOWN_COMMAND },
    ];
    for (const c of tolerant) {
      const result = parseStaad(loadFixture(c.fixture));
      expect(
        result.warnings.some((w) => w.code === c.code),
        `${c.fixture} should warn ${c.code}`,
      ).toBe(true);
    }
    // ...while the exact-tier fixtures parse with NO warning-severity codes
    // (D-08 tiering). Informational UNIT_CHANGE notices (units.ts, P1
    // statefulness) are expected and are not defects.
    const exact = ['handwritten/plane-2d.std', 'handwritten/feet-imperial.std', 'handwritten/continuations.std'];
    for (const name of exact) {
      const result = parseStaad(loadFixture(name));
      const warns = result.warnings.filter((w) => w.severity === 'warning');
      expect(warns, `${name} should have no warning-severity codes`).toEqual([]);
    }
  });
});