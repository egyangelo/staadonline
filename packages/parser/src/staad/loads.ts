/**
 * LOAD / LOAD COMB header handlers (01-08 Task 1, PARSE-01/PARSE-03).
 *
 * Segmentation reality (verified against staadSample/HPP_Main_Building_2.std):
 * the load-case header IS the block's header entry — `LOAD 1 LOADTYPE Dead
 * TITLE D` has an EMPTY body in real files; the item commands (SELFWEIGHT /
 * MEMBER LOAD / JOINT LOAD / ELEMENT LOAD) arrive as SEPARATE uppercase
 * blocks and are handled in Task 2. A block's name tokens are therefore the
 * only input these handlers need.
 *
 * LOAD <id> [LOADTYPE <type...>] [TITLE <rest...>]
 *   - id: strictly-positive integer (parseListId, D-04). Non-numeric ids
 *     (`LOAD R1 ...` — the DEFINE REFERENCE LOADS idiom) warn MALFORMED_LINE
 *     and skip the case (T-08-01: never fabricate a case from a bad id).
 *   - loadtype: multi-token aware (`LOADTYPE Roof Live` → 'Roof Live'); the
 *     type runs until a `TITLE` token or the end of the header.
 *   - title: remainder of the header, verbatim (`H (H)` stays 'H (H)').
 *   - kind 'PRIMARY'; forceUnit snapshot from ctx.units (PITFALLS P1 display).
 *   - Sets ctx.currentLoadCase so item handlers can attach LoadItems.
 *
 * LOAD COMB <id> [COMB] <terms...>
 *   - kind 'COMBINATION'; terms parsed per the GUI's emitted syntax where
 *     `+`/`-` are term SEPARATORS, not factor signs (`- 1 DL + 1 H` →
 *     [{1,'DL'},{1,'H'}]); a genuinely negative factor is a negative NUMBER
 *     token. Factors must be finite Numbers (T-08-02 strict parse, no NaN).
 *     References resolve to a numeric id when the token is a valid integer,
 *     else the case NAME string (the GUI emits names — DL/H/W/LL — since the
 *     combo ids differ from case ids). Unknown tokens (`(1)` envelope
 *     suffixes, `ENV`) are tolerated and skipped (P2 tolerance).
 *   - Tolerates combos WITHOUT the literal `COMB` keyword (`LOAD COMB 100
 *     - 1 DL`) — the keyword is optional per P2 version drift.
 *
 * LOAD LIST <...>
 *   - Envelope directive (`LOAD LIST ENV 1 2`): no case is created. Registered
 *     as its own key so the block is not misread as a LOAD case, plus a
 *     defensive tokens[1]==='LIST' check in loadHandler.
 *
 * Security: list-free header parsing — no unbounded allocation; all numeric
 * parsing is strict finite (T-05-04 / T-08-02). No throw paths.
 */

import {
  WARNING_CODES,
  type LoadAxis,
  type LoadAxisRef,
  type LoadCase,
  type LoadCombinationTerm,
} from '../types';
import type { CommandBlock, ParseContext } from '../core';
import { expandList, listItemLength, parseListId } from './lists';
import { registerCommand } from './index';

function warnMalformed(ctx: ParseContext, tokens: readonly string[], line: number): void {
  ctx.warnings.push({
    code: WARNING_CODES.MALFORMED_LINE,
    message: `Malformed load header: ${tokens.join(' ')}`,
    line,
    severity: 'warning',
  });
}

/**
 * LOAD <id> [LOADTYPE <type...>] [TITLE <rest...>] → PRIMARY LoadCase.
 * The header entry's own tokens are the whole input (body ignored — real
 * LOAD blocks have empty bodies; member/joint rows live in their own blocks).
 */
export function loadHandler(ctx: ParseContext, block: CommandBlock): void {
  const tokens = block.name.map((t) => t.text);

  // `LOAD LIST <...>` → envelope directive, silently skipped (also registered
  // as its own key; belt-and-suspenders for blocks dispatched via 'LOAD').
  if (tokens[1]?.toUpperCase() === 'LIST') return;

  const id = parseListId(tokens[1]);
  if (id === null) {
    warnMalformed(ctx, tokens, block.line);
    return;
  }

  const lc: LoadCase = { id, title: '', items: [], kind: 'PRIMARY' };

  let i = 2;
  while (i < tokens.length) {
    const tok = tokens[i].toUpperCase();
    if (tok === 'LOADTYPE') {
      // Multi-token loadtype ('Roof Live') runs until TITLE / end of header.
      const parts: string[] = [];
      let j = i + 1;
      while (j < tokens.length && tokens[j].toUpperCase() !== 'TITLE') {
        parts.push(tokens[j]);
        j++;
      }
      if (parts.length > 0) lc.loadtype = parts.join(' ');
      i = j;
    } else if (tok === 'TITLE') {
      lc.title = tokens.slice(i + 1).join(' ');
      break;
    } else {
      i++; // unknown keyword → tolerated, skipped (P2)
    }
  }

  lc.forceUnit = ctx.units.force;
  ctx.loadCases.push(lc);
  ctx.currentLoadCase = lc;
}

