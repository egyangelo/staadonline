"use client";

/**
 * MagnitudeLabelToggle — Labels pill gated behind the markers layer
 * (03-04 Task 3, D-10, UI-SPEC MagnitudeLabelToggle row).
 *
 * Rendered only while the markers layer is visible AND the effective
 * selected load case has items (via resolveLoadCaseItems, so combinations
 * count their union). Commits viewerStore.labelsVisible only — the actual
 * label chips are rendered by the 03-08 MarkersLayer.
 *
 * Mounted in 03-09 page.tsx integration.
 */
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import { resolveLoadCaseItems } from "@/lib/loadCases";
import styles from "./MagnitudeLabelToggle.module.css";

export function MagnitudeLabelToggle() {
  const model = useModelStore((s) => s.model);
  const markersVisible = useViewerStore((s) => s.markersVisible);
  const labelsVisible = useViewerStore((s) => s.labelsVisible);
  const setLabelsVisible = useViewerStore((s) => s.setLabelsVisible);
  const loadCaseId = useViewerStore((s) => s.loadCaseId);

  if (!markersVisible) return null;

  const hasItems =
    model !== null && loadCaseId !== null && resolveLoadCaseItems(model, loadCaseId).length > 0;
  if (!hasItems) return null;

  return (
    <button
      type="button"
      className={styles.pill}
      aria-pressed={labelsVisible}
      title="Show load magnitude labels"
      onClick={() => setLabelsVisible(!labelsVisible)}
    >
      Labels
    </button>
  );
}
