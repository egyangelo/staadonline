import { describe, expect, it } from 'vitest';
import { tokenize, type Token, type TokenizedLine } from '../src/tokenizer';

/**
 * Tokenizer behavior contract (PARSE-04 / PITFALLS P2):
 *
 * - `;` packs multiple entries per physical line → N TokenizedLines sharing the source line number
 * - Whole-line comments (`*` as first non-blank char) are omitted
 * - A line ending with a standalone `-` continues onto the next physical line (trailing `-` dropped)
 * - Tokens split on whitespace, never commas
 * - Single-quoted tokens are preserved as one token (inner spaces kept), quotes stripped, `quoted: true`
 * - Numbers stay literal strings (`1.`, `0.`, `1E3`, `1.0E-03`, `-2.8`) — no numeric parsing here
 * - Command abbreviations are NOT expanded (canonicalize's job in 01-04)
 * - Empty lines are dropped
 */

const texts = (out: TokenizedLine[]): string[][] => out.map((l) => l.tokens.map((t) => t.text));

describe('tokenize (PARSE-04 grammar cases)', () => {
  it('splits a semicolon-packed physical line into one entry per statement, all sharing the line number', () => {
    const out = tokenize('1 0 0 0; 2 0 3.5 0; 3 6 3.5 0');
    expect(out).toHaveLength(3);
    for (const entry of out) expect(entry.line).toBe(1);
    expect(texts(out)).toEqual([
      ['1', '0', '0', '0'],
      ['2', '0', '3.5', '0'],
      ['3', '6', '3.5', '0'],
    ]);
  });

  it('omits whole lines whose first non-blank char is *', () => {
    const out = tokenize('* this is a comment\n1 2 3');
    expect(out).toHaveLength(1);
    expect(out[0].line).toBe(2);
    expect(texts(out)).toEqual([['1', '2', '3']]);
  });

  it('omits indented comment lines too', () => {
    const out = tokenize('   * indented comment\n4 5');
    expect(out).toHaveLength(1);
    expect(out[0].line).toBe(2);
    expect(texts(out)).toEqual([['4', '5']]);
  });

  it('joins a physical line ending with " -" to the next line into a single entry (trailing - dropped)', () => {
    const out = tokenize('1 TO 7 -\n8 9');
    expect(out).toHaveLength(1);
    expect(out[0].line).toBe(1);
    expect(texts(out)).toEqual([['1', 'TO', '7', '8', '9']]);
  });

  it('treats CRLF and LF line endings identically', () => {
    const lf = tokenize('1 2 3\n4 5 6\n7 8 9');
    const crlf = tokenize('1 2 3\r\n4 5 6\r\n7 8 9');
    expect(texts(crlf)).toEqual(texts(lf));
    expect(crlf.map((e) => e.line)).toEqual(lf.map((e) => e.line));
  });

  it('preserves quoted tokens as single tokens with inner spaces, stripping quotes and tagging quoted', () => {
    const out = tokenize("'EUROPE (EN 2023).DB3' 1 2");
    expect(out).toHaveLength(1);
    expect(texts(out)).toEqual([['EUROPE (EN 2023).DB3', '1', '2']]);
    expect(out[0].tokens[0].quoted).toBe(true);
    expect(out[0].tokens[1].quoted).toBe(false);
    expect(out[0].tokens[2].quoted).toBe(false);
  });

  it('preserves quoted multi-word section names like IPE 300', () => {
    const out = tokenize("'IPE 300' ST");
    expect(texts(out)).toEqual([['IPE 300', 'ST']]);
    expect(out[0].tokens[0].quoted).toBe(true);
  });

  it('preserves trailing-dot and scientific-notation numbers as literal strings', () => {
    const out = tokenize('1. 0. 1E3 1.0E-03 -2.8');
    expect(texts(out)).toEqual([['1.', '0.', '1E3', '1.0E-03', '-2.8']]);
    for (const t of out[0].tokens) expect(t.quoted).toBe(false);
  });

  it('drops empty lines', () => {
    const out = tokenize('\n1 2\n\n3 4\n');
    expect(texts(out)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('treats commas as data, not token separators', () => {
    const out = tokenize('1, 2, 3');
    expect(texts(out)).toEqual([['1,', '2,', '3']]);
  });
});

describe('tokenize token shape', () => {
  it('exposes Token and TokenizedLine shapes', () => {
    const token: Token = { text: '1', quoted: false };
    const entry: TokenizedLine = { line: 1, tokens: [token] };
    expect(token).toEqual({ text: '1', quoted: false });
    expect(entry.line).toBe(1);
    expect(entry.tokens[0].text).toBe('1');
  });
});

describe('tokenize tolerance hardening (edge cases)', () => {
  it('closes an unterminated quote at end of line without throwing', () => {
    const out = tokenize("'EUROPE (EN 2023 1 2");
    expect(out).toHaveLength(1);
    // The quote region extends to end of line: everything after the opening
    // quote becomes one quoted token; the trailing content is not re-split.
    expect(out[0].tokens).toEqual([{ text: 'EUROPE (EN 2023 1 2', quoted: true }]);
  });

  it('treats a lone "-" mid-entry as data, not a continuation', () => {
    const out = tokenize('1 - 2');
    expect(out).toHaveLength(1);
    expect(texts(out)).toEqual([['1', '-', '2']]);
  });

  it('treats a "-" not in final position as data even at end of a member list', () => {
    const out = tokenize('1 TO 7 - 8');
    expect(out).toHaveLength(1);
    expect(texts(out)).toEqual([['1', 'TO', '7', '-', '8']]);
  });

  it('treats negative numbers as data, not continuations', () => {
    const out = tokenize('-2.8 -1');
    expect(out).toHaveLength(1);
    expect(texts(out)).toEqual([['-2.8', '-1']]);
  });

  it('drops empty entries produced by consecutive semicolons', () => {
    const out = tokenize('1 2;;3 4;');
    expect(texts(out)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('chains continuations across more than two physical lines', () => {
    const out = tokenize('1 TO 7 -\n8 9 -\n10');
    expect(out).toHaveLength(1);
    expect(out[0].line).toBe(1);
    expect(texts(out)).toEqual([['1', 'TO', '7', '8', '9', '10']]);
  });

  it('continues an entry after a semicolon-packed line, preserving line numbers', () => {
    const out = tokenize('1 0 0; 2 1 0 -\n3 2 0');
    expect(out).toHaveLength(2);
    expect(texts(out)).toEqual([
      ['1', '0', '0'],
      ['2', '1', '0', '3', '2', '0'],
    ]);
    expect(out[0].line).toBe(1);
    expect(out[1].line).toBe(1); // continuation keeps the first physical line's number
  });

  it('drops a dangling continuation hyphen at end of input', () => {
    const out = tokenize('1 TO 7 -');
    expect(out).toHaveLength(1);
    expect(texts(out)).toEqual([['1', 'TO', '7']]);
  });

  it('handles very long lines in linear time without pathological behavior', () => {
    const many = Array.from({ length: 2000 }, (_, i) => String(i));
    const out = tokenize(many.join(' '));
    expect(out).toHaveLength(1);
    expect(out[0].tokens).toHaveLength(2000);
    expect(out[0].tokens[1999].text).toBe('1999');
  });
});