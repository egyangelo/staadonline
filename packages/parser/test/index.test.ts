import { describe, expect, it } from 'vitest';
import { MAX_INPUT_LENGTH, parseStaad, registerParsingCommands } from '../src/index';
import { WARNING_CODES } from '../src/types';
import { expected } from './fixtures/manifest';
import { loadFixture } from './fixtures/loadFixture';

/**
 * Count JOINT COORDINATES rows in fixture text the same way the manifest
 * counts member/element rows (semicolon-split, numeric first word) — the
 * corpus has NON-CONTIGUOUS joint ids (max 1222, 1122 rows), so the model's
 * node count equals ROWS, while `expected.joints` is the MAX id. Mirroring
 * the manifest keeps the real-fixture count computed, never hand-typed
 * (D-09: no hardcoded corpus counts).
 */
function countJointRows(text: string): number {
  const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith('JOINT COORDINATES'));
  if (start === -1) return 0;
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('*')) continue;
    const c = line.charCodeAt(0);
    if (c >= 65 && c <= 90) break; // next command block
    for (const entry of line.split(';')) {
      const t = entry.trim();
      if (t.length === 0) continue;
      const first = t.split(' ')[0] ?? '';
      if (/^\d+$/.test(first)) count++;
    }
  }
  return count;
}

/**
 * End-to-end parseStaad contract (01-04/01-05):
 * - (1) the real corpus fixture parses WITHOUT throwing using the production
 *       handlers: UNIT and STAAD run through the real COMMAND_TABLE,
 *       JOINT COORDINATES / MEMBER INCIDENCES (01-05) populate nodes and
 *       members, MEMBER PROPERTY (01-06) resolves PRIS/TABLE sections, and
 *       CONSTANTS (01-06) stores MATERIAL — unknown blocks become
 *       UNKNOWN_COMMAND warnings, unit state lands in the model, bounds are
 *       computed, node 2 is at y = -2.8 (key_context), and member rows match
 *       the manifest count.
 * - (2) empty input → empty model, no warnings, P1 defaults.
 * - (3) STAAD PLANE + 2-coordinate rows → z = 0, no MALFORMED_LINE
 *       (checker #3 D-02 2D coverage).
 * - (4) STAAD SPACE + a 2-coordinate row → MALFORMED_LINE (missing z).
 * - (5) size guard: oversized input returns a warning result, never throws
 *       (T-04-01).
 *
 * NOTE: the test-local JOINT COORDINATES stub that 01-04 registered here was
 * REMOVED in 01-05 — the production handler (staad/joint-coordinates.ts) now
 * registers into the real COMMAND_TABLE via the src/index import graph, and
 * this file exercises it end-to-end instead of shadowing it.
 */

// Production core-state + geometry handlers (UNIT, STAAD, JOINT COORDINATES,
// MEMBER INCIDENCES) register when '../src/index' is imported above. Call the
// bootstrap to keep the registration surface explicit.
registerParsingCommands();

