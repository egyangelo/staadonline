/**
 * STAAD parse module worker (04-03, D-03/D-04/D-05) — client-only; zero
 * DOM/Node; raw postMessage.
 *
 * Receives a typed ParseRequest (`{ type: 'parse', text }`), runs the
 * zero-dependency parser's `parseStaad`, relays progress as
 * `{ type: 'progress', fraction }` (throttled to ≥1% delta, T-04-13), and posts
 * the structured-cloned ParseResult back (D-05). Parse throws degrade to
 * `{ type: 'error', message }` — the parser is tolerant, so this is defensive.
 *
 * This file is a module-worker target only, instantiated by parseModel with the
 * exact static path `./staad.worker.ts` and `{ type: 'module' }` (the caller
 * owns the literal `new URL(...)`, T-04-15). It is never imported by the page
 * directly. It must not import `next/server` or any Node API;
 * `transpilePackages` makes the TS parser import work.
 */

import { parseStaad } from "@staad-online/parser";
import type { ParseMessage, ParseRequest } from "./parseModel";

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  if (e.data?.type !== "parse") return;
  let last = -1;
  const post = (fraction: number): void => {
    if (fraction - last >= 0.01) {
      last = fraction;
      (self.postMessage as (m: ParseMessage) => void)({
        type: "progress",
        fraction,
      });
    }
  };
  try {
    const result = parseStaad(e.data.text, post);
    post(1);
    (self.postMessage as (m: ParseMessage) => void)({ type: "result", result });
  } catch (err) {
    (self.postMessage as (m: ParseMessage) => void)({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};