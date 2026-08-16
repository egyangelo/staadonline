/**
 * STAAD member-list range expansion (01-05 Task 1, PARSE-01).
 *
 * PITFALLS P2 list syntax: explicit ids (`1 2 3`), ranges (`1 TO 5`),
 * stepped ranges (`1 TO 9 BY 2`), `ALL` (resolved against a caller-supplied
 * member/node count reference), and mixed forms (`1 TO 3 7 9 TO 11`).
 * Consumed by MEMBER INCIDENCES (01-05), MEMBER PROPERTY / SUPPORTS / LOAD
 * lists (01-06+), and START GROUP DEFINITION (01-08) — the real corpus's
 * `_RAFT 132 TO 162 211 212 ...` group rows are this exact shape.
 *
 * Security (threat T-05-01, PITFALLS security — "recursive/explosive
 * expansions ... zip-bomb-style"): expansion is BOUNDED. `maxRef` clamps the
 * range (member lists reference existing members — an id above the count is a
 * dangling reference and is dropped); without `maxRef` a hard cap
 * (`LIST_HARD_CAP`) bounds the allocation. Range bounds are validated BEFORE
 * any allocation, and a total-entry guard stops the scan once the cap is
 * reached — a hostile `1 TO 999999999` can never materialize a billion-entry
 * array.
 *
 * Tolerant (P2): non-numeric tokens are skipped, never fatal; a descending
 * range (`5 TO 1`) expands to nothing.
 *
 * Headless + worker-ready: zero DOM/global access.
 */

/** Hard cap on list expansion when the caller provides no `maxRef` (T-05-01). */
export const LIST_HARD_CAP = 1_000_000;

export interface ExpandListOptions {
  /**
   * Reference size (member/node count) that `ALL` resolves to and that range
   * ends are clamped to. When absent, `ALL` expands to nothing (unresolvable)
   * and ranges are clamped at `LIST_HARD_CAP`.
   */
  maxRef?: number;
}

/**
 * Parse a token as a strictly-valid positive integer list id (member/joint
 * numbers are 1-based, D-04). Accepts STAAD number spellings (`1.`, `1E3` —
 * PITFALLS P2 trailing-dot floats); rejects NaN/Infinity (T-05-04) and values
 * below 1. Returns null for non-numeric or invalid tokens.
 */
export function parseListId(s: string | undefined): number | null {
  if (s === undefined || s.length === 0) return null;
  const v = Number(s);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1) return null;
  return v;
}

/**
 * Length (in tokens) of the list item starting at `tokens[i]`:
 * - 1 for a bare id or `ALL`;
 * - 3 for `n TO m`;
 * - 5 for `n TO m BY k`;
 * - 0 when `tokens[i]` cannot start a list item (non-numeric, not ALL).
 *
 * Used by MEMBER INCIDENCES to find where the member list ends and the node
 * pair begins (the scanner primitive for row boundary detection).
 */
export function listItemLength(tokens: readonly string[], i: number): number {
  const t = tokens[i]?.toUpperCase() ?? '';
  if (t === 'ALL') return 1;
  if (parseListId(tokens[i]) === null) return 0;
  if (tokens[i + 1]?.toUpperCase() === 'TO') {
    if (parseListId(tokens[i + 2]) === null) return 0;
    if (tokens[i + 3]?.toUpperCase() === 'BY') {
      const step = parseListId(tokens[i + 4]);
      return step !== null ? 5 : 3;
    }
    return 3;
  }
  return 1;
}

/**
 * Expand space-separated member-list tokens into concrete 1-based ids.
 *
 * Skips non-numeric tokens (tolerant — they are not part of the list and must
 * not crash the parse). Each emitted id is ≤ `maxRef` when provided, else the
 * hard cap. The scan stops entirely once `LIST_HARD_CAP` ids have been
 * produced (zip-bomb guard).
 */
export function expandList(tokens: readonly string[], opts: ExpandListOptions = {}): number[] {
  const cap = opts.maxRef ?? LIST_HARD_CAP;
  const ids: number[] = [];

  let i = 0;
  while (i < tokens.length) {
    if (ids.length >= LIST_HARD_CAP) break; // total-entry guard (T-05-01)

    const item = tokens[i].toUpperCase();
    if (item === 'ALL') {
      if (opts.maxRef !== undefined) {
        for (let v = 1; v <= cap; v++) ids.push(v);
      }
      // ALL without maxRef: no reference to resolve against → nothing (tolerant).
      i++;
      continue;
    }

    const startVal = parseListId(tokens[i]);
    if (startVal === null) {
      i++; // non-numeric token → skipped (tolerant, P2)
      continue;
    }

    if (tokens[i + 1]?.toUpperCase() === 'TO') {
      const endVal = parseListId(tokens[i + 2]);
      let step = 1;
      let consumed = 3;
      if (endVal !== null && tokens[i + 3]?.toUpperCase() === 'BY') {
        const s = parseListId(tokens[i + 4]);
        if (s !== null && s >= 1) {
          step = s;
          consumed = 5;
        }
      }
      if (endVal !== null) appendRange(ids, startVal, endVal, step, cap);
      i += consumed;
      continue;
    }

    // Bare explicit id — bounded by the cap.
    if (startVal <= cap) ids.push(startVal);
    i++;
  }

  return ids;
}

/**
 * Append `start..end` stepping by `step` to `ids`, clamped to `cap`.
 * Validates the range bounds BEFORE allocating (T-05-01): descending or
 * all-above-cap ranges produce nothing.
 */
function appendRange(ids: number[], start: number, end: number, step: number, cap: number): void {
  let lo = start < 1 ? 1 : start;
  const hi = end > cap ? cap : end;
  if (hi < lo) return; // descending / out-of-cap range → nothing
  for (let v = lo; v <= hi; v += step) {
    ids.push(v);
  }
}
