---
phase: 01-parser-model
plan: 1
subsystem: parser
tags: [typescript, vitest, parser, staad, types, headless, worker-ready]

# Dependency graph
requires: []
provides:
  - "@staad-online/parser package boundary (strict TS 7 + Vitest 4, zero runtime deps)"
  - "Complete typed StaadModel contract consumed by the tokenizer/handlers/finalize (plans 01-02..01-09) and the Phase 2 renderer"
  - "Stable WARNING_CODES (six codes) and ParseWarning shape per D-06/D-07"
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, phase-2-rendering]

# Tech tracking
tech-stack:
  added: [typescript 7.0.2, vitest 4.1.10]
  patterns:
    - "Source-first package exports (main/exports -> ./src/index.ts); bundler resolves TS"
    - "Map-based containers for sections and groups (sections: Map<string, SectionProfile & SectionMeta>)"
    - "STAAD abbreviated unit tokens as literal unions (UnitLength/UnitForce)"
    - "Import-free type module — headless + worker-ready enforced by construction"

key-files:
  created:
    - packages/parser/src/types.ts
    - packages/parser/test/types-smoke.test.ts
    - packages/parser/package.json
    - packages/parser/package-lock.json
    - packages/parser/tsconfig.json
    - packages/parser/vitest.config.ts
    - .gitignore
  modified: []

key-decisions:
  - "Parser ships as standalone package @staad-online/parser with source-first exports; zero runtime dependencies per STACK.md (dependency-free by design)"
  - "Unit tokens are STAAD's abbreviated forms ('FT', 'IN', 'KIP', 'LB', 'KN', 'M') — literal unions, not long names"
  - "Sections and groups stored in Map containers (no eval-prone structures) per threat model T-01 boundary"
  - "TypeScript 7.0.2 + Vitest 4.1.10 installed as latest stable per STACK.md"

patterns-established:
  - "Type module is import-free (zero DOM/Three/runtime imports) — the headless + worker-ready invariant holds by construction"

requirements-completed: [PARSE-05]

# Metrics
duration: 3min
completed: 2026-08-15
status: complete
---

# Phase 1 Plan 1: Parser Package Scaffold & Typed Model Summary

**Standalone `@staad-online/parser` package (strict TS 7 + Vitest 4, zero runtime dependencies) with the complete typed `StaadModel` contract — 12 exported types, Map containers for sections/groups, and six stable machine-readable warning codes, headless and worker-ready per ARCHITECTURE.md Pattern 1**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-15T19:31:40Z
- **Completed:** 2026-08-15T19:34:27Z
- **Tasks:** 3 (1 blocking-human gate approved, 2 auto executed)
- **Files modified:** 7

## Accomplishments

- `packages/parser/` standalone package: `package.json` (`@staad-online/parser`, private, ESM, source-first exports), strict `tsconfig.json` (ES2022, bundler resolution, `noEmit`), `vitest.config.ts` scoped to `test/**/*.test.ts` — zero runtime dependencies
- Complete typed model in `src/types.ts` per D-03/D-04: `Node`, `Member`, `SectionProfile`, `SectionMeta`, `Support`, `LoadCase`, `LoadItem`, `Group`, `Bounds`, `ParseWarning`, `StaadModel`, `ParseResult` — all `id`/`nodeId`/`startNode`/`endNode` fields preserve original 1-based `.std` numbers (D-04)
- `WARNING_CODES` const with the six stable D-06/D-07 codes (UNKNOWN_COMMAND, IGNORED_COMMAND, SKIPPED_ELEMENT, UNRESOLVED_SECTION, MALFORMED_LINE, UNIT_CHANGE); `ParseWarning` carries `{ code, message, line, severity }`
- `SectionProfile.approximate: boolean` contract for the D-05 approximate-fallback flag
- types-smoke test suite (7 tests) green: exact six codes, warning construction per code with severity, approximate flag, full `StaadModel` + `ParseResult` assembly
- Root `.gitignore` added (node_modules/dist hygiene — repo had none)

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy gate (typescript + vitest)** — user-approved (blocking-human checkpoint, no commit)
2. **Task 2: Scaffold parser package + install tooling** — `7262248` (chore)
3. **Task 3: Define complete typed model + warning codes** — `cfd1b5a` (feat)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified

