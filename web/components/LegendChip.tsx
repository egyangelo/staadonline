"use client";

/**
 * LegendChip — per-load-case axis-convention legend (03-05 Task 1, D-11,
 * UI-SPEC LegendChip row).
 *
 * Computes the effective global-vs-local axis refs for the selected load
 * case via `effectiveAxisRefs` and renders a mono GLOBAL / LOCAL /
 * `GLOBAL / LOCAL` chip plus the 3-axis engineering triad. Hidden when the
 * case has no items. Per-load-case only — no per-arrow G/L tags anywhere.
 *
 * Read-only presentation of already-resolved data; no pick/raycast logic.
 *
 * Mounted in 03-09 page.tsx integration (toolbar wrapping).
 */
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import { effectiveAxisRefs } from "@/lib/loadCases";
import styles from "./LegendChip.module.css";

export function LegendChip() {
  const model = useModelStore((s) => s.model);
  const loadCaseId = useViewerStore((s) => s.loadCaseId);

  if (!model || loadCaseId === null) return null;

  const refs = effectiveAxisRefs(model, loadCaseId);
  if (refs.length === 0) return null;

  const label = refs.join(" / ");

  return (
    <div className={styles.chip} aria-label="Load axis convention">
      <svg className={styles.triad} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 15 15 4" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" />
        <path d="M4 15 15 15" stroke="#34c759" strokeWidth="2" strokeLinecap="round" />
        <path d="M4 15 4 4" stroke="#007aff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span key={label} className={styles.label}>
        {label}
      </span>
    </div>
  );
}
