"use client";

/**
 * ErrorToast — typed file/parse error toast (02-06 Task 4, FILE-04 copy,
 * UI-SPEC). Presentational: shows the exact UI-SPEC copy per code with a 2px
 * destructive border; the page (02-07) clears it on the next open action.
 *
 * T-02-02: copy is FIXED per code; the wrapped message (only on UNREADABLE/
 * PARSE) is appended as a React text node with a length cap, never as HTML.
 */
import styles from "./ErrorToast.module.css";

export type ErrorCode = "WRONG_TYPE" | "TOO_LARGE" | "UNREADABLE" | "PARSE";

interface ErrorToastProps {
  code: ErrorCode;
  detail?: string;
  onDismiss: () => void;
}

const COPY: Record<
  Exclude<ErrorCode, "UNREADABLE" | "PARSE">,
  { title: string; body: string }
> = {
  WRONG_TYPE: {
    title: "Not a STAAD file",
    body: "This file isn't a `.std` input deck. Choose a `.std` file and try again.",
  },
  TOO_LARGE: {
    title: "File too large or unreadable",
    body: "STAAD Online reads `.std` decks up to 64 MB. Choose a valid, smaller file and try again.",
  },
};

function copyFor(code: ErrorCode, detail?: string): { title: string; body: string } {
  if (code === "WRONG_TYPE" || code === "TOO_LARGE") return COPY[code];
  const detailText = detail ? detail.slice(0, 200) : "";
  return {
    title: "File too large or unreadable",
    body: detailText
      ? `STAAD Online could not read this file. ${detailText}`
      : "STAAD Online could not read this file. Try a different `.std` file.",
  };
}

export function ErrorToast({ code, detail, onDismiss }: ErrorToastProps) {
  const { title, body } = copyFor(code, detail);

  return (
    <aside className={styles.toast} role="alert" aria-live="assertive">
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        <p className={styles.body}>{body}</p>
      </div>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss error">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M6 6 14 14M14 6 6 14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </aside>
  );
}