/**
 * Unit-state machine — the running unit context for the STAAD .std parser
 * (PARSE-02 / PITFALLS P1).
 *
 * Units are STATEFUL, not file-global: `UNIT` lines can appear any number of
 * times and every value read after a declaration is interpreted in the most
 * recent one (Bentley TR.3). When `UNIT` is absent the default is
 * FEET + KIPS. This module owns the state; every handler that reads a
 * physical dimension converts via `toMeters` against the CURRENT state.
 *
 * Length factor table (meters base, per TR.3):
 *   IN=0.0254, FT/FE=0.3048, ME=1, DM=0.1, CM=0.01, MM=0.001, KM=1000
 * Force tokens (KIP/KIPS, KN, N, KG, LB, MT, ...) are recorded for display
 * only — force does not affect geometry conversion.
 *
 * Implementation notes:
 * - Map-based alias tables (never plain objects keyed by unit names) —
 *   PITFALLS security: no prototype-pollution surface on untrusted tokens.
 * - Tolerant per T-04-04: `applyUnitCommand` validates the WHOLE line against
 *   the alias tables first and mutates the state only when every token is
 *   recognized; malformed lines emit MALFORMED_LINE and leave the state
 *   unchanged. A redundant UNIT line emits no warning at all.
 * - Headless + worker-ready: zero DOM/global access.
 */

import type { TokenizedLine } from './tokenizer';
import { WARNING_CODES, type ParseWarning, type UnitForce, type UnitLength } from './types';

/** Running unit state. Canonical values are the UnitLength/UnitForce literals. */
export interface UnitState {
  length: UnitLength;
  force: UnitForce;
}

interface LengthAlias {
  /** Canonical UnitLength the token maps to. */
  canonical: UnitLength;
  /** Meters per canonical unit (geometry is normalized to meters). */
  meters: number;
}

/**
 * Length-unit aliases per TR.3 + PITFALLS P1 abbreviations.
 * Canonical names ('IN', 'FT', 'M', 'DM', 'CM', 'MM', 'KM') are keys too, so
 * a state value always resolves to its own factor.
 */
const LENGTH_ALIASES = new Map<string, LengthAlias>([
  // inches
  ['IN', { canonical: 'IN', meters: 0.0254 }],
  ['INCH', { canonical: 'IN', meters: 0.0254 }],
  ['INCHES', { canonical: 'IN', meters: 0.0254 }],
  // feet
  ['FT', { canonical: 'FT', meters: 0.3048 }],
  ['FE', { canonical: 'FT', meters: 0.3048 }],
  ['FEET', { canonical: 'FT', meters: 0.3048 }],
  // meters
  ['M', { canonical: 'M', meters: 1 }],
  ['ME', { canonical: 'M', meters: 1 }],
  ['METER', { canonical: 'M', meters: 1 }],
  ['METERS', { canonical: 'M', meters: 1 }],
  // decimeters / centimeters / millimeters / kilometers
  ['DM', { canonical: 'DM', meters: 0.1 }],
  ['CM', { canonical: 'CM', meters: 0.01 }],
  ['MM', { canonical: 'MM', meters: 0.001 }],
  ['MMS', { canonical: 'MM', meters: 0.001 }],
  ['KM', { canonical: 'KM', meters: 1000 }],
]);

/**
 * Force-unit aliases (display only). KIPS canonicalizes to KIP — the STAAD
 * token KIPS maps to the UnitForce union literal KIP locked in 01-02.
 */
const FORCE_ALIASES = new Map<string, UnitForce>([
  ['KIP', 'KIP'],
  ['KIPS', 'KIP'],
  ['KN', 'KN'],
  ['N', 'N'],
  ['DN', 'DN'],
  ['NE', 'NE'],
  ['MN', 'MN'],
  ['MT', 'MT'],
  ['KG', 'KG'],
  ['KGF', 'KG'],
  ['LB', 'LB'],
  ['LBS', 'LB'],
  ['PO', 'PO'],
]);

/** P1 default: FEET + KIPS. Stored canonically as FT/KIP (01-02 literal unions). */
export function createUnitState(): UnitState {
  return { length: 'FT', force: 'KIP' };
}

/**
 * Apply a tokenized `UNIT ...` entry (e.g. `UNIT METER KN`) to the running
 * state. `entry.tokens[0]` is the UNIT keyword (guaranteed by command
 * dispatch) and is skipped; every remaining token must be a recognized
 * length or force alias, otherwise the whole line is malformed and the state
 * is left unchanged (T-04-04).
 *
 * Emits warnings through the `warn` callback:
 * - UNIT_CHANGE (info) when the state actually changes — NOT for a redundant
 *   declaration that keeps the current units;
 * - MALFORMED_LINE (warning) when any token is unrecognized or no alias at
 *   all is present.
 *
 * A length-only line (`UNIT INCH`) changes length and leaves force as-is;
 * a force-only line (`UNIT KIP`) changes force and leaves length as-is.
 */
export function applyUnitCommand(
  entry: TokenizedLine,
  state: UnitState,
  warn: (warning: ParseWarning) => void,
): void {
  const tokens = entry.tokens;

  let newLength: UnitLength | undefined;
  let newForce: UnitForce | undefined;
  let badToken: string | null = null;

  for (let i = 1; i < tokens.length; i++) {
    const text = tokens[i].text.toUpperCase();
    const lengthAlias = LENGTH_ALIASES.get(text);
    if (lengthAlias !== undefined) {
      newLength = lengthAlias.canonical;
      continue;
    }
    const forceAlias = FORCE_ALIASES.get(text);
    if (forceAlias !== undefined) {
      newForce = forceAlias;
      continue;
    }
    badToken = tokens[i].text;
    break;
  }

  // Validate the WHOLE line before mutating: any unrecognized token (or no
  // alias at all) → MALFORMED_LINE, state unchanged.
  if (badToken !== null || (newLength === undefined && newForce === undefined)) {
    const raw = tokens.map((t) => t.text).join(' ');
    warn({
      code: WARNING_CODES.MALFORMED_LINE,
      message: `Unrecognized unit specification: ${raw}`,
      line: entry.line,
      severity: 'warning',
    });
    return;
  }

  const oldLength = state.length;
  const oldForce = state.force;
  if (newLength !== undefined) state.length = newLength;
  if (newForce !== undefined) state.force = newForce;

  if (state.length !== oldLength || state.force !== oldForce) {
    warn({
      code: WARNING_CODES.UNIT_CHANGE,
      message: `Units changed from ${oldLength}/${oldForce} to ${state.length}/${state.force}`,
      line: entry.line,
      severity: 'info',
    });
  }
}

/** Convert a value in the state's current length unit to METERS. */
export function toMeters(value: number, state: UnitState): number {
  const alias = LENGTH_ALIASES.get(state.length);
  // state.length is always a canonical key (createUnitState / applyUnitCommand
  // only ever store canonical literals), so the alias is guaranteed present.
  return value * (alias as LengthAlias).meters;
}
