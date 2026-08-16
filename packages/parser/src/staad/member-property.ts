/**
 * MEMBER PROPERTY command handler (01-06 Task 2, PARSE-01 / D-05).
 *
 * Parses every MEMBER PROPERTY block body row into section profiles and
 * member→section links:
 *
 * - Named rows (`_C1-400X500 PRIS YD 0.4 ZD 0.5`) register the profile into
 *   `ctx.namedSections` keyed by the section NAME — members are linked to the
 *   section via GROUPS at finalize (a START GROUP DEFINITION group whose name
 *   matches a namedSections key gets every member's sectionKey set).
 * - Ranged rows (`17 18 20 TO 48 PRIS YD 0.05 ZD 0.05`) expand the member
 *   list via `expandList` (bounded, T-06-01) and write direct links into
 *   `ctx.memberSectionLinks`; the profile lands in `ctx.sections` under a
 *   synthetic label `_<property text>` so the model exposes it even without a
 *   group.
 *
 * Syntax variants (PITFALLS P3 — version drift, all must parse):
 * - PRIS YD v [ZD v] — rectangular (D-05); YD alone = CIRCULAR → approximate
 *   fallback + UNRESOLVED_SECTION warning (never fabricated exact geometry).
 * - TABLE [tableName] ST sectionName — modern quoted `TABLE 'IPE' ST 'IPE 300'`
 *   and legacy `TABLE ST W12X35`; section name is a lookup key, not geometry
 *   (T-06-04) → approximate fallback + UNRESOLVED_SECTION (D-05/D-07). The DB
 *   qualifier in the block header (AMERICAN / quoted '...DB3' / bare / STEEL)
 *   does NOT change this — no section-DB lookup exists in Phase 1.
 * - PIPE / TUBE / USER / TAPERED — tolerated as approximate fallback +
 *   UNRESOLVED_SECTION (not fatal).
 *
 * The block header qualifier is read (block.name tokens after MEMBER PROPERTY)
 * for forward-compat, but behavior is qualifier-independent in Phase 1.
 *
 * Security:
 * - T-06-01: member-list expansion goes through `expandList` — bounded,
 *   never a zip-bomb (shared with 01-05).
 * - T-06-02: sections/namedSections are Map containers; profiles are plain
 *   data objects with no prototype chain.
 * - T-06-03: PRIS YD/ZD convert through `ctx.units` (toMeters) in the
 *   resolver BEFORE the polygon is built.
 * - T-06-04: section sizes never parsed from name strings.
 *
 * Headless + worker-ready: zero DOM/global access.
 */

import type { CommandBlock, ParseContext } from '../core';
import { expandList, parseListId } from './lists';
import { resolveSectionProfile } from './steel-resolver';
import { WARNING_CODES } from '../types';
import { registerCommand } from './index';

/** Property keywords that start the property spec after the member list. */
const PROPERTY_KEYWORDS = new Set(['PRIS', 'TABLE', 'PIPE', 'TUBE', 'USER', 'TAPERED']);

/** True when the token participates in a member LIST (ids / ALL / TO / BY). */
function isListToken(s: string): boolean {
  const up = s.toUpperCase();
  if (up === 'ALL' || up === 'TO' || up === 'BY') return true;
  return parseListId(s) !== null;
}

/** Highest 1-based member id in the context (0 when no members parsed yet). */
function maxMemberId(ctx: ParseContext): number {
  let max = 0;
  for (const m of ctx.members) if (m.id > max) max = m.id;
  return max;
}

/**
 * Extract the section NAME from `TABLE [tableName] ST sectionName` tokens
 * (propTokens[0] === 'TABLE'). Handles both modern quoted
 * `TABLE 'IPE' ST 'IPE 300'` (table name + ST) and legacy `TABLE ST W12X35`
 * (ST directly). Returns null when the ST marker / section name is absent.
 */
function tableSectionName(propTokens: readonly string[]): string | null {
  let i = 1;
  if (propTokens[i]?.toUpperCase() === 'ST') {
    i++; // legacy `TABLE ST W12X35` — no table name
  } else {
    if (propTokens[i + 1]?.toUpperCase() !== 'ST') return null;
    i += 2; // modern `TABLE 'IPE' ST 'IPE 300'`
  }
  const section = propTokens[i];
  return section !== undefined ? section : null;
}

export function memberPropertyHandler(ctx: ParseContext, block: CommandBlock): void {
  // block.name = [MEMBER, PROPERTY, ...qualifier] — qualifier (AMERICAN /
  // quoted DB name / STEEL / bare) is informational in Phase 1 (D-05: no DB).
  for (const entry of block.bodyLines) {
    const tokens = entry.tokens.map((tok) => tok.text);
    if (tokens.length === 0) continue;

    // Locate the property keyword — everything before it is the member list.
    let kwIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (PROPERTY_KEYWORDS.has(tokens[i].toUpperCase())) {
        kwIdx = i;
        break;
      }
    }
    if (kwIdx <= 0) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed member property row: ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    const memberTokens = tokens.slice(0, kwIdx);
    const propTokens = tokens.slice(kwIdx);
    const kw = propTokens[0].toUpperCase();

    // Named row: exactly one non-list token that starts the row (`_C1`).
    const named = memberTokens.length === 1 && !isListToken(memberTokens[0]);
    if (!named && !memberTokens.every(isListToken)) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed member property row: ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    // Section label: the table section name for TABLE rows; '_' + property
    // text for unnamed rows; the name itself for named rows.
    let label: string;
    if (named) {
      label = memberTokens[0];
    } else if (kw === 'TABLE') {
      const section = tableSectionName(propTokens);
      if (section === null) {
        ctx.warnings.push({
          code: WARNING_CODES.MALFORMED_LINE,
          message: `Malformed TABLE property row: ${tokens.join(' ')}`,
          line: entry.line,
          severity: 'warning',
        });
        continue;
      }
      label = section;
    } else {
      label = `_${propTokens.join(' ')}`;
    }

    const profile = resolveSectionProfile(kw, label, propTokens, ctx.units);
    if (profile === null) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed member property row: ${tokens.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    if (profile.approximate) {
      // D-07: unresolved sections always warn (TABLE name-only, PRIS circular,
      // PIPE/TUBE/USER/TAPERED). Section DB is a Phase 2 concern.
      ctx.warnings.push({
        code: WARNING_CODES.UNRESOLVED_SECTION,
        message: `Unresolved section: ${label} — approximate geometry (section database deferred to Phase 2)`,
        line: entry.line,
        severity: 'warning',
      });
    }

    if (named) {
      ctx.namedSections.set(label, profile);
    } else {
      // Ranged row: expand (bounded by the member reference, T-06-01) and
      // link every member; expose the profile under the synthetic label.
      const maxRef = maxMemberId(ctx);
      const ids = maxRef > 0 ? expandList(memberTokens, { maxRef }) : expandList(memberTokens);
      for (const id of ids) ctx.memberSectionLinks.set(id, label);
      ctx.sections.set(label, profile);
    }
  }
}

// Register on import (module side effect). The CANONICAL key is
// 'MEMBER PROPERTIES' — core.ts COMMAND_ALIASES maps PROPERTY → PROPERTIES,
// so every header form (MEMBER PROPERTY / MEMBER PROPERTY AMERICAN /
// MEMBER PROPERTIES 'EUROPE (EN 2023).DB3') canonicalizes to
// 'MEMBER PROPERTIES ...' before dispatch. resolveHandler matches the LONGEST
// registered key that is a token-wise prefix of the header, so the 2-token
// key covers all qualifier forms.
registerCommand(['MEMBER PROPERTIES'], memberPropertyHandler);
