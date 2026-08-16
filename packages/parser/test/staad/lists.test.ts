/**
 * expandList — STAAD member-list range expansion (01-05 Task 1, TDD RED).
 *
 * PITFALLS P2 list syntax: explicit ids (`1 2 3`), `n1 TO n2`, `n1 TO n2 BY k`,
 * `ALL` (resolved against a caller-supplied member/node count reference), and
 * mixed forms (`1 TO 3 7 9 TO 11`).
 *
 * Security (threat T-05-01): expansion is BOUNDED — a hostile `1 TO 999999999`
 * must never allocate a zip-bomb array. With `maxRef` the range is clamped to
 * it; without, a hard cap (`LIST_HARD_CAP`) bounds the allocation.
 *
 * Tolerant (P2): non-numeric tokens are skipped, never fatal; descending
 * ranges expand to nothing.
 */
import { describe, expect, it } from 'vitest';
import { expandList, LIST_HARD_CAP, listItemLength } from '../src/staad/lists';

describe('expandList — member-list range expansion (01-05)', () => {
  it('expands explicit ids: "1 2 3" → [1,2,3]', () => {
    expect(expandList(['1', '2', '3'])).toEqual([1, 2, 3]);
  });

  it('expands TO ranges: "1 TO 5" → [1,2,3,4,5]', () => {
    expect(expandList(['1', 'TO', '5'])).toEqual([1, 2, 3, 4, 5]);
  });

  it('expands TO BY steps: "1 TO 9 BY 2" → [1,3,5,7,9]', () => {
    expect(expandList(['1', 'TO', '9', 'BY', '2'])).toEqual([1, 3, 5, 7, 9]);
  });

  it('mixes ranges and explicit ids: "1 TO 3 7 9 TO 11" → [1,2,3,7,9,10,11]', () => {
    expect(expandList(['1', 'TO', '3', '7', '9', 'TO', '11'])).toEqual([1, 2, 3, 7, 9, 10, 11]);
  });

  it('ALL resolves against maxRef: ALL with maxRef 100 → 1..100', () => {
    const ids = expandList(['ALL'], { maxRef: 100 });
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe(1);
    expect(ids[99]).toBe(100);
  });

  it('ALL without maxRef expands to nothing (no reference to resolve against)', () => {
    expect(expandList(['ALL'])).toEqual([]);
  });

  it('caps unbounded ranges at maxRef: "1 TO 999999999" maxRef 100 → 1..100 (T-05-01)', () => {
    expect(expandList(['1', 'TO', '999999999'], { maxRef: 100 })).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
  });

  it('clamps range end at maxRef: "50 TO 999" maxRef 100 → 50..100', () => {
    expect(expandList(['50', 'TO', '999'], { maxRef: 100 })).toEqual(
      Array.from({ length: 51 }, (_, i) => i + 50),
    );
  });

  it('caps unbounded ranges at the hard cap when no maxRef is given (T-05-01 zip-bomb guard)', () => {
    const ids = expandList(['1', 'TO', '999999999']);
    expect(ids).toHaveLength(LIST_HARD_CAP);
    expect(ids[0]).toBe(1);
    expect(ids[LIST_HARD_CAP - 1]).toBe(LIST_HARD_CAP);
  });

  it('skips non-numeric tokens tolerantly: "1 X 2" → [1,2]', () => {
    expect(expandList(['1', 'X', '2'])).toEqual([1, 2]);
  });

  it('expands nothing for a descending range: "5 TO 1" → []', () => {
    expect(expandList(['5', 'TO', '1'])).toEqual([]);
  });
});

describe('listItemLength — list-token scanner (01-05)', () => {
  it('measures list items: 3 for n TO m, 5 for n TO m BY k, 1 for bare id / ALL, 0 for non-items', () => {
    expect(listItemLength(['5', 'TO', '7', '10', '20'], 0)).toBe(3);
    expect(listItemLength(['5', 'TO', '9', 'BY', '2', '10'], 0)).toBe(5);
    expect(listItemLength(['3', '5', '6', 'BETA', '90'], 0)).toBe(1);
    expect(listItemLength(['ALL', '1', '2'], 0)).toBe(1);
    expect(listItemLength(['X', '1', '2'], 0)).toBe(0);
  });
});