- `packages/parser/package.json` — `@staad-online/parser` manifest: private, ESM, source-first exports, `test`/`typecheck` scripts, devDeps typescript ^7.0.2 + vitest ^4.1.10
- `packages/parser/package-lock.json` — lockfile from `npm install` (46 packages, 0 vulnerabilities)
- `packages/parser/tsconfig.json` — strict, ES2022, module ESNext, moduleResolution bundler, noEmit, includes src + test
- `packages/parser/vitest.config.ts` — test include `test/**/*.test.ts`
- `packages/parser/src/types.ts` — the complete typed model + `WARNING_CODES` (zero imports)
- `packages/parser/test/types-smoke.test.ts` — 7-test smoke suite asserting codes, warning shape, approximate flag, model assembly
- `.gitignore` — node_modules/, dist/

## Decisions Made

- **Package boundary:** `@staad-online/parser` is a standalone package with source-first exports (`./src/index.ts`); Phase 2's Vite app imports it by name. Zero runtime dependencies — the parser is dependency-free by design (STACK.md).
- **Unit token literals:** `UnitLength`/`UnitForce` use STAAD's abbreviated tokens exactly as the `UNIT` command emits them (`'FT'`, `'IN'`, `'KIP'`, `'LB'`, `'KN'`, `'M'`...) — the parser's unit-state machine (01-04) maps these directly.
- **Map containers:** `sections` and `groups` are `Map`s (lookup by sectionKey/group name), matching the threat-model preference for Map-based containers with no eval-prone structures.
- **Tooling versions:** TypeScript 7.0.2 (native line) + Vitest 4.1.10 — latest stable per STACK.md, verified against the npm registry before install.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Smoke test used 'FEET' instead of the locked 'FT' unit token**
- **Found during:** Task 3 (typed model + smoke test)
- **Issue:** The smoke test's ParseResult fixture used `length: 'FEET'`, which is not in the locked `UnitLength` union — the plan specifies STAAD's abbreviated `'FT'`. `tsc --noEmit` failed with TS2322.
- **Fix:** Changed fixture to `length: 'FT'`; types.ts itself was correct.
- **Files modified:** packages/parser/test/types-smoke.test.ts
- **Verification:** `npx tsc --noEmit` exit 0; vitest 7/7 green
- **Committed in:** cfd1b5a (Task 3 commit)

**2. [Rule 2 - Missing Critical] Added root .gitignore (node_modules hygiene)**
- **Found during:** Task 2 (npm install)
- **Issue:** Repo had no `.gitignore`; `npm install` generated `packages/parser/node_modules/` which would otherwise remain permanently untracked and risk accidental commits of 46 packages of tooling.
- **Fix:** Added root `.gitignore` with `node_modules/` and `dist/`.
- **Files modified:** .gitignore
- **Verification:** `git check-ignore packages/parser/node_modules` returns the path; commit staged only intended files
- **Committed in:** 7262248 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both were corrective — one test-fixture token fix (the locked union is authoritative), one repo-hygiene necessity. No scope creep; the typed model shipped exactly per D-03/D-04/D-06/D-07.

## Issues Encountered

- **Package-legitimacy gate (Task 1):** The plan requires a blocking-human checkpoint before any npm install. The prior executor surfaced `typescript` (npmjs.com/package/typescript, Microsoft) and `vitest` (npmjs.com/package/vitest, Vite team); the user approved with "install". Install completed cleanly: 46 packages, 0 vulnerabilities.
- **Vitest version assumption:** package.json initially pinned vitest ^3.2.4 from assumption; `npm view vitest version` showed latest stable is **4.1.10**, corrected before install (4.x keeps the `defineConfig`/`test.include` API used here).

## User Setup Required

None - no external service configuration required. Local dev: `cd packages/parser && npm install` (already done), `npm test` / `npm run typecheck`.

## Next Phase Readiness

- Types contract is the spine every downstream plan consumes: 01-02 (tokenizer), 01-04 (ParseResult assembly + finalize), 01-05..01-08 (command handlers), 01-09 (golden verification), and Phase 2's renderer all import from `packages/parser/src/types.ts`.
- `ParseResult` is wired as the return type of `parseStaad` (implemented in 01-04) — the key_link from this plan is satisfied by the type definition.
- Blockers: none. Ready for plan 01-02 (Tokenizer, TDD).

---
*Phase: 01-parser-model*
*Completed: 2026-08-15*

## Self-Check: PASSED

- All 7 key files exist on disk (package.json, package-lock.json, tsconfig.json, vitest.config.ts, src/types.ts, test/types-smoke.test.ts, .gitignore)
- Both task commits found in git history: `7262248` (chore), `cfd1b5a` (feat)
- `npx tsc --noEmit` strict-clean (exit 0); `npx vitest run` 7/7 green
- WARNING_CODES exports exactly the six D-07 codes (test-asserted); runtime deps: NONE