/**
 * MEMBER INCIDENCES command handler (01-05 Task 3, PARSE-01 members).
 *
 * Parses the MEMBER INCIDENCES block body into typed Member records:
 * - each entry is `member-list start-node end-node [specifiers...]` — the
 *   real HPP fixture shape is `1 1 739; 2 3 610;` (semicolon-packed entries
 *   already arrived as separate TokenizedLine entries);
 * - the member list is expanded via `expandList` (P2 list syntax: bare ids,
 *   `TO` ranges, `BY` steps — bounded per threat T-05-01);
 * - the node pair is the pair of numeric tokens immediately after the
 *   MAXIMAL member list: for `5 TO 7 10 20 100 200` the list is
 *   `5 TO 7 10 20` (→ members 5,6,7,10,20) and the pair is (100, 200);
 *   for `3 5 6 BETA 90` the maximal list is just `3` and the pair is (5, 6);
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

/**
 * Split a member row's tokens into { member-list slice, startNode, endNode }.
 *
 * The list is the maximal prefix of list items (scanned via `listItemLength`)
 * that still leaves a valid numeric node pair immediately after it. Returns
 * null when no such split exists (malformed row).
 */
function splitMemberRow(
  tokens: readonly string[],
): { list: string[]; startNode: number; endNode: number } | null {
  let bestEnd = -1;

  let i = 0;
  while (i < tokens.length) {
    const len = listItemLength(tokens, i);
    if (len === 0) break; // list items are contiguous at the row start
    const next = i + len;
    const a = parseListId(tokens[next]);
    const b = parseListId(tokens[next + 1]);
    if (a !== null && b !== null) bestEnd = next; // valid node pair follows this item
    i = next;
  }

  if (bestEnd === -1) return null;
  const startNode = parseListId(tokens[bestEnd]);
  const endNode = parseListId(tokens[bestEnd + 1]);
  // startNode/endNode are guaranteed non-null by the scan above.
  return { list: tokens.slice(0, bestEnd), startNode: startNode as number, endNode: endNode as number };
}

export function memberIncidencesHandler(ctx: ParseContext, block: CommandBlock): void {
  // Map-based lookup: dedupe (T-05-02) + id → member access without plain
  // object keys. Seeded from ctx so prior member contributions are honored.
  const memberById = new Map(ctx.members.map((m) => [m.id, m]));

  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    const row = splitMemberRow(tokens);

    if (row === null) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed member row: ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    // Trailing tokens beyond startNode/endNode (BETA, ...) are tolerated (P2).
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

// Register on import (module side effect, see units.ts). The canonical key
// 'MEMBER INCIDENCES' covers abbreviated spellings (MEMB INCI, MEMBER
// INCIDENCE) because canonicalizeCommand expands P2 aliases before dispatch.
registerCommand(['MEMBER INCIDENCES'], memberIncidencesHandler);
