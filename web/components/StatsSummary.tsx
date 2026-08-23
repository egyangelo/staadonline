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
import { useMemo, useState } from "react";
import { useModelStore } from "@/store/modelStore";
import { buildSummaryData } from "@/lib/summaryData";
import styles from "./StatsSummary.module.css";

function formatAxis(label: string, [min, max]: [number, number]): string {
  return `${label} ${min.toFixed(2)}..${max.toFixed(2)}`;
}

export function StatsSummary() {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const model = useModelStore((s) => s.model);
  const warnings = useModelStore((s) => s.warnings);

  const summary = useMemo(
    () => (model ? buildSummaryData(model, warnings) : null),
    [model, warnings],
  );

  if (!model || !summary) return null;

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
  // Plates cell only for models that carry plate/shell elements (05-01).
  if (summary.elements > 0) {
    stats.push({ label: "Plates", value: summary.elements });
  }

  const unitsLine = `${model.units.length} / ${model.units.force}`;
  const b = model.bounds;
  const boundsLine = [
    formatAxis("X", [b.min[0], b.max[0]]),
    formatAxis("Y", [b.min[1], b.max[1]]),
    formatAxis("Z", [b.min[2], b.max[2]]),
  ].join("  ");

  return (
    <aside
      className={`${styles.card} ${expanded && !collapsed ? styles.cardExpanded : ""}`}
      aria-label="Model summary"
    >
      <div className={styles.header}>
        <span className={styles.title}>Model summary</span>
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

          {expanded && (
            <div className={styles.extra}>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>GROUPS</h3>
                {summary.groupList.length === 0 ? (
                  <p className={styles.emptyText}>No groups defined</p>
                ) : (
                  <ul className={styles.groupList}>
                    {summary.groupList.map((g) => (
                      <li key={g.name} className={styles.groupRow}>
                        <span className={styles.groupName}>{g.name}</span>
                        <span className={styles.groupCount}>
                          · {g.count} {g.count === 1 ? "member" : "members"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>BOUNDING BOX</h3>
                <dl className={styles.bboxList}>
                  {summary.boundingBoxRows.map((row) => (
                    <div key={row.axis} className={styles.bboxRow}>
                      <dt>{row.axis}</dt>
                      <dd>
                        {row.min.toFixed(2)} .. {row.max.toFixed(2)}
                      </dd>
                      <dd className={styles.extent}>Extent {row.extent.toFixed(2)}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>WARNINGS</h3>
                <ul className={styles.warningList}>
                  {summary.warningsList.map((w) => (
                    <li key={`${w.code}-${w.line}`} className={styles.warningRow}>
                      <span className={styles.warningCode}>{w.code}</span>
                      <span className={styles.warningLine}>· {w.line}</span>
                    </li>
                  ))}
                </ul>
                {summary.warningsTruncated && (
                  <p className={styles.warningFooter}>
                    Showing first 12 of {summary.warningsTotal}
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {/* Controls live in a footer pinned to the card's bottom edge so the
          Details/collapse actions stay reachable without hunting the top. */}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.detailsPill}
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Less" : "Details"}
        </button>
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
    </aside>
  );
}