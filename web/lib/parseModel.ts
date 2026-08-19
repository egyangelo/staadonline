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

import type { ParseResult } from "@staad-online/parser";

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