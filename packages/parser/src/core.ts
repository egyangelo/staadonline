/**
 * Core parse pipeline: block segmentation, command canonicalization, the
 * ParseContext accumulator, and model finalization (01-04, PARSE-03/PARSE-05).
 *
 * Pure + headless: no DOM, no Three, no globals — worker-ready
 * (ARCHITECTURE.md Pattern 1).
 *
 * Segmentation model (ARCHITECTURE.md Pattern 3, tolerant):
 * - An entry whose first token starts with an UPPERCASE letter is a NEW block
 *   header; entries starting with a digit, `_`, quote, or `-` (or anything
 *   else non-uppercase) are body of the current block.
 * - Scoped absorption: after a `DEFINE ...` header, body is absorbed until
 *   the matching `END DEFINE ...` header; after a `START ...` header, until
 *   an `END ...` header (START JOB INFORMATION / START GROUP DEFINITION /
 *   START CONCRETE DESIGN, DEFINE MATERIAL START, DEFINE REFERENCE LOADS).
 * - Tolerant termination for un-terminated DEFINE blocks (checker #8):
 *   a DEFINE block closes at the next top-level LOAD (numeric id) /
 *   PERFORM / PAGE / PRINT / DEFINE header. `LOAD R1 LOADTYPE Mass` inside
 *   DEFINE REFERENCE LOADS is reference-load DATA — its id is non-numeric,
 *   so it is absorbed, not a terminator.
 * - Mis-segmentation never crashes: unknown blocks become UNKNOWN_COMMAND
 *   warnings downstream and their body is skipped (T-04-03).
 *
 * Security: every entity lookup is Map-based (never plain objects keyed by
 * member/joint numbers — PITFALLS security, T-04-02).
 */

import type { Token, TokenizedLine } from './tokenizer';
import { createUnitState } from './resolve-units';
import type {
  Bounds,
  Group,
  LoadCase,
  Member,
  Node,
  ParseWarning,
  SectionMeta,
  SectionProfile,
  StaadModel,
  Support,
  UnitSystem,
} from './types';

/** A segmented command block: header tokens + subsequent body entries. */
export interface CommandBlock {
  /** Tokens of the header entry (e.g. `UNIT METER KN`). */
  name: Token[];
  /** Entries after the header that belong to this block. */
  bodyLines: TokenizedLine[];
  /** 1-based source line of the header entry. */
  line: number;
}

/**
 * Accumulator threaded through every command handler. Handlers mutate these
 * collections; `finalize` turns the context into the typed StaadModel.
 */
export interface ParseContext {
  /** Running unit state (PITFALLS P1 — mutated by UNIT blocks). */
  units: UnitSystem;
  /** Structured warnings (D-06/D-07). */
  warnings: ParseWarning[];
  /** Joints, coordinates normalized to METERS. 1-based source ids (D-04). */
  nodes: Node[];
  /** Members. 1-based source ids (D-04). */
  members: Member[];
  /** Resolved section profiles keyed by sectionKey (what the model exposes). */
  sections: Map<string, SectionProfile & SectionMeta>;
  /** Supports. */
  supports: Support[];
  /** Load cases. */
  loadCases: LoadCase[];
  /** Case that item handlers (SELFWEIGHT / MEMBER LOAD / JOINT LOAD) append to. */
  currentLoadCase?: LoadCase;
  /** Named groups (group name → members/joints/elements). */
  groups: Map<string, Group>;
  /** Section name → profile lookups from property lines (01-06). */
  namedSections: Map<string, SectionProfile & SectionMeta>;
  /** Direct member id → sectionKey links (01-06). */
  memberSectionLinks: Map<number, string>;
  /** 2D/3D frame kind — set by the STAAD header handler (01-04). */
  structure: 'SPACE' | 'PLANE' | 'FRAME';
  /** Model bounds; computed by `finalize`. */
  bounds: Bounds;
}

/**
 * Per-token command aliases (PITFALLS P2 abbreviations + version drift).
 * Applied after uppercasing; unknown tokens pass through unchanged.
 */
const COMMAND_ALIASES = new Map<string, string>([
  ['INCIDENCE', 'INCIDENCES'],
  ['INCI', 'INCIDENCES'],
  ['PROPERTY', 'PROPERTIES'],
  ['JNT', 'JOINT'],
  ['COORD', 'COORDINATES'],
  ['LOADING', 'LOAD'],
  ['MEMB', 'MEMBER'],
  ['ELEM', 'ELEMENT'],
]);

/**
 * Canonicalize a header entry's tokens into the command key used for
 * dispatch: uppercase each token, map aliases, join with single spaces
 * (quoted tokens keep their inner spaces — e.g. a section DB filename).
 */
export function canonicalizeCommand(tokens: readonly Token[]): string {
  const parts: string[] = [];
  for (const tok of tokens) {
    const up = tok.text.toUpperCase();
    parts.push(COMMAND_ALIASES.get(up) ?? up);
  }
  return parts.join(' ');
}

/** True when every character is a digit (0-9). */
function isDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

/** True when the entry's first token starts an uppercase letter AND is unquoted. */
function isHeaderEntry(entry: TokenizedLine): boolean {
  const first = entry.tokens[0];
  if (first === undefined || first.quoted) return false;
  const c = first.text.charCodeAt(0);
  return c >= 65 && c <= 90;
}

