import { describe, expect, it } from 'vitest';
import type { TokenizedLine } from '../src/tokenizer';
import { WARNING_CODES, type ParseWarning } from '../src/types';
import { applyUnitCommand, createUnitState, toMeters, type UnitState } from '../src/resolve-units';

/**
 * Unit-state machine contract (PARSE-02 / PITFALLS P1):
 *
 * - Units are STATEFUL: default FEET + KIPS (canonical storage 'KIP' — the
 *   UnitForce union locked in 01-02 holds KIP, not the STAAD token KIPS).
 * - `UNIT` lines switch the running state; every later numeric token is
 *   interpreted in the most recent declaration (Bentley TR.3).
 * - Aliases per PITFALLS P1 / TR.3: IN/INCH/INCHES, FT/FEET/FE, ME/METER/M,
 *   MM/MMS, DM, CM, KM; force KIP/KIPS, KN, N, KG, LB, MT.
 * - A redundant UNIT line (no state change) emits NO warning; a change emits
 *   exactly one UNIT_CHANGE; an unrecognized unit token leaves the state
 *   unchanged and emits MALFORMED_LINE (T-04-04: validated aliases only).
 * - Length factor table (meters base): IN=0.0254, FT/FE=0.3048, ME=1,
 *   DM=0.1, CM=0.01, MM=0.001, KM=1000. Force is display-only.
 */

/** Build a tokenized UNIT entry from a plain string (tokens split on whitespace). */
function unitEntry(line: number, text: string): TokenizedLine {
  return { line, tokens: text.split(' ').filter((s) => s.length > 0).map((t) => ({ text: t, quoted: false })) };
}

/** Collect warnings into an array while applying a UNIT line. */
function apply(state: UnitState, lineText: string, line = 10): { state: UnitState; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  applyUnitCommand(unitEntry(line, lineText), state, (w) => warnings.push(w));
  return { state, warnings };
}

describe('unit-state defaults (P1)', () => {
  it('fresh state has length FEET and force KIPS (canonical KIP)', () => {
    const state = createUnitState();
    expect(state.length).toBe('FEET');
    expect(state.force).toBe('KIP');
  });
});

describe('applyUnitCommand mid-file switches (TR.3)', () => {
  it("'UNIT METER KN' switches the running state to M / KN", () => {
    const state = createUnitState();
    apply(state, 'UNIT METER KN');
    expect(state.length).toBe('M');
    expect(state.force).toBe('KN');
  });

  it('applies the most recent unit declaration (stateful, not file-global)', () => {
    const state = createUnitState();
    apply(state, 'UNIT METER KN', 14);
    apply(state, 'UNIT INCH', 40); // later declaration wins for subsequent tokens
    expect(state.length).toBe('IN');
    expect(state.force).toBe('KN'); // force untouched by a length-only switch
  });
});

describe('toMeters factor table', () => {
  it("'UNIT INCH' → 12 in = 0.3048 m", () => {
    const state = createUnitState();
    apply(state, 'UNIT INCH');
    expect(toMeters(12, state)).toBeCloseTo(0.3048, 12);
  });

  it("'UNIT FEET' → 1 ft = 0.3048 m exactly", () => {
    const state = createUnitState();
    apply(state, 'UNIT FEET');
    expect(toMeters(1, state)).toBe(0.3048);
  });

  it("'UNIT METER' is the identity (1 m = 1 m)", () => {
    const state = createUnitState();
    apply(state, 'UNIT METER');
    expect(toMeters(1, state)).toBe(1);
  });
});

describe('unit token aliases (PITFALLS P1 abbreviations)', () => {
  it("accepts 'UNIT MMS' as millimeters", () => {
    const state = createUnitState();
    apply(state, 'UNIT MMS');
    expect(state.length).toBe('MM');
  });

  it("accepts 'UNIT FE' as feet", () => {
    const state = createUnitState();
    apply(state, 'UNIT FE');
    expect(state.length).toBe('FT');
  });

  it("accepts 'UNIT ME' as meters", () => {
    const state = createUnitState();
    apply(state, 'UNIT ME');
    expect(state.length).toBe('M');
  });

  it("accepts 'UNIT KIP' as the KIPS force token (canonical KIP)", () => {
    const state = createUnitState();
    apply(state, 'UNIT KIP');
    expect(state.force).toBe('KIP');
  });
});

describe('warning emission rules (D-06/D-07)', () => {
  it('a unit switch emits exactly one UNIT_CHANGE warning with the source line', () => {
    const warnings: ParseWarning[] = [];
    applyUnitCommand(unitEntry(14, 'UNIT METER KN'), createUnitState(), (w) => warnings.push(w));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(WARNING_CODES.UNIT_CHANGE);
    expect(warnings[0].line).toBe(14);
    expect(warnings[0].severity).toBe('info');
  });

  it("a redundant 'UNIT METER KN' when already M/KN emits no warning", () => {
    const state = createUnitState();
    apply(state, 'UNIT METER KN', 14);
    const { warnings } = apply(state, 'UNIT METER KN', 200);
    expect(warnings).toHaveLength(0);
  });

  it("a malformed unit line ('UNIT BANANA PINEAPPLE') leaves state unchanged and emits MALFORMED_LINE", () => {
    const state = createUnitState();
    const { warnings } = apply(state, 'UNIT BANANA PINEAPPLE', 60);
    expect(state.length).toBe('FEET');
    expect(state.force).toBe('KIP');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
    expect(warnings[0].line).toBe(60);
    expect(warnings[0].severity).toBe('warning');
  });

  it('a partially unrecognized unit line also leaves the state unchanged (validated aliases only)', () => {
    const state = createUnitState();
    const { warnings } = apply(state, 'UNIT METER PINEAPPLE', 61);
    expect(state.length).toBe('FEET'); // METER alone must not apply — whole line validated first
    expect(state.force).toBe('KIP');
    expect(warnings[0].code).toBe(WARNING_CODES.MALFORMED_LINE);
  });
});
