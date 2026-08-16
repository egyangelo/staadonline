/**
 * Viewer interaction state for the 3D canvas — kept separate from model
 * data per ARCHITECTURE.md state layer. High-frequency interaction state
 * lives in refs inside useFrame, never here (no per-frame store writes).
 * This store only holds committed user preferences.
 *
 * `exaggeration` (D-02/D-04): uniform app-wide member cross-section scale,
 * default 15x. Range clamping lives in the 02-06 Slider — the store holds
 * the raw committed number.
 */
import { create } from "zustand/react";

export interface ViewerStoreState {
  exaggeration: number;
  setExaggeration: (n: number) => void;
}

export const useViewerStore = create<ViewerStoreState>((set) => ({
  exaggeration: 15,
  setExaggeration: (exaggeration) => set({ exaggeration }),
}));