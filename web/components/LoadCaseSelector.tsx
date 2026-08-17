"use client";

/**
 * LoadCaseSelector — top-right load-case dropdown (03-04 Task 2, D-12,
 * UI-SPEC LoadCaseSelector row).
 *
 * Lists every load case (primary + combination + repeated) from the parsed
 * model and commits viewerStore.loadCaseId on selection. Combines/repeats
 * render the union of referenced items downstream (resolveLoadCaseItems in
 * the 03-08 MarkersLayer) — this control only commits the id.
 *
 * All file-derived strings (case titles) render as React text nodes — no
 * HTML injection (T-02/T-03-01). The dropdown is height-bounded (max 320px,
 * scroll) so a huge .std deck never blows up the DOM (T-03-02).
 *
 * Mounted in 03-09 page.tsx integration.
 */
import { useEffect, useRef, useState } from "react";
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import styles from "./LoadCaseSelector.module.css";

export function LoadCaseSelector() {
  const model = useModelStore((s) => s.model);
  const loadCaseId = useViewerStore((s) => s.loadCaseId);
  const setLoadCaseId = useViewerStore((s) => s.setLoadCaseId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!model) return null;

  const selected = model.loadCases.find((c) => c.id === loadCaseId) ?? null;
  const disabled = model.loadCases.length === 0;

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.caption}>LOAD CASE</span>
        <span className={styles.value}>
          {selected ? `${selected.id} — ${selected.title}` : "\u00a0"}
        </span>
      </button>
      {open && (
        <ul className={styles.dropdown} role="listbox" aria-label="Load cases">
          {model.loadCases.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === loadCaseId}>
              <button
                type="button"
                className={styles.row}
                onClick={() => {
                  setLoadCaseId(c.id);
                  setOpen(false);
                }}
              >
                <span className={styles.rowId}>{c.id}</span>
                <span className={styles.rowTitle}>{c.title}</span>
                {c.id === loadCaseId && <span className={styles.check}>·</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