describe('parseStaad — public entry (01-04)', () => {
  it('(1) parses the real HPP fixture without throwing; units M/KN, bounds, node 2 y = -2.8', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    let result!: ReturnType<typeof parseStaad>;
    expect(() => {
      result = parseStaad(text);
    }).not.toThrow();

    // UNIT METER KN was honored through the real UNIT handler (P1 state).
    expect(result.model.units.length).toBe('M');
    expect(result.model.units.force).toBe('KN');

    // Unknown blocks degrade to structured warnings, never crashes.
    expect(result.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_COMMAND)).toBe(true);

    // Bounds are computed (finalize) and finite (P8).
    expect(result.model.bounds.min).toHaveLength(3);
    expect(result.model.bounds.max).toHaveLength(3);
    for (const v of [...result.model.bounds.min, ...result.model.bounds.max]) {
      expect(Number.isFinite(v)).toBe(true);
    }

    // The production geometry handler (01-05) parsed every joint ROW of the
    // corpus (1122 rows; ids are non-contiguous so max id is 1222) and
    // normalized coordinates through the running unit state: node 2 =
    // (0, -2.8, 0) — key_context exact value, METER factor 1.
    expect(result.model.nodes).toHaveLength(countJointRows(text));
    const maxId = result.model.nodes.reduce((m, n) => (n.id > m ? n.id : m), 0);
    expect(maxId).toBe(expected['real/HPP_Main_Building_2.std'].joints); // 1222, manifest-computed
    const node2 = result.model.nodes.find((n) => n.id === 2);
    expect(node2).toBeDefined();
    expect(node2?.x).toBe(0);
    expect(node2?.y).toBe(-2.8);
    expect(node2?.z).toBe(0);
    expect(result.model.bounds.min[1]).toBeLessThanOrEqual(-2.8);

    // MEMBER INCIDENCES (production handler) populated the model: exact
    // manifest-computed member count with 1-based source ids preserved (D-04).
    expect(result.model.members).toHaveLength(expected['real/HPP_Main_Building_2.std'].members);
    const member1 = result.model.members.find((m) => m.id === 1);
    expect(member1).toMatchObject({ id: 1, startNode: 1, endNode: 739 });

    // MEMBER PROPERTY (01-06): TABLE rows resolved to approximate fallback
    // sections (D-05), members linked by direct range links and via named
    // groups at finalize.
    const ipe = result.model.sections.get('IPE 300');
    expect(ipe).toBeDefined();
    expect(ipe!.approximate).toBe(true);
    expect(result.model.sections.get('12CS3.5X105')?.approximate).toBe(true);
    expect(result.model.members.find((m) => m.id === 964)?.sectionKey).toBe('IPE 300');
    expect(result.model.members.find((m) => m.id === 1042)?.sectionKey).toBe('12CS3.5X105');
    // NOTE: named-section→member links via groups are proven in the 01-06
    // member-property unit test (seeded group); the real file's START GROUP
    // DEFINITION handler lands in 01-08.
    expect(result.warnings.filter((w) => w.code === WARNING_CODES.UNRESOLVED_SECTION).length).toBeGreaterThan(0);

    // CONSTANTS (01-06): MATERIAL stored on members (D-03 color-by-material).
    expect(result.model.members.find((m) => m.id === 1)?.material).toBe('CONCRETE');
    expect(result.model.members.find((m) => m.id === 964)?.material).toBe('STEEL_36_KSI');
  });

  it('(2) parses empty input into an empty model with P1 defaults and no warnings', () => {
    const result = parseStaad('');
    expect(result.model.nodes).toHaveLength(0);
    expect(result.model.members).toHaveLength(0);
    expect(result.model.units).toEqual({ length: 'FT', force: 'KIP' });
    expect(result.model.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    expect(result.warnings).toEqual([]);
  });

  it('(3) STAAD PLANE honors 2-coordinate rows with z = 0 and no MALFORMED_LINE (checker #3)', () => {
    const deck = `STAAD PLANE
UNIT METER KN
JOINT COORDINATES
1 0 0
2 6 0
3 6 4
`;
    const result = parseStaad(deck);
    expect(result.model.nodes).toHaveLength(3);
    expect(result.model.nodes.find((n) => n.id === 2)?.z).toBe(0);
    expect(result.model.nodes.find((n) => n.id === 3)?.z).toBe(0);
    expect(result.warnings.some((w) => w.code === WARNING_CODES.MALFORMED_LINE)).toBe(false);
  });

  it('(4) STAAD SPACE flags a 2-coordinate row as MALFORMED_LINE (missing z)', () => {
    const deck = `STAAD SPACE
UNIT METER KN
JOINT COORDINATES
1 0 0
2 6 0
`;
    const result = parseStaad(deck);
    const malformed = result.warnings.filter((w) => w.code === WARNING_CODES.MALFORMED_LINE);
    expect(malformed.length).toBeGreaterThan(0);
    expect(malformed[0].line).toBe(4); // the offending row's source line
    // Under SPACE the 2-coordinate rows are rejected (missing z): no node
    // may carry a fabricated z=0 — the row is skipped, not defaulted.
    expect(result.model.nodes).toHaveLength(0);
  });

  it('(5) refuses input over the size limit with an error warning instead of parsing (T-04-01)', () => {
    const oversized = 'x'.repeat(MAX_INPUT_LENGTH + 1);
    let result!: ReturnType<typeof parseStaad>;
    expect(() => {
      result = parseStaad(oversized);
    }).not.toThrow();

    expect(result.model.nodes).toHaveLength(0);
    expect(result.model.members).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe(WARNING_CODES.IGNORED_COMMAND);
    expect(result.warnings[0].severity).toBe('error');
    expect(result.warnings[0].line).toBe(0);
    // Empty model still carries P1 default units.
    expect(result.model.units.length).toBe('FT');
  });
});
