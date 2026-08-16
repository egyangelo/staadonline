/**
 * Expected counts for every fixture (D-09 dual-tier validation source of truth).
 *
 * Tier 1 — REAL fixture (`real/HPP_Main_Building_2.std`): `expectedReal` is
 * COMPUTED by the deterministic counting helpers below — never hand-typed
 * magic numbers (the plan forbids hardcoding the 92 KB file's counts by hand).
 *
 * Tier 2 — hand-written fixtures (`handwritten/*.std`): `expectedHandwritten`
 * holds exact constants; each fixture is small enough to count manually.
 *
 * Helpers use only simple string operations (whitespace splitting, prefix
 * checks, `;` splitting, digit checks) — no regex over content, matching the
 * tokenizer's no-regex stance (T-02-01) and the plan's "simple string
 * operations" instruction. They run over the known real fixture at test time
 * only (threat T-03-02 — accepted).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolved from this module's own location — never process.cwd(). */
const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

export interface FixtureCounts {
  /** Max numeric joint id in the JOINT COORDINATES block (joints are 1-based, D-04). */
  joints: number;
  /** Member rows: semicolon-terminated entries in MEMBER INCIDENCES. */
  members: number;
  /** Element rows: semicolon-terminated entries in ELEMENT INCIDENCES. */
  elements: number;
  /** Named group entries in START GROUP DEFINITION (between START and END markers). */
  groups: number;
  /** Expanded joint ids in SUPPORTS rows (sum of numeric-prefix words, plates excluded). */
  supports: number;
  /** Primary load-case headers: lines `LOAD <numeric id> LOADTYPE`. */
  loadPrimary: number;
  /** Load-combination records: lines `LOAD COMB <id>`. */
  loadComb: number;
  /** loadPrimary + loadComb (checker #9 disambiguation: two distinct load records). */
  loadCases: number;
  /** Tokens of the FIRST UNIT line (PITFALLS P1 — units are stateful; first switch wins for the manifest). */
  unit: { length: string; force: string };
}

// ---------------------------------------------------------------------------
// Deterministic counting helpers (documented inline; reused by 01-05 parser tests)
// ---------------------------------------------------------------------------

/** Normalize line endings (literal replaceAll — no regex) and split into lines. */
function normalizeLines(text: string): string[] {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
}

/** Whitespace-split a line into words without regex. */
function splitWords(line: string): string[] {
  const words: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (ch === ' ' || ch === '\t') {
      if (cur.length > 0) {
        words.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) words.push(cur);
  return words;
}

/** True when every character is a digit (0-9). */
function isDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

/** True when the line starts a new command header (first char A-Z). Data lines start with digits or `_`. */
function isCommandHeader(line: string): boolean {
  const c = line.charCodeAt(0);
  return c >= 65 && c <= 90;
}

/** First word of a line (used for joint-id extraction). */
function firstWord(line: string): string {
  return splitWords(line)[0] ?? '';
}

/**
 * Count joints as the MAX numeric joint id in the JOINT COORDINATES block.
 * Joints are 1-based and (in this corpus) contiguous, so max id == count.
 */
export function countJoints(text: string): number {
  const lines = normalizeLines(text);
  const start = lines.findIndex((l) => l.trim().startsWith('JOINT COORDINATES'));
  if (start === -1) return 0; // no joint block → no joints
  let max = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('*')) continue;
    if (isCommandHeader(line)) break; // next command block
    for (const entry of line.split(';')) {
      const t = entry.trim();
      if (t.length === 0) continue;
      const id = Number.parseInt(firstWord(t), 10);
      if (Number.isFinite(id) && id > max) max = id;
    }
  }
  return max;
}

/**
 * Count rows as semicolon-terminated entries inside the named block.
 * Used for MEMBER INCIDENCES (members) and ELEMENT INCIDENCES (elements).
 * Accepts full and abbreviated header forms (PITFALLS P2 — `MEMB INCI`,
 * `ELEM INCI`); returns 0 when the block header is absent (fixtures without
 * the block must not leak counts from the rest of the file).
 */
