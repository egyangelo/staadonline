"use client";

/**
 * MemberExtrusionToggle — "Profiles" pill toggling how frame members render.
 * ON (default): true cross-section extrusion. OFF: slim centerline sticks so
 * the structure reads as a wireframe (useful with dense models and with the
 * plate Thickness view). Rebuilds the scene on toggle via ViewerCanvas deps.
 */
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import styles from "./MagnitudeLabelToggle.module.css";

export function MemberExtrusionToggle() {
  const model = useModelStore((s) => s.model);
  const memberExtrusion = useViewerStore((s) => s.memberExtrusion);
  const setMemberExtrusion = useViewerStore((s) => s.setMemberExtrusion);

  if (!model || model.members.length === 0) return null;

  return (
    <button
      type="button"
      className={styles.pill}
      aria-pressed={memberExtrusion}
      title="Toggle member cross-section extrusion (profiles vs centerline sticks)"
      onClick={() => setMemberExtrusion(!memberExtrusion)}
    >
      Profiles
    </button>
  );
}
