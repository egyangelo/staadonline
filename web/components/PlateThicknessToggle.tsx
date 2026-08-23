"use client";

/**
 * PlateThicknessToggle — "Thickness" pill shown only when the loaded model
 * has plate elements. Toggles viewerStore.plateThickness: OFF renders plates
 * as zero-thickness surfaces (D-05-02); ON extrudes each quad by its
 * ELEMENT PROPERTIES thickness where resolved (true-surface → true-solid).
 *
 * The scene rebuilds on toggle (ViewerCanvas build-effect dep) — plates are a
 * single merged mesh so the rebuild is cheap relative to member instancing.
 */
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import styles from "./MagnitudeLabelToggle.module.css";

export function PlateThicknessToggle() {
  const model = useModelStore((s) => s.model);
  const plateThickness = useViewerStore((s) => s.plateThickness);
  const setPlateThickness = useViewerStore((s) => s.setPlateThickness);

  if (!model || model.elements.length === 0) return null;

  return (
    <button
      type="button"
      className={styles.pill}
      aria-pressed={plateThickness}
      title="Toggle plate thickness (extrude shells by their ELEMENT PROPERTIES thickness)"
      onClick={() => setPlateThickness(!plateThickness)}
    >
      Thickness
    </button>
  );
}
