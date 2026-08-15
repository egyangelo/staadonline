import { describe, expect, it } from 'vitest';
import {
  WARNING_CODES,
  type ParseResult,
  type ParseWarning,
  type SectionProfile,
  type StaadModel,
} from '../src/types';

/** The six stable codes locked in D-06/D-07. */
const EXPECTED_WARNING_CODES = [
  'UNKNOWN_COMMAND',
  'IGNORED_COMMAND',
  'SKIPPED_ELEMENT',
  'UNRESOLVED_SECTION',
  'MALFORMED_LINE',
  'UNIT_CHANGE',
] as const;

describe('WARNING_CODES (D-06/D-07)', () => {
  it('exports exactly the six stable codes', () => {
    expect(Object.keys(WARNING_CODES).sort()).toEqual([...EXPECTED_WARNING_CODES].sort());
  });

  it('has an entry for every expected code', () => {
    for (const code of EXPECTED_WARNING_CODES) {
      expect(WARNING_CODES).toHaveProperty(code);
      expect(Object.values(WARNING_CODES)).toContain(code);
    }
  });
});

describe('ParseWarning shape (D-06)', () => {
  it('constructs a warning with each code carrying a severity', () => {
    for (const code of Object.values(WARNING_CODES)) {
      const warning: ParseWarning = {
        code,
        message: `sample message for ${code}`,
        line: 12,
        severity: 'warning',
      };
      expect(warning.code).toBe(code);
      expect(warning.severity).toBe('warning');
      expect(warning.line).toBe(12);
      expect(typeof warning.message).toBe('string');
    }
  });

  it('supports error and info severities', () => {
    const err: ParseWarning = {
      code: WARNING_CODES.UNKNOWN_COMMAND,
      message: 'm',
      line: 1,
      severity: 'error',
    };
    const info: ParseWarning = {
      code: WARNING_CODES.UNIT_CHANGE,
      message: 'm',
      line: 2,
      severity: 'info',
    };
    expect(err.severity).toBe('error');
    expect(info.severity).toBe('info');
  });
});

describe('SectionProfile.approximate (D-05 contract)', () => {
  it('is a boolean on every profile', () => {
    const fallback: SectionProfile = {
      label: 'W14X90',
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      approximate: true,
    };
    const exact: SectionProfile = {
      label: 'PRIS',
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      approximate: false,
    };
    expect(typeof fallback.approximate).toBe('boolean');
    expect(fallback.approximate).toBe(true);
    expect(exact.approximate).toBe(false);
  });
});

describe('StaadModel shape (D-03)', () => {
  it('assembles a complete typed model with Map containers', () => {
    const model: StaadModel = {
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 5, y: 0, z: 0 },
      ],
      members: [{ id: 1, startNode: 1, endNode: 2, sectionKey: 'PRIS', group: 'G1', material: 'STEEL' }],
      sections: new Map([
        [
          'PRIS',
          {
            label: 'PRIS',
            points: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
            approximate: false,
            family: 'PRISMATIC',
            dims: '0.3 0.3',
            area: 0.09,
          },
        ],
      ]),
      supports: [
        {
          nodeId: 1,
          type: 'PINNED',
          releases: { FX: false, FY: false, FZ: false, MX: true, MY: true, MZ: true },
          line: 10,
        },
      ],
      loadCases: [
        {
          id: 1,
          title: 'DL',
          loadtype: 'DEAD',
          items: [{ kind: 'JOINT_LOAD', axis: 'Y', axisRef: 'GLOBAL', magnitude: -100, targets: [2], line: 15 }],
        },
      ],
      groups: new Map([['G1', { name: 'G1', memberIds: [1], jointIds: [], elementIds: [] }]]),
      units: { length: 'M', force: 'KN' },
      bounds: {
        min: [0, 0, 0],
        max: [5, 0, 0],
      },
    };

    expect(model.nodes).toHaveLength(2);
    expect(model.members[0].sectionKey).toBe('PRIS');
    expect(model.sections.get('PRIS')?.family).toBe('PRISMATIC');
    expect(model.sections.get('PRIS')?.approximate).toBe(false);
    expect(model.supports[0].releases.MX).toBe(true);
    expect(model.loadCases[0].items[0].targets).toEqual([2]);
    expect(model.groups.get('G1')?.memberIds).toEqual([1]);
    expect(model.units.length).toBe('M');
  });

  it('produces a ParseResult with a warnings array', () => {
    const result: ParseResult = {
      model: {
        nodes: [],
        members: [],
        sections: new Map(),
        supports: [],
        loadCases: [],
        groups: new Map(),
        units: { length: 'FT', force: 'KIP' },
        bounds: {
          min: [0, 0, 0],
          max: [0, 0, 0],
        },
      },
      warnings: [
        { code: WARNING_CODES.UNKNOWN_COMMAND, message: 'ignored command', line: 1, severity: 'warning' },
      ],
    };
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe(WARNING_CODES.UNKNOWN_COMMAND);
    expect(result.model.units.force).toBe('KIP');
  });
});