/**
 * Parse LOAD COMB factor terms from `tokens[start..]`. Never throws; unknown
 * tokens are skipped (P2 tolerance); a finite-number token must be followed by
 * a reference token, else parsing stops (malformed trailing — caller warned).
 */
function parseCombinationTerms(tokens: readonly string[], start: number): LoadCombinationTerm[] {
  const terms: LoadCombinationTerm[] = [];
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === '+' || tok === '-') {
      // GUI term separator — NOT a factor sign (see header doc comment).
      i++;
      continue;
    }
    const factor = Number(tok);
    if (Number.isFinite(factor)) {
      const refTok = tokens[i + 1];
      if (refTok !== undefined && refTok !== '+' && refTok !== '-') {
        const numericRef = parseListId(refTok);
        terms.push({ factor, ref: numericRef !== null ? numericRef : refTok });
        i += 2;
        continue;
      }
      break; // factor with no reference → malformed trailing tokens
    }
    i++; // unknown token ((1) envelope suffix, ENV, ...) → tolerated
  }
  return terms;
}

/** LOAD COMB <id> [COMB] <terms...> → COMBINATION LoadCase with factor terms. */
export function loadCombHandler(ctx: ParseContext, block: CommandBlock): void {
  const tokens = block.name.map((t) => t.text);

  const id = parseListId(tokens[2]);
  if (id === null) {
    warnMalformed(ctx, tokens, block.line);
    return;
  }

  // Optional 'COMB' keyword (P2 version drift): skip it when present.
  const start = tokens[3]?.toUpperCase() === 'COMB' ? 4 : 3;

  const lc: LoadCase = {
    id,
    title: '',
    items: [],
    kind: 'COMBINATION',
    terms: parseCombinationTerms(tokens, start),
  };
  lc.forceUnit = ctx.units.force;
  ctx.loadCases.push(lc);
  ctx.currentLoadCase = lc;
}

/** LOAD LIST <...> → envelope directive; intentionally a no-op (no case). */
export function loadListHandler(_ctx: ParseContext, _block: CommandBlock): void {
  /* silent — LOAD LIST ENV 1 2 selects the envelope, creates no load case */
}

/* ------------------------------------------------------------------ *
 * Item handlers (01-08 Task 2).                                      *
 *                                                                    *
 * In real STAAD.Pro files these commands arrive as SEPARATE blocks    *
 * whose header is a single merged entry (continuations folded in by   *
 * the tokenizer — e.g. the SELFWEIGHT LIST spans multiple physical    *
 * lines). Handlers read the block header for SELFWEIGHT and the body  *
 * rows for MEMBER/JOINT/ELEMENT LOAD.                                *
 *                                                                    *
 * All rows are validated (never throw, T-08-01): missing/invalid      *
 * direction or non-finite magnitude → MALFORMED_LINE (T-08-02 strict  *
 * Number). Rows outside a load case warn MALFORMED_LINE and are       *
 * skipped — no implicit id-0 case is fabricated.                     *
 * ------------------------------------------------------------------ */

/** Highest 1-based member id in the context (0 when none parsed yet). */
function maxMemberId(ctx: ParseContext): number {
  let max = 0;
  for (const m of ctx.members) if (m.id > max) max = m.id;
  return max;
}

/** Highest 1-based joint id in the context (0 when none parsed yet). */
function maxJointId(ctx: ParseContext): number {
  let max = 0;
  for (const n of ctx.nodes) if (n.id > max) max = n.id;
  return max;
}

/**
 * Resolve the axis of a STAAD direction token ('Y', 'GY', 'FX', 'MX', ...)
 * — the axis letter is the token's LAST character. Null when no axis.
 */
function parseAxisToken(s: string | undefined): LoadAxis | null {
  if (s === undefined || s.length === 0) return null;
  const ch = s[s.length - 1].toUpperCase();
  return ch === 'X' || ch === 'Y' || ch === 'Z' ? ch : null;
}

/**
 * MEMBER LOAD direction: bare single-letter dirs (Y/X/Z) are member LOCAL
 * axes; prefixed dirs (GY/GX/GZ, MX/MY/MZ) are GLOBAL (PITFALLS UX).
 */
function parseDir(s: string | undefined): { axis: LoadAxis; axisRef: LoadAxisRef } | null {
  if (s === undefined || s.length === 0) return null;
  const up = s.toUpperCase();
  const ch = up[up.length - 1];
  if (ch !== 'X' && ch !== 'Y' && ch !== 'Z') return null;
  return up.length === 1
    ? { axis: ch, axisRef: 'LOCAL' }
    : { axis: ch, axisRef: 'GLOBAL' };
}

