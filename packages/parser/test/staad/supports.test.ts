/**
 * SUPPORTS handler tests (01-07 Task 1, TDD RED).
 *
 * Behavior contract (plan + D-03/D-04/D-06/D-07 + threat T-07-01/03):
 * - SUPPORTS rows are `<joint-list> <restraint>`: the leading tokens form a
 *   joint list (expandList — STAAD SUPPORTS references JOINT/node numbers,
 *   D-04 1-based source ids), the trailing tokens define the restraint.
 * - Restraint kinds:
 *   - PINNED — translations fixed (FX/FY/FZ restrained), rotations released
 *     (MX/MY/MZ free): releases { FX:false, FY:false, FZ:false, MX:true,
 *     MY:true, MZ:true } (types.ts: true = released).
 *   - FIXED — all six DOFs restrained: releases all false.
 *   - FIXED BUT <dofs> — everything fixed EXCEPT the listed DOFs, which are
 *     RELEASED (true in the releases set — plan action text "all fixed
 *     except listed releases" + types.ts contract; the plan's literal
 *     `{FY:false,MZ:false}` expectation is a typo, documented in SUMMARY).
 *   - ENFORCED — enforced-displacement support: all six restrained.
 *   - SPRING — elastic support; stiffness spec recorded in Support.note
 *     (additive optional field, Rule 2 deviation — Support had no note
 *     field, plan requires "record type + note").
 * - Plate support rows (containing a PLATE marker, e.g.
 *   `_RAFT PLATE MAT DIRECT Y ...`) are SKIPPED with a SKIPPED_ELEMENT
 *   warning (D-07 — plates out of phase scope); no Support record; never a
 *   throw.
 * - Rows with no usable joint list (e.g. `X PINNED`) warn MALFORMED_LINE
 *   and are skipped.
 * - Dangling joint refs (no Node record for an expanded id): the support is
 *   STILL STORED (tolerant) plus a MALFORMED_LINE warning (T-07-03 — chosen
 *   option from the plan: "store + MALFORMED_LINE warning").
 * - 1-based source ids preserved (D-04); warning line attribution (D-06).
 *
 * Security (T-07-01): joint lists expand through bounded `expandList` — a
 * hostile `1 TO 999999999` can never zip-bomb (LIST_HARD_CAP).
 */
import { describe, expect, it } from 'vitest';
import { supportsHandler } from '../../src/staad/supports';
import { createContext } from '../../src/core';
import { tokenize } from '../../src/tokenizer';
import { WARNING_CODES } from '../../src/types';
import type { CommandBlock, ParseContext } from '../../src/core';

/** Build a SUPPORTS block whose body is the tokenized entries of `deck`. */
function supportsBlock(deck: string): CommandBlock {
  return {
    name: [{ text: 'SUPPORTS', quoted: false }],
    bodyLines: tokenize(deck),
    line: 1,
  };
}

/** Seed ctx.nodes with the given 1-based ids (0,0,0 coordinates). */
function seedNodes(ctx: ParseContext, ids: number[]): void {
  for (const id of ids) ctx.nodes.push({ id, x: 0, y: 0, z: 0 });
}

