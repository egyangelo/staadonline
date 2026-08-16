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
 * header entry + any digit continuation body lines), and 'BETA' (the row is
 * the block header entry — STAAD's axis-rotation rows land here).
 *
 * Row grammar: `MATERIAL <name> MEMB <list...>` → every member in the
 * expanded list gets `.material = name` (D-03: downstream color-by-material
 * in Phase 3 reads Member.material). `BETA <angle> MEMB <list...>` → every
 * member in the expanded list gets `.rotation = angle` in degrees (D-06: the
 * renderer orients extruded section profiles about the member axis from it).
 * The angle is a pure number — stored unmodified, never converted. Other
 * CONSTANTS rows (E / ALPHA / DAMPING / ...) are tolerated and ignored
 * silently — never fatal.
 * Malformed MATERIAL or BETA rows (non-numeric list / missing name, angle,
 * or MEMB marker) warn MALFORMED_LINE with the source line — never a throw.
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

function warnMalformed(ctx: ParseContext, tokens: readonly string[], line: number, row = 'MATERIAL'): void {
  ctx.warnings.push({
    code: WARNING_CODES.MALFORMED_LINE,
    message: `Malformed ${row} row: ${tokens.join(' ')}`,
    line,
    severity: 'warning',
  });
}

/**
 * Parse a finite numeric value (floats and negatives allowed — a BETA angle
 * is a pure degree measure, not an integer id). Mirrors `parseDimValue`
 * (steel-resolver: Number + Number.isFinite); non-finite or empty → null.
 */
function parseBetaAngle(s: string | undefined): number | null {
  if (s === undefined || s.length === 0) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return v;
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

/**
 * Apply one BETA row. `tokens` is `[BETA] <angle> MEMB <list...>` — the
 * leading BETA token is optional (present in CONSTANTS-body rows and
 * BETA-header rows alike). Members that exist in the context get
 * `.rotation = angle` (degrees, stored unmodified — D-06); dangling
 * references (ids beyond the member table) are dropped silently (tolerant).
 * Malformed rows (non-finite/missing angle, missing MEMB/MEMBER marker,
 * empty member list) push one MALFORMED_LINE warning with the source line —
 * NEVER a throw (warn-don't-throw).
 */
function applyBetaRow(ctx: ParseContext, tokens: readonly string[], line: number): void {
  let i = 0;
  if (tokens[i]?.toUpperCase() === 'BETA') i++;
  const angle = parseBetaAngle(tokens[i]);
  if (angle === null) {
    warnMalformed(ctx, tokens, line, 'BETA');
    return;
  }
  const marker = tokens[i + 1]?.toUpperCase();
  if (marker !== 'MEMB' && marker !== 'MEMBER') {
    warnMalformed(ctx, tokens, line, 'BETA');
    return;
  }

  const listTokens = tokens.slice(i + 2);
  const maxRef = maxMemberId(ctx);
  const ids = maxRef > 0 ? expandList(listTokens, { maxRef }) : expandList(listTokens);
  if (ids.length === 0) {
    warnMalformed(ctx, tokens, line, 'BETA'); // non-numeric / empty member list
    return;
  }

  const memberById = new Map(ctx.members.map((m) => [m.id, m]));
  for (const id of new Set(ids)) {
    const member = memberById.get(id);
    if (member !== undefined) member.rotation = angle;
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
    // `BETA <angle> MEMB <list>` — the row lives in the block HEADER entry
    // (uppercase-first-token segmentation), possibly extended by digit-starting
    // body lines (`-` continuation-less decks). Stores member rotation (D-06).
    const tokens = block.name.map((t) => t.text);
    for (const entry of block.bodyLines) {
      tokens.push(...entry.tokens.map((t) => t.text));
    }
    applyBetaRow(ctx, tokens, block.line);
  } else {
    // 'CONSTANTS' block: rows arrive as body lines (lowercase-starting
    // handwritten decks, or any deck where segmentation kept them in-block).
    for (const entry of block.bodyLines) {
      const tokens = entry.tokens.map((t) => t.text);
      const head = tokens[0]?.toUpperCase() ?? '';
      if (head === 'MATERIAL') {
        applyMaterialRow(ctx, tokens, entry.line);
      } else if (head === 'BETA') {
        applyBetaRow(ctx, tokens, entry.line);
      }
      // Other CONSTANTS rows (E / ALPHA / DAMPING / ...) are tolerated and
      // ignored silently — never fatal.
    }
  }
}

// Register on import (module side effect). Three keys because the real
// fixture's segmentation splits CONSTANTS rows into their own blocks —
// materials would never be stored otherwise (checker #5).
registerCommand(['CONSTANTS', 'MATERIAL', 'BETA'], constantsHandler);