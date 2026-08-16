/**
 * LOAD / LOAD COMB / SELFWEIGHT / MEMBER LOAD / JOINT LOAD handler tests
 * (01-08, TDD per task).
 *
 * Behavior contract (plan + PITFALLS P2/P3 + D-03/D-04/D-07 + checker #6/#9):
 * - The LOAD case header IS the block's header entry (`LOAD 1 LOADTYPE Dead
 *   TITLE D` — body empty in real STAAD.Pro files). loadHandler parses
 *   `LOAD <id> [LOADTYPE <t>...] [TITLE <rest...>]` from the block header
 *   tokens and sets ctx.currentLoadCase for item handlers.
 * - Non-numeric ids (`LOAD R1 ...`, absorbed inside DEFINE REFERENCE LOADS in
 *   the real file but defensively) → MALFORMED_LINE + case skipped.
 * - `LOAD LIST ...` blocks are load-case-envelope directives → silently
 *   skipped, no case created.
 * - `LOAD COMB <id> COMB [ENV] <terms...>` → LoadCase kind COMBINATION with
 *   factor terms referencing the referenced case by NAME when numeric ids are
 *   absent, by numeric id when present (tolerant). The STAAD GUI emits sign
 *   tokens as term separators (`- 1 DL + 1 H`) — consumed, factors stored as
 *   written (a genuinely negative factor arrives as a `-1` numeric token).
 * - SELFWEIGHT rows: `SELFWEIGHT <axis> <factor> [LIST <list>]` → LoadItem
 *   SELFWEIGHT (axisRef GLOBAL — gravity is always global).
 * - MEMBER LOAD rows: `<list> <type> <dir> <mag>`; dir G-prefixed = global,
 *   bare = local (PITFALLS UX: GY/GX/GZ global, Y/X/Z local).
 * - JOINT LOAD rows: `<joints> <dir> <mag>` (axisRef GLOBAL — joints have no
 *   local axes in STAAD).
 * - ELEMENT LOAD rows → SKIPPED_ELEMENT per row (plates out of scope, D-07),
 *   no item added.
 * - Malformed rows (no direction/magnitude, non-numeric magnitude) warn
 *   MALFORMED_LINE, never throw (T-08-02 strict Number()).
 * - Load cases record the declared force unit (ctx.units.force) for display
 *   (PITFALLS P1).
 *
 * The parse() helper runs the production pipeline (segment → dispatch) so
 * every test proves the handler is registered under COMMAND_TABLE.
 */
import { describe, expect, it } from 'vitest';
import '../../src/index'; // UNIT/STAAD/geometry handlers (side-effect registration)
import '../../src/staad/loads'; // LOAD-family handlers (side-effect registration)
import { canonicalizeCommand, createContext, segmentBlocks } from '../../src/core';
import { resolveHandler } from '../../src/staad/index';
import { tokenize } from '../../src/tokenizer';
import { WARNING_CODES } from '../../src/types';
import type { ParseContext } from '../../src/core';

/** Run the production pipeline (segment → dispatch) over a deck string. */
function parse(text: string): ParseContext {
  const ctx = createContext();
  const blocks = segmentBlocks(tokenize(text));
  for (const block of blocks) {
    const key = canonicalizeCommand(block.name);
    const handler = resolveHandler(key);
    if (handler !== undefined) handler(ctx, block);
  }
  return ctx;
}

/** Inclusive integer range helper for list assertions. */
function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let v = a; v <= b; v++) out.push(v);
  return out;
}

describe('LOAD case headers (01-08 Task 1)', () => {
  it('(1) LOAD 1 LOADTYPE Dead TITLE D → LoadCase { id:1, title:D, loadtype:Dead }', () => {
    const ctx = parse('LOAD 1 LOADTYPE Dead TITLE D');
    expect(ctx.loadCases).toHaveLength(1);
    expect(ctx.loadCases[0]).toMatchObject({ id: 1, title: 'D', loadtype: 'Dead', kind: 'PRIMARY' });
    expect(ctx.loadCases[0].items).toEqual([]);
  });

  it('(2) LOAD 13 LOADTYPE Seismic-H TITLE EX → loadtype Seismic-H', () => {
    const ctx = parse('LOAD 13 LOADTYPE Seismic-H TITLE EX');
    expect(ctx.loadCases[0]).toMatchObject({ id: 13, loadtype: 'Seismic-H', title: 'EX' });
  });

  it('(3) LOAD COMB 100 COMB - 1 DL + 1 H → COMBINATION with name-referencing terms', () => {
    const ctx = parse('LOAD COMB 100 COMB - 1 DL + 1 H');
    expect(ctx.loadCases).toHaveLength(1);
    const lc = ctx.loadCases[0];
    expect(lc.kind).toBe('COMBINATION');
    expect(lc.id).toBe(100);
    expect(lc.items).toEqual([]);
    expect(lc.terms).toEqual([
      { factor: 1, ref: 'DL' },
      { factor: 1, ref: 'H' },
    ]);
  });

  it('(4) bare LOAD 2 → LoadCase with empty title, no crash', () => {
    const ctx = parse('LOAD 2');
    expect(ctx.loadCases).toHaveLength(1);
    expect(ctx.loadCases[0]).toMatchObject({ id: 2, title: '', kind: 'PRIMARY' });
    expect(ctx.loadCases[0].loadtype).toBeUndefined();
  });

  it('(5) non-numeric id LOAD R1 LOADTYPE Mass → MALFORMED_LINE, case skipped', () => {
    const ctx = parse('LOAD R1 LOADTYPE Mass TITLE EQ-LOAD');
    expect(ctx.loadCases).toHaveLength(0);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(6) LOAD LIST ENV 1 2 → silently skipped, no case created', () => {
    const ctx = parse('LOAD LIST ENV 1 2');
    expect(ctx.loadCases).toHaveLength(0);
    expect(ctx.warnings).toEqual([]);
  });

  it('(7) numeric-ref combo LOAD COMB 200 COMB - 1.0 5 + 1.0 6 → terms reference case ids', () => {
    const ctx = parse('LOAD COMB 200 COMB - 1.0 5 + 1.0 6');
    expect(ctx.loadCases[0].kind).toBe('COMBINATION');
    expect(ctx.loadCases[0].terms).toEqual([
      { factor: 1, ref: 5 },
      { factor: 1, ref: 6 },
    ]);
  });

  it('(8) real-file-shaped combo with envelope suffix tolerates trailing tokens', () => {
    const ctx = parse('LOAD COMB 115 COMB - 1 DL + 0.6 W + 1 H (1)');
    expect(ctx.loadCases[0].terms).toEqual([
      { factor: 1, ref: 'DL' },
      { factor: 0.6, ref: 'W' },
      { factor: 1, ref: 'H' },
    ]);
  });

  it('(9) multi-word loadtype (Roof Live) is captured whole, not truncated', () => {
    const ctx = parse('LOAD 3 LOADTYPE Roof Live TITLE LR');
    expect(ctx.loadCases[0]).toMatchObject({ id: 3, loadtype: 'Roof Live', title: 'LR' });
  });

  it('(10) load cases record the declared force unit for display (P1)', () => {
    const ctx = parse('UNIT METER KN\nLOAD 1 LOADTYPE Dead TITLE D');
    expect(ctx.loadCases[0].forceUnit).toBe('KN');
  });

  it('(11) the current load case is set for item attachment', () => {
    const ctx = parse('LOAD 1 LOADTYPE Dead TITLE D');
    expect(ctx.currentLoadCase).toBe(ctx.loadCases[0]);
  });
});