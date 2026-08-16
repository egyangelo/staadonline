---
status: issues
phase: 01-parser-model
files_reviewed: 20
critical: 0
warning: 1
info: 7
total: 8
---

# Code Review: Phase 01 — Parser & Model

## Summary
The parser is high quality: a hand-written linear tokenizer (no regex over input), Map-based entity storage throughout (no prototype-pollution surface), bounded list expansion (T-05-01), and a "never throws — warn instead" contract that is consistently honored across every handler. One Warning-level hole: strict-finite validation checks raw token values but not the meter-converted result, so an overflow to `Infinity` can slip into the model. The remaining findings are tolerance/design gaps and test-coverage notes. All 176 tests pass.

## Findings

### Critical
none

### Warning
- **WR-01** — `packages/parser/src/staad/joint-coordinates.ts:116-119`, `packages/parser/src/staad/steel-resolver.ts:63-65` — **unit-conversion overflow bypasses the strict-finite contract (T-05-04).** `parseCoord`/`parseDimValue` validate `Number.isFinite(v)` on the raw token, but `toMeters(value, state)` multiplies afterward and is never re-checked. A hostile coordinate/dimension such as `9e307` in `KM` units is finite as parsed but `9e307 * 1000 === Infinity` (verified), so `Infinity` enters `Node` coords, PRIS polygon points, and `finalize` bounds — corrupting the documented "finite bounds" invariant and any downstream finite assertion. Fix: validate the converted value (`Number.isFinite(toMeters(...))`) or clamp dimensions before storing, and add a hostile-input test (e.g. `UNIT KM` + `9e307 0 0` must produce a MALFORMED_LINE warning, not an Infinity node).

### Info
- **IN-01** — `packages/parser/src/core.ts:180-198` — An unterminated `DEFINE` block silently absorbs subsequent model-definition commands (`MEMBER INCIDENCES`, `SUPPORTS`, `MEMBER PROPERTY`, ...) into its body until the next `LOAD`/`PERFORM`/`PAGE`/`PRINT`/`DEFINE` header. This is the documented checker-#8 tolerance, but geometry after a stray `DEFINE` is lost with no warning at all. Consider emitting a warning when a DEFINE block closes via a non-`END DEFINE` terminator so silent data loss is at least surfaced.
- **IN-02** — `packages/parser/src/staad/supports.ts:151` — `ALL` in a SUPPORTS row expands to nothing because `expandList(listTokens)` is called without `maxRef` (joint count), yielding a "no joint list" MALFORMED_LINE warning. A legitimate `ALL PINNED` row is rejected rather than resolved. Low impact for the current corpus; passing the joint count as `maxRef` would fix it.
- **IN-03** — `packages/parser/src/staad/loads.ts:296,337` (also `member-property.ts:174`, `constants.ts:75`) — Load/joint-load target lists are clamped to `maxRef` (max member/joint id seen so far), so an out-of-range target is silently truncated rather than recorded or warned. For a well-formed deck (incidences precede loads) this is a no-op; for decks with dangling refs it hides the reference. Consider warning when clamped ids are dropped.
- **IN-04** — `packages/parser/src/staad/lists.ts:44-49` — `parseListId` accepts hex (`0x10` → 16) and exponent (`1E3` → 1000) spellings because it uses `Number()`. Hex is not a STAAD number spelling and is harmless given the hard caps, but non-canonical. A decimal-only check (`/^\d+(\.\d+)?$/` style) would be stricter; at minimum document that hex parses.
- **IN-05** — `packages/parser/src/staad/steel-resolver.ts:42-47` — `parseDimValue` accepts zero and negative dimensions. `PRIS YD -0.5 ZD 0.5` produces a mirrored rectangle and `YD 0` a degenerate zero-area polygon, with no warning. Not exploitable, but consider rejecting `<= 0` for dims.
- **IN-06** — `packages/parser/src/staad/loads.ts:132-133,157` — `parseCombinationTerms` stops on a factor with no following reference, but the caller `loadCombHandler` never warns, contradicting the code comment "caller warned". `LOAD COMB 5 1` silently creates a combination with empty `terms`. Emit a MALFORMED_LINE there or drop the comment.
- **IN-07** — Test coverage (golden.test.ts + handwritten.test.ts are strong: exact counts, `0.3048`/`0.0254` unit factors, `z=0` 2D behavior, warning codes, continuation merges). Gaps worth noting: (a) no test exercises the WR-01 overflow path (hostile huge numbers); (b) LOAD COMB combination-term parsing has no end-to-end exact assertion; (c) no fuzz/edge-input tests for `tokenizer`/`expandList` (empty input, `;;`, lone `-`, unterminated quotes are covered unit-wise but not property-style); (d) `countJointRows` in golden.test.ts duplicates count logic in test code rather than a parser-agnostic manifest — acceptable, but it re-implements a parser heuristic.

## Notes
- ReDoS: none — the tokenizer is a hand-written single-pass scanner and the only regexes (`registerCommand`'s `\s+` collapse, test-only `/^\d+$/`) run on trusted/compile-time strings.
- State leakage between parses: none — `createContext()` is per-parse, `COMMAND_TABLE` is a null-prototype map mutated only by idempotent registration; no module-level per-parse state.
- Buffer/array bounds: all token indexing uses `?.` / guard checks; `expandList`/`appendRange` respect `LIST_HARD_CAP` and step `>= 1` (no infinite loops).
