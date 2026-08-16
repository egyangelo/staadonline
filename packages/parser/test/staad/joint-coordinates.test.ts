/**
 * JOINT COORDINATES handler tests (01-05 Task 2, TDD RED).
 *
 * Behavior contract (plan + PITFALLS P1/P2 + D-04/D-06):
 * - Semicolon-packed rows become one node per entry (tokenizer already
 *   splits `;` — these tests exercise the handler against real tokenized
 *   entries, mirroring the HPP fixture shape `1 0 0 0; 2 0 -2.8 0;`).
 * - Coordinates are normalized to METERS through the running unit state (P1):
 *   FEET default → 1 ft = 0.3048 m.
 * - 2-coordinate rows (Z omitted) are valid ONLY under PLANE/FRAME (z = 0,
 *   D-02); under SPACE they are MALFORMED_LINE and skipped (never fabricated).
 * - Duplicate joint ids: second occurrence warns MALFORMED_LINE, first wins
 *   (Map-based dedupe, threat T-05-02).
 * - Malformed numeric tokens → MALFORMED_LINE warning with the source line,
 *   never a throw (T-05-04 strict numeric parse).
 */
import { describe, expect, it } from 'vitest';
import { jointCoordinatesHandler } from '../../src/staad/joint-coordinates';
import { createContext } from '../../src/core';
import { tokenize } from '../../src/tokenizer';
import { WARNING_CODES } from '../../src/types';
import type { CommandBlock } from '../../src/core';

/** Build a JOINT COORDINATES block whose body is the real tokenized entries of `deck`. */
function jointBlock(deck: string): CommandBlock {
  return {
    name: [{ text: 'JOINT COORDINATES', quoted: false }],
    bodyLines: tokenize(deck),
    line: 1,
  };
}

describe('JOINT COORDINATES handler (01-05)', () => {
  it('(1) parses a full 4-token row into a typed Node under METER units', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    jointCoordinatesHandler(ctx, jointBlock('1 0 0 0'));
    expect(ctx.nodes).toEqual([{ id: 1, x: 0, y: 0, z: 0 }]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(2) semicolon-packed line produces one node per entry with 1-based ids (D-04)', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    jointCoordinatesHandler(ctx, jointBlock('1 0 0 0; 2 0 3.5 0; 3 6 3.5 0'));
    expect(ctx.nodes).toHaveLength(3);
    expect(ctx.nodes.map((n) => n.id)).toEqual([1, 2, 3]);
    expect(ctx.nodes[1]).toEqual({ id: 2, x: 0, y: 3.5, z: 0 });
    expect(ctx.nodes[2]).toEqual({ id: 3, x: 6, y: 3.5, z: 0 });
  });

  it('(3) 2-coordinate row under PLANE defaults z to 0 (D-02) with no warning', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    ctx.structure = 'PLANE';
    jointCoordinatesHandler(ctx, jointBlock('5 0 0'));
    expect(ctx.nodes).toEqual([{ id: 5, x: 0, y: 0, z: 0 }]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(4) FEET units convert coordinates to meters (P1): 1 1 1 1 → x=y=z=0.3048', () => {
    const ctx = createContext(); // default unit state is FT/KIP
    jointCoordinatesHandler(ctx, jointBlock('1 1 1 1'));
    expect(ctx.nodes).toHaveLength(1);
    expect(ctx.nodes[0].x).toBeCloseTo(0.3048, 10);
    expect(ctx.nodes[0].y).toBeCloseTo(0.3048, 10);
    expect(ctx.nodes[0].z).toBeCloseTo(0.3048, 10);
  });

  it('(5) 2-coordinate row under SPACE is MALFORMED_LINE, skipped, never a throw', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    ctx.structure = 'SPACE';
    expect(() => jointCoordinatesHandler(ctx, jointBlock('7 1 2'))).not.toThrow();
    expect(ctx.nodes).toHaveLength(0);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(6) duplicate joint id warns MALFORMED_LINE and keeps the first occurrence', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    jointCoordinatesHandler(ctx, jointBlock('2 0 0 0\n2 1 1 1'));
    expect(ctx.nodes).toHaveLength(1);
    expect(ctx.nodes[0]).toEqual({ id: 2, x: 0, y: 0, z: 0 });
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(2); // the second row's source line
  });

  it('(7) non-numeric coordinate is MALFORMED_LINE with line attribution, no throw (T-05-04)', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    expect(() => jointCoordinatesHandler(ctx, jointBlock('4 0 X 0'))).not.toThrow();
    expect(ctx.nodes).toHaveLength(0);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(8) trailing extra tokens after x/y/z are tolerated (P2 — unknown specifiers non-fatal)', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    jointCoordinatesHandler(ctx, jointBlock('9 1 2 3 4 5'));
    expect(ctx.nodes).toEqual([{ id: 9, x: 1, y: 2, z: 3 }]);
    expect(ctx.warnings).toEqual([]);
  });
});
