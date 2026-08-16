/**
 * MEMBER PROPERTY handler tests (01-06 Task 2, TDD RED).
 *
 * Behavior contract (plan + PITFALLS P2/P3 + D-04/D-05/D-07):
 * - Body rows split into a member-list (expanded via expandList) and property
 *   tokens. Named rows (`_NAME ...`) register ctx.namedSections keyed by the
 *   name — linked to members via groups at finalize. Ranged rows write
 *   ctx.memberSectionLinks (memberId → sectionKey).
 * - PRIS YD/ZD → rectangular polygon (via steel-resolver, D-05); PRIS YD-only
 *   = circular → approximate fallback + UNRESOLVED_SECTION warning (P3).
 * - TABLE rows — modern quoted `TABLE 'IPE' ST 'IPE 300'` and legacy
 *   `TABLE ST W12X35` — produce approximate fallback profiles labeled with the
 *   section name + UNRESOLVED_SECTION warning (D-05/D-07). The DB qualifier in
 *   the block header (AMERICAN / quoted '...DB3' / bare) does not change this:
 *   no section-DB lookup exists in Phase 1.
 * - Quoted tokens arrive quote-stripped from the tokenizer (single tokens,
 *   inner spaces kept) — used as-is.
 * - Malformed rows (no property keyword) warn MALFORMED_LINE, never throw.
 */
import { describe, expect, it } from 'vitest';
import { memberPropertyHandler } from '../../src/staad/member-property';
import { canonicalizeCommand, createContext, finalize, segmentBlocks } from '../../src/core';
import { resolveHandler } from '../../src/staad/index';
import { tokenize } from '../../src/tokenizer';
import { WARNING_CODES } from '../../src/types';
import type { CommandBlock, ParseContext } from '../../src/core';
import { loadFixture } from '../fixtures/loadFixture';

/** Build a MEMBER PROPERTY block whose header/body are the real tokenized entries. */
function propertyBlock(header: string, deck: string): CommandBlock {
  return {
    name: tokenize(header)[0].tokens,
    bodyLines: tokenize(deck),
    line: 1,
  };
}

/** Run the production pipeline (segment → dispatch) over a deck string. */
function dispatchDeck(ctx: ParseContext, text: string): void {
  const blocks = segmentBlocks(tokenize(text));
  for (const block of blocks) {
    const key = canonicalizeCommand(block.name);
    const handler = resolveHandler(key);
    if (handler !== undefined) handler(ctx, block);
  }
}