function countBlockEntries(text: string, headers: string[]): number {
  const lines = normalizeLines(text);
  const start = lines.findIndex((l) => headers.some((h) => l.trim().startsWith(h)));
  if (start === -1) return 0;
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('*')) continue;
    if (isCommandHeader(line)) break; // next command block
    for (const entry of line.split(';')) {
      if (entry.trim().length > 0) count++;
    }
  }
  return count;
}

/** Member rows in MEMBER INCIDENCES (accepts `MEMB INCI` abbreviation). */
export function countMemberRows(text: string): number {
  return countBlockEntries(text, ['MEMBER INCIDENCES', 'MEMB INCI']);
}

/** Element rows in ELEMENT INCIDENCES (incl. ELEMENT INCIDENCES SHELL). */
export function countElementRows(text: string): number {
  return countBlockEntries(text, ['ELEMENT INCIDENCES', 'ELEM INCI']);
}

/**
 * Count NAMED group entries inside START GROUP DEFINITION ... END GROUP
 * DEFINITION. Sub-headers (JOINT / ELEMENT / MEMBER), `*` comments, blank
 * lines, and digit-leading continuation lines are excluded.
 */
export function countGroupEntries(text: string): number {
  const lines = normalizeLines(text);
  const start = lines.findIndex((l) => l.trim().startsWith('START GROUP DEFINITION'));
  if (start === -1) return 0; // no group block → no group entries (fixtures without groups)
  const endIdx = lines.findIndex((l, i) => i > start && l.trim().startsWith('END GROUP DEFINITION'));
  const end = endIdx === -1 ? lines.length : endIdx;
  const SUB_HEADERS = new Set(['JOINT', 'ELEMENT', 'MEMBER']);
  let count = 0;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('*')) continue;
    const first = firstWord(line);
    if (SUB_HEADERS.has(first)) continue;
    const c = first.charCodeAt(0);
    // Named entry: starts with `_` or a letter. Continuation lines start with digits.
    if (c === 95 || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)) count++;
  }
  return count;
}

/** Primary load-case headers: `LOAD <numeric id> LOADTYPE` (e.g. `LOAD 13 LOADTYPE Seismic-H`). */
export function countLoadPrimary(text: string): number {
  let count = 0;
  for (const line of normalizeLines(text)) {
    const t = splitWords(line);
    if (t.length >= 3 && t[0] === 'LOAD' && isDigits(t[1]) && t[2] === 'LOADTYPE') count++;
  }
  return count;
}

/** Load-combination records: `LOAD COMB <id>`. */
export function countLoadComb(text: string): number {
  let count = 0;
  for (const line of normalizeLines(text)) {
    const t = splitWords(line);
    if (t.length >= 3 && t[0] === 'LOAD' && t[1] === 'COMB' && isDigits(t[2])) count++;
  }
  return count;
}

/** Tokens of the first UNIT line (e.g. `UNIT METER KN` → { length: 'METER', force: 'KN' }). */
export function detectUnit(text: string): { length: string; force: string } {
  for (const line of normalizeLines(text)) {
    const t = splitWords(line);
    if (t[0] === 'UNIT' && t.length >= 3) {
      return { length: t[1], force: t[2] };
    }
  }
  return { length: '', force: '' };
}

/**
 * Count expanded joint ids inside the SUPPORTS block. Each data line is a
 * joint list + restraint keyword (e.g. `14 16 18 20 22 24 1118 1121 PINNED`);
 * the count is the sum of all-digit words per non-plate row. Plate rows
 * (leading group-name `_` token + PLATE marker) are excluded — they produce
 * no Support records (D-07). Ranges (`1 TO 5`) are not used in the corpus's
 * SUPPORTS blocks (verified against the real file and all hand-written
 * fixtures) — the helper counts literal ids only, matching the parser's
 * expansion for these fixtures.
 */
