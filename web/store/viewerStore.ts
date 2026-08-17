/**
 * Viewer interaction state for the 3D canvas — kept separate from model
 * data per ARCHITECTURE.md state layer. High-frequency interaction state
 * (hover id, pointer samples) lives in refs inside useFrame, never here
 * (no per-frame store writes). This store only holds committed user
 * preferences (03-01, UI-SPEC store row).
 *
 * `exaggeration` (D-02/D-04): uniform app-wide member cross-section scale,
 * default 15x. Range clamping lives in the 02-06 Slider — the store holds
 * the raw committed number.
 *
 * Phase 3 committed prefs (COLOR-01..04, MARK-01..04, INSP-01/02): color
 * mode, markers toggle, selected load case, labels toggle, and the current
 * selection. ERROR/EMPTY restore clears selectedId/loadCaseId (reset to the
 * first case on next load) via resetSceneState.
 */
import { create } from "zustand/react";

export type ColorMode = "section" | "group" | "material" | "all";
export type SelectedKind = "member" | "support";

export interface ViewerStoreState {
  exaggeration: number;
  setExaggeration: (n: number) => void;

  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;

  markersVisible: boolean;
  setMarkersVisible: (visible: boolean) => void;

  loadCaseId: number | null;
  setLoadCaseId: (id: number | null) => void;

  labelsVisible: boolean;
  setLabelsVisible: (visible: boolean) => void;

  selectedId: number | null;
  selectedKind: SelectedKind | null;
  select: (id: number, kind: SelectedKind) => void;
  clearSelection: () => void;

  resetSceneState: (loadCaseId?: number | null, markersDefaultOn?: boolean) => void;
}

export const useViewerStore = create<ViewerStoreState>((set) => ({
  exaggeration: 15,
  setExaggeration: (exaggeration) => set({ exaggeration }),

  colorMode: "section",
  setColorMode: (colorMode) => set({ colorMode }),

  markersVisible: true,
  setMarkersVisible: (markersVisible) => set({ markersVisible }),

  loadCaseId: null,
  setLoadCaseId: (loadCaseId) => set({ loadCaseId }),

  labelsVisible: true,
  setLabelsVisible: (labelsVisible) => set({ labelsVisible }),

  selectedId: null,
  selectedKind: null,
  select: (id, kind) => set({ selectedId: id, selectedKind: kind }),
  clearSelection: () => set({ selectedId: null, selectedKind: null }),

  // UI-SPEC ERROR/EMPTY restore: clears selection and resets loadCaseId to
  // the first case on next load (caller passes model loadCases[0]?.id);
  // markers default-on when supports/loadCases exist (D-07 provisional).
  resetSceneState: (loadCaseId = null, markersDefaultOn) =>
    set((s) => ({
      selectedId: null,
      selectedKind: null,
      loadCaseId: loadCaseId === undefined ? s.loadCaseId : loadCaseId,
      markersVisible: markersDefaultOn === undefined ? s.markersVisible : markersDefaultOn,
    })),
}));