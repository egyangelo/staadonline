import { describe, expect, it } from 'vitest';
import type { Token, TokenizedLine } from '../src/tokenizer';
import type { SectionMeta, SectionProfile } from '../src/types';
import { canonicalizeCommand, createContext, finalize, segmentBlocks } from '../src/core';

/**
 * Core pipeline contract (01-04):
 * - canonicalizeCommand: uppercase + alias mapping + single-space join
 * - segmentBlocks: uppercase-first = new header; digit/_/quote/- = body;
 *   DEFINE scoped absorption (END DEFINE + tolerant termination); START
 *   absorption until END
 * - createContext: P1 defaults, Map-based lookups, SPACE structure
 * - finalize: bounds from nodes, 1-based ids preserved, member-section links
 */

/** Build a tokenized entry from a plain string (whitespace split, unquoted). */
function entry(text: string, line = 1): TokenizedLine {
  return {
    line,
    tokens: text.split(' ').filter((s) => s.length > 0).map((t) => ({ text: t, quoted: false })),
  };
}

function texts(lines: TokenizedLine[]): string[][] {
  return lines.map((l) => l.tokens.map((t) => t.text));
}

function blockNames(blocks: ReturnType<typeof segmentBlocks>): string[] {
  return blocks.map((b) => b.name.map((t) => t.text).join(' '));
}

describe('canonicalizeCommand (P2 aliases + normalization)', () => {
  const toks = (text: string): Token[] => text.split(' ').map((t) => ({ text: t, quoted: false }));

  it('uppercases tokens and joins with single spaces', () => {
    expect(canonicalizeCommand(toks('unit meter kn'))).toBe('UNIT METER KN');
    expect(canonicalizeCommand(toks('Staad Plane'))).toBe('STAAD PLANE');
  });

  it("maps INCIDENCE → INCIDENCES and INCI → INCIDENCES", () => {
    expect(canonicalizeCommand(toks('MEMBER INCIDENCE'))).toBe('MEMBER INCIDENCES');
    expect(canonicalizeCommand(toks('MEMB INCI'))).toBe('MEMBER INCIDENCES');
  });

  it("maps JNT COORD → JOINT COORDINATES", () => {
    expect(canonicalizeCommand(toks('JNT COORD'))).toBe('JOINT COORDINATES');
  });

  it("maps LOADING → LOAD, MEMB → MEMBER, PROPERTY → PROPERTIES, ELEM → ELEMENT", () => {
    expect(canonicalizeCommand(toks('LOADING'))).toBe('LOAD');
    expect(canonicalizeCommand(toks('MEMB PROPERTY'))).toBe('MEMBER PROPERTIES');
    expect(canonicalizeCommand(toks('ELEM INCI'))).toBe('ELEMENT INCIDENCES');
  });

  it('preserves quoted tokens verbatim (uppercased, inner spaces kept)', () => {
    expect(canonicalizeCommand([{ text: 'EUROPE (EN 2023).DB3', quoted: true }])).toBe('EUROPE (EN 2023).DB3');
  });

  it('passes unknown tokens through unchanged (tolerant)', () => {
    expect(canonicalizeCommand(toks('FROBNICATE 12'))).toBe('FROBNICATE 12');
  });
});

