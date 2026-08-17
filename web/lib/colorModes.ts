/**
 * Categorical color-mode logic (03-01, COLOR-01..04 / D-01..D-04).
 * Pure TS - zero three/React imports so it unit-tests in node.
 *
 * Members are assigned a fixed 8-hue categorical palette by section / group /
 * material key, deterministically in first-seen member array order (D-01).
 * The palette cycles round-robin when distinct keys exceed 8 (D-02).
 * Group/material modes render members with no key as neutral grey (D-03);
 * an 'all' mode paints every member the theme accent blue (D-04).
 *
 * Security: key-to-index assignments are stored in a real `Map` (never a
 * plain object), so file-derived strings like `__proto__` cannot pollute
 * (T-03-01). Palette strings are fixed in-code constants - indexed only,
 * never interpreted as colors (T-03-02).
 */
import type { Member, StaadModel } from "@staad-online/parser";

export type ColorModeKey = "section" | "group" | "material" | "all";
export type ThemeName = "light" | "dark";

/** Fixed 8-hue categorical palette, UI-SPEC Color table P0..P7. */
export const MEMBER_PALETTE = [
  "#2FA45C", // P0
  "#8B5CF6", // P1
  "#F26D21", // P2
  "#0FB5D6", // P3
  "#E5484D", // P4
  "#F0B429", // P5
  "#4C63F5", // P6
  "#7BC043", // P7
] as const;

/** Palette index the FIRST distinct key of each mode seeds at (D-02 cyclic). */
export const MODE_SEEDS = { section: 0, group: 3, material: 5 } as const;

/** Neutral grey for unassigned group/material members (D-03), #8E8E93. */
export function neutralGrey(): { r: number; g: number; b: number } {
  return { r: 0x8e / 255, g: 0x8e / 255, b: 0x93 / 255 };
}

/** Theme accent blue for the 'all' mode (D-04). */
export function themeAccent(theme: ThemeName): { r: number; g: number; b: number } {
  return theme === "dark"
    ? { r: 0x0a / 255, g: 0x84 / 255, b: 1 }
    : { r: 0x00, g: 0x7a / 255, b: 1 };
}

/** Hover dim target #6E6E73 (UI-SPEC §Motion draft). */
export const hoverDim: { r: number; g: number; b: number } = {
  r: 0x6e / 255,
  g: 0x6e / 255,
  b: 0x73 / 255,
};
/** Hover/selection brighten target #FFFFFF (UI-SPEC §Motion draft). */
export const hoverBrighten: { r: number; g: number; b: number } = { r: 1, g: 1, b: 1 };

/** Lerp factors per UI-SPEC: hover dim 0.48, hover brighten 0.25, selection dim 0.62, selection brighten 0.40. */
export const HOVER_DIM = 0.48;
export const HOVER_BRIGHTEN = 0.25;
export const SELECT_DIM = 0.62;
export const SELECT_BRIGHTEN = 0.4;

/**
 * Categorical key for a member in a mode. Section mode keys on sectionKey
 * (missing -> '' — still consumes a palette slot, never grey). Group/material
 * modes key on group/material (missing -> null -> grey, no slot consumed).
 * File strings left verbatim.
 */
export function modeKeyFor(member: Member, mode: ColorModeKey): string | null {
  switch (mode) {
    case "section":
      return member.sectionKey ?? "";
    case "group":
      return member.group ?? null;
    case "material":
      return member.material ?? null;
    default:
      return null;
  }
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

/**
 * Compute per-member display colors (0..1 float rgb) for a color mode.
 * Returns `Map<memberId, {r,g,b}>`. First-seen deterministic order (D-01),
 * cyclic round-robin once distinct keys exceed 8 (D-02), neutral grey for
 * unassigned group/material keys (D-03), theme accent for 'all' (D-04).
 */
export function computeMemberColors(
  model: StaadModel,
  mode: ColorModeKey,
  theme: ThemeName,
): Map<number, { r: number; g: number; b: number }> {
  const out = new Map<number, { r: number; g: number; b: number }>();

  if (mode === "all") {
    const accent = themeAccent(theme);
    for (const m of model.members) out.set(m.id, { ...accent });
    return out;
  }

  // Real Map (never a plain object) so `__proto__`-style keys cannot pollute.
  const keyIndex = new Map<string, number>();
  let distinct = 0;

  for (const member of model.members) {
    const key = modeKeyFor(member, mode);
    if (key === null) {
      out.set(member.id, neutralGrey());
      continue;
    }
    let idx = keyIndex.get(key);
    if (idx === undefined) {
      idx = (MODE_SEEDS[mode] + distinct) % MEMBER_PALETTE.length;
      distinct++;
      keyIndex.set(key, idx);
    }
    out.set(member.id, parseHex(MEMBER_PALETTE[idx]));
  }

  return out;
}