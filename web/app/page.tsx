"use client";

/**
 * STAAD Online viewer page (02-07, D-11/D-12; FILE-01..FILE-04).
 *
 * Full-canvas 3D viewer with a minimal floating chrome cluster:
 *   - <ViewerCanvas /> (02-05) fixed full-viewport behind the chrome;
 *   - bottom-left cluster: OpenControl + ExaggerationSlider (02-06);
 *   - StatsSummary (02-06) above the cluster;
 *   - ErrorToast bottom-center when a typed error is set;
 *   - LoadingOverlay (02-06) while status === 'loading'.
 *
 * State machine: EMPTY → LOADING → LOADED (ERROR reachable from LOADING;
 * error restores EMPTY without touching model/warnings — FILE-03).
 *
 * Security (T-02-01..T-02-06): every file-derived string renders as a React
 * text node (never dangerouslySetInnerHTML); open/drop funnel through
 * FileService.readStdFile (FILE-04 guards INSIDE the service, page never
 * re-checks size/extension); picker cancel no-ops by construction; a repeat
 * open during LOADING aborts the in-flight open before committing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseStaad, registerParsingCommands } from "@staad-online/parser";
import { FileServiceError, readStdFile } from "@/lib/fileService";
import { useModelStore } from "@/store/modelStore";
import { ViewerCanvas } from "@/components/ViewerCanvas";
import { OpenControl } from "@/components/OpenControl";
import { ExaggerationSlider } from "@/components/ExaggerationSlider";
import { StatsSummary } from "@/components/StatsSummary";
import { ErrorToast, type ErrorCode } from "@/components/ErrorToast";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import styles from "./viewer.module.css";

registerParsingCommands();

const ERROR_CODE_MAP: Record<FileServiceError["code"], ErrorCode> = {
  WRONG_TYPE: "WRONG_TYPE",
  TOO_LARGE: "TOO_LARGE",
  UNREADABLE: "UNREADABLE",
};

export default function Home() {
  const status = useModelStore((s) => s.status);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const openToken = useRef(0);

  const openFile = useCallback(async (file: File) => {
    // Every open aborts the previous in-flight one (FILE-03/T-02-06): a stale
    // token means the old read must never commit setModel.
    const token = ++openToken.current;
    setError(null);
    setErrorDetail(undefined);
    useModelStore.getState().beginLoading();

    try {
      const { name, text } = await readStdFile(file);
      if (token !== openToken.current) return;
      const result = parseStaad(text);
      if (token !== openToken.current) return;
      useModelStore.getState().setModel(result, name);
    } catch (e) {
      if (token !== openToken.current) return;
      if (e instanceof FileServiceError) {
        setError(ERROR_CODE_MAP[e.code]);
      } else {
        setError("PARSE");
        setErrorDetail(e instanceof Error ? e.message : String(e));
      }
      // EMPTY restored without touching model/warnings (FILE-03).
      useModelStore.getState().setError();
    }
  }, []);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void openFile(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openFile]);

  const ready = status === "ready";
  const loading = status === "loading";
  const empty = status === "empty" && !error;

  return (
    <div
      className={`${styles.page} ${dragOver ? styles.dragOver : ""}`}
      aria-busy={loading}
    >
      <ViewerCanvas />

      {empty && (
        <section className={styles.emptyState}>
          <h1 className={styles.emptyTitle}>No model loaded</h1>
          <p className={styles.emptyBody}>
            Open a <code>.std</code> STAAD input deck to see its analytical
            model in 3D. Parsing happens entirely in your browser — nothing is
            uploaded.
          </p>
          <p className={styles.emptyNext}>
            Use “Open STAAD File”, or drag a <code>.std</code> file onto this
            window.
          </p>
        </section>
      )}

      {ready && (
        <div className={styles.statsWrap}>
          <StatsSummary />
        </div>
      )}

      <div className={styles.cluster}>
        <OpenControl onOpen={openFile} />
        <ExaggerationSlider />
      </div>

      {error && (
        <ErrorToast
          code={error}
          detail={errorDetail}
          onDismiss={() => setError(null)}
        />
      )}

      {loading && <LoadingOverlay />}
    </div>
  );
}