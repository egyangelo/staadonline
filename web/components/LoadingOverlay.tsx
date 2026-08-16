"use client";

/**
 * LoadingOverlay — "Opening…" parse overlay (02-06 Task 4, UI-SPEC LOADING
 * state). Dims and blocks pointer input above the canvas; no user control of
 * its own — cancel/abort is owned by page.tsx (02-07), which also ensures a
 * repeat-open during LOADING is safe (UI-SPEC "repeat-open during LOADING
 * aborts the in-flight open"). Honors prefers-reduced-motion.
 */
import styles from "./LoadingOverlay.module.css";

export function LoadingOverlay() {
  return (
    <div className={styles.overlay} aria-live="polite" aria-busy="true">
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.label}>Opening…</p>
    </div>
  );
}