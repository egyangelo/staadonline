# Phase 1: Parser & Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 1-Parser & Model
**Areas discussed:** Golden corpus, Model schema, Section geometry, Warnings model, Validation

---

## Golden Corpus

| Option | Description | Selected |
|--------|-------------|----------|
| You provide files | Real STAAD.Pro-generated .std files from different versions | ✓ |
| OSS samples + hand-written | OpenBuilding samples + hand-written edge cases | |
| Hand-written only | Hand-written corpus without real files | |

**User's choice:** You provide files
**Notes:** User pointed to `E:\Software Development\STAADONLINE\staadSample`. Contains `HPP_Main_Building_2.std` (92 KB, 1774 lines) — real STAAD.Pro GUI output.

| Option | Description | Selected |
|--------|-------------|----------|
| Drop files during exec | User drops files into fixtures during execution | |
| Provide files now | Files provided before planning | |
| Placeholder now, real later | Hand-written placeholders, real files later | |

**User's choice:** Provided directory path during discussion (`staadSample`)
**Notes:** Sample inspected — metric METER KN, semicolon-packed JOINT COORDINATES, PRIS properties, quoted-DB `'EUROPE (EN 2023).DB3'` + `TABLE 'IPE' ST`, member ranges `TO`, START GROUP DEFINITION, ELEMENT INCIDENCES SHELL (plates), DEFINE MATERIAL, CONSTANTS, SUPPORTS, DEFINE REFERENCE LOADS, LOAD cases, DEFINE WIND LOAD, PERFORM ANALYSIS, design blocks.

| Option | Description | Selected |
|--------|-------------|----------|
| Real + hand-written | staadSample files + hand-written edge cases | ✓ |
| Real files only | Validate only against staadSample/ | |

**User's choice:** Real + hand-written
**Notes:** Hand-written fixtures cover 2D PLANE (Z omitted), FEET/imperial units, older unquoted TABLE syntax, `" -"` continuations, unknown-command tolerance.

---

## Model Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Full typed model | Typed records for Node, Member, Section, Support, LoadCase, LoadItem, Group, Bounds | ✓ |
| Minimal raw arrays | Just arrays of raw parsed values | |
| Typed interfaces only | Typed flat records, no classes | |

**User's choice:** Full typed model
**Notes:** Fields sized for downstream renderer, inspector, and summary panel.

| Option | Description | Selected |
|--------|-------------|----------|
| Source numbers | Keep original 1-based .std numbers as source-of-truth IDs | ✓ |
| 0-based indexes | 0-based internal indexes; source numbers as display field | |

**User's choice:** Source numbers
**Notes:** Engineers reference member/joint numbers in coordination; 1-based preserved.

---

## Section Geometry

| Option | Description | Selected |
|--------|-------------|----------|
| PRIS + fallback | PRIS→rect polygons; TABLE ST→approximate fallback + flag; full DB in Phase 2 | ✓ |
| Bundle DB now | Bundle AISC/steel section DB in Phase 1 | |

**User's choice:** PRIS + fallback
**Notes:** Section DB decision deferred to Phase 2 per research.

---

## Warnings Model

| Option | Description | Selected |
|--------|-------------|----------|
| Structured warnings | {code, message, line, severity} with stable codes; warnings[] on ParseResult | ✓ |
| Plain strings | String messages only, no codes | |

**User's choice:** Structured warnings

| Option | Description | Selected |
|--------|-------------|----------|
| Categorize all | Warnings for unknown commands, skipped plates, unresolved sections, malformed lines, unit changes | ✓ |
| Minimal categories | Only skipped/unknown commands | |

**User's choice:** Categorize all
**Notes:** Tests assert on warning codes.

---

## Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest + snapshots | Vitest with golden-file snapshots | ✓ |
| node:test | Built-in runner, zero deps | |
| Vitest explicit asserts | No snapshots, explicit expected values | |

**User's choice:** Vitest + snapshots
**Notes:** Parser is headless — no DOM.

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-tier | Hand-written fixtures assert exact counts/values; real files assert tolerant no-crash + counts | ✓ |
| Crash-free only | Real files only assert no-crash | |

**User's choice:** Dual-tier

---

## the agent's Discretion

- Parser internal structure (tokenizer vs scanner, command-dispatch table layout) — follow research ARCHITECTURE.md.
- Precise stable warning-code naming scheme.
- Fixture directory layout inside the parser package.

## Deferred Ideas

- Full bundled section database (AISC/steel) — Phase 2.
- Analysis results (`.OUT` files) — next milestone.
- Multi-format support (`.e2k`, `.s2k`) — future; keep parser format-isolated.