/**
 * SELFWEIGHT <axis> <factor> [LIST <list>] → SELFWEIGHT item on the current
 * case. The full row (including continuation-folded LIST) lives in the block
 * header. No LIST marker → targets [] (implicit ALL — selfweight applies to
 * the whole structure). axisRef always GLOBAL (gravity).
 */
export function selfweightHandler(ctx: ParseContext, block: CommandBlock): void {
  const tokens = block.name.map((t) => t.text);

  const axis = parseAxisToken(tokens[1]);
  const factor = Number(tokens[2]);
  if (axis === null || !Number.isFinite(factor)) {
    warnMalformed(ctx, tokens, block.line);
    return;
  }
  if (ctx.currentLoadCase === undefined) {
    warnMalformed(ctx, tokens, block.line);
    return;
  }

  let targets: number[] = [];
  const listIdx = tokens.findIndex((t) => t.toUpperCase() === 'LIST');
  if (listIdx >= 0) {
    const maxRef = maxMemberId(ctx);
    targets = expandList(tokens.slice(listIdx + 1), maxRef > 0 ? { maxRef } : {});
  }

  ctx.currentLoadCase.items.push({
    kind: 'SELFWEIGHT',
    axis,
    axisRef: 'GLOBAL',
    magnitude: factor,
    targets,
    line: block.line,
  });
}

/**
 * MEMBER LOAD <list> <type> <dir> <mag> rows → MEMBER_LOAD items. Maximal
 * member-list scan (listItemLength) finds where the list ends; the next three
 * tokens are type (informational in Phase 1, D-05), direction, magnitude.
 * Empty lists (implicit ALL) are allowed → targets [].
 */
export function memberLoadHandler(ctx: ParseContext, block: CommandBlock): void {
  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;

    let i = 0;
    let len = listItemLength(tokens, i);
    while (len > 0 && i < tokens.length) {
      i += len;
      len = listItemLength(tokens, i);
    }
    const listTokens = tokens.slice(0, i);

    const type = tokens[i]?.toUpperCase();
    const dir = parseDir(tokens[i + 1]);
    const mag = Number(tokens[i + 2]);
    if (type === undefined || dir === null || !Number.isFinite(mag)) {
      warnMalformed(ctx, tokens, entry.line);
      continue;
    }
    if (ctx.currentLoadCase === undefined) {
      warnMalformed(ctx, tokens, entry.line);
      continue;
    }

    const maxRef = maxMemberId(ctx);
    ctx.currentLoadCase.items.push({
      kind: 'MEMBER_LOAD',
      axis: dir.axis,
      axisRef: dir.axisRef,
      magnitude: mag,
      targets: expandList(listTokens, maxRef > 0 ? { maxRef } : {}),
      line: entry.line,
    });
  }
}

/**
 * JOINT LOAD <joints> <dir> <mag> rows → JOINT_LOAD items. Direction is a
 * force/moment token (FX/FY/FZ/MX/MY/MZ); axisRef always GLOBAL (joints have
 * no local axes in STAAD). A row with no joint list at all is malformed.
 */
export function jointLoadHandler(ctx: ParseContext, block: CommandBlock): void {
  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;

    let i = 0;
    let len = listItemLength(tokens, i);
    while (len > 0 && i < tokens.length) {
      i += len;
      len = listItemLength(tokens, i);
    }
    const listTokens = tokens.slice(0, i);

    const axis = parseAxisToken(tokens[i]);
    const mag = Number(tokens[i + 1]);
    if (i === 0 || axis === null || !Number.isFinite(mag)) {
      warnMalformed(ctx, tokens, entry.line);
      continue;
    }
    if (ctx.currentLoadCase === undefined) {
      warnMalformed(ctx, tokens, entry.line);
      continue;
    }

    const maxRef = maxJointId(ctx);
    ctx.currentLoadCase.items.push({
      kind: 'JOINT_LOAD',
      axis,
      axisRef: 'GLOBAL',
      magnitude: mag,
      targets: expandList(listTokens, maxRef > 0 ? { maxRef } : {}),
      line: entry.line,
    });
  }
}

/**
 * ELEMENT LOAD rows → SKIPPED_ELEMENT per row (plates out of scope, D-07).
 * No items are attached and no current case is required.
 */
export function elementLoadHandler(ctx: ParseContext, block: CommandBlock): void {
  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;
    ctx.warnings.push({
      code: WARNING_CODES.SKIPPED_ELEMENT,
      message: `Element load skipped (plates out of scope, D-07): ${tokens.join(' ')}`,
      line: entry.line,
      severity: 'warning',
    });
  }
}

registerCommand(['LOAD'], loadHandler);
registerCommand(['LOAD COMB'], loadCombHandler);
registerCommand(['LOAD LIST'], loadListHandler);
registerCommand(['SELFWEIGHT'], selfweightHandler);
registerCommand(['MEMBER LOAD'], memberLoadHandler);
registerCommand(['JOINT LOAD'], jointLoadHandler);
registerCommand(['ELEMENT LOAD'], elementLoadHandler);