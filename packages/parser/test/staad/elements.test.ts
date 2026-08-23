/**
 * Tolerant ELEMENT INCIDENCES / ELEMENT PROPERTIES handlers (05-01 Task 2,
 * PLATE-01/PLATE-03).
 *
 * - clean quads → typed Plate records (triangles = quad with repeated node,
 *   never warned)
 * - range rows / group refs / non-clean rows → ONE SKIPPED_ELEMENT warning
 *   per row, zero records, never a throw (D-05-01, T-05-03)
 * - ELEMENT PROPERTIES resolves thickness by element id (simple + numeric
 *   `TO` ranges); unresolvable forms warn per row
 * - duplicates: first record wins, later ones warn (T-05-04)
 */
import { describe, expect, it } from 'vitest';

import { parseStaad } from '../../src';
import { WARNING_CODES } from '../../src/types';
import { countElementRows } from '../fixtures/manifest';
import { loadFixture } from '../fixtures/loadFixture';

function skippedWarnings(warnings: { code: string }[]): number {
  return warnings.filter((w) => w.code === WARNING_CODES.SKIPPED_ELEMENT).length;
}

describe('ELEMENT INCIDENCES (PLATE-01)', () => {
  it('(1) clean quad row yields exactly one Plate record', () => {
    const result = parseStaad(
      'STAAD SPACE\nUNIT METER KN\nJOINT COORDINATES\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\nELEMENT INCIDENCES\n1 1 2 3 4\n',
    );
    expect(result.model.elements.length).toBe(1);
    expect(result.model.elements[0]).toEqual({ id: 1, nodes: [1, 2, 3, 4] });
    expect(result.model.elements[0].thickness).toBeUndefined();
  });

  it('(2) triangle row stores the repeated node as-is and never warns', () => {
    const result = parseStaad(
      'JOINT COORDINATES\n1 0 0 0\n2 1 0 0\n3 0 1 0\nELEMENT INCIDENCES\n5 1 2 3 3\n',
    );
    expect(result.model.elements.length).toBe(1);
    expect(result.model.elements[0]).toEqual({ id: 5, nodes: [1, 2, 3, 3] });
    expect(skippedWarnings(result.warnings)).toBe(0);
  });

  it('(3) semicolon-packed rows produce one record per entry', () => {
    const result = parseStaad(
      'JOINT COORDINATES\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\n5 2 1 0\n6 2 0 0\n7 3 1 0\n8 3 0 0\nELEMENT INCIDENCES\n1 1 2 3 4; 2 5 6 7 8;\n',
    );
    expect(result.model.elements.map((p) => p.id)).toEqual([1, 2]);
  });

  it('(4) range row warns SKIPPED_ELEMENT once and produces zero records (T-05-03)', () => {
    const result = parseStaad('ELEMENT INCIDENCES\n1 TO 5 1 2 3 4\n');
    expect(result.model.elements.length).toBe(0);
    expect(skippedWarnings(result.warnings)).toBe(1);
  });

  it('(5) _GROUP reference row warns SKIPPED_ELEMENT once, zero records', () => {
    const result = parseStaad('ELEMENT INCIDENCES\n_RAFT 1 2 3 4\n');
    expect(result.model.elements.length).toBe(0);
    expect(skippedWarnings(result.warnings)).toBe(1);
  });

  it('(6) malformed row (wrong arity) warns once, never throws', () => {
    const result = parseStaad('ELEMENT INCIDENCES\n9 1 2 3 4 5\n');
    expect(result.model.elements.length).toBe(0);
    expect(skippedWarnings(result.warnings)).toBe(1);
  });

  it('(7) duplicate element id warns once, first record wins (T-05-04)', () => {
    const result = parseStaad(
      'JOINT COORDINATES\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\n5 2 0 0\nELEMENT INCIDENCES\n1 1 2 3 4\n1 1 2 3 5\n',
    );
    expect(result.model.elements.length).toBe(1);
    expect(result.model.elements[0].nodes).toEqual([1, 2, 3, 4]);
    expect(skippedWarnings(result.warnings)).toBe(1);
  });

  it('(8) empty deck parses without throwing', () => {
    const result = parseStaad('ELEMENT INCIDENCES\n');
    expect(result.model.elements).toEqual([]);
  });
});

describe('ELEMENT PROPERTIES (PLATE-01/D-05-04)', () => {
  it('(9) simple per-id row sets thickness on the matching plate', () => {
    const result = parseStaad(
      'JOINT COORDINATES\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\nELEMENT INCIDENCES\n1 1 2 3 4\nELEMENT PROPERTIES\n1 THICK 0.2\n',
    );
    expect(result.model.elements[0].thickness).toBe(0.2);
  });

  it('(10) numeric TO range applies thickness to every covered plate', () => {
    const result = parseStaad(
      'JOINT COORDINATES\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\n5 2 0 0\n6 2 1 0\n7 3 0 0\n8 3 1 0\nELEMENT INCIDENCES\n1 1 2 3 4\n2 5 6 7 8\nELEMENT PROPERTY\n1 TO 2 THICKNESS 0.35\n',
    );
    expect(result.model.elements.map((p) => p.thickness)).toEqual([0.35, 0.35]);
  });

  it('(11) unresolvable property row (UNKNOWN group ref) warns SKIPPED_ELEMENT once per row', () => {
    const result = parseStaad(
      'ELEMENT INCIDENCES\n1 1 2 3 4\nELEMENT PROPERTIES\n_NOPE THICKNESS 0.6\n',
    );
    expect(skippedWarnings(result.warnings)).toBe(1);
    expect(result.model.elements[0].thickness).toBeUndefined();
  });

  it('(14) group-ref row applies thickness to every element of a defined group', () => {
    const result = parseStaad(
      'JOINT COORDINATES\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\n5 2 0 0\n6 2 1 0\n7 3 0 0\n8 3 1 0\n' +
        'ELEMENT INCIDENCES\n1 1 2 3 4; 2 5 6 7 8;\n' +
        'START GROUP DEFINITION\nELEMENT\n_RAFT 1 TO 2\nEND GROUP DEFINITION\n' +
        'ELEMENT PROPERTY\n_RAFT THICKNESS 0.6\n',
    );
    expect(result.model.elements.map((p) => p.thickness)).toEqual([0.6, 0.6]);
  });

  it('(12) properties for an unknown element id are tolerated without throw', () => {
    const result = parseStaad('ELEMENT PROPERTIES\n99 THICK 0.2\n');
    expect(result.model.elements).toEqual([]);
  });
});

describe('golden fixture element count (PLATE-01)', () => {
  it('(13) HPP fixture parses 938 typed plates end-to-end', () => {
    const text = loadFixture('real/HPP_Main_Building_2.std');
    const expected = countElementRows(text);
    expect(expected).toBe(938);
    const result = parseStaad(text);
    expect(result.model.elements.length).toBe(expected);
  });
});
