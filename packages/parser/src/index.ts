/**
 * Public entry point for the STAAD .std parser (01-04, ARCHITECTURE.md
 * Pattern 1): `parseStaad(text): ParseResult` is the ONLY public API. It is
 * pure, headless, and worker-ready — zero DOM/Three/global access.
 *
 * Flow: size guard → tokenize → segment blocks → dispatch each block through
 * COMMAND_TABLE (longest canonical prefix) → finalize. Unknown commands push
 * an UNKNOWN_COMMAND warning and their body is skipped — the parse never
 * throws on unexpected input (PARSE-03 tolerance).
 *
 * Threat model:
 * - T-04-01: a 64 MB input-size guard returns a warning result instead of
 *   allocating/tokenizing (memory-exhaustion DoS).
 * - T-04-02: entity storage is Map-based throughout (no prototype-pollution
 *   surface).
 */

import { canonicalizeCommand, createContext, finalize, segmentBlocks } from './core';
import { createUnitState } from './resolve-units';
import { resolveHandler } from './staad/index';
import { tokenize } from './tokenizer';
import { WARNING_CODES, type ParseResult, type ParseWarning, type StaadModel } from './types';

// Side-effect registration of the core-state handlers (01-04). 01-09 extends
// this import list with the remaining handler modules (geometry, loads,
// supports, groups, properties).
import './staad/units';
import './staad/header';

/** Input-size guard threshold (T-04-01): larger inputs are refused, not parsed. */
export const MAX_INPUT_LENGTH = 64_000_000;

/**
 * Bootstrap the production command set. The core-state handlers (UNIT, STAAD)
 * register via the static side-effect imports above; 01-09 completes the
 * import list with the remaining handler modules. Production code calls this
 * once at startup so the registration surface stays explicit.
 */
export function registerParsingCommands(): void {
  // Registration happens on module import (side effects above).
}

/** Empty model with P1 default units — used by the size guard's warning result. */
function emptyModel(): StaadModel {
  return {
    nodes: [],
    members: [],
    sections: new Map(),
    supports: [],
    loadCases: [],
    groups: new Map(),
    units: createUnitState(),
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

/**
 * Parse raw `.std` text into a typed StaadModel plus collected warnings.
 * Never throws on malformed or unknown input — problems degrade to
 * structured warnings (D-06/D-07).
 */
export function parseStaad(text: string): ParseResult {
  if (text.length > MAX_INPUT_LENGTH) {
    const warning: ParseWarning = {
      code: WARNING_CODES.IGNORED_COMMAND,
      message: `Input exceeds the ${MAX_INPUT_LENGTH}-character limit; parse aborted`,
      line: 0, // no specific source line — the whole input was refused
      severity: 'error',
    };
    return { model: emptyModel(), warnings: [warning] };
  }

  const entries = tokenize(text);
  const ctx = createContext();
  const blocks = segmentBlocks(entries);

  for (const block of blocks) {
    const key = canonicalizeCommand(block.name);
    const handler = resolveHandler(key);
    if (handler !== undefined) {
      handler(ctx, block);
    } else {
      ctx.warnings.push({
        code: WARNING_CODES.UNKNOWN_COMMAND,
        message: `Unknown command: ${key}`,
        line: block.line,
        severity: 'warning',
      });
    }
  }

  return { model: finalize(ctx), warnings: ctx.warnings };
}
