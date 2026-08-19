"use client";

/**
 * LoadingOverlay — "Opening…" parse overlay (02-06 Task 4, UI-SPEC LOADING
 * state). Dims and blocks pointer input above the canvas; no user control of
 * its own — cancel/abort is owned by page.tsx (02-07), which also ensures a
 * repeat-open during LOADING is safe (UI-SPEC "repeat-open during LOADING
 * aborts the in-flight open"). Honors prefers-reduced-motion.
 */
import styles from "./LoadingOverlay.module.css";

export function LoadingOverlay({ fraction }: { fraction?: number | null }) {
  const determinate = fraction != null;
  const pct = determinate ? Math.round(fraction! * 100) : 0;
  return (
    <div className={styles.overlay} aria-live="polite" aria-busy="true">
      {determinate ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className={styles.bar}
          >
            <div className={styles.barFill} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.pct}>Opening… {pct}%</p>
        </>
      ) : (
        <>
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.label}>Opening…</p>
        </>
      )}
    </div>
  );
}