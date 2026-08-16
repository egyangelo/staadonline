/**
 * MEMBER INCIDENCES handler tests (01-05 Task 3, TDD RED).
 *
 * Behavior contract (plan + PITFALLS P2 + D-04/D-06):
 * - Rows are `member-list start-node end-node [specifiers...]`; the member
 *   list may be a bare id (`1 1 739`), a range (`5 TO 7 ...`), a range with
 *   explicit ids (`5 TO 7 10 20 100 200` → members 5,6,7,10,20 each with
 *   startNode 100 / endNode 200 — the node pair is the pair of numeric tokens
 *   after the maximal list), or semicolon-packed multi-row lines.
 * - 1-based source member ids preserved (D-04).
 * - Trailing specifiers (BETA angle, ...) are tolerated, never fatal (P2).
 * - Malformed rows (non-numeric member list / missing node pair) → a
 *   MALFORMED_LINE warning with the source line; the row is skipped; the
 *   handler never throws.
 * - Duplicate member ids: second occurrence warns MALFORMED_LINE, first wins
 *   (Map-based dedupe, threat T-05-02).
 */
import { describe, expect, it } from 'vitest';
import { memberIncidencesHandler } from '../../src/staad/member-incidences';
import { createContext } from '../../src/core';
import { tokenize } from '../../src/tokenizer';
import { WARNING_CODES } from '../../src/types';
import type { CommandBlock } from '../../src/core';

/** Build a MEMBER INCIDENCES block whose body is the real tokenized entries of `deck`. */
function memberBlock(deck: string): CommandBlock {
  return {
    name: [{ text: 'MEMBER INCIDENCES', quoted: false }],
    bodyLines: tokenize(deck),
    line: 1,
  };
}

describe('MEMBER INCIDENCES handler (01-05)', () => {
  it('(1) parses a single row into a typed Member with 1-based ids (D-04)', () => {
    const ctx = createContext();
    memberIncidencesHandler(ctx, memberBlock('1 1 739'));
    expect(ctx.members).toEqual([{ id: 1, startNode: 1, endNode: 739 }]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(2) range row with explicit ids expands every member to the same node pair', () => {
    const ctx = createContext();
    // List tokens `5 TO 7 10 20` expand to ids 5,6,7,10,20; the node pair is
    // the numeric tokens following the maximal list: 100, 200.
    memberIncidencesHandler(ctx, memberBlock('5 TO 7 10 20 100 200'));
    expect(ctx.members.map((m) => m.id)).toEqual([5, 6, 7, 10, 20]);
    for (const m of ctx.members) {
      expect(m.startNode).toBe(100);
      expect(m.endNode).toBe(200);
    }
    expect(ctx.warnings).toEqual([]);
  });

  it('(3) trailing BETA specifier is tolerated (P2 — extra tokens non-fatal)', () => {
    const ctx = createContext();
    memberIncidencesHandler(ctx, memberBlock('3 5 6 BETA 90'));
    expect(ctx.members).toEqual([{ id: 3, startNode: 5, endNode: 6 }]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(4) semicolon-packed lines produce multiple members', () => {
    const ctx = createContext();
    memberIncidencesHandler(ctx, memberBlock('1 1 739; 2 3 610; 3 5 807'));
    expect(ctx.members.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(ctx.members[1]).toEqual({ id: 2, startNode: 3, endNode: 610 });
    expect(ctx.members[2]).toEqual({ id: 3, startNode: 5, endNode: 807 });
  });

  it('(5) non-numeric member list is MALFORMED_LINE, skipped, never a throw', () => {
    const ctx = createContext();
    expect(() => memberIncidencesHandler(ctx, memberBlock('X 1 2'))).not.toThrow();
    expect(ctx.members).toHaveLength(0);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(6) row with no valid node pair is MALFORMED_LINE with line attribution', () => {
    const ctx = createContext();
    memberIncidencesHandler(ctx, memberBlock('1 2 X'));
    expect(ctx.members).toHaveLength(0);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(7) duplicate member id warns MALFORMED_LINE and keeps the first occurrence (T-05-02)', () => {
    const ctx = createContext();
    memberIncidencesHandler(ctx, memberBlock('1 1 2\n1 3 4'));
    expect(ctx.members).toHaveLength(1);
    expect(ctx.members[0]).toEqual({ id: 1, startNode: 1, endNode: 2 });
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(2);
  });
});
