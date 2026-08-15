---
phase: 01-parser-model
plan: 2
subsystem: parser
tags: [typescript, vitest, parser, staad, tokenizer, grammar, headless, worker-ready]

# Dependency graph
requires:
  - phase: 01-parser-model (plan 01-01)
    provides: "@staad-online/parser package boundary, strict TS + Vitest toolchain, typed StaadModel contract"
provides:
  - "tokenize(text): TokenizedLine[] — the grammar layer turning raw .std text into logical entries (semicolon splitting, * comments, \" -\" continuations, quoted tokens, CRLF/LF)"
  - "Token / TokenizedLine types exported for block segmentation (01-04) and command handlers"
  - "Hand-written single-pass character scanner pattern (zero regex over untrusted input — ReDoS mitigation T-02-01)"
affects: [01-04, 01-05, 01-06, 01-07, 01-08, 01-09, phase-2-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-written character-scanner tokenizer (never regex over input content) — linear single pass, tolerant close-at-line-end"
    - "Entries, not physical lines, are the tokenizer unit: semicolon-packed lines yield N TokenizedLines sharing the 1-based source line number"

key-files:
  created:
    - packages/parser/src/tokenizer.ts
    - packages/parser/test/tokenizer.test.ts
  modified: []

key-decisions:
  - "Tokenizer emits entries (TokenizedLine { line, tokens }) not physical lines — semicolon-packed GUI output becomes N entries sharing the source line number, continuations keep the first physical line's number"
  - "Continuation detection is token-based (a standalone trailing '-' token at end of physical line) not char-based — negative numbers like -2.8 and mid-line '-' are naturally data"
  - "Unterminated quotes close at end of line (quote region = rest of line) — tolerant, never throws (T-02-03)"
  - "Line-ending normalization uses literal replaceAll (not regex) — no regex touches input content (T-02-01)"

patterns-established:
  - "Grammar-layer functions are pure, import-free, DOM-free — headless + worker-ready by construction, matching 01-01's import-free type module"

requirements-completed: [PARSE-04]

# Metrics
duration: 4min
completed: 2026-08-15
status: complete
---

# Phase 1 Plan 2: Tokenizer Summary

**Hand-written single-pass character-scanner tokenizer for `.std` grammar — `tokenize(text): TokenizedLine[]` with per-entry 1-based line numbers, handling semicolon-packed lines, `*` comments, `" -"` continuations, quoted section-DB tokens, CRLF/LF, and literal-string number preservation; zero regex over untrusted input (ReDoS mitigation), zero imports, worker-ready**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-15T22:38:58Z
- **Completed:** 2026-08-15T22:43:00Z
- **Tasks:** 3 (RED / GREEN / REFACTOR — full TDD cycle)
- **Files modified:** 2 created

## Accomplishments

- **RED (780fe96):** 11-test behavior suite covering every PARSE-04 grammar case — semicolon-packed entries, `*` comments (incl. indented), `" -"` continuation joining, CRLF==LF equivalence, quoted `'EUROPE (EN 2023).DB3'` / `'IPE 300'` tokens with `quoted` flag, literal number strings (`1.` `0.` `1E3` `1.0E-03` `-2.8`), empty-line drop, commas-as-data. Suite failed exactly as planned (module absent)
- **GREEN (ac0cb6a):** `tokenize()` implemented as a hand-written linear state machine — no regex over input content (threat T-02-01 mitigate), single pass, tolerant (never throws, T-02-03). All 11 tests green; strict `tsc --noEmit` clean
- **REFACTOR (bdf7c70):** 9 hardening edge-case tests added and passing — unterminated quote closes at line end, lone `-` mid-entry / non-final `-` / negative numbers are data not continuation, consecutive-semicolon empty entries dropped, 3+-line chained continuations, continuation after semicolon-packed line preserving first line number, dangling `-` at EOF dropped, 2000-token line in linear time. Scanner confirmed already single-pass — no structural refactor needed
- **Full suite:** 27 tests green (20 tokenizer + 7 types-smoke), `npx tsc --noEmit` exit 0
- **Exports for 01-04:** `tokenize`, `TokenizedLine`, `Token` — the `key_links` contract (block segmentation consumes `TokenizedLine[]`) is satisfied

## Task Commits

Each TDD stage was committed atomically:

1. **Task 1 (RED): failing tokenizer tests** — `780fe96` (test)
2. **Task 2 (GREEN): implement tokenizer** — `ac0cb6a` (feat)
3. **Task 3 (REFACTOR): harden tokenizer edge cases** — `bdf7c70` (refactor)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified

- `packages/parser/src/tokenizer.ts` — `tokenize(text): TokenizedLine[]`; `Token { text, quoted }`, `TokenizedLine { line, tokens }`; hand-written single-pass scanner: line-ending normalization via literal `replaceAll`, blank/comment-line skip, semicolon entry splitting, token-based trailing-`-` continuation detection with cross-line merge, quoted-token capture with strip+flag, entry merge via in-flight `pending` state
- `packages/parser/test/tokenizer.test.ts` — 20-test suite: 11 behavior-contract tests (RED) + 9 tolerance-hardening edge cases (REFACTOR)

## Decisions Made

- **Entries as the tokenizer unit:** each `TokenizedLine` is one logical entry with a 1-based source line number; semicolon-packed physical lines yield N entries sharing the line number (matches how `JOINT COORDINATES` lines appear in real GUI files, D-01). Continuations keep the first physical line's number — exactly the "1 TO 7 -" list-range pattern in PITFALLS P2.
- **Token-based continuation detection:** a continuation is a *standalone* `-` token in final position of a physical line. This distinguishes `1 TO 7 -` (continuation) from `-2.8` (data, one token) and `1 - 2` (data) without special-casing negative numbers.
- **Tolerant malformed-input handling:** unterminated quote → quote region extends to end of line; consecutive semicolons → empty entries dropped; dangling `-` at EOF → marker dropped. Malformed input never throws (T-02-03 mitigate: degrades to warnings downstream in 01-04).
- **No regex on content:** line-ending normalization uses string `replaceAll` (literal), not a regex — preserving the documented ReDoS mitigation (PITFALLS security table, T-02-01).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **pwsh commit-message quoting (Task 1):** the first `git commit` attempt failed with `error: unknown switch '\'` because an embedded `" -"` double-quote inside a double-quoted pwsh argument terminated the string early. Resolved by switching to single-quoted pwsh `-m` arguments; commit succeeded unchanged on retry. No impact on content or history.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Tokenizer is the spine primitive for 01-04 (block segmentation + `parseStaad`):** `parseStaad` will consume `TokenizedLine[]`, group entries into command blocks by canonicalized command name, and run the unit-state machine + command handlers — all the PARSE-04 grammar cases are already proven here.
- **Ready for plan 01-03** per roadmap order (depends_on chain).
- Blockers: none.

---

*Phase: 01-parser-model*
*Completed: 2026-08-15*

## Self-Check: PASSED

- All 3 key files exist on disk (src/tokenizer.ts, test/tokenizer.test.ts, 01-02-SUMMARY.md)
- All 3 TDD gate commits found in git history in order: `780fe96` (test) → `ac0cb6a` (feat) → `bdf7c70` (refactor)
- `npx vitest run test/tokenizer.test.ts` 20/20 green; full suite 27/27 green; `npx tsc --noEmit` exit 0
- No regex over input content (no `new RegExp`, no `replace(/.../`/`match(`/`split(` regex usages in tokenizer.ts)
- `tokenize`, `TokenizedLine`, `Token` exported for 01-04 consumption