describe('MEMBER PROPERTY handler (01-06 Task 2)', () => {
  it('(1) named PRIS row under AMERICAN registers a rect section (links via groups at finalize)', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    memberPropertyHandler(ctx, propertyBlock('MEMBER PROPERTY AMERICAN', '_C1 PRIS YD 0.4 ZD 0.5'));
    const sec = ctx.namedSections.get('_C1');
    expect(sec).toBeDefined();
    expect(sec!.approximate).toBe(false);
    expect(sec!.points).toEqual([
      [-0.25, -0.2],
      [0.25, -0.2],
      [0.25, 0.2],
      [-0.25, 0.2],
    ]);
    expect(ctx.warnings).toEqual([]);

    // Named sections link to members via groups at finalize (D-05 plan path).
    ctx.members.push({ id: 1, startNode: 10, endNode: 11 });
    ctx.groups.set('_C1', { name: '_C1', memberIds: [1], jointIds: [], elementIds: [] });
    const model = finalize(ctx);
    expect(model.members[0].sectionKey).toBe('_C1');
    expect(model.sections.get('_C1')).toBe(sec);
  });

  it('(2) ranged PRIS row links every expanded member to the section (memberSectionLinks)', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    memberPropertyHandler(ctx, propertyBlock('MEMBER PROPERTY AMERICAN', '17 18 20 TO 48 PRIS YD 0.05 ZD 0.05'));
    const label = '_PRIS YD 0.05 ZD 0.05';
    expect(ctx.memberSectionLinks.get(17)).toBe(label);
    expect(ctx.memberSectionLinks.get(18)).toBe(label);
    expect(ctx.memberSectionLinks.get(20)).toBe(label);
    expect(ctx.memberSectionLinks.get(48)).toBe(label);
    expect(ctx.memberSectionLinks.get(19)).toBeUndefined(); // gap not linked
    const sec = ctx.sections.get(label);
    expect(sec).toBeDefined();
    expect(sec!.approximate).toBe(false);
    expect(ctx.warnings).toEqual([]);
  });

  it('(3) quoted-DB TABLE row produces approximate fallback labeled with the section name', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    memberPropertyHandler(
      ctx,
      propertyBlock("MEMBER PROPERTY 'EUROPE (EN 2023).DB3'", "964 TO 977 TABLE 'IPE' ST 'IPE 300'"),
    );
    const sec = ctx.sections.get('IPE 300');
    expect(sec).toBeDefined();
    expect(sec!.approximate).toBe(true);
    expect(ctx.memberSectionLinks.get(964)).toBe('IPE 300');
    expect(ctx.memberSectionLinks.get(977)).toBe('IPE 300');
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.UNRESOLVED_SECTION);
    expect(ctx.warnings[0].line).toBe(1);
  });

  it('(4) legacy unquoted TABLE ST row behaves the same (P3 version drift)', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    memberPropertyHandler(ctx, propertyBlock('MEMBER PROPERTY STEEL', '1 3 TABLE ST W12X35'));
    const sec = ctx.sections.get('W12X35');
    expect(sec).toBeDefined();
    expect(sec!.approximate).toBe(true);
    expect(ctx.memberSectionLinks.get(1)).toBe('W12X35');
    expect(ctx.memberSectionLinks.get(3)).toBe('W12X35');
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.UNRESOLVED_SECTION);
  });

  it('(5) PRIS with only YD is a circular section → approximate fallback + warning (P3)', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    memberPropertyHandler(ctx, propertyBlock('MEMBER PROPERTY AMERICAN', '_CIRC PRIS YD 0.3'));
    const sec = ctx.namedSections.get('_CIRC');
    expect(sec).toBeDefined();
    expect(sec!.approximate).toBe(true);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.UNRESOLVED_SECTION);
  });

  it('(6) row without a property keyword is MALFORMED_LINE, never a throw', () => {
    const ctx = createContext();
    expect(() => memberPropertyHandler(ctx, propertyBlock('MEMBER PROPERTY', '1 2 3 4'))).not.toThrow();
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
  });

  it('(7) real HPP MEMBER PROPERTY slice parses to expected counts (mini-deck)', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
    const start = lines.findIndex((l) => l.trim().startsWith('MEMBER PROPERTY AMERICAN'));
    const end = lines.findIndex((l) => l.trim().startsWith('CONSTANTS'));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const deck = lines.slice(start, end).join('\n');

    const ctx = createContext();
    ctx.units.length = 'M'; // the real file declares UNIT METER KN before MEMBER PROPERTY
    dispatchDeck(ctx, deck);

    // 17 named PRIS rows (lines 800-819 minus the 3 ranged rows); 4 unique
    // ranged PRIS sections (0.5/0.25, 0.6/0.3, 0.05/0.05, 0.2/0.2) and 2
    // TABLE fallbacks (IPE 300, 12CS3.5X105) → 6 sections total.
    expect(ctx.namedSections.size).toBe(17);
    expect(ctx.sections.size).toBe(6);
    expect(ctx.sections.get('IPE 300')).toBeDefined();
    expect(ctx.sections.get('IPE 300')!.approximate).toBe(true);
    expect(ctx.sections.get('12CS3.5X105')).toBeDefined();
    expect(ctx.sections.get('12CS3.5X105')!.approximate).toBe(true);

    // The continuation-merged ranged PRIS row links its members.
    expect(ctx.memberSectionLinks.get(17)).toBe('_PRIS YD 0.05 ZD 0.05');
    expect(ctx.memberSectionLinks.get(1409)).toBe('_PRIS YD 0.05 ZD 0.05');
    expect(ctx.memberSectionLinks.size).toBeGreaterThan(100);

    // Exactly the 2 TABLE rows warn UNRESOLVED_SECTION.
    const unresolved = ctx.warnings.filter((w) => w.code === WARNING_CODES.UNRESOLVED_SECTION);
    expect(unresolved).toHaveLength(2);
  });
});
