"use client";

/**
 * OpenControl — primary accent "Open STAAD File" CTA + hidden file input
 * (02-06 Task 1, D-12, UI-SPEC Copywriting).
 *
 * Owns the picker mechanics only; the actual parse wiring stays in page.tsx
 * (02-07) via `onOpen`. Cancel-safety by construction: a dismissed picker
 * never fires onChange (FILE-03), so no error is rendered here. input.value
 * is reset after every selection so re-picking the same file re-fires.
 */
import { useRef } from "react";
import styles from "./OpenControl.module.css";

interface OpenControlProps {
  onOpen: (file: File) => void;
}

export function OpenControl({ onOpen }: OpenControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const trigger = () => inputRef.current?.click();

  return (
    <div className={styles.container}>
      <button type="button" className={styles.button} onClick={trigger}>
        <svg
          className={styles.icon}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 6.5A1.5 1.5 0 0 1 4 5h3.2l1.4 1.5H16a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 16 15.5H4a1.5 1.5 0 0 1-1.5-1.5v-7.5Z"
            fill="currentColor"
          />
        </svg>
        Open STAAD File
      </button>
      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept=".std"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onOpen(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}