/**
 * Smoke test proving the fixture harness works (plan 01-03 Task 3).
 *
 * - Every fixture loads non-empty via the deterministic loader
 * - Real fixture is a large corpus (> 50 000 chars)
 * - Every hand-written fixture carries the `* end of fixture` terminator
 * - Manifest (D-09) is complete: expectedReal positive, expectedHandwritten
 *   covers all 5 hand-written names
 * - Ground-truth spot checks on the real file (checker-verified counts:
 *   1222 joints / 350 members / 938 elements / 40 groups / 8 PINNED
 *   supports / 14 primary / 274 comb / 288 total loads, unit METER KN)
 */
import { describe, expect, it } from 'vitest';

import { expected, expectedHandwritten, expectedReal } from './manifest';
import { FIXTURE_NAMES, loadFixture } from './loadFixture';

const HANDWRITTEN_NAMES = FIXTURE_NAMES.filter((n) => n.startsWith('handwritten/'));

function isPositiveInteger(v: number): boolean {
  return Number.isInteger(v) && v > 0;
}

describe('fixture corpus', () => {
  it('loads every fixture as non-empty UTF-8 text', () => {
    for (const name of FIXTURE_NAMES) {
      const text = loadFixture(name);
      expect(text.length, `fixture ${name}`).toBeGreaterThan(0);
    }
  });

  it('real fixture is the 92 KB-scale corpus (> 50 000 chars)', () => {
    expect(loadFixture('real/HPP_Main_Building_2.std').length).toBeGreaterThan(50_000);
  });

  it('every hand-written fixture ends with the `* end of fixture` terminator', () => {
    for (const name of HANDWRITTEN_NAMES) {
      expect(loadFixture(name), `fixture ${name}`).toContain('* end of fixture');
    }
  });

  it('throws on unknown fixture names', () => {
    expect(() => loadFixture('nope/nope.std')).toThrow(/Unknown fixture/);
  });
});

describe('manifest (D-09 expected counts)', () => {
  it('expectedReal counts are all positive integers', () => {
    const c = expectedReal;
    expect(isPositiveInteger(c.joints)).toBe(true);
    expect(isPositiveInteger(c.members)).toBe(true);
    expect(isPositiveInteger(c.elements)).toBe(true);
    expect(isPositiveInteger(c.groups)).toBe(true);
    expect(isPositiveInteger(c.supports)).toBe(true);
    expect(isPositiveInteger(c.loadPrimary)).toBe(true);
    expect(isPositiveInteger(c.loadComb)).toBe(true);
    expect(isPositiveInteger(c.loadCases)).toBe(true);
  });

  it('expectedReal matches the checker-verified ground truth of the real file', () => {
    const c = expectedReal;
    expect(c.joints).toBe(1222);
    expect(c.members).toBe(350);
    expect(c.elements).toBe(938);
    expect(c.groups).toBe(40);
    expect(c.supports).toBe(8); // 8 PINNED joints in the sample (checker #10)
    expect(c.loadPrimary).toBe(14);
    expect(c.loadComb).toBe(274);
    expect(c.loadCases).toBe(288); // = loadPrimary + loadComb (checker #9 disambiguation)
    expect(c.unit).toEqual({ length: 'METER', force: 'KN' });
  });

  it('expectedHandwritten covers all 5 hand-written fixture names', () => {
    for (const name of HANDWRITTEN_NAMES) {
      const fixtureName = name.replace('handwritten/', '').replace('.std', '');
      expect(expectedHandwritten, `missing ${fixtureName}`).toHaveProperty(fixtureName);
    }
  });

  it('expected map keys every fixture name', () => {
    for (const name of FIXTURE_NAMES) {
      expect(expected, `missing ${name}`).toHaveProperty(name);
    }
  });
});