/**
 * Tolerated-command registrations (01-08 Task 3, PARSE-03).
 *
 * Real STAAD.Pro files interleave dozens of non-model commands between the
 * load cases and after them (PERFORM ANALYSIS, CHANGE, PARAMETER, CHECK CODE,
 * DEFINE-scoped blocks, element/plate blocks, ...). The parser must tolerate
 * them without treating them as unknown (D-07 tiering):
 *
 * - IGNORED_COMMAND, warn once per block: structural-but-out-of-scope
 *   commands (member releases/cracked/offsets, DEFINE MATERIAL / REFERENCE
 *   LOADS / IBC / WIND LOAD / ENVELOPE scopes, SET NL, ENVELOPE, job-info,
 *   concrete-design scopes, PARAMETER, CHECK CODE, DESIGN BEAM/COLUMN,
 *   PERFORM ANALYSIS, PRINT, PAGE, INPUT WIDTH). The handler runs once on the
 *   block header; the body is already absorbed by segmentation (DEFINE /
 *   START scopes absorb their rows).
 * - SKIPPED_ELEMENT, warn once per block: plate/element blocks that the
 *   parser deliberately does not model (D-07) — ELEMENT INCIDENCES,
 *   ELEMENT PROPERTIES. NOTE (01-09 Rule 1): the key MUST be the canonical
 *   spelling — core.ts COMMAND_ALIASES maps PROPERTY → PROPERTIES before
 *   dispatch, so a raw 'ELEMENT PROPERTY' registration would never match a
 *   real header and the block would fall through to UNKNOWN_COMMAND.
 * - Silent no-ops: CHANGE (case bookkeeping) and FINISH (deck end). No
 *   warning — these are noise, not defects.
 *
 * Blocks terminated by END DEFINE / END <START-scope> headers are consumed by
 * segmentBlocks and never reach dispatch — no registrations needed there.
 *
 * Registration is idempotent and runs as a module-import side effect, so
 * importing this module is enough (mirrors the other handler modules).
 */

import { WARNING_CODES } from '../types';
import type { CommandBlock, ParseContext } from '../core';
import { registerCommand, type CommandHandler } from './index';

/** IGNORED_COMMAND once per block for a structural-but-out-of-scope command. */
function ignoredHandler(label: string): CommandHandler {
  return (ctx: ParseContext, block: CommandBlock) => {
    ctx.warnings.push({
      code: WARNING_CODES.IGNORED_COMMAND,
      message: `Ignored command (out of Phase-1 scope): ${label}`,
      line: block.line,
      severity: 'warning',
    });
  };
}

/** SKIPPED_ELEMENT once per block for plate/element blocks (D-07). */
function skippedElementHandler(label: string): CommandHandler {
  return (ctx: ParseContext, block: CommandBlock) => {
    ctx.warnings.push({
      code: WARNING_CODES.SKIPPED_ELEMENT,
      message: `Element block skipped (plates out of scope, D-07): ${label}`,
      line: block.line,
      severity: 'warning',
    });
  };
}

/** Silent no-op — noise commands that need no warning (CHANGE, FINISH). */
function silentHandler(): CommandHandler {
  return () => {
    /* intentional silence */
  };
}

/** Ignored with a warning (out-of-scope structural commands). */
const IGNORED = [
  'MEMBER RELEASE',
  'MEMBER CRACKED',
  'MEMBER OFFSET',
  'DEFINE MATERIAL',
  'DEFINE REFERENCE LOADS',
  'DEFINE IBC',
  'DEFINE WIND LOAD',
  'DEFINE ENVELOPE',
  'SET NL',
  'ENVELOPE',
  'JOB INFORMATION',
  'START JOB INFORMATION',
  'CONCRETE DESIGN',
  'START CONCRETE DESIGN',
  'PARAMETER',
  'CHECK CODE',
  'DESIGN BEAM',
  'DESIGN COLUMN',
  'PERFORM ANALYSIS',
  'PRINT',
  'PAGE',
  'INPUT WIDTH',
];

/** Skipped with a SKIPPED_ELEMENT warning (plate/element blocks, D-07). */
const SKIPPED_ELEMENT_BLOCKS = ['ELEMENT INCIDENCES', 'ELEMENT PROPERTIES'];

/** Silent no-ops (deck bookkeeping). */
const SILENT = ['CHANGE', 'FINISH'];

/** Register every tolerated command. Idempotent — safe to call repeatedly. */
export function registerSkippedCommands(): void {
  for (const name of IGNORED) registerCommand([name], ignoredHandler(name));
  for (const name of SKIPPED_ELEMENT_BLOCKS) registerCommand([name], skippedElementHandler(name));
  for (const name of SILENT) registerCommand([name], silentHandler());
}

// Module-import side effect (mirrors the other handler modules).
registerSkippedCommands();