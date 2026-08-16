/**
 * MEMBER INCIDENCES command handler (01-05 Task 3, PARSE-01 members).
 *
 * Parses the MEMBER INCIDENCES block body into typed Member records:
 * - each entry is `member-list start-node end-node [specifiers...]` — the
 *   real HPP fixture shape is `1 1 739; 2 3 610;` (semicolon-packed entries
 *   already arrived as separate TokenizedLine entries);
 * - a row may define MULTIPLE members: STAAD accepts repeated
 *   `list i j` groups on one logical row (`3 3 1 4 1 2` = member 3: 3→1
 *   AND member 4: 1→2) — which is exactly what a `" -"` continuation merge
 *   produces (01-09 fixture continuations.std). The row splitter tries the
 *   multi-group reading FIRST (minimal lists, left-to-right); when trailing
 *   tokens cannot form a complete group it falls back to the 01-05
 *   MAXIMAL-LIST single-group reading (`5 TO 7 10 20 100 200` → members
 *   5,6,7,10,20 with pair (100, 200));
 * - the member list is expanded via `expandList` (P2 list syntax: bare ids,
 *   `TO` ranges, `BY` steps — bounded per threat T-05-01);
 * - 1-based source ids are preserved (D-04);
 * - trailing specifiers (BETA angle, ...) are tolerated, never fatal (P2).
 *
 * Tolerance (P2 / D-06): a row with no valid member list or no node pair
 * pushes a MALFORMED_LINE warning with the source line and is skipped — the
 * handler never throws.
 *
 * Security:
 * - T-05-01: member ids come from `expandList` (bounded allocation — a
 *   hostile `1 TO 999999999` can never materialize a zip-bomb member array).
 * - T-05-02: duplicate member ids are deduped via a Map — first wins, the
 *   collision warns MALFORMED_LINE (never plain-object keys).
 * - T-05-04: strict positive-integer parsing via `parseListId`.
 *
 * Headless + worker-ready: zero DOM/global access.
 */

import type { CommandBlock, ParseContext } from '../core';
import { expandList, listItemLength, parseListId } from './lists';
import { WARNING_CODES, type Member } from '../types';
import { registerCommand } from './index';

/** One `list i j` group extracted from a member row. */
interface MemberRowGroup {
  list: string[];
  startNode: number;
  endNode: number;
}

/**
 * Split a member row's tokens into one or more (member-list, node-pair)
 * groups. Two strategies, in order:
 *
 * 1. Greedy multi-group (left-to-right, MINIMAL one-item lists): consume
 *    `list-item i j` groups while every group is complete. STAAD allows
 *    repeated definitions on one logical row — the `" -"` continuation
 *    merge (`3 3 1 4 1 2` → member 3: 3→1, member 4: 1→2) is this shape.
 *    If the ENTIRE token stream is consumed → use these groups.
 * 2. Maximal-list single-group (the 01-05 documented decision for rows like
 *    `5 TO 7 10 20 100 200` → members 5,6,7,10,20 with pair (100, 200)):
 *    when strategy 1 leaves unconsumed tokens (or no complete group), the
 *    list is the maximal prefix of list items that still leaves a valid
 *    numeric node pair immediately after it.
 *
 * Returns null when neither strategy finds a valid split (malformed row).
 */
function splitMemberRow(tokens: readonly string[]): MemberRowGroup[] | null {
  // Strategy 1: greedy minimal-list multi-group (left-to-right).
  const groups: MemberRowGroup[] = [];
  let i = 0;
  let complete = true;
  while (i < tokens.length) {
    const len = listItemLength(tokens, i);
    const a = parseListId(tokens[i + len]);
    const b = parseListId(tokens[i + len + 1]);
    if (len === 0 || a === null || b === null) {
      complete = false;
      break;
    }
    groups.push({ list: tokens.slice(i, i + len), startNode: a, endNode: b });
    i += len + 2;
  }
  if (complete && groups.length > 0) return groups;

  // Strategy 2: maximal-list single-group (01-05 decision).
  let bestEnd = -1;
  let j = 0;
  while (j < tokens.length) {
    const len = listItemLength(tokens, j);
    if (len === 0) break; // list items are contiguous at the row start
    const next = j + len;
    const a = parseListId(tokens[next]);
    const b = parseListId(tokens[next + 1]);
    if (a !== null && b !== null) bestEnd = next; // valid node pair follows this item
    j = next;
  }

  if (bestEnd === -1) return null;
  const startNode = parseListId(tokens[bestEnd]);
  const endNode = parseListId(tokens[bestEnd + 1]);
  // startNode/endNode are guaranteed non-null by the scan above.
  return [
    {
      list: tokens.slice(0, bestEnd),
      startNode: startNode as number,
      endNode: endNode as number,
    },
  ];
}

export function memberIncidencesHandler(ctx: ParseContext, block: CommandBlock): void {
  // Map-based lookup: dedupe (T-05-02) + id → member access without plain
  // object keys. Seeded from ctx so prior member contributions are honored.
  const memberById = new Map(ctx.members.map((m) => [m.id, m]));

  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    const groups = splitMemberRow(tokens);

    if (groups === null) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed member row: ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    for (const row of groups) {
      // Trailing specifiers beyond each group (BETA, ...) are tolerated (P2).
      const ids = expandList(row.list);
      for (const id of ids) {
        if (memberById.has(id)) {
          ctx.warnings.push({
            code: WARNING_CODES.MALFORMED_LINE,
            message: `Duplicate member id ${id} — keeping the first occurrence`,
            line: entry.line,
            severity: 'warning',
          });
          continue;
        }
        const member: Member = { id, startNode: row.startNode, endNode: row.endNode };
        memberById.set(id, member);
        ctx.members.push(member);
      }
    }
  }
}

// Register on import (module side effect, see units.ts). The canonical key
// 'MEMBER INCIDENCES' covers abbreviated spellings (MEMB INCI, MEMBER
// INCIDENCE) because canonicalizeCommand expands P2 aliases before dispatch.
registerCommand(['MEMBER INCIDENCES'], memberIncidencesHandler);
