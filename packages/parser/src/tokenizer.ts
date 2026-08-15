/**
 * Tokenizer — the grammar layer for STAAD .std input decks (PARSE-04).
 *
 * Turns raw `.std` text into structured entries (`TokenizedLine[]`) that block
 * segmentation (01-04) and command handlers consume. Handles the PITFALLS P2
 * grammar features that break naive line parsers:
 *
 * - `;` packs multiple statements per physical line → N entries sharing the line number
 * - Whole-line comments (`*` as first non-blank char) are omitted
 * - A physical line ending with a standalone `-` continues onto the next line (trailing `-` dropped)
 * - Tokens split on whitespace, never commas; commas are data
 * - Single-quoted tokens (`'EUROPE (EN 2023).DB3'`) stay one token — inner spaces kept,
 *   quotes stripped, `quoted: true`
 * - Numbers are preserved as literal strings (`1.`, `0.`, `1E3`, `1.0E-03`, `-2.8`) —
 *   numeric parsing belongs to command handlers, never here
 *
 * Implementation notes:
 * - Hand-written character scanner, NOT regex-based (PITFALLS.md security:
 *   regex-heavy tokenizers on untrusted input risk ReDoS; the hand-written
 *   linear state machine is the documented mitigation — threat T-02-01).
 * - Single linear pass over the input; tolerant of malformed input: an
 *   unterminated quote closes at end of line, empty entries are dropped,
 *   a dangling continuation hyphen at EOF is dropped — never throws
 *   (threat T-02-03: malformed input degrades to warnings downstream).
 * - Headless + worker-ready: zero imports, no DOM, no globals.
 */

/** One token from the source. */
export interface Token {
  /** The token text with surrounding single quotes stripped. */
  text: string;
  /** True when the token was single-quoted in the source. */
  quoted: boolean;
}

/**
 * One logical entry. Entries — not physical lines — are the unit: a
 * semicolon-packed physical line yields multiple TokenizedLines sharing the
 * same 1-based source line number, and a continued entry keeps the line
 * number of its first physical line.
 */
export interface TokenizedLine {
  /** 1-based original source line number (D-04 source of truth). */
  line: number;
  tokens: Token[];
}

/**
 * Tokenize raw `.std` text into logical entries.
 *
 * Line endings are normalized to `\n` first (literal string replacement —
 * CRLF files travel between Windows workstations and the web). Blank lines
 * and whole-line `*` comments are dropped. Returns an empty array for empty
 * or comment-only input.
 */
export function tokenize(text: string): TokenizedLine[] {
  // Normalize line endings via literal replacement (no regex over content).
  const src = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const entries: TokenizedLine[] = [];

  // An entry may span physical lines via `-` continuation; `pending` holds the
  // entry currently being accumulated and is flushed when the continuation ends.
  let pending: Token[] | null = null;
  let pendingLine = 1;

  let line = 1; // 1-based physical line counter
  let i = 0;
  const n = src.length;

  while (i < n) {
    // --- Physical line start: skip leading blanks, drop blanks, skip comments.
    while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
    if (i >= n) break;
    if (src[i] === '\n') {
      i++;
      line++;
      continue; // blank line → dropped
    }
    if (src[i] === '*') {
      while (i < n && src[i] !== '\n') i++; // whole-line comment → skipped
      if (i < n) i++;
      line++;
      continue;
    }

    // --- Scan this physical line into semicolon-separated token segments.
    const segments: Token[][] = [];
    let cur: Token[] = [];
    let tok = '';
    let quoted = false;
    let inQuote = false;

    const flushToken = (): void => {
      if (tok.length > 0) {
        cur.push({ text: tok, quoted });
        tok = '';
        quoted = false;
      }
    };
    const pushSegment = (): void => {
      segments.push(cur);
      cur = [];
    };

    while (i < n && src[i] !== '\n') {
      const ch = src[i];
      if (inQuote) {
        // Quoted content is literal until the closing quote (or end of line).
        if (ch === "'") {
          inQuote = false;
          flushToken();
        } else {
          tok += ch;
        }
      } else if (ch === "'") {
        flushToken();
        inQuote = true;
        quoted = true;
      } else if (ch === ';') {
        flushToken();
        pushSegment();
      } else if (ch === ' ' || ch === '\t') {
        flushToken();
      } else {
        tok += ch;
      }
      i++;
    }
    flushToken();
    pushSegment();

    // --- Continuation: last token of the last segment is a lone `-`.
    const lastSeg = segments[segments.length - 1];
    let continues = false;
    if (lastSeg.length > 0) {
      const lastToken = lastSeg[lastSeg.length - 1];
      if (lastToken.text === '-' && !lastToken.quoted) {
        continues = true;
        lastSeg.pop(); // trailing `-` is a marker, not data
      }
    }

    // --- Merge segments into entries.
    // The first segment of a physical line joins an in-flight continuation;
    // every subsequent non-empty segment starts a new entry (semicolon
    // boundary). Empty segments (consecutive `;`) are dropped.
    let firstSegment = true;
    for (const seg of segments) {
      if (seg.length === 0) continue;
      if (pending === null) {
        pending = seg;
        pendingLine = line;
        firstSegment = false;
      } else if (firstSegment) {
        pending.push(...seg); // continuation merge from the previous line
        firstSegment = false;
      } else {
        entries.push({ line: pendingLine, tokens: pending });
        pending = seg;
        pendingLine = line;
        firstSegment = false;
      }
    }

    if (!continues && pending !== null) {
      entries.push({ line: pendingLine, tokens: pending });
      pending = null;
    }

    // Consume the newline (or hit EOF) and advance the line counter.
    if (i < n && src[i] === '\n') i++;
    line++;
  }

  // EOF with an in-flight continuation: flush what was accumulated.
  if (pending !== null) {
    entries.push({ line: pendingLine, tokens: pending });
  }

  return entries;
}