describe('SUPPORTS handler (01-07 Task 1)', () => {
  it('(1) explicit joint list with PINNED → 8 Support records, type PINNED, rotations released', () => {
    const ctx = createContext();
    seedNodes(ctx, [14, 16, 18, 20, 22, 24, 1118, 1121]);
    supportsHandler(ctx, supportsBlock('14 16 18 20 22 24 1118 1121 PINNED'));
    expect(ctx.supports).toHaveLength(8);
    for (const s of ctx.supports) {
      expect(s.type).toBe('PINNED');
      expect(s.releases).toEqual({ FX: false, FY: false, FZ: false, MX: true, MY: true, MZ: true });
    }
    expect(ctx.supports.map((s) => s.nodeId)).toEqual([14, 16, 18, 20, 22, 24, 1118, 1121]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(2) range row `1 TO 5 FIXED` → 5 FIXED supports, all DOFs restrained', () => {
    const ctx = createContext();
    seedNodes(ctx, [1, 2, 3, 4, 5]);
    supportsHandler(ctx, supportsBlock('1 TO 5 FIXED'));
    expect(ctx.supports).toHaveLength(5);
    expect(ctx.supports.map((s) => s.nodeId)).toEqual([1, 2, 3, 4, 5]);
    for (const s of ctx.supports) {
      expect(s.type).toBe('FIXED');
      expect(s.releases).toEqual({ FX: false, FY: false, FZ: false, MX: false, MY: false, MZ: false });
    }
    expect(ctx.warnings).toEqual([]);
  });

  it('(3) `7 FIXED BUT FY MZ` → FIXED_BUT with FY and MZ RELEASED (true)', () => {
    const ctx = createContext();
    seedNodes(ctx, [7]);
    supportsHandler(ctx, supportsBlock('7 FIXED BUT FY MZ'));
    expect(ctx.supports).toHaveLength(1);
    expect(ctx.supports[0].nodeId).toBe(7);
    expect(ctx.supports[0].type).toBe('FIXED_BUT');
    // types.ts: true = released. FIXED BUT FY MZ = all fixed except FY/MZ
    // released → FY:true, MZ:true (plan's literal `false` expectation is a
    // typo — see SUMMARY deviation #1).
    expect(ctx.supports[0].releases).toEqual({
      FX: false,
      FY: true,
      FZ: false,
      MX: false,
      MY: false,
      MZ: true,
    });
    expect(ctx.warnings).toEqual([]);
  });

  it('(4) plate support row → SKIPPED_ELEMENT warning, no Support record, no crash', () => {
    const ctx = createContext();
    expect(() =>
      supportsHandler(ctx, supportsBlock('_RAFT PLATE MAT DIRECT Y SUBGRADE 15000 COMPRESSION')),
    ).not.toThrow();
    expect(ctx.supports).toHaveLength(0);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.SKIPPED_ELEMENT);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(5) malformed row `X PINNED` (no joint list) → MALFORMED_LINE, skipped', () => {
    const ctx = createContext();
    supportsHandler(ctx, supportsBlock('X PINNED'));
    expect(ctx.supports).toHaveLength(0);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(6) SPRING row records type SPRING with the stiffness note (Rule 2 deviation)', () => {
    const ctx = createContext();
    seedNodes(ctx, [7]);
    supportsHandler(ctx, supportsBlock('7 SPRING FX 1000'));
    expect(ctx.supports).toHaveLength(1);
    expect(ctx.supports[0].nodeId).toBe(7);
    expect(ctx.supports[0].type).toBe('SPRING');
    expect(ctx.supports[0].note).toBe('FX 1000');
    expect(ctx.warnings).toEqual([]);
  });

  it('(7) dangling joint ref → support STILL STORED plus MALFORMED_LINE warning (T-07-03)', () => {
    const ctx = createContext();
    seedNodes(ctx, [1]); // node 2 does not exist
    supportsHandler(ctx, supportsBlock('1 2 FIXED'));
    expect(ctx.supports).toHaveLength(2); // both stored, tolerant
    expect(ctx.supports[1].nodeId).toBe(2);
    expect(ctx.warnings.some((w) => w.code === WARNING_CODES.MALFORMED_LINE)).toBe(true);
  });

  it('(8) ENFORCED support → type ENFORCED, all six DOFs restrained', () => {
    const ctx = createContext();
    seedNodes(ctx, [3]);
    supportsHandler(ctx, supportsBlock('3 ENFORCED'));
    expect(ctx.supports).toHaveLength(1);
    expect(ctx.supports[0].type).toBe('ENFORCED');
    expect(ctx.supports[0].releases).toEqual({
      FX: false,
      FY: false,
      FZ: false,
      MX: false,
      MY: false,
      MZ: false,
    });
    expect(ctx.warnings).toEqual([]);
  });
});