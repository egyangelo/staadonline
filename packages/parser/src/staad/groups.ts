/**
 * START/END GROUP DEFINITION command handler (01-07 Task 2, PARSE-01 groups
 * half; feeds member-property's named-section linking in core.ts finalize).
 *
 * Parses the START GROUP DEFINITION block body into typed Group records:
 * - the body is a sequence of section headers (JOINT / ELEMENT / MEMBER)
 *   followed by group rows of the form `_NAME <list>`; the current section
 *   decides which array the row populates (memberIds / jointIds /
 *   elementIds — types.ts Group).
 * - group names keep the exact `_NAME` spelling (D-04 source fidelity):
 *   member-property links members to `ctx.namedSections` by the exact key,
 *   and core.ts finalize links group.memberIds to members by `_NAME`
 *   (sectionKey).
 * - lists expand via `expandList` (bounded — T-07-04: a hostile
 *   `_X 1 TO 999999999` can never zip-bomb, LIST_HARD_CAP).
 * - ELEMENT section rows are recorded (elementIds) AND warned with
 *   SKIPPED_ELEMENT per D-07 — plates/elements are out of phase scope, but
 *   the group must exist so downstream resolution never reports
 *   UNRESOLVED_SECTION for a legitimately-defined group.
 * - `-` continuation lines are already merged into one entry by the
 *   tokenizer; nothing to do here (regression-covered by tests).
 * - unknown section keywords are tolerated and skipped (T-07-05): real
 *   decks vary, P2 non-fatal.
 * - rows without a leading `_NAME` token are malformed → MALFORMED_LINE
 *   warning, skipped (T-07-04).
 * - END GROUP DEFINITION: consumed by the START scope in segmentBlocks
 *   (core.ts — the END entry never reaches dispatch). endGroupsHandler is a
 *   defensive no-op registered under 'END GROUP DEFINITION' so an un-scoped
 *   deck cannot crash (T-07-05).
 *
 * Security: never throws (T-07-04/05); Map containers only; bounded lists.
 *
 * Headless + worker-ready: zero DOM/global access.
 */

import type { CommandBlock, ParseContext } from '../core';
import { expandList, parseListId } from './lists';
import { WARNING_CODES } from '../types';
import { registerCommand } from './index';

/** Section keywords that switch the current group section. */
type GroupSection = 'JOINT' | 'ELEMENT' | 'MEMBER';

const SECTION_KEYWORDS = new Set<GroupSection>(['JOINT', 'ELEMENT', 'MEMBER']);

export function startGroupsHandler(ctx: ParseContext, block: CommandBlock): void {
  let section: GroupSection = 'MEMBER'; // STAAD default: groups are member groups
  let current: { name: string; line: number } | null = null;

  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;

    // Section header switch (single uppercase keyword).
    const up0 = tokens[0].toUpperCase();
    if (tokens.length === 1 && SECTION_KEYWORDS.has(up0 as GroupSection)) {
      section = up0 as GroupSection;
      current = null;
      continue;
    }
    // Unknown single-token header (e.g. FANCY SECTION keyword): tolerated —
    // skipped, but the previous section context is reset (T-07-05).
    if (tokens.length === 1) {
      current = null;
      continue;
    }

    // Group row: first token must be the `_NAME`.
    const name = tokens[0];
    if (!name.startsWith('_')) {
      // A LIST-starting row (numeric / ALL / TO / BY) without `_NAME` is a
      // malformed group row → warn and skip (T-07-04). Any other
      // word-starting row is an UNKNOWN SECTION KEYWORD (e.g. FANCY
      // SECTION) — tolerated silently per T-07-05, never a crash.
      const up = name.toUpperCase();
      const isListStart = up === 'ALL' || up === 'TO' || up === 'BY' || parseListId(name) !== null;
      if (isListStart) {
        ctx.warnings.push({
          code: WARNING_CODES.MALFORMED_LINE,
          message: `Malformed GROUP DEFINITION row (expected _NAME): ${tokens.join(' ')}`,
          line: entry.line,
          severity: 'warning',
        });
      }
      current = null;
      continue;
    }

    const listTokens = tokens.slice(1);
    const ids = expandList(listTokens); // bounded (T-07-04)
    if (ids.length === 0) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed GROUP DEFINITION row (empty list): ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      current = null;
      continue;
    }

    // Get-or-create the group, preserving the exact `_NAME` spelling (D-04).
    let group = ctx.groups.get(name);
    if (group === undefined) {
      group = { name, memberIds: [], jointIds: [], elementIds: [] };
      ctx.groups.set(name, group);
    }

    switch (section) {
      case 'JOINT':
        group.jointIds.push(...ids);
        break;
      case 'ELEMENT':
        group.elementIds.push(...ids);
        // D-07: plates/elements out of phase scope — group recorded so
        // downstream linking stays resolved, warned so the UI can surface it.
        ctx.warnings.push({
          code: WARNING_CODES.SKIPPED_ELEMENT,
          message: `ELEMENT group '${name}' skipped (elements out of scope, D-07): ${ids.length} item(s)`,
          line: entry.line,
          severity: 'warning',
        });
        break;
      case 'MEMBER':
      default:
        group.memberIds.push(...ids);
        break;
    }
    current = { name, line: entry.line };
  }

  void current; // reserved for per-group metadata if needed (P2)
}

/** Defensive no-op — END GROUP DEFINITION is consumed by the START scope. */
export function endGroupsHandler(_ctx: ParseContext, _block: CommandBlock): void {
  // START scope in segmentBlocks absorbs the END entry before dispatch; this
  // registration guarantees an un-scoped deck degrades to a no-op (T-07-05).
}

// Register on import (module side effect, see units.ts). Both keys are
// canonical — the three-token START header dispatches exact (longest-prefix
// in resolveHandler resolves 'START GROUP DEFINITION' before the single
// 'START' entry in COMMAND_TABLE, which has no handler of its own).
registerCommand(['START GROUP DEFINITION'], startGroupsHandler);
registerCommand(['END GROUP DEFINITION'], endGroupsHandler);