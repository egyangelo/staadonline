/**
 * parseModel — central sync-vs-worker parse branch for the STAAD viewer
 * (04-03, D-03/D-04/D-05, PERF-01/PERF-02).
 *
 * Files larger than WORKER_THRESHOLD characters parse in a dedicated singleton
 * module Web Worker (./staad.worker.ts) off the main thread, keeping the UI
 * responsive for large decks (D-03, PERF-01). Smaller files parse synchronously
 * on the main thread with zero worker overhead.
 *
 * The worker protocol is raw typed postMessage with no runtime dependencies
 * (D-04) — no Comlink — matching the parser's zero-dependency philosophy. The
 * discriminated unions below are the shared contract between the main thread
 * (parseModel) and the worker (staad.worker.ts). The parsed ParseResult crosses
 * back via structured clone of the full typed model (D-05).
 */

import { parseStaad, type ParseResult } from "@staad-online/parser";

/** Character-length threshold above which parsing dispatches to the Web Worker (D-03, PERF-01). */
export const WORKER_THRESHOLD = 2_000_000;

/** Worker → main messages (D-04/D-05/D-06 relay). */
export type ParseMessage =
  | { type: "ready" }
  | { type: "progress"; fraction: number }
  | { type: "result"; result: ParseResult }
  | { type: "error"; message: string };

/** Main → worker request (D-04). */
export type ParseRequest = { type: "parse"; text: string };

/** Lazily-created singleton module worker, reused across opens (D-04). */
let worker: Worker | null = null;

/**
 * Parse raw `.std` text, choosing the fast path by size (D-03, PERF-01):
 * files larger than WORKER_THRESHOLD parse in the singleton module worker off
 * the main thread (keeping the UI responsive); smaller files parse
 * synchronously with zero worker overhead. `onProgress` (D-06) receives a
 * non-decreasing fraction in [0,1] when the worker relays it (or when the
 * sync parser reports it). Resolves the structured-cloned ParseResult (D-05) —
 * the same shape the stores/renderer consume.
 */
export async function parseModel(
  text: string,
  onProgress?: (fraction: number) => void,
): Promise<ParseResult> {
  if (text.length > WORKER_THRESHOLD) {
    return parseInWorker(text, onProgress);
  }
  return parseStaad(text, onProgress);
}

/**
 * Lazily create (or reuse) the singleton module worker. Construction is
 * client-only (guarded by `typeof window`); the worker URL is the exact static
 * literal `new URL('./staad.worker.ts', import.meta.url)` with module type —
 * never a templated URL (T-04-15). On worker error the singleton is nulled so
 * the next open re-creates it (T-04-14).
 */
function getWorker(): Worker {
  if (typeof window === "undefined") {
    throw new Error("Worker unavailable outside browser");
  }
  if (worker) return worker;
  worker = new Worker(new URL("./staad.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onerror = () => {
    worker = null;
  };
  return worker;
}

/**
 * Dispatch one parse to the singleton worker and await its structured-cloned
 * result. Routes `progress` → onProgress, `result` → resolve, `error` →
 * reject; any other message type is ignored (T-04-11).
 */
function parseInWorker(
  text: string,
  onProgress?: (fraction: number) => void,
): Promise<ParseResult> {
  return new Promise<ParseResult>((resolve, reject) => {
    const w = getWorker();
    const onMsg = (e: MessageEvent<ParseMessage>): void => {
      const m = e.data;
      if (m.type === "progress") {
        onProgress?.(m.fraction);
        return;
      }
      if (m.type === "result") {
        w.removeEventListener("message", onMsg);
        resolve(m.result);
        return;
      }
      if (m.type === "error") {
        w.removeEventListener("message", onMsg);
        reject(new Error(m.message));
        return;
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "parse", text } as ParseRequest);
  });
}