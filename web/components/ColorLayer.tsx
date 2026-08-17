"use client";

/**
 * ColorLayer — R3F color-buffer rewrite layer (03-07 Task 2, COLOR-04/D-01).
 *
 * Subscribes to colorMode + selection and rewrites the instanced color buffer
 * ONLY — never geometry/material/matrix (COLOR-04). Hover is applied
 * imperatively through an exposed handle the PickingController drives on the
 * 8 Hz throttle tick.
 *
 * Mode effect: `computeMemberColors(model, mode, theme)` cached via
 * modeColorCache, written through applyModeColors. Selection effect: the
 * selected member instance brightens (SELECT_BRIGHTEN), all others dim
 * (SELECT_DIM). Hover: the hovered instance brightens (HOVER_BRIGHTEN), all
 * others dim (HOVER_DIM).
 *
 * Pure math lives in web/lib/colorLayer.ts + colorModes.ts — this component
 * is a thin subscriber + handle, mounted inside SceneContents during 03-09.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { useViewerStore, type SelectedKind } from "@/store/viewerStore";
import { useModelStore } from "@/store/modelStore";
import { computeMemberColors, type ThemeName } from "@/lib/colorModes";
import {
  applyHoverBrighten,
  applyHoverDim,
  applyModeColors,
  HOVER_BRIGHTEN,
  HOVER_DIM,
  SELECT_BRIGHTEN,
  SELECT_DIM,
} from "@/lib/colorLayer";

export interface ColorLayerHandle {
  /** Imperative hover hook: brighten one instance, dim the rest (null = clear). */
  applyHover: (hoveredInstance: number | null) => void;
}

export interface ColorLayerProps {
  meshes: THREE.InstancedMesh[];
  instanceToMember: Map<number, number>;
  theme?: ThemeName;
}

/**
 * Determine which instances the selection dims/brightens. Pure so the buffer
 * math is node-testable without a canvas: selected member instance → brighten,
 * every other instance → dim. Returns { brighten: number[]; dim: number[] }.
 */
export function computeSelectionState(
  instanceToMember: Map<number, number>,
  instanceCount: number,
  selectedId: number | null,
  selectedKind: SelectedKind | null,
): { brighten: number[]; dim: number[] } {
  const brighten: number[] = [];
  const dim: number[] = [];
  if (selectedKind === "member" && selectedId !== null) {
    for (let i = 0; i < instanceCount; i++) {
      if (instanceToMember.get(i) === selectedId) brighten.push(i);
      else dim.push(i);
    }
  }
  return { brighten, dim };
}

/** Map a global instance index to (mesh, local slot). */
export function locateInstance(
  meshes: THREE.InstancedMesh[],
  globalIndex: number,
): { mesh: THREE.InstancedMesh; slot: number } | null {
  let offset = 0;
  for (const mesh of meshes) {
    if (globalIndex < offset + mesh.count) {
      return { mesh, slot: globalIndex - offset };
    }
    offset += mesh.count;
  }
  return null;
}

export const ColorLayer = forwardRef<ColorLayerHandle, ColorLayerProps>(
  function ColorLayer({ meshes, instanceToMember, theme = "light" }, ref) {
    const colorMode = useViewerStore((s) => s.colorMode);
    const selectedId = useViewerStore((s) => s.selectedId);
    const selectedKind = useViewerStore((s) => s.selectedKind);
    const model = useModelStore((s) => s.model);

    // Base mode palette per (mode, theme) — COLOR-04 cache replay.
    const memberColors = useMemo(
      () => (model ? computeMemberColors(model, colorMode, theme) : null),
      [model, colorMode, theme],
    );
    const paletteCacheKey = `${colorMode}:${theme}`;

    const restoreBase = (): void => {
      if (!memberColors) return;
      applyModeColors(meshes, instanceToMember, memberColors, paletteCacheKey);
    };

    // Mode change → full buffer rewrite (never a rebuild).
    useEffect(() => {
      restoreBase();
    }, [colorMode, model, theme]);

    // Selection → brighten selected, dim others; clear → restore base.
    useEffect(() => {
      if (!memberColors) return;
      if (selectedKind === "member" && selectedId !== null) {
        const { brighten, dim } = computeSelectionState(
          instanceToMember,
          meshes.reduce((n, m) => n + m.count, 0),
          selectedId,
          selectedKind,
        );
        for (const gi of brighten) {
          const loc = locateInstance(meshes, gi);
          if (loc) applyHoverBrighten(loc.mesh, loc.slot, SELECT_BRIGHTEN);
        }
        for (const gi of dim) {
          const loc = locateInstance(meshes, gi);
          if (loc) applyHoverDim(loc.mesh, loc.slot, SELECT_DIM);
        }
      } else {
        restoreBase();
      }
    }, [selectedId, selectedKind, meshes, instanceToMember, memberColors]);

    const hoveredRef = useRef<number | null>(null);

    useImperativeHandle(
      ref,
      (): ColorLayerHandle => ({
        applyHover: (hoveredInstance) => {
          hoveredRef.current = hoveredInstance;
          if (!memberColors) return;
          const total = meshes.reduce((n, m) => n + m.count, 0);
          if (hoveredInstance === null) {
            // Restore: selection state if any, else base mode.
            if (selectedKind === "member" && selectedId !== null) {
              const { brighten, dim } = computeSelectionState(
                instanceToMember,
                total,
                selectedId,
                selectedKind,
              );
              for (const gi of brighten) {
                const loc = locateInstance(meshes, gi);
                if (loc) applyHoverBrighten(loc.mesh, loc.slot, SELECT_BRIGHTEN);
              }
              for (const gi of dim) {
                const loc = locateInstance(meshes, gi);
                if (loc) applyHoverDim(loc.mesh, loc.slot, SELECT_DIM);
              }
            } else {
              restoreBase();
            }
            return;
          }
          for (let gi = 0; gi < total; gi++) {
            const loc = locateInstance(meshes, gi);
            if (!loc) continue;
            if (gi === hoveredInstance) applyHoverBrighten(loc.mesh, loc.slot, HOVER_BRIGHTEN);
            else applyHoverDim(loc.mesh, loc.slot, HOVER_DIM);
          }
        },
      }),
      [meshes, instanceToMember, memberColors, selectedId, selectedKind],
    );

    return null;
  },
);
