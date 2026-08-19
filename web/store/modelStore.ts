/**
 * Write-once model store for the opened .std deck (ARCHITECTURE.md state
 * layer / Pattern 1: parse → model → render is one-way). The raw parsed
 * model is committed ATOMICALLY via setModel — never incrementally. Rebuild
 * downstream (SceneBuilder) only when a new model is set, never per store
 * subscription (02-04).
 *
 * FILE-03/cancel-safety: setError() returns to the EMPTY status WITHOUT
 * mutating model/warnings — a failed open never commits partial state; the
 * previously committed values stay untouched.
 */
import { create } from "zustand/react";
import type { ParseResult, ParseWarning, StaadModel } from "@staad-online/parser";

export interface ModelStoreState {
  status: "empty" | "loading" | "ready";
  model: StaadModel | null;
  warnings: ParseWarning[];
  fileName: string | null;
  progress: number | null;
  beginLoading: () => void;
  setProgress: (progress: number) => void;
  setModel: (result: ParseResult, fileName: string) => void;
  setError: () => void;
}

export const useModelStore = create<ModelStoreState>((set) => ({
  status: "empty",
  model: null,
  warnings: [],
  fileName: null,
  progress: null,

  beginLoading: () => set({ status: "loading", progress: null }),

  setProgress: (progress) => set({ progress }),

  setModel: (result, fileName) =>
    set({
      status: "ready",
      model: result.model,
      warnings: result.warnings,
      fileName,
      progress: null,
    }),

  // Back to EMPTY without touching model/warnings (FILE-03).
  setError: () => set({ status: "empty", fileName: null, progress: null }),
}));