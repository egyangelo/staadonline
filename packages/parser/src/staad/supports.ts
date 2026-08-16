/**
 * SUPPORTS command handler (01-07 Task 1, PARSE-01 supports half).
 *
 * Parses the SUPPORTS block body into typed Support records:
 * - each entry is `<joint-list> <restraint>` — the LEADING tokens are a joint
 *   list referencing JOINT/node numbers (D-04 1-based source ids) expanded
 *   via `expandList` (bounded, T-07-01); the trailing tokens define the
 *   restraint.
 * - restraint kinds (STAAD.Pro Technical Reference):
 *   - PINNED — translations fixed, rotations released:
 *     releases { FX:false, FY:false, FZ:false, MX:true, MY:true, MZ:true }
 *     (types.ts: true = released).
 *   - FIXED — all six DOFs restrained (releases all false).
 *   - FIXED BUT <dofs> — all fixed EXCEPT the listed DOFs, which are
 *     RELEASED (true in the releases set). The plan's literal test
 *     expectation `{FY:false, MZ:false}` contradicts both the type contract
 *     and the plan's own action text ("all fixed except listed releases");
 *     the type contract wins (see 01-07-SUMMARY deviation #1).
 *   - ENFORCED — enforced-displacement support (all six DOFs restrained,
 *     type marker distinguishes it from FIXED).
 *   - SPRING — elastic support; the stiffness spec after the SPRING keyword
 *     is recorded verbatim in Support.note (Rule 2 addition — the D-03
 *     shape had no note field and the plan requires "record type + note").
 *   - any other keyword → MALFORMED_LINE warning, row skipped.
 * - plate support rows (a group-name reference + PLATE marker, e.g.
 *   `_RAFT PLATE MAT DIRECT Y SUBGRADE 15000 COMPRESSION`) are SKIPPED with
 *   a SKIPPED_ELEMENT warning per D-07 (plates out of phase scope) — no
 *   Support record, never a throw.
 * - rows with no usable joint list (`X PINNED`) warn MALFORMED_LINE and are
 *   skipped.
 * - DANGLING joint refs (an expanded joint id with no Node record) are
 *   STORED anyway (tolerant) plus a MALFORMED_LINE warning — the plan's
 *   chosen option ("store + MALFORMED_LINE warning"), T-07-03.
 *
 * Security:
 * - T-07-01: joint-list expansion goes through `expandList` (bounded —
 *   a hostile `1 TO 999999999` can never zip-bomb the model).
 * - T-07-02: joint lookup is Map-based (no plain-object keys).
 * - T-07-03: never throws on dangling refs or malformed rows — warnings only.
 *
 * Headless + worker-ready: zero DOM/global access.
 */

import type { CommandBlock, ParseContext } from '../core';
import { expandList, parseListId } from './lists';
import { WARNING_CODES, type Support, type SupportReleases, type SupportType } from '../types';
import { registerCommand } from './index';

/** A support restraint spec parsed from the row's trailing tokens. */
interface RestraintSpec {
  type: SupportType;
  releases: SupportReleases;
  /** Stiffness text for SPRING rows (verbatim, e.g. 'FX 1000'). */
  note?: string;
}

/** True when the token participates in a joint LIST (ids / ALL / TO / BY). */
function isListToken(s: string): boolean {
  const up = s.toUpperCase();
  if (up === 'ALL' || up === 'TO' || up === 'BY') return true;
  return parseListId(s) !== null;
}

/** Six DOF names accepted after FIXED BUT (case-insensitive). */
const DOF_NAMES = new Set(['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ']);

/** All-false releases (every DOF restrained) — FIXED / ENFORCED base. */
function allRestrained(): SupportReleases {
  return { FX: false, FY: false, FZ: false, MX: false, MY: false, MZ: false };
}

/** PINNED: translations fixed, rotations released (types.ts: true = released). */
function pinnedReleases(): SupportReleases {
  return { FX: false, FY: false, FZ: false, MX: true, MY: true, MZ: true };
}

/**
 * Parse the restraint tokens (everything after the joint list) into a
 * RestraintSpec. Returns null for an unknown restraint keyword — the caller
 * warns MALFORMED_LINE.
 */
function parseRestraint(tokens: readonly string[]): RestraintSpec | null {
  const kw = tokens[0]?.toUpperCase() ?? '';
  switch (kw) {
    case 'PINNED':
      return { type: 'PINNED', releases: pinnedReleases() };
    case 'FIXED': {
      // `FIXED BUT <dofs>`: all fixed except the listed DOFs, which are
      // RELEASED (true). Anything after BUT that is not a DOF name is
      // tolerated and ignored (P2 — non-fatal specifiers).
      if (tokens[1]?.toUpperCase() === 'BUT') {
        const releases = allRestrained();
        for (const t of tokens.slice(2)) {
          const dof = t.toUpperCase();
          if (DOF_NAMES.has(dof)) releases[dof as keyof SupportReleases] = true;
        }
        return { type: 'FIXED_BUT', releases };
      }
      return { type: 'FIXED', releases: allRestrained() };
    }
    case 'ENFORCED':
      return { type: 'ENFORCED', releases: allRestrained() };
    case 'SPRING': {
      // `SPRING <stiffness spec...>` — the elastic stiffness is recorded
      // verbatim (note); every DOF is considered restrained by the spring.
      return { type: 'SPRING', releases: allRestrained(), note: tokens.slice(1).join(' ') };
    }
    default:
      return null;
  }
}

export function supportsHandler(ctx: ParseContext, block: CommandBlock): void {
  // Map-based lookup: joint id → node without plain-object keys (T-07-02).
  const nodeById = new Map(ctx.nodes.map((n) => [n.id, n]));

  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;

    // Plate support row (group-name reference + PLATE marker) → SKIPPED
    // per D-07; plates are out of phase scope. Never a throw.
    if (tokens.some((t) => t.toUpperCase() === 'PLATE')) {
      ctx.warnings.push({
        code: WARNING_CODES.SKIPPED_ELEMENT,
        message: `Plate support skipped (plates out of scope, D-07): ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    // Split the row at the first non-list token: leading tokens are the
    // joint list, trailing tokens are the restraint spec.
    let i = 0;
    while (i < tokens.length && isListToken(tokens[i])) i++;
    const listTokens = tokens.slice(0, i);
    const restraintTokens = tokens.slice(i);

    const spec = parseRestraint(restraintTokens);
    if (spec === null) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed SUPPORTS row (bad restraint): ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    const ids = expandList(listTokens); // bounded (T-07-01)
    if (ids.length === 0) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed SUPPORTS row (no joint list): ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    // Dangling joint refs: store anyway (tolerant) + warn once per row
    // (T-07-03 chosen option — "store + MALFORMED_LINE warning").
    const dangling = ids.filter((id) => !nodeById.has(id));
    if (dangling.length > 0) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Support references joint(s) with no Node record: ${dangling.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
    }

    for (const id of ids) {
      const support: Support = {
        nodeId: id,
        type: spec.type,
        releases: spec.releases,
        line: entry.line,
      };
      if (spec.note !== undefined) support.note = spec.note;
      ctx.supports.push(support);
    }
  }
}

// Register on import (module side effect, see units.ts). 'SUPPORTS' is the
// canonical key — COMMAND_ALIASES has no alias for it, and the block header
// is a single token, so dispatch is exact.
registerCommand(['SUPPORTS'], supportsHandler);