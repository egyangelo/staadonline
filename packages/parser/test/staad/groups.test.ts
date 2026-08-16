/**
 * START/END GROUP DEFINITION handler tests (01-07 Task 2, TDD RED).
 *
 * Behavior contract (plan + D-07 + threat T-07-04/05 + member-property's
 * named-section linking contract in core.ts):
 * - The START GROUP DEFINITION block body is a sequence of section headers
 *   (JOINT / ELEMENT / MEMBER) followed by group rows of the form
 *   `_NAME <list>` where the list expands via `expandList`.
 * - Groups are stored in ctx.groups (Map) keyed by their `_NAME`, each with
 *   memberIds / jointIds / elementIds arrays (types.ts Group). The section
 *   header decides which array the row populates:
 *   - MEMBER section rows → memberIds (e.g. `_COLS 1 TO 12 49 TO 57`)
 *   - JOINT section rows → jointIds (e.g. `_F7 303`)
 *   - ELEMENT section rows → elementIds + a SKIPPED_ELEMENT warning per row
 *     (D-07 — ELEMENT groups reference plates/elements out of phase scope;
 *     the group is still recorded so downstream MEMBER/PLATE linking and the
 *     mini-deck integration never see an UNRESOLVED_SECTION).
 * - `-` continuation lines have already been merged by the tokenizer, so a
 *   multi-line `_NAME` row arrives as one entry (regression guard).
 * - Unknown section keywords are tolerated (skipped, no crash) — real-world
 *   decks vary; P2 tolerance (T-07-05).
 * - Rows without a `_NAME` (no leading underscore token) are malformed →
 *   MALFORMED_LINE warning, skipped (T-07-04: warnings, never a throw).
 * - Group names preserve the underscore exactly as written (D-04 source
 *   fidelity — member-property links groups by exact `_NAME` key).
 * - END GROUP DEFINITION is consumed by the START scope in segmentBlocks
 *   (core.ts) and never dispatched; endGroupsHandler is registered as a
 *   defensive no-op under 'END GROUP DEFINITION'.
 * - Warning line attribution follows D-06 (1-based source line).
 *
 * Security (T-07-04/05): lists expand through bounded `expandList`; a
 * hostile `_X 1 TO 999999999` can never zip-bomb (LIST_HARD_CAP).
 */
import { describe, expect, it } from 'vitest';
import { startGroupsHandler } from '../../src/staad/groups';
import { createContext } from '../../src/core';
import { tokenize } from '../../src/tokenizer';
import { WARNING_CODES } from '../../src/types';
import type { CommandBlock, ParseContext } from '../../src/core';

/** Build a START GROUP DEFINITION block whose body is the tokenized `deck`. */
function groupsBlock(deck: string): CommandBlock {
  return {
    name: [
      { text: 'START', quoted: false },
      { text: 'GROUP', quoted: false },
      { text: 'DEFINITION', quoted: false },
    ],
    bodyLines: tokenize(deck),
    line: 1,
  };
}

describe('GROUP DEFINITION handler (01-07 Task 2)', () => {
  it('(1) MEMBER section: `_COLS 1 TO 12 49 TO 57` → Group with memberIds', () => {
    const ctx = createContext();
    startGroupsHandler(
      ctx,
      groupsBlock('MEMBER\n_COLS 1 TO 12 49 TO 57'),
    );
    const group = ctx.groups.get('_COLS');
    expect(group).toBeDefined();
    expect(group!.memberIds).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 49, 50, 51, 52, 53, 54, 55, 56, 57,
    ]);
    expect(group!.jointIds).toEqual([]);
    expect(group!.elementIds).toEqual([]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(2) JOINT section: `_F7 303` → Group with jointIds', () => {
    const ctx = createContext();
    startGroupsHandler(ctx, groupsBlock('JOINT\n_F7 303'));
    const group = ctx.groups.get('_F7');
    expect(group).toBeDefined();
    expect(group!.jointIds).toEqual([303]);
    expect(group!.memberIds).toEqual([]);
    expect(group!.elementIds).toEqual([]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(3) ELEMENT section: `_RAFT 132 TO 162 211` → elementIds + SKIPPED_ELEMENT (D-07)', () => {
    const ctx = createContext();
    startGroupsHandler(ctx, groupsBlock('ELEMENT\n_RAFT 132 TO 162 211'));
    const group = ctx.groups.get('_RAFT');
    expect(group).toBeDefined();
    expect(group!.elementIds).toEqual([...Array.from({ length: 31 }, (_, k) => 132 + k), 211]);
    expect(group!.memberIds).toEqual([]);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.SKIPPED_ELEMENT);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(4) `-` continuation lines are merged by the tokenizer into one row', () => {
    const ctx = createContext();
    startGroupsHandler(
      ctx,
      groupsBlock('MEMBER\n_COLS 1 TO 5\n- 49 TO 51'),
    );
    const group = ctx.groups.get('_COLS');
    expect(group).toBeDefined();
    expect(group!.memberIds).toEqual([1, 2, 3, 4, 5, 49, 50, 51]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(5) unknown section keyword is tolerated — skipped, no crash (T-07-05)', () => {
    const ctx = createContext();
    expect(() =>
      startGroupsHandler(ctx, groupsBlock('MEMBER\n_COLS 1 TO 3\nFANCY SECTION\n_F9 7')),
    ).not.toThrow();
    expect(ctx.groups.has('_COLS')).toBe(true);
    expect(ctx.groups.has('_F9')).toBe(true);
    expect(ctx.groups.get('_F9')!.memberIds).toEqual([7]);
    expect(ctx.warnings).toEqual([]);
  });

  it('(6) row without a `_NAME` → MALFORMED_LINE warning, skipped (T-07-04)', () => {
    const ctx = createContext();
    startGroupsHandler(ctx, groupsBlock('MEMBER\n1 TO 3'));
    expect(ctx.groups.size).toBe(0);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(7) group name keeps its exact underscore spelling (D-04 source fidelity)', () => {
    const ctx = createContext();
    startGroupsHandler(ctx, groupsBlock('MEMBER\n_GROUP_1 1 TO 2'));
    const group = ctx.groups.get('_GROUP_1');
    expect(group).toBeDefined();
    expect(group!.memberIds).toEqual([1, 2]);
    // member-property links by exact key: '_GROUP_1' must be the stored name.
    expect([...ctx.groups.keys()]).toEqual(['_GROUP_1']);
  });

  it('(8) multiple sections in one block populate distinct groups', () => {
    const ctx = createContext();
    startGroupsHandler(
      ctx,
      groupsBlock(
        'JOINT\n_F7 303\n_F8 308\nMEMBER\n_COLS 1 TO 12 49 TO 57\nELEMENT\n_RAFT 132 TO 162 211',
      ),
    );
    expect(ctx.groups.size).toBe(4);
    expect(ctx.groups.get('_F7')!.jointIds).toEqual([303]);
    expect(ctx.groups.get('_F8')!.jointIds).toEqual([308]);
    expect(ctx.groups.get('_COLS')!.memberIds).toHaveLength(20);
    expect(ctx.groups.get('_RAFT')!.elementIds).toHaveLength(32);
    // Only the ELEMENT row warns (D-07).
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.SKIPPED_ELEMENT);
  });
});