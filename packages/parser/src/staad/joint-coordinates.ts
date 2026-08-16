/**
 * JOINT COORDINATES command handler (01-05 Task 2, PARSE-01 joints).
 *
 * Parses the JOINT COORDINATES block body into typed Node records:
 * - each entry is `id x y [z]` (semicolon-packed entries already arrived as
 *   separate TokenizedLine entries from the tokenizer — the real HPP fixture
 *   shape is `1 0 0 0; 2 0 -2.8 0;`);
 * - coordinates are normalized to METERS through the RUNNING unit state
 *   (PITFALLS P1 — `toMeters` against `ctx.units`; the UNIT handler mutates
 *   that state as the file is consumed);
 * - 1-based source ids are preserved (D-04 — engineers reference joint
 *   numbers in coordination);
 * - a 2-coordinate row (Z omitted) is valid ONLY under a 2D structure
 *   (PLANE/FRAME, D-02): z defaults to 0. Under SPACE it is MALFORMED_LINE
 *   and the row is skipped — a fabricated z=0 must never enter the model.
 *
 * Tolerance (P2 / D-06): trailing tokens after z are tolerated (unknown
 * specifiers are non-fatal); malformed rows push a MALFORMED_LINE warning
 * with the source line and are skipped — the handler never throws.
 *
 * Security:
 * - T-05-02: duplicate joint ids are deduped via a Map — first wins, the
 *   collision warns MALFORMED_LINE (never plain-object keys).
 * - T-05-04: coordinates are strict-number-parsed (NaN/Infinity rejected) —
 *   no eval, no regex-driven parsing.
 *
 * Headless + worker-ready: zero DOM/global access.
 */

import type { CommandBlock, ParseContext } from '../core';
import { toMeters } from '../resolve-units';
import { WARNING_CODES, type Node } from '../types';
import { registerCommand } from './index';

/** Strict finite-number parse for a coordinate token (T-05-04). */
function parseCoord(s: string | undefined): number | null {
  if (s === undefined || s.length === 0) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export function jointCoordinatesHandler(ctx: ParseContext, block: CommandBlock): void {
  // Map-based lookup: dedupe (T-05-02) and id → node access without plain
  // object keys (prototype-pollution surface). Seeded from ctx so the handler
  // stays correct even if other blocks contributed nodes first.
  const nodeById = new Map(ctx.nodes.map((n) => [n.id, n]));

  for (const entry of block.bodyLines) {
    const t = entry.tokens.map((tok) => tok.text);

    const id = parseCoord(t[0]);
    if (id === null) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed joint row (bad id): ${t.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    if (nodeById.has(id)) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Duplicate joint id ${id} — keeping the first occurrence`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    const x = parseCoord(t[1]);
    const y = parseCoord(t[2]);
    if (x === null || y === null) {
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Malformed joint row (bad x/y): ${t.join(' ')}`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    let z: number;
    const zTok = t[3];
    if (zTok !== undefined) {
      const zz = parseCoord(zTok);
      if (zz === null) {
        ctx.warnings.push({
          code: WARNING_CODES.MALFORMED_LINE,
          message: `Malformed joint row (bad z): ${t.join(' ')}`,
          line: entry.line,
          severity: 'warning',
        });
        continue;
      }
      z = zz;
    } else if (ctx.structure === 'PLANE' || ctx.structure === 'FRAME') {
      // 2D model (D-02): Z omitted → 0. A 2D model may still give z explicitly.
      z = 0;
    } else {
      // SPACE + missing z: the row is malformed — skip, never fabricate z=0.
      ctx.warnings.push({
        code: WARNING_CODES.MALFORMED_LINE,
        message: `Joint ${id} is missing the z coordinate (structure ${ctx.structure})`,
        line: entry.line,
        severity: 'warning',
      });
      continue;
    }

    // Trailing tokens beyond x/y/z are tolerated (P2 — non-fatal specifiers).

    const node: Node = {
      id,
      x: toMeters(x, ctx.units),
      y: toMeters(y, ctx.units),
      z: toMeters(z, ctx.units),
    };
    nodeById.set(id, node);
    ctx.nodes.push(node);
  }
}

// Register on import (module side effect, see units.ts). The canonical key
// 'JOINT COORDINATES' covers abbreviated spellings (JNT COORD, JOINT COORD)
// because canonicalizeCommand expands P2 aliases before dispatch.
registerCommand(['JOINT COORDINATES'], jointCoordinatesHandler);
