import { describe, expect, it } from 'vitest';
import { MAX_INPUT_LENGTH, parseStaad, registerParsingCommands } from '../src/index';
import { registerCommand, type CommandHandler } from '../src/staad/index';
import { toMeters } from '../src/resolve-units';
import type { ParseContext } from '../src/core';
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
 * End-to-end parseStaad contract (01-04):
 * - (1) the real corpus fixture parses WITHOUT throwing using only the
 *       core-state handlers (+ this test's JOINT COORDINATES stub): UNIT and
 *       STAAD run through the real COMMAND_TABLE, unknown blocks become
 *       UNKNOWN_COMMAND warnings, unit state lands in the model, bounds are
 *       computed, node 2 is at y = -2.8 (key_context).
 * - (2) empty input → empty model, no warnings, P1 defaults.
 * - (3) STAAD PLANE + 2-coordinate rows → z = 0, no MALFORMED_LINE
 *       (checker #3 D-02 2D coverage).
 * - (4) STAAD SPACE + a 2-coordinate row → MALFORMED_LINE (missing z).
 * - (5) size guard: oversized input returns a warning result, never throws
 *       (T-04-01).
 *
 * NOTE: JOINT COORDINATES has no production handler in 01-04 (it arrives in
 * 01-05). This file registers a test-local stub so the pipeline's structure
 * and unit-state behavior are provable end-to-end NOW. The stub normalizes
 * coordinates through toMeters using the running unit state — the same
 * contract the 01-05 handler must implement.
 */

// Production core-state handlers (UNIT, STAAD) register when '../src/index'
// is imported above. Call the bootstrap to keep the registration surface
// explicit, then add the geometry stub.
registerParsingCommands();

const stubJointCoordinates: CommandHandler = (ctx: ParseContext, block) => {
  for (const entry of block.bodyLines) {
    const t = entry.tokens.map((tok) => tok.text);
    const id = Number(t[0]);
    const x = Number(t[1]);
    const y = Number(t[2]);
    if (t.length < 3 || !Number.isFinite(id) || !Number.isFinite(x) || !Number.isFinite(y)) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed joint row: ${t.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }
    const zTok = t[3];
    if (zTok === undefined) {
      if (ctx.structure === 'SPACE') {
        ctx.warnings.push({
          code: WARNING_CODES.MALFORMED_LINE,
          message: `Joint ${id} is missing the z coordinate (structure ${ctx.structure})`,
          line: entry.line,
          severity: 'warning',
        });
        continue;
      }
      // PLANE / FRAME: 2D row — z = 0 (checker #3).
      ctx.nodes.push({ id, x: toMeters(x, ctx.units), y: toMeters(y, ctx.units), z: 0 });
      continue;
    }
    const z = Number(zTok);
    if (!Number.isFinite(z)) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed joint row: ${t.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }
    ctx.nodes.push({ id, x: toMeters(x, ctx.units), y: toMeters(y, ctx.units), z: toMeters(z, ctx.units) });
  }
};

registerCommand(['JOINT COORDINATES', 'JNT COORD'], stubJointCoordinates);

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

    // The geometry stub parsed every joint ROW of the corpus (1122 rows;
    // ids are non-contiguous so max id is 1222) and normalized coordinates
    // through the running unit state: node 2 = (0, -2.8, 0) — key_context
    // exact value, METER factor 1.
    expect(result.model.nodes).toHaveLength(countJointRows(text));
    const maxId = result.model.nodes.reduce((m, n) => (n.id > m ? n.id : m), 0);
    expect(maxId).toBe(expected['real/HPP_Main_Building_2.std'].joints); // 1222, manifest-computed
    const node2 = result.model.nodes.find((n) => n.id === 2);
    expect(node2).toBeDefined();
    expect(node2?.x).toBe(0);
    expect(node2?.y).toBe(-2.8);
    expect(node2?.z).toBe(0);
    expect(result.model.bounds.min[1]).toBeLessThanOrEqual(-2.8);
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
