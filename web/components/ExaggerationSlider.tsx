"use client";

/**
 * ExaggerationSlider — uniform cross-section scale (02-06 Task 2, D-02,
 * REND-04). Writes the viewer store continuously on every input (Apple §1:
 * commit continuously, no debounce; value tracks the pointer 1:1). Default 15
 * comes from the store's initial state (D-02).
 */
import { useViewerStore } from "@/store/viewerStore";
import styles from "./ExaggerationSlider.module.css";

export function ExaggerationSlider() {
  const exaggeration = useViewerStore((s) => s.exaggeration);
  const setExaggeration = useViewerStore((s) => s.setExaggeration);
  const fillPct = ((exaggeration - 1) / (100 - 1)) * 100;

  return (
    <label className={styles.row}>
      <span className={styles.label}>SIZE EXAGGERATION</span>
      <input
        className={styles.input}
        style={{ "--fill": `${fillPct}%` } as React.CSSProperties}
        type="range"
        min={1}
        max={100}
        step={1}
        value={exaggeration}
        onChange={(e) => setExaggeration(Number(e.target.value))}
      />
      <span className={styles.value}>{exaggeration}×</span>
    </label>
  );
}