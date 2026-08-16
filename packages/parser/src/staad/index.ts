/**
 * Command dispatch table for the STAAD .std parser (01-04).
 *
 * Handlers register under CANONICAL keys (e.g. 'UNIT', 'STAAD',
 * 'JOINT COORDINATES', 'MEMBER PROPERTY'). Dispatch resolves a block's
 * canonicalized header to the LONGEST registered key that prefixes it —
 * multi-token keys ('JOINT COORDINATES') beat single-token prefixes
 * ('JOINT'); single-token keys match their own headers.
 *
 * Registration is via module-import side effects: this plan registers the
 * core-state handlers (staad/units, staad/header); geometry/load handlers
 * register in 01-05/06/07/08; 01-09 wires the production import through
 * `registerParsingCommands()`.
 *
 * Unknown commands are NOT fatal: parseStaad pushes an UNKNOWN_COMMAND
 * warning and skips the block body (PARSE-03 tolerance, T-04-03).
 */

import type { CommandBlock, ParseContext } from '../core';

/** A command handler receives the block and mutates the shared ParseContext. */
export type CommandHandler = (ctx: ParseContext, block: CommandBlock) => void;

/**
 * The dispatch table. Keys are canonical command names (uppercased, aliases
 * expanded). Looked up by longest-prefix match at dispatch time.
 */
export const COMMAND_TABLE: Record<string, CommandHandler> = Object.create(null) as Record<
  string,
  CommandHandler
>;

/**
 * Register a handler under every given canonical name (pass full names AND
 * aliases — e.g. ['MEMBER INCIDENCES', 'MEMBER INCIDENCE']). Keys are
 * uppercased + whitespace-collapsed so callers can pass any casing.
 */
export function registerCommand(canonicalNames: string[], handler: CommandHandler): void {
  for (const name of canonicalNames) {
    const key = name.trim().replace(/\s+/g, ' ').toUpperCase();
    COMMAND_TABLE[key] = handler;
  }
}

/**
 * Resolve the handler for a canonicalized header key: the LONGEST registered
 * key that prefixes the header's token sequence (token-wise prefix, so
 * 'UNIT' does not match 'UNITXYZ').
 */
export function resolveHandler(canonicalKey: string): CommandHandler | undefined {
  const headerTokens = canonicalKey.split(' ');
  let bestKey: string | null = null;
  let bestHandler: CommandHandler | undefined;
  for (const [key, handler] of Object.entries(COMMAND_TABLE)) {
    const keyTokens = key.split(' ');
    if (keyTokens.length > headerTokens.length) continue;
    let matches = true;
    for (let i = 0; i < keyTokens.length; i++) {
      if (keyTokens[i] !== headerTokens[i]) {
        matches = false;
        break;
      }
    }
    if (matches && (bestKey === null || keyTokens.length > bestKey.split(' ').length)) {
      bestKey = key;
      bestHandler = handler;
    }
  }
  return bestHandler;
}
