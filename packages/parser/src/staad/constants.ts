/**
 * CONSTANTS command handler (01-06 Task 3) — stores MATERIAL on members.
 *
 * The real HPP fixture's CONSTANTS block (lines 835-849) is segmented by the
 * uppercase-first-token rule into its own blocks:
 *
 *   CONSTANTS                       ← block with NO body (next row is a header)
 *   BETA 90 MEMB 964 TO 975 ...     ← own block (header entry carries the row)
 *   MATERIAL CONCRETE MEMB 1 TO 12  ← own block; `-` continuations merge the
 *   165 TO 166 ...                    remaining list into the HEADER entry,
 *                                     or arrive as digit-starting body lines
 *   MATERIAL STEEL_36_KSI MEMB ...  ← own block
 *
 * The handler is therefore registered under THREE dispatch keys (checker #5):
 * 'CONSTANTS' (rows arrive as body lines), 'MATERIAL' (the row is the block
 * header entry + any digit continuation body lines), and 'BETA' (valid STAAD
 * row, ignored silently — never a warning).
 *
 * Row grammar: `MATERIAL <name> MEMB <list...>` → every member in the
 * expanded list gets `.material = name` (D-03: downstream color-by-material
 * in Phase 3 reads Member.material). BETA rows are tolerated and ignored.
 * Malformed MATERIAL rows (non-numeric list / missing name or MEMB marker)
 * warn MALFORMED_LINE with the source line — never a throw.
 *
 * Security:
 * - Member-list expansion is bounded via `expandList` (T-06-01 shared with
 *   01-05) — a hostile `MATERIAL X MEMB 1 TO 999999999` cannot zip-bomb.
 * - Member lookup is Map-based (T-06-02 — no plain-object keys).
 * - Material names are untrusted display data (threat model boundary) — they
 *   are stored as-is, never interpreted (no eval, no prototype keys).
 *
 * Headless + worker-ready: zero DOM/global access.
 */

import type { CommandBlock, ParseContext } from '../core';
import { expandList } from './lists';
import { WARNING_CODES } from '../types';
import { registerCommand } from './index';

/** Highest 1-based member id in the context (0 when no members parsed yet). */
function maxMemberId(ctx: ParseContext): number {
  let max = 0;
  for (const m of ctx.members) if (m.id > max) max = m.id;
  return max;
}

function warnMalformed(ctx: ParseContext, tokens: readonly string[], line: number): void {
  ctx.warnings.push({
    code: WARNING_CODES.MALFORMED_LINE,
    message: `Malformed MATERIAL row: ${tokens.join(' ')}`,
    line,
    severity: 'warning',
  });
}

/**
 * Apply one MATERIAL row. `tokens` is `[MATERIAL] <name> MEMB <list...>` —
 * the leading MATERIAL token is optional (present in CONSTANTS-body rows and
 * MATERIAL-header rows alike). Members that exist in the context get
 * `.material = name`; dangling references (ids beyond the member table) are
 * dropped silently (tolerant, P2).
 */
function applyMaterialRow(ctx: ParseContext, tokens: readonly string[], line: number): void {
  let i = 0;
  if (tokens[i]?.toUpperCase() === 'MATERIAL') i++;
  const name = tokens[i];
  const marker = tokens[i + 1]?.toUpperCase();
  if (name === undefined || (marker !== 'MEMB' && marker !== 'MEMBER')) {
    warnMalformed(ctx, tokens, line);
    return;
  }

  const listTokens = tokens.slice(i + 2);
  const maxRef = maxMemberId(ctx);
  const ids = maxRef > 0 ? expandList(listTokens, { maxRef }) : expandList(listTokens);
  if (ids.length === 0) {
    warnMalformed(ctx, tokens, line); // non-numeric / empty member list
    return;
  }

  const memberById = new Map(ctx.members.map((m) => [m.id, m]));
  for (const id of new Set(ids)) {
    const member = memberById.get(id);
    if (member !== undefined) member.material = name;
  }
}

export function constantsHandler(ctx: ParseContext, block: CommandBlock): void {
  const first = block.name[0]?.text.toUpperCase() ?? '';
  if (first === 'MATERIAL') {
    // The row lives in the block HEADER entry (real fixture shape — `-`
    // continuations merged it there), possibly extended by digit-starting
    // body lines (files without `-` continuations).
    const tokens = block.name.map((t) => t.text);
    for (const entry of block.bodyLines) {
      tokens.push(...entry.tokens.map((t) => t.text));
    }
    applyMaterialRow(ctx, tokens, block.line);
  } else if (first === 'BETA') {
    // `BETA <angle> MEMB <list>` — valid STAAD, no material. Tolerated and
    // ignored WITHOUT a warning (it is not an unknown command).
  } else {
    // 'CONSTANTS' block: rows arrive as body lines (lowercase-starting
    // handwritten decks, or any deck where segmentation kept them in-block).
    for (const entry of block.bodyLines) {
      const tokens = entry.tokens.map((t) => t.text);
      const head = tokens[0]?.toUpperCase() ?? '';
      if (head === 'MATERIAL') {
        applyMaterialRow(ctx, tokens, entry.line);
      }
      // BETA and other CONSTANTS rows (E / ALPHA / DAMPING / ...) are
      // tolerated and ignored silently — never fatal.
    }
  }
}

// Register on import (module side effect). Three keys because the real
// fixture's segmentation splits CONSTANTS rows into their own blocks —
// materials would never be stored otherwise (checker #5).
registerCommand(['CONSTANTS', 'MATERIAL', 'BETA'], constantsHandler);