describe('segmentBlocks (tolerant block segmentation)', () => {
  it('treats uppercase-first entries as new headers; digit/_/quote/- entries as body', () => {
    const blocks = segmentBlocks([
      entry('JOINT COORDINATES', 5),
      entry('1 0 0 0', 6),
      entry('_CONTINUED', 7),
      // The tokenizer emits a quoted token as ONE token with quoted: true —
      // quote-starting entries are body even when the text is uppercase.
      { line: 8, tokens: [{ text: 'QUOTED 1', quoted: true }] },
      entry('-2.8 -1', 9),
      entry('MEMBER INCIDENCES', 10),
      entry('1 1 2', 11),
    ]);
    expect(blockNames(blocks)).toEqual(['JOINT COORDINATES', 'MEMBER INCIDENCES']);
    expect(texts(blocks[0].bodyLines)).toEqual([['1', '0', '0', '0'], ['_CONTINUED'], ['QUOTED 1'], ['-2.8', '-1']]);
    expect(texts(blocks[1].bodyLines)).toEqual([['1', '1', '2']]);
    expect(blocks[0].line).toBe(5);
    expect(blocks[1].line).toBe(10);
  });

  it('skips body entries before any header silently (no crash)', () => {
    const blocks = segmentBlocks([entry('1 0 0 0'), entry('STAAD SPACE'), entry('2 0 0 0')]);
    expect(blockNames(blocks)).toEqual(['STAAD SPACE']);
    expect(texts(blocks[0].bodyLines)).toEqual([['2', '0', '0', '0']]);
  });

  it('absorbs START blocks until the END header (START JOB INFORMATION)', () => {
    const blocks = segmentBlocks([
      entry('START JOB INFORMATION', 3),
      entry('ENGINEER DATE 20-OCT-24', 4),
      entry('JOB NAME HPP', 5),
      entry('END JOB INFORMATION', 6),
      entry('INPUT WIDTH 79', 7),
    ]);
    expect(blockNames(blocks)).toEqual(['START JOB INFORMATION', 'INPUT WIDTH 79']);
    expect(texts(blocks[0].bodyLines)).toEqual([
      ['ENGINEER', 'DATE', '20-OCT-24'],
      ['JOB', 'NAME', 'HPP'],
    ]);
  });

  it('absorbs DEFINE blocks until the matching END DEFINE header', () => {
    const blocks = segmentBlocks([
      entry('DEFINE MATERIAL START', 1),
      entry('E 20000000', 2),
      entry('POISSON 0.3', 3),
      entry('END DEFINE MATERIAL', 4),
      entry('UNIT METER KN', 5),
    ]);
    expect(blockNames(blocks)).toEqual(['DEFINE MATERIAL START', 'UNIT METER KN']);
    expect(texts(blocks[0].bodyLines)).toEqual([['E', '20000000'], ['POISSON', '0.3']]);
  });

  it('terminates an un-terminated DEFINE block at the next DEFINE header (DEFINE IBC 2015)', () => {
    const blocks = segmentBlocks([
      entry('DEFINE IBC 2015', 908),
      entry('SS 0.115 S1 0.034', 909),
      entry('REFERENCE LOAD Y', 912),
      entry('R1 1.0', 913),
      entry('DEFINE WIND LOAD', 914),
      entry('TYPE 1 WWARD_XZ', 915),
    ]);
    expect(blockNames(blocks)).toEqual(['DEFINE IBC 2015', 'DEFINE WIND LOAD']);
    expect(texts(blocks[0].bodyLines)).toEqual([
      ['SS', '0.115', 'S1', '0.034'],
      ['REFERENCE', 'LOAD', 'Y'],
      ['R1', '1.0'],
    ]);
    expect(texts(blocks[1].bodyLines)).toEqual([['TYPE', '1', 'WWARD_XZ']]);
  });

  it('terminates an un-terminated DEFINE block at the next numeric LOAD header (DEFINE WIND LOAD)', () => {
    const blocks = segmentBlocks([
      entry('DEFINE WIND LOAD', 914),
      entry('TYPE 1 WWARD_XZ', 915),
      entry('ASCE-7-2016:PARAMS 0.000', 917),
      entry('LOAD 13 LOADTYPE Seismic-H TITLE EX', 938),
      entry('SELFWEIGHT Y -1', 939),
    ]);
    expect(blockNames(blocks)).toEqual(['DEFINE WIND LOAD', 'LOAD 13 LOADTYPE Seismic-H TITLE EX', 'SELFWEIGHT Y -1']);
    expect(texts(blocks[0].bodyLines)).toHaveLength(2);
  });

  it('absorbs non-numeric LOAD (LOAD R1) inside DEFINE REFERENCE LOADS — not a terminator', () => {
    const blocks = segmentBlocks([
      entry('DEFINE REFERENCE LOADS', 883),
      entry('LOAD R1 LOADTYPE Mass TITLE EQ-LOAD', 884),
      entry('SELFWEIGHT Y -1 LIST 1 TO 12', 885),
      entry('MEMBER LOAD', 886),
      entry('17 18 UNI GY -27.6', 887),
      entry('END DEFINE REFERENCE LOADS', 906),
      entry('UNIT METER KN', 907),
    ]);
    expect(blockNames(blocks)).toEqual(['DEFINE REFERENCE LOADS', 'UNIT METER KN']);
    expect(texts(blocks[0].bodyLines)).toEqual([
      ['LOAD', 'R1', 'LOADTYPE', 'Mass', 'TITLE', 'EQ-LOAD'],
      ['SELFWEIGHT', 'Y', '-1', 'LIST', '1', 'TO', '12'],
      ['MEMBER', 'LOAD'],
      ['17', '18', 'UNI', 'GY', '-27.6'],
    ]);
  });

  it('closes an open block at end of input', () => {
    const blocks = segmentBlocks([entry('DEFINE IBC 2015'), entry('SS 0.115')]);
    expect(blockNames(blocks)).toEqual(['DEFINE IBC 2015']);
    expect(texts(blocks[0].bodyLines)).toEqual([['SS', '0.115']]);
  });
});

