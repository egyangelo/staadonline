/**
 * Golden-file tests against the real HPP fixture (01-09 Task 2, TDD RED).
 *
 * This is the D-09 TOLERANT-TIER gate: the real STAAD.Pro corpus
 * (HPP_Main_Building_2.std, ~92 KB) must parse through the FULLY WIRED
 * production entry (parseStaad + registerParsingCommands, 01-09 Task 1)
 * with manifest-exact counts, correct units, and computed finite bounds —
 * never a crash (T-09-01), and warnings instead of throws for anything the
 * parser deliberately does not model (D-06/D-07 tolerance).
 *
 * All counts are asserted == manifest values (T-09-02): the manifest is
 * derived by deterministic counting helpers (D-09 — no hand-typed corpus
 * counts), and the fixture is ground truth — a manifest/parser mismatch
 * means a parser bug, never a manifest edit.
 *
 * Test 9 is the golden-tier unit assertion (checker #2): UNIT METER KN at
 * line 14 must be APPLIED — with the FEET/KIPS default the model units
 * would stay FEET/KIPS and node 2 (line 16 `2 0 -2.8 0`) would read
 * y = -2.8 × 0.3048 ≈ -0.8534. Both assertions catch the 3.28× scale error
 * that count-only tests cannot see.
 */
import { describe, expect, it } from 'vitest';
import { parseStaad } from '../src/index';
import { WARNING_CODES } from '../src/types';
import { expectedReal } from './fixtures/manifest';
import { loadFixture } from './fixtures/loadFixture';

/**
 * Count JOINT COORDINATES rows in fixture text (semicolon-split, numeric
 * first word) — mirrors index.test.ts's established pattern. The corpus has
 * NON-CONTIGUOUS joint ids (max 1222, 1122 rows): the model's node count
 * equals ROWS, while manifest.expectedReal.joints is the MAX id (D-04).
 */
function countJointRows(text: string): number {
  const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith('JOINT COORDINATES'));
  if (start === -1) return 0;
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('*')) continue;
    const c = line.charCodeAt(0);
    if (c >= 65 && c <= 90) break; // next command block
    for (const entry of line.split(';')) {
      const t = entry.trim();
      if (t.length === 0) continue;
      const first = t.split(' ')[0] ?? '';
      if (/^\d+$/.test(first)) count++;
    }
  }
  return count;
}

describe('golden: real HPP_Main_Building_2.std (tolerant tier, D-09)', () => {
  it('(1) parses the real file without throwing (T-09-01)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    let result!: ReturnType<typeof parseStaad>;
    expect(() => {
      result = parseStaad(text);
    }).not.toThrow();
    expect(result.model.nodes.length).toBeGreaterThan(0);
  });

  it('(2) joint count matches the manifest (>= 1200); node count equals joint ROWS', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    // expectedReal.joints is the checker-verified MAX joint id (1222); the
    // ids are non-contiguous, so the model's node count equals the ROW count
    // (1122 — computed, never hardcoded), while the max id ties the manifest.
    const maxId = result.model.nodes.reduce((m, n) => (n.id > m ? n.id : m), 0);
    expect(maxId).toBe(expectedReal.joints);
    expect(maxId).toBeGreaterThanOrEqual(1200); // tolerant-tier bound
    expect(result.model.nodes).toHaveLength(countJointRows(text));
  });

  it('(3) member count equals manifest.expectedReal.members', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    expect(result.model.members).toHaveLength(expectedReal.members);
    // 1-based source ids preserved (D-04) — first member of the corpus.
    expect(result.model.members[0]).toMatchObject({ id: 1, startNode: 1, endNode: 739 });
  });

  it('(4) sections are populated (PRIS + TABLE fallback profiles)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    expect(result.model.sections.size).toBeGreaterThan(0);
    // TABLE rows resolve to approximate fallback profiles (D-05).
    expect(result.model.sections.get('IPE 300')?.approximate).toBe(true);
  });

  it('(5) supports.length equals manifest.expectedReal.supports (8 PINNED)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    expect(result.model.supports).toHaveLength(expectedReal.supports);
    // The corpus's support rows are all PINNED: translations fixed,
    // rotations released (types.ts: true = released).
    expect(result.model.supports.every((s) => s.type === 'PINNED')).toBe(true);
    expect(result.model.supports[0]?.releases).toEqual({
      FX: false,
      FY: false,
      FZ: false,
      MX: true,
      MY: true,
      MZ: true,
    });
  });

  it('(6) load cases: PRIMARY 14 + COMBINATION 274 = 288 (checker #9)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    // Disambiguated: not 14, not 274 — the SUM is asserted (manifest-computed).
    expect(result.model.loadCases).toHaveLength(expectedReal.loadCases);
    expect(result.model.loadCases.filter((c) => c.kind === 'PRIMARY')).toHaveLength(
      expectedReal.loadPrimary,
    );
    expect(result.model.loadCases.filter((c) => c.kind === 'COMBINATION')).toHaveLength(
      expectedReal.loadComb,
    );
  });

  it('(7) groups.size equals manifest.expectedReal.groups (START GROUP DEFINITION names)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    expect(result.model.groups.size).toBe(expectedReal.groups);
  });

  it('(8) warnings include SKIPPED_ELEMENT and UNRESOLVED_SECTION; bounds finite (P8)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    // ELEMENT INCIDENCES SHELL at source line 375 → SKIPPED_ELEMENT (D-07),
    // now realizable via the canonical skipped.ts registration (01-09).
    const skipped = result.warnings.filter((w) => w.code === WARNING_CODES.SKIPPED_ELEMENT);
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.some((w) => w.line === 375)).toBe(true);
    // TABLE sections → UNRESOLVED_SECTION (D-07, approximate fallback).
    expect(result.warnings.some((w) => w.code === WARNING_CODES.UNRESOLVED_SECTION)).toBe(true);
    // Bounds computed by finalize and finite on every axis (P8).
    const { bounds } = result.model;
    for (const v of [...bounds.min, ...bounds.max]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(bounds.max[0] - bounds.min[0]).toBeGreaterThan(0);
    expect(bounds.max[1] - bounds.min[1]).toBeGreaterThan(0);
    expect(bounds.max[2] - bounds.min[2]).toBeGreaterThan(0);
  });

  it('(9) golden unit assertion: units M/KN applied; node 2 y = -2.8 exactly (checker #2)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const result = parseStaad(text);
    // UNIT METER KN (line 14) must land in the model — a missing UNIT
    // handler would leave the FEET/KIPS default.
    expect(result.model.units).toEqual({ length: 'M', force: 'KN' });
    // Line 16 `2 0 -2.8 0` — with the FEET default this would be
    // -2.8 × 0.3048 ≈ -0.8534, so this assertion catches a 3.28× scale
    // error that count-only tests cannot see.
    const node2 = result.model.nodes.find((n) => n.id === 2);
    expect(node2).toBeDefined();
    expect(node2?.y).toBe(-2.8);
    expect(node2?.z).toBe(0);
  });
});