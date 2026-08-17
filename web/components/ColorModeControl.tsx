"use client";

/**
 * ColorModeControl — top-center segmented color-mode switcher (03-04 Task 1,
 * D-01, UI-SPEC ColorModeControl row).
 *
 * Commits viewerStore.colorMode only. The actual COLOR-04 color-buffer
 * rewrite happens in the 03-07 ColorLayer scene component — this control
 * never triggers a scene rebuild.
 *
 * Keyboard: roving tabindex + ArrowLeft/ArrowRight/Home/End; the arrow keys
 * move focus AND commit the target mode. The active segment's label sits on
 * a solid thumb (light #FFFFFF / dark #1C1C1E, never accent) that slides
 * with a spring; reduced-motion kills the slide.
 *
 * Mounted in 03-09 page.tsx integration.
 */
import { useViewerStore, type ColorMode } from "@/store/viewerStore";
import styles from "./ColorModeControl.module.css";

const MODES: { mode: ColorMode; label: string }[] = [
  { mode: "section", label: "Section" },
  { mode: "group", label: "Group" },
  { mode: "material", label: "Material" },
  { mode: "all", label: "All members" },
];

export function ColorModeControl() {
  const colorMode = useViewerStore((s) => s.colorMode);
  const setColorMode = useViewerStore((s) => s.setColorMode);
  const activeIndex = MODES.findIndex((m) => m.mode === colorMode);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = (activeIndex - 1 + MODES.length) % MODES.length;
        break;
      case "ArrowRight":
        next = (activeIndex + 1) % MODES.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = MODES.length - 1;
        break;
    }
    if (next === null) return;
    e.preventDefault();
    const target = e.currentTarget.querySelector<HTMLElement>(
      `[data-index="${next}"]`,
    );
    target?.focus();
    setColorMode(MODES[next].mode);
  };

  return (
    <div
      className={styles.control}
      role="radiogroup"
      aria-label="Color members by section, group, material, or all"
      style={{ "--thumb-index": activeIndex } as React.CSSProperties}
      onKeyDown={onKeyDown}
    >
      <div className={styles.thumb} aria-hidden="true" />
      {MODES.map((m, i) => (
        <button
          key={m.mode}
          type="button"
          role="radio"
          aria-checked={m.mode === colorMode}
          data-index={i}
          className={styles.segment}
          tabIndex={m.mode === colorMode ? 0 : -1}
          onClick={() => setColorMode(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