describe('createContext (defaults + Map-based lookups)', () => {
  it('returns P1 defaults and empty collections', () => {
    const ctx = createContext();
    expect(ctx.units).toEqual({ length: 'FT', force: 'KIP' });
    expect(ctx.structure).toBe('SPACE');
    expect(ctx.nodes).toEqual([]);
    expect(ctx.members).toEqual([]);
    expect(ctx.warnings).toEqual([]);
    expect(ctx.sections).toBeInstanceOf(Map);
    expect(ctx.groups).toBeInstanceOf(Map);
    expect(ctx.namedSections).toBeInstanceOf(Map);
    expect(ctx.memberSectionLinks).toBeInstanceOf(Map);
    expect(ctx.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });
});

describe('finalize (bounds + member-section links, D-04 ids)', () => {
  const profile = (label: string): SectionProfile & SectionMeta => ({
    label,
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    approximate: false,
    family: 'PRISMATIC',
  });

  it('computes bounds min/max from node coordinates', () => {
    const ctx = createContext();
    ctx.nodes.push({ id: 1, x: 0, y: 0, z: 0 });
    ctx.nodes.push({ id: 2, x: 6, y: 4, z: -2.8 });
    const model = finalize(ctx);
    expect(model.bounds).toEqual({ min: [0, 0, -2.8], max: [6, 4, 0] });
  });

  it('returns zero bounds when there are no nodes', () => {
    const model = finalize(createContext());
    expect(model.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });

  it('links members to sections via memberSectionLinks, preserving 1-based ids', () => {
    const ctx = createContext();
    ctx.nodes.push({ id: 1, x: 0, y: 0, z: 0 });
    ctx.nodes.push({ id: 2, x: 6, y: 0, z: 0 });
    ctx.members.push({ id: 7, startNode: 1, endNode: 2 }); // 1-based source id preserved
    ctx.memberSectionLinks.set(7, 'PRIS-1');
    ctx.sections.set('PRIS-1', profile('PRIS-1'));
    const model = finalize(ctx);
    expect(model.members[0].id).toBe(7); // D-04: never renumbered
    expect(model.members[0].startNode).toBe(1);
    expect(model.members[0].sectionKey).toBe('PRIS-1');
    expect(model.sections.get('PRIS-1')?.label).toBe('PRIS-1');
  });

  it('links members in a group whose name matches a namedSections key, copying the profile', () => {
    const ctx = createContext();
    ctx.nodes.push({ id: 1, x: 0, y: 0, z: 0 });
    ctx.nodes.push({ id: 2, x: 6, y: 0, z: 0 });
    ctx.members.push({ id: 1, startNode: 1, endNode: 2 });
    ctx.groups.set('IPE_300', { name: 'IPE_300', memberIds: [1], jointIds: [], elementIds: [] });
    ctx.namedSections.set('IPE_300', profile('IPE_300'));
    const model = finalize(ctx);
    expect(model.members[0].sectionKey).toBe('IPE_300');
    expect(model.sections.get('IPE_300')?.label).toBe('IPE_300');
    expect(model.sections.get('IPE_300')?.approximate).toBe(false);
  });

  it('copies the running unit state into the model', () => {
    const ctx = createContext();
    ctx.units.length = 'M';
    ctx.units.force = 'KN';
    const model = finalize(ctx);
    expect(model.units).toEqual({ length: 'M', force: 'KN' });
  });
});
