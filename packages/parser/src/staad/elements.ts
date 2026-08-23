/**
 * ELEMENT INCIDENCES / ELEMENT PROPERTIES handlers (05-01, PLATE-01/PLATE-03).
 *
 * D-05-01: quads only. A clean row is `elemId j1 j2 j3 j4` — all numeric,
 * exactly five tokens. Triangles arrive as a quad with the last node
 * repeated (j4 === j3) and are stored as-is, never warned.
 *
 * Tolerance (T-05-03/T-05-04): range rows (`TO`), `_GROUP` references,
 * solids (`... SOLID`), and any non-clean form produce ONE SKIPPED_ELEMENT
 * warning per row and zero records — ranges are NEVER expanded
 * combinatorially. Duplicate element ids warn once; first record wins.
 *
 * ELEMENT PROPERTIES resolves `thickness` onto matching plates by element id
 * (D-05-04): simple per-id rows (`1 THICK 0.2`) and numeric list rows with a
 * trailing THICKNESS value (`1 TO 5 THICKNESS 0.3`) are expanded via the
 * bounded list helpers (LIST_HARD_CAP zip-bomb guard). Unresolvable forms
 * (group refs like `_RAFT THICKNESS 0.6`, missing keyword) warn
 * SKIPPED_ELEMENT once per row and change nothing.
 *
 * Headless + worker-ready: zero DOM/global access; never throws.
 */

import type { CommandBlock, ParseContext } from '../core';
import { WARNING_CODES } from '../types';
import type { Plate } from '../types';
import { expandList, listItemLength, parseListId } from './lists';
import { registerCommand } from './index';

function warnSkipped(ctx: ParseContext, line: number, message: string): void {
  ctx.warnings.push({
    code: WARNING_CODES.SKIPPED_ELEMENT,
    message,
    line,
    severity: 'warning',
  });
}

/**
 * ELEMENT INCIDENCES: each body entry is one element statement (the
 * tokenizer splits semicolon-packed rows into separate entries).
 */
export function elementIncidencesHandler(ctx: ParseContext, block: CommandBlock): void {
  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;

    // Clean quad/triangle: strictly-numeric tokens. Five tokens = elemId +
    // four joints; four tokens = elemId + three joints (true STAAD triangle,
    // e.g. HPP rows `1261 92 76 77`) — normalized to the repeated-node quad
    // contract ([j1, j2, j3, j3]).
    if (tokens.length === 5 || tokens.length === 4) {
      const nums = tokens.map((t) => (parseListId(t) === null ? null : Number(t)));
      const id = nums[0];
      if (id !== null && nums.every((n) => n !== null)) {
        const existing = ctx.elements.find((p) => p.id === id);
        if (existing !== undefined) {
          // First record wins (T-05-04); later duplicates warn once per row.
          warnSkipped(ctx, entry.line, `Duplicate element id ${id} ignored (first wins)`);
          continue;
        }
        const plate: Plate =
          tokens.length === 5
            ? { id, nodes: [nums[1]!, nums[2]!, nums[3]!, nums[4]!] }
            : { id, nodes: [nums[1]!, nums[2]!, nums[3]!, nums[3]!] };
        ctx.elements.push(plate);
        continue;
      }
    }

    // Non-clean row (ranges, _GROUP refs, solids, wrong arity): tolerant skip.
    warnSkipped(
      ctx,
      entry.line,
      `Element incidence row skipped (not a clean 4-joint quad, D-05-01): ${tokens.join(' ')}`,
    );
  }
}

/** Thickness keyword accepted in both spellings after canonicalization. */
const THICKNESS_KEYWORDS = new Set(['THICKNESS', 'THICK']);

/**
 * ELEMENT PROPERTIES: resolve thickness onto plates by element id (D-05-04).
 * Row shape: `<element-list> THICK|THICKNESS <value>`. The list supports bare
 * ids and numeric `TO` ranges (bounded expansion, LIST_HARD_CAP). Group-ref
 * or otherwise unresolvable rows warn once and change nothing.
 */
export function elementPropertiesHandler(ctx: ParseContext, block: CommandBlock): void {
  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;

    // Locate the trailing THICK(NESS) <value> pair.
    const kwIdx = tokens.findIndex((t, i) => i > 0 && THICKNESS_KEYWORDS.has(t.toUpperCase()));
    if (kwIdx <= 0 || kwIdx + 1 >= tokens.length) {
      warnSkipped(
        ctx,
        entry.line,
        `Element property row skipped (unresolvable form, D-05-04): ${tokens.join(' ')}`,
      );
      continue;
    }
    const value = Number(tokens[kwIdx + 1]);
    if (!Number.isFinite(value) || value <= 0) {
      warnSkipped(
        ctx,
        entry.line,
        `Element property row skipped (invalid thickness value): ${tokens.join(' ')}`,
      );
      continue;
    }

    // Expand the leading element list with bounded item-length scanning.
    const listTokens = tokens.slice(0, kwIdx);
    const ids: number[] = [];
    let i = 0;
    let valid = true;
    while (i < listTokens.length) {
      const len = listItemLength(listTokens, i);
      if (len === 0) {
        valid = false; // group ref / garbage token inside the list
        break;
      }
      const startVal = parseListId(listTokens[i]);
      if (startVal !== null && len >= 3 && listTokens[i + 1].toUpperCase() === 'TO') {
        ids.push(...expandList(listTokens.slice(i, i + len)));
      } else if (listTokens[i].toUpperCase() === 'ALL') {
        valid = false; // ALL has no reference here — unresolvable
        break;
      } else if (startVal !== null) {
        ids.push(startVal);
      }
      i += len;
    }

    if (!valid || ids.length === 0) {
      warnSkipped(
        ctx,
        entry.line,
        `Element property row skipped (unresolvable element list, D-05-04): ${tokens.join(' ')}`,
      );
      continue;
    }

    for (const id of ids) {
      const plate = ctx.elements.find((p) => p.id === id);
      if (plate !== undefined) plate.thickness = value;
    }
  }
}

// Register on import (module side effect). 'ELEMENT INCIDENCES' prefix-matches
// real headers like 'ELEMENT INCIDENCES SHELL' (longest-prefix dispatch);
// 'ELEMENT PROPERTIES' covers 'ELEMENT PROPERTY' via COMMAND_ALIASES.
registerCommand(['ELEMENT INCIDENCES'], elementIncidencesHandler);
registerCommand(['ELEMENT PROPERTIES'], elementPropertiesHandler);
