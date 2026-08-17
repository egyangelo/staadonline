/**
 * Per-instance color rewrite layer (03-01 Task 3 + 03-07 Task 1, COLOR-04).
 * Pure three + data helpers — no R3F. Given the already-built instanced
 * meshes (SceneBuilder SceneBuildResult) and per-member colors, write each
 * mesh's `instanceColor` buffer and mark `needsUpdate`. NEVER touches
 * matrix / geometry / material — mode switches are a color-buffer rewrite,
 * never a scene rebuild (COLOR-04).
 *
 * Security (T-03-03/T-03-04): the palette is fixed in-code; only palette
 * indices derive from file data. Buffer writes go through setColorAt with a
 * typed Color — no free-form string reaches the GPU.
 */
import { Color, type InstancedMesh } from "three";

export type Rgb = { r: number; g: number; b: number };

/** Per-mode base palette cache: `${mode}:${theme}` -> Map<memberId, Rgb>. */
export const modeColorCache = new Map<string, Map<number, Rgb>>();

export function clearModeColorCache(): void {
  modeColorCache.clear();
}

const dimTarget = new Color(0x6e / 255, 0x6e / 255, 0x73 / 255); // #6E6E73
const brightTarget = new Color(1, 1, 1); // #FFFFFF

const scratch = new Color();

function writeInstance(mesh: InstancedMesh, slot: number, rgb: Rgb): void {
  mesh.setColorAt(slot, new Color(rgb.r, rgb.g, rgb.b));
}

/**
 * Write per-instance colors for every mesh using the instance->member map.
 * `cacheKey` (`${mode}:${theme}`) enables the COLOR-04 cache replay: a
 * repeat selection of the same mode replays the cached memberColors instead
 * of recomputing. When no key is given, no caching happens.
 */
export function applyModeColors(
  meshes: InstancedMesh[],
  instanceToMember: Map<number, number>,
  memberColors: Map<number, Rgb>,
  cacheKey?: string,
): void {
  let colors = memberColors;
  if (cacheKey !== undefined) {
    const cached = modeColorCache.get(cacheKey);
    if (cached) {
      colors = cached;
    } else {
      modeColorCache.set(cacheKey, memberColors);
    }
  }

  // SceneBuilder assigns instance ids globally across all meshes (a single
  // counter), so per-mesh slot i is the running offset + i.
  let offset = 0;
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.count; i++) {
      const memberId = instanceToMember.get(offset + i);
      const rgb = memberId === undefined ? undefined : colors.get(memberId);
      if (rgb) writeInstance(mesh, i, rgb);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    offset += mesh.count;
  }
}

/**
 * Lerp the instance's current color toward the dim target (#6E6E73) by
 * `factor` (hover dim 0.48 / selection dim 0.62).
 */
export function applyHoverDim(mesh: InstancedMesh, instance: number, factor: number): void {
  mesh.getColorAt(instance, scratch);
  scratch.lerp(dimTarget, factor);
  mesh.setColorAt(instance, scratch);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Lerp the instance's current color toward white (#FFFFFF) by `factor`. */
export function applyHoverBrighten(mesh: InstancedMesh, instance: number, factor: number): void {
  mesh.getColorAt(instance, scratch);
  scratch.lerp(brightTarget, factor);
  mesh.setColorAt(instance, scratch);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Re-export hover factor constants so consumers import from one place. */
export { HOVER_DIM, HOVER_BRIGHTEN, SELECT_DIM, SELECT_BRIGHTEN } from "./colorModes";