/**
 * Tolerant DEFINE-block terminator (checker #8): a DEFINE block WITHOUT a
 * matching END DEFINE absorbs until the next top-level LOAD / PERFORM
 * ANALYSIS / PAGE / PRINT / DEFINE header. LOAD counts only with a NUMERIC
 * id — `LOAD R1 LOADTYPE Mass` inside DEFINE REFERENCE LOADS is
 * reference-load data and must be absorbed (manifest decision 01-03).
 */
function isDefineTerminator(entry: TokenizedLine): boolean {
  const first = entry.tokens[0]?.text ?? '';
  switch (first) {
    case 'PERFORM':
    case 'PAGE':
    case 'PRINT':
    case 'DEFINE':
      return true;
    case 'LOAD':
      return isDigits(entry.tokens[1]?.text ?? '');
    default:
      return false;
  }
}

/**
 * Segment tokenized entries into command blocks.
 *
 * Leading body entries (before any header) are skipped silently — there is
 * no command to attribute them to, and a corrupt file must not crash
 * (T-04-03).
 */
export function segmentBlocks(entries: TokenizedLine[]): CommandBlock[] {
  const blocks: CommandBlock[] = [];
  let current: CommandBlock | null = null;
  let scope: 'normal' | 'define' | 'start' = 'normal';

  const closeBlock = (): void => {
    if (current !== null) {
      blocks.push(current);
      current = null;
    }
    scope = 'normal';
  };

  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];
    const first = entry.tokens[0]?.text ?? '';

    if (scope === 'define') {
      // Matching END DEFINE (e.g. END DEFINE MATERIAL) closes the block.
      if (first === 'END' && entry.tokens[1]?.text === 'DEFINE') {
        closeBlock();
        i++;
        continue;
      }
      // Un-terminated DEFINE block: close at the next top-level header
      // WITHOUT consuming it — re-process the entry as a new header below.
      if (isDefineTerminator(entry)) {
        closeBlock();
        continue;
      }
      // Everything else is body (including uppercase data like
      // SELFWEIGHT / MEMBER LOAD / E 20000000 — scoped absorption).
      (current as CommandBlock).bodyLines.push(entry);
      i++;
      continue;
    }

    if (scope === 'start') {
      // START ... absorbs until an END ... header (END JOB INFORMATION, ...).
      if (first === 'END') {
        closeBlock();
        i++;
        continue;
      }
      (current as CommandBlock).bodyLines.push(entry);
      i++;
      continue;
    }

    // Normal scope: uppercase-first entry starts a new block.
    if (isHeaderEntry(entry)) {
      closeBlock();
      current = { name: entry.tokens, bodyLines: [], line: entry.line };
      if (first === 'DEFINE') scope = 'define';
      else if (first === 'START') scope = 'start';
      i++;
      continue;
    }

    // Body entry: attach to the open block, or skip if none is open.
    if (current !== null) current.bodyLines.push(entry);
    i++;
  }

  // EOF closes whatever block is still open.
  closeBlock();
  return blocks;
}

/** Fresh ParseContext: P1 defaults (FT/KIP), SPACE structure, empty collections. */
export function createContext(): ParseContext {
  return {
    units: createUnitState(),
    warnings: [],
    nodes: [],
    members: [],
    sections: new Map(),
    supports: [],
    loadCases: [],
    groups: new Map(),
    namedSections: new Map(),
    memberSectionLinks: new Map(),
    structure: 'SPACE',
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

/**
 * Finalize the accumulated context into the typed StaadModel:
 * - compute bounds min/max from node coordinates (P8 — bounds only; the
 *   centroid rebase is a Phase 2 REND-06 concern);
 * - 0-based internal indexes come from array position; 1-based source ids are
 *   preserved as fields on every entity (D-04);
 * - link members ↔ sections: direct memberSectionLinks first, then members
 *   in a group whose name matches a namedSections key (set sectionKey and
 *   copy the profile into the model's sections Map).
 */
export function finalize(ctx: ParseContext): StaadModel {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const n of ctx.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.z < minZ) minZ = n.z;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
    if (n.z > maxZ) maxZ = n.z;
  }
  const bounds: Bounds =
    ctx.nodes.length === 0
      ? { min: [0, 0, 0], max: [0, 0, 0] }
      : {
          min: [minX, minY, minZ],
          max: [maxX, maxY, maxZ],
        };
  ctx.bounds = bounds;

  for (const [memberId, sectionKey] of ctx.memberSectionLinks) {
    const member = ctx.members.find((m) => m.id === memberId);
    if (member !== undefined) member.sectionKey = sectionKey;
  }

  for (const [groupName, group] of ctx.groups) {
    const profile = ctx.namedSections.get(groupName);
    if (profile === undefined) continue;
    for (const memberId of group.memberIds) {
      const member = ctx.members.find((m) => m.id === memberId);
      if (member !== undefined) member.sectionKey = groupName;
    }
    if (!ctx.sections.has(groupName)) ctx.sections.set(groupName, profile);
  }

  return {
    nodes: ctx.nodes,
    members: ctx.members,
    sections: ctx.sections,
    supports: ctx.supports,
    loadCases: ctx.loadCases,
    groups: ctx.groups,
    units: { length: ctx.units.length, force: ctx.units.force },
    bounds,
  };
}
