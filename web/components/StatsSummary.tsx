"use client";

/**
 * StatsSummary — retained parse-stats glass card (02-06 Task 3, D-11/D-07).
 * Derives the six model counts, UNITS, BOUNDS, warnings count, and approximate
 * section count from the model store. Informational only in Phase 2 (Phase 3
 * INSP-03 owns click-through); collapse is the single user action.
 *
 * Security (T-02-01/T-02-05): every value is rendered as a React text node —
 * no HTML injection anywhere; approximate count is derived from
 * `approximate === true` booleans only (no string parsing, T-02-05).
 */
import { useState } from "react";
import { useModelStore } from "@/store/modelStore";
import styles from "./StatsSummary.module.css";

function formatAxis(label: string, [min, max]: [number, number]): string {
  return `${label} ${min.toFixed(2)}..${max.toFixed(2)}`;
}

export function StatsSummary() {
  const [collapsed, setCollapsed] = useState(false);
  const model = useModelStore((s) => s.model);
  const warnings = useModelStore((s) => s.warnings);

  if (!model) return null;

  const sections = [...model.sections.values()];
  const approximateCount = sections.filter((s) => s.approximate === true).length;
  const warningCount = warnings.length;

  const stats: { label: string; value: number }[] = [
    { label: "Joints", value: model.nodes.length },
    { label: "Members", value: model.members.length },
    { label: "Sections", value: sections.length },
    { label: "Supports", value: model.supports.length },
    { label: "Load cases", value: model.loadCases.length },
    { label: "Groups", value: model.groups.size },
  ];

  const unitsLine = `${model.units.length} / ${model.units.force}`;
  const b = model.bounds;
  const boundsLine = [
    formatAxis("X", [b.min[0], b.max[0]]),
    formatAxis("Y", [b.min[1], b.max[1]]),
    formatAxis("Z", [b.min[2], b.max[2]]),
  ].join("  ");

  return (
    <aside className={styles.card} aria-label="Model summary">
      <div className={styles.header}>
        <span className={styles.title}>Model summary</span>
        <button
          type="button"
          className={styles.toggle}
          aria-label={collapsed ? "Expand model summary" : "Collapse model summary"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg
            className={`${styles.chevron} ${collapsed ? styles.chevronClosed : ""}`}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 12.5 10 7.5 15 12.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className={styles.body}>
          <div className={styles.grid}>
            {stats.map(({ label, value }) => (
              <div key={label} className={styles.cell}>
                <span className={styles.cardValue}>{value}</span>
                <span className={styles.cardLabel}>{label}</span>
              </div>
            ))}
          </div>

          <dl className={styles.details}>
            <div className={styles.detail}>
              <dt>UNITS</dt>
              <dd>{unitsLine}</dd>
            </div>
            <div className={styles.detail}>
              <dt>BOUNDS</dt>
              <dd>{boundsLine}</dd>
            </div>
          </dl>

          <div className={styles.chips}>
            {warningCount > 0 && (
              <span className={`${styles.chip} ${styles.chipWarning}`}>
                {warningCount} {warningCount === 1 ? "warning" : "warnings"}
              </span>
            )}
            {approximateCount > 0 && (
              <span className={`${styles.chip} ${styles.chipWarning}`}>
                {approximateCount} approximate
              </span>
            )}
            {warningCount === 0 && (
              <span className={`${styles.chip} ${styles.chipSuccess}`}>
                Clean parse — no warnings.
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}