/**
 * Mini-deck integration test: supports + groups wired through the FULL
 * dispatch pipeline (01-07 Task 3).
 *
 * Builds a complete STAAD deck and runs parseStaad end-to-end (segment →
 * dispatch → finalize) — the first full-dispatch proof that SUPPORTS and
 * GROUP DEFINITION handlers work together with the geometry/property
 * handlers before the golden-file plan (01-09).
 *
 * Deck coverage (plan task 3):
 * - STAAD SPACE + UNIT METER KN (01-04 core-state handlers, checker #3)
 * - JOINT COORDINATES (6 joints, SPACE → z included)
 * - MEMBER INCIDENCES
 * - START GROUP DEFINITION — MEMBER + ELEMENT sections WITH a `-`
 *   continuation row (real corpus shape)
 * - SUPPORTS — PINNED range + FIXED BUT + a plate row
 * - MEMBER PROPERTY PRIS rows
 * - CONSTANTS MATERIAL
 *
 * All handler modules are imported for their side-effect registration into
 * COMMAND_TABLE (units, header, joint-coordinates, member-incidences,
 * member-property, steel-resolver, supports, groups, constants).
 *
 * Assertions: no throw; units.length 'M' (not the FEET default); exact
 * node/member/support/group counts; correct support types; exact group
 * memberIds; SKIPPED_ELEMENT present for the ELEMENT group AND the plate
 * support; UNRESOLVED_SECTION ABSENT (all PRIS resolve); member materials
 * set (CONSTANTS MATERIAL STEEL applied).
 */
import { describe, expect, it } from 'vitest';
import { parseStaad } from '../../src/index';
// Side-effect registration into COMMAND_TABLE (order irrelevant):
import '../../src/staad/units';
import '../../src/staad/header';
import '../../src/staad/joint-coordinates';
import '../../src/staad/member-incidences';
import '../../src/staad/member-property';
import '../../src/staad/steel-resolver';
import '../../src/staad/supports';
import '../../src/staad/groups';
import '../../src/staad/constants';
import { WARNING_CODES } from '../../src/types';

const deck = `STAAD SPACE
UNIT METER KN
JOINT COORDINATES
1 0 0 0
2 4 0 0
3 4 3 0
4 0 3 0
5 2 1.5 3
6 2 1.5 -3
MEMBER INCIDENCES
1 1 2
2 2 3
3 3 4
4 4 1
5 1 5
6 2 6
START GROUP DEFINITION
MEMBER
_COLS 1 TO 3 4 -
5 6
ELEMENT
_RAFT 132 TO 162 211
END GROUP DEFINITION
SUPPORTS
1 TO 4 PINNED
5 FIXED BUT FY MZ
_RAFT PLATE MAT DIRECT Y SUBGRADE 15000 COMPRESSION
MEMBER PROPERTY AMERICAN
1 TO 6 PRIS YD 0.3 ZD 0.3
CONSTANTS
MATERIAL STEEL MEMB 1 TO 6
`;

describe('mini-deck end-to-end dispatch (01-07 Task 3)', () => {
  it('parses supports + groups through the full pipeline without throwing', () => {
    let result!: ReturnType<typeof parseStaad>;
    expect(() => {
      result = parseStaad(deck);
    }).not.toThrow();

    // 01-04 core-state handlers applied: UNIT METER → 'M' (not FEET default).
    expect(result.model.units.length).toBe('M');

    // Exact entity counts.
    expect(result.model.nodes).toHaveLength(6);
    expect(result.model.members).toHaveLength(6);
    expect(result.model.supports).toHaveLength(5); // 4 PINNED + 1 FIXED_BUT
    expect(result.model.groups.size).toBe(2); // _COLS + _RAFT

    // Support types + releases (types.ts: true = released).
    const supports = result.model.supports;
    expect(supports.filter((s) => s.type === 'PINNED')).toHaveLength(4);
    expect(supports.map((s) => s.nodeId).slice(0, 4)).toEqual([1, 2, 3, 4]);
    for (const s of supports.slice(0, 4)) {
      expect(s.releases).toEqual({ FX: false, FY: false, FZ: false, MX: true, MY: true, MZ: true });
    }
    const fb = supports[4];
    expect(fb).toMatchObject({ nodeId: 5, type: 'FIXED_BUT' });
    // FIXED BUT FY MZ: FY and MZ RELEASED (true) — type contract + plan
    // action text; see 01-07-SUMMARY deviation #1.
    expect(fb.releases).toEqual({ FX: false, FY: true, FZ: false, MX: false, MY: false, MZ: true });

    // Group contents: _COLS memberIds exact (continuation-merged row),
    // _RAFT elementIds recorded.
    const cols = result.model.groups.get('_COLS');
    expect(cols).toBeDefined();
    expect(cols!.memberIds).toEqual([1, 2, 3, 4, 5, 6]);
    const raft = result.model.groups.get('_RAFT');
    expect(raft).toBeDefined();
    expect(raft!.elementIds).toEqual([...Array.from({ length: 31 }, (_, k) => 132 + k), 211]);

    // Warnings: SKIPPED_ELEMENT present for the ELEMENT group AND the plate
    // support (2 total — nothing else in this deck warns).
    const skipped = result.warnings.filter((w) => w.code === WARNING_CODES.SKIPPED_ELEMENT);
    expect(skipped).toHaveLength(2);

    // No UNRESOLVED_SECTION: every member has a PRIS section.
    expect(result.warnings.some((w) => w.code === WARNING_CODES.UNRESOLVED_SECTION)).toBe(false);
    expect(result.model.sections.size).toBeGreaterThan(0);

    // CONSTANTS MATERIAL STEEL applied to every member.
    for (const m of result.model.members) {
      expect(m.material).toBe('STEEL');
    }
    // Sections linked: every member has its PRIS sectionKey (finalize).
    for (const m of result.model.members) {
      expect(m.sectionKey).toBe('_PRIS YD 0.3 ZD 0.3');
    }
  });
});