"use client";

/**
 * NativeOpenControl — Android "Open STAAD File" entry for the Capacitor
 * file-picker (04-06, D-01/D-02, FILE-03, PATTERNS §2.8).
 *
 * Owns the picker mechanics only; page.tsx owns the parse wiring via onOpen
 * (the same role OpenControl plays on web). Calls the Capacitor picker
 * directly — no hidden <input type="file"> — with readData OFF (default), so
 * the picked file crosses back as a content URI / blob, never base64 (D-01,
 * PLAT-03). Picker dismissal (no files) is a strict no-op: no beginLoading, no
 * store write, no error (FILE-03). readNativeFile reuses the FileService
 * guards + FileServiceError codes; a typed error is re-thrown for the page's
 * ERROR_CODE_MAP — a raw DOM/plugin error is never rendered here.
 */
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { FileServiceError, readNativeFile } from "@/lib/fileService";
import styles from "./NativeOpenControl.module.css";

interface NativeOpenControlProps {
  onOpen: (file: { name: string; text: string }) => void;
}

export function NativeOpenControl({ onOpen }: NativeOpenControlProps) {
  // Web builds already have OpenControl (hidden <input type="file">); the
  // Capacitor picker only works inside a native shell, so this control hides
  // itself on web instead of rendering a second dead "Open STAAD File" button.
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(Capacitor.isNativePlatform());
  }, []);

  if (!native) return null;

  const open = async () => {
    try {
      const { files } = await FilePicker.pickFiles({
        types: [".std"],
        limit: 1,
      });
      // FILE-03 strict no-op: a dismissed picker returns no files and must not
      // beginLoading / write the store / surface an error.
      if (!files?.length) return;
      const opened = await readNativeFile(files[0]);
      if (opened) onOpen(opened);
    } catch (e) {
      // Typed FileServiceError (WRONG_TYPE/TOO_LARGE/UNREADABLE) propagates to
      // the page's ERROR_CODE_MAP; a picker dismissal must never reach here.
      if (e instanceof FileServiceError) throw e;
    }
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void open()}
      >
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
    </div>
  );
}