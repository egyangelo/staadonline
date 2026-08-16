/**
 * UNIT command handler (01-04) — closes checker #2: the unit-state machine
 * must be reachable from COMMAND_TABLE, else every real file parses
 * coordinates at the FEET default (a 3.28x scale error invisible to
 * count-only tests).
 *
 * Registered as a module-import side effect; the handler forwards the block
 * header tokens (e.g. `UNIT METER KN` at real line 14) to
 * `applyUnitCommand`, which mutates the running unit state (PITFALLS P1).
 */

import type { CommandBlock, ParseContext } from '../core';
import { applyUnitCommand } from '../resolve-units';
import { registerCommand } from './index';

function unitsHandler(ctx: ParseContext, block: CommandBlock): void {
  applyUnitCommand(
    { line: block.line, tokens: block.name },
    ctx.units,
    (w) => ctx.warnings.push(w),
  );
}

// Register on import (01-09 assembles the production entry via
// registerParsingCommands which imports this module for its side effect).
registerCommand(['UNIT'], unitsHandler);
