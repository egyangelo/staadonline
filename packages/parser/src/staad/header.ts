/**
 * STAAD header handler (01-04) — producer for ctx.structure (checker #3).
 *
 * Parses the first block header entry `STAAD PLANE|SPACE|FRAME` (real line 1
 * is `STAAD SPACE`; the plane-2d fixture is `STAAD PLANE`) and sets
 * `ctx.structure` accordingly. Default remains 'SPACE'.
 *
 * Downstream consumers: JOINT COORDINATES only accepts 2-coordinate rows
 * when structure is PLANE/FRAME — without this, D-02's 2D coverage silently
 * drops every plane joint.
 */

import type { CommandBlock, ParseContext } from '../core';
import { registerCommand } from './index';

type Structure = ParseContext['structure'];

const STRUCTURE_KINDS: Record<string, Structure> = Object.freeze({
  PLANE: 'PLANE',
  SPACE: 'SPACE',
  FRAME: 'FRAME',
});

function staadHeaderHandler(ctx: ParseContext, block: CommandBlock): void {
  const kindToken = block.name[1]?.text.toUpperCase() ?? '';
  const kind = STRUCTURE_KINDS[kindToken];
  if (kind !== undefined) ctx.structure = kind;
  // Unknown or missing kind token: keep the SPACE default (tolerant).
}

// Register on import (module side effect, see units.ts).
registerCommand(['STAAD'], staadHeaderHandler);