export function countSupports(text: string): number {
  const lines = normalizeLines(text);
  const start = lines.findIndex((l) => l.trim().startsWith('SUPPORTS'));
  if (start === -1) return 0; // no SUPPORTS block → no supports (fixtures without supports)
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('*')) continue;
    if (isCommandHeader(line)) break; // next command block
    for (const entry of line.split(';')) {
      const words = splitWords(entry.trim());
      if (words.length === 0 || isDigits(words[0]) === false) continue; // plate rows, `_` group refs
      for (const w of words) {
        if (isDigits(w)) count++;
      }
    }
  }
  return count;
}

/** Compute the full count set for a fixture text (used for the real file). */
export function computeRealCounts(text: string): FixtureCounts {
  const loadPrimary = countLoadPrimary(text);
  const loadComb = countLoadComb(text);
  return {
    joints: countJoints(text),
    members: countMemberRows(text),
    elements: countElementRows(text),
    groups: countGroupEntries(text),
    supports: countSupports(text),
    loadPrimary,
    loadComb,
    loadCases: loadPrimary + loadComb,
    unit: detectUnit(text),
  };
}

// ---------------------------------------------------------------------------
// Tier 1 — REAL fixture: computed, never hardcoded
// ---------------------------------------------------------------------------

const REAL_FIXTURE_PATH = join(FIXTURE_DIR, 'real', 'HPP_Main_Building_2.std');
const realText = readFileSync(REAL_FIXTURE_PATH, 'utf8');

export const expectedReal: FixtureCounts = computeRealCounts(realText);

// ---------------------------------------------------------------------------
// Tier 2 — hand-written fixtures: exact constants (small enough to count by hand)
// ---------------------------------------------------------------------------

export const expectedHandwritten: Record<string, FixtureCounts> = {
  'plane-2d': {
    joints: 3,
    members: 2,
    elements: 0,
    groups: 0,
    supports: 2, // `1 2 PINNED`
    loadPrimary: 0,
    loadComb: 0,
    loadCases: 0,
    unit: { length: 'METER', force: 'KN' },
  },
  'feet-imperial': {
    joints: 3,
    members: 2,
    elements: 0,
    groups: 0,
    supports: 0, // no SUPPORTS block
    loadPrimary: 0,
    loadComb: 0,
    loadCases: 0,
    unit: { length: 'FEET', force: 'KIPS' }, // first UNIT line wins (P1)
  },
  'legacy-table': {
    joints: 3,
    members: 2,
    elements: 0,
    groups: 0,
    supports: 0, // no SUPPORTS block
    loadPrimary: 0,
    loadComb: 0,
    loadCases: 0,
    unit: { length: 'FEET', force: 'KIPS' },
  },
  'continuations': {
    joints: 3,
    members: 4, // entries 1, 2, and the `3 3 1 -` + `4 1 2` continuation-merged row (2 members in 1 entry)
    elements: 0,
    groups: 0,
    supports: 3, // `1 2 3 PINNED`
    loadPrimary: 0,
    loadComb: 0,
    loadCases: 0,
    unit: { length: 'METER', force: 'KN' },
  },
  'unknown-commands': {
    joints: 2,
    members: 1, // FROBNICATE block (header + body) is skipped with a warning — only `1 1 2` counts
    elements: 0,
    groups: 0,
    supports: 2, // `1 2 PINNED`
    loadPrimary: 0,
    loadComb: 0,
    loadCases: 0,
    unit: { length: 'METER', force: 'KN' },
  },
};

// ---------------------------------------------------------------------------
// `expected` — the D-09 per-fixture expected-count map (single source of truth)
// ---------------------------------------------------------------------------

export const expected: Record<string, FixtureCounts> = {
  'real/HPP_Main_Building_2.std': expectedReal,
  'handwritten/plane-2d.std': expectedHandwritten['plane-2d'],
  'handwritten/feet-imperial.std': expectedHandwritten['feet-imperial'],
  'handwritten/legacy-table.std': expectedHandwritten['legacy-table'],
  'handwritten/continuations.std': expectedHandwritten['continuations'],
  'handwritten/unknown-commands.std': expectedHandwritten['unknown-commands'],
};