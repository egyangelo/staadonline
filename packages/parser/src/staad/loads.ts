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

import { WARNING_CODES, type LoadCase, type LoadCombinationTerm } from '../types';
import type { CommandBlock, ParseContext } from '../core';
import { parseListId } from './lists';
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

registerCommand(['LOAD'], loadHandler);
registerCommand(['LOAD COMB'], loadCombHandler);
registerCommand(['LOAD LIST'], loadListHandler);