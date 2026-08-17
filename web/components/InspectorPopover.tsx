"use client";

/**
 * InspectorPopover — member + support inspector (03-05 Task 2, D-13/D-08/D-15,
 * UI-SPEC InspectorPopover row).
 *
 * Slides in from the right when a member or support is selected. Pure
 * presentation of already-resolved data:
 *   - member: MEMBER n + Section/Group/Material/Length rows + Nodes row with
 *     coordinates from rebaseModel (matches rendered geometry, REND-06);
 *     orange `~ APPROXIMATE DIMENSIONS` banner when section.approximate.
 *   - support: SUPPORT n + type label + 6-dot releases grid (released = open
 *     dot per types contract: true = released) + Stiffness row when `note`.
 *
 * Dismissal: close button, Escape, or a tap anywhere outside the popover.
 *
 * Mounted in 03-09 page.tsx integration.
 */
import { useEffect, useMemo, useState } from "react";
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import { rebaseModel } from "@/lib/scene";
import type { Support, SupportReleases } from "@staad-online/parser";
import styles from "./InspectorPopover.module.css";

const SUPPORT_TYPE_LABEL: Record<Support["type"], string> = {
  FIXED: "Fixed",
  PINNED: "Pinned",
  FIXED_BUT: "Fixed but released",
  SPRING: "Spring",
  ENFORCED: "Enforced",
  PLATE: "Plate",
};

const RELEASE_AXES: (keyof SupportReleases)[] = ["FX", "FY", "FZ", "MX", "MY", "MZ"];

function fmtCoord(v: number): string {
  return v.toFixed(2);
}

export function InspectorPopover() {
  const model = useModelStore((s) => s.model);
  const selectedId = useViewerStore((s) => s.selectedId);
  const selectedKind = useViewerStore((s) => s.selectedKind);
  const clearSelection = useViewerStore((s) => s.clearSelection);
  const [entered, setEntered] = useState(false);

  // Rebase origin + node coords once per model (T-03-05: no re-lookup per render).
  const rebase = useMemo(() => (model ? rebaseModel(model) : null), [model]);

  useEffect(() => {
    if (selectedId === null) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-inspector-popover]")) {
        clearSelection();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      cancelAnimationFrame(frame);
      setEntered(false);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [selectedId, clearSelection]);

  if (!model || !rebase || selectedId === null || selectedKind === null) return null;

  const popover =
    selectedKind === "member" ? (
      renderMember(model, selectedId, rebase.nodeCoords)
    ) : (
      renderSupport(model, selectedId)
    );
  if (!popover) return null;

  return (
    <aside
      data-inspector-popover
      className={`${styles.popover} ${entered ? styles.entered : ""}`}
      aria-label="Inspector"
    >
      <button
        type="button"
        className={styles.close}
        aria-label="Close inspector"
        onClick={clearSelection}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M6 6 14 14 M14 6 6 14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {popover}
    </aside>
  );
}

/** Node-id → dense-array index, for member start/end node coordinate lookup. */
function nodeIndexMap(model: NonNullable<ReturnType<typeof useModelStore.getState>["model"]>): Map<number, number> {
  const m = new Map<number, number>();
  model.nodes.forEach((n, i) => m.set(n.id, i));
  return m;
}

function renderMember(
  model: NonNullable<ReturnType<typeof useModelStore.getState>["model"]>,
  memberId: number,
  nodeCoords: Float64Array,
): React.ReactElement | null {
  const member = model.members.find((m) => m.id === memberId);
  if (!member) return null;

  const nodeIdx = nodeIndexMap(model);
  const si = nodeIdx.get(member.startNode);
  const ei = nodeIdx.get(member.endNode);
  const sCoord = si === undefined ? null : `(${fmtCoord(nodeCoords[si * 3])}, ${fmtCoord(nodeCoords[si * 3 + 1])}, ${fmtCoord(nodeCoords[si * 3 + 2])})`;
  const eCoord = ei === undefined ? null : `(${fmtCoord(nodeCoords[ei * 3])}, ${fmtCoord(nodeCoords[ei * 3 + 1])}, ${fmtCoord(nodeCoords[ei * 3 + 2])})`;

  const section = member.sectionKey !== undefined ? model.sections.get(member.sectionKey) : undefined;
  let length: number | null = null;
  if (si !== undefined && ei !== undefined) {
    const dx = nodeCoords[ei * 3] - nodeCoords[si * 3];
    const dy = nodeCoords[ei * 3 + 1] - nodeCoords[si * 3 + 1];
    const dz = nodeCoords[ei * 3 + 2] - nodeCoords[si * 3 + 2];
    length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return (
    <div className={styles.body}>
      {section?.approximate === true && (
        <div className={styles.approx}>~ APPROXIMATE DIMENSIONS</div>
      )}
      <h2 className={styles.title}>MEMBER {member.id}</h2>
      <dl className={styles.details}>
        <div className={styles.detail}>
          <dt>Section</dt>
          <dd>{section?.label ?? "—"}</dd>
        </div>
        <div className={styles.detail}>
          <dt>Group</dt>
          <dd>{member.group ?? "—"}</dd>
        </div>
        <div className={styles.detail}>
          <dt>Material</dt>
          <dd>{member.material ?? "—"}</dd>
        </div>
        <div className={styles.detail}>
          <dt>Length</dt>
          <dd>{length === null ? "—" : `${fmtCoord(length)} m`}</dd>
        </div>
        <div className={styles.detail}>
          <dt>Nodes</dt>
          <dd>
            {member.startNode} → {member.endNode}
          </dd>
        </div>
        {sCoord && (
          <div className={styles.detail}>
            <dt>Node {member.startNode}</dt>
            <dd>{sCoord}</dd>
          </div>
        )}
        {eCoord && (
          <div className={styles.detail}>
            <dt>Node {member.endNode}</dt>
            <dd>{eCoord}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function renderSupport(
  model: NonNullable<ReturnType<typeof useModelStore.getState>["model"]>,
  nodeId: number,
): React.ReactElement | null {
  const support = model.supports.find((sp) => sp.nodeId === nodeId);
  if (!support) return null;

  return (
    <div className={styles.body}>
      <h2 className={styles.title}>SUPPORT {support.nodeId}</h2>
      <dl className={styles.details}>
        <div className={styles.detail}>
          <dt>Type</dt>
          <dd>{SUPPORT_TYPE_LABEL[support.type]}</dd>
        </div>
      </dl>
      <div className={styles.releases} role="group" aria-label="Release degrees of freedom">
        {RELEASE_AXES.map((axis) => (
          <span
            key={axis}
            className={`${styles.dot} ${support.releases[axis] ? styles.released : ""}`}
            title={axis}
          >
            {axis}
          </span>
        ))}
      </div>
      {support.note !== undefined && (
        <dl className={styles.details}>
          <div className={styles.detail}>
            <dt>Stiffness</dt>
            <dd>{support.note}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
