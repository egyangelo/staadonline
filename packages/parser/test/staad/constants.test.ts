/**
 * CONSTANTS handler tests (01-06 Task 3).
 *
 * Behavior contract (plan + checker #5 + D-03/D-06):
 * - MATERIAL rows (`MATERIAL <name> MEMB <list>`) store the material name on
 *   every member in the expanded list — reachable through BOTH dispatch
 *   paths: the CONSTANTS-body path (rows arrive as block body lines) and the
 *   MATERIAL-block-header path (the real HPP fixture: uppercase-first-token
 *   segmentation splits `MATERIAL CONCRETE MEMB ...` into its own block, so
 *   the row must be read from the header entry tokens PLUS any digit-starting
 *   continuation body lines).
 * - BETA rows (`BETA 90 MEMB ...`) are tolerated and ignored WITHOUT a
 *   warning (valid STAAD, not unknown).
 * - Malformed MATERIAL rows (non-numeric member list) warn MALFORMED_LINE
 *   with the source line, never a throw.
 * - The real CONSTANTS slice (lines 835-849) parses without MALFORMED_LINE
 *   through the production dispatch table (registration proof).
 */
import { describe, expect, it } from 'vitest';
import { constantsHandler } from '../../src/staad/constants';
import { canonicalizeCommand, createContext, segmentBlocks } from '../../src/core';
import { resolveHandler } from '../../src/staad/index';
import { tokenize } from '../../src/tokenizer';
import { WARNING_CODES } from '../../src/types';
import type { CommandBlock, ParseContext } from '../../src/core';
import { loadFixture } from '../fixtures/loadFixture';

function seedMembers(ctx: ParseContext, ids: number[]): void {
  for (const id of ids) {
    ctx.members.push({ id, startNode: id * 10, endNode: id * 10 + 1 });
  }
}

function block(name: string, body: string): CommandBlock {
  return {
    name: tokenize(name)[0].tokens,
    bodyLines: tokenize(body),
    line: 1,
  };
}

/** Run the production pipeline (segment → dispatch) over a deck string. */
function dispatchDeck(ctx: ParseContext, text: string): void {
  const blocks = segmentBlocks(tokenize(text));
  for (const block of blocks) {
    const key = canonicalizeCommand(block.name);
    const handler = resolveHandler(key);
    if (handler !== undefined) handler(ctx, block);
  }
}

describe('CONSTANTS handler (01-06 Task 3)', () => {
  it('(1) CONSTANTS-body MATERIAL row stores material on every expanded member', () => {
    const ctx = createContext();
    seedMembers(ctx, [1, 2, 3]);
    constantsHandler(ctx, block('CONSTANTS', 'material concrete memb 1 to 3'));
    // Material name stored RAW as written (faithful to source — the real
    // fixture writes CONCRETE / STEEL_36_KSI uppercase); Phase 3 normalizes
    // when matching for color-by-material.
    expect(ctx.members.find((m) => m.id === 1)?.material).toBe('concrete');
    expect(ctx.members.find((m) => m.id === 2)?.material).toBe('concrete');
    expect(ctx.members.find((m) => m.id === 3)?.material).toBe('concrete');
    expect(ctx.warnings).toEqual([]);
  });

  it('(2) MATERIAL-block-header path reads the row from header tokens + digit continuation lines', () => {
    const ctx = createContext();
    seedMembers(ctx, [1, 2, 3, 4, 5]);
    // Real-fixture shape: the row is the block header entry, extended by
    // digit-starting body lines (files without `-` continuations).
    constantsHandler(ctx, block('MATERIAL CONCRETE MEMB 1 TO 3', '4 5'));
    expect(ctx.members.every((m) => m.material === 'CONCRETE')).toBe(true);
    expect(ctx.warnings).toEqual([]);
  });

  it('(3) BETA rows are tolerated and ignored without warnings (valid STAAD)', () => {
    const ctx = createContext();
    seedMembers(ctx, [1, 2]);
    constantsHandler(ctx, block('BETA 90 MEMB 1 TO 2', ''));
    expect(ctx.members.every((m) => m.material === undefined)).toBe(true);
    expect(ctx.warnings).toEqual([]);
  });

  it('(4) malformed MATERIAL row (non-numeric list) warns MALFORMED_LINE, never throws', () => {
    const ctx = createContext();
    expect(() => constantsHandler(ctx, block('CONSTANTS', 'material steel memb X Y'))).not.toThrow();
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(5) real CONSTANTS slice parses through the production dispatch without warnings', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
    const start = lines.findIndex((l) => l.trim().startsWith('CONSTANTS'));
    const end = lines.findIndex((l) => l.trim().startsWith('MEMBER OFFSET'));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const deck = lines.slice(start, end).join('\n');

    const ctx = createContext();
    expect(() => dispatchDeck(ctx, deck)).not.toThrow();
    // MATERIAL rows have valid numeric lists (no members in the slice, but
    // no MALFORMED_LINE either); BETA ignored silently → zero warnings.
    expect(ctx.warnings).toEqual([]);
  });
});