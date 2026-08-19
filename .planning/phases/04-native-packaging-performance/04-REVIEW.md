---
phase: 04-native-packaging-performance
status: issues-found
files_reviewed: 18
depth: standard
critical: 0
warning: 3
info: 3
total: 6
---

# Code Review: Phase 04 — Native Packaging & Performance

## Findings

### WR-1 (singleton worker message cross-talk on overlapping opens)
- **File:** web/lib/parseModel.ts:80-106 (also web/lib/staad.worker.ts:36, web/app/page.tsx:69-73)
- **Severity:** Warning
- **Description:** `parseInWorker` attaches a per-call `message` listener to the **shared** singleton worker and never scopes messages to the originating request. When two large-file opens overlap (a repeat-open while a >2 MB worker parse is still in flight — possible via `NativeOpenControl`/`OpenControl`/drag-drop, all live during LOADING), each `parseInWorker` adds a listener to the same `worker`. The worker's `self.postMessage({ type: "result", result })` is delivered to **every** attached listener, so the second open's promise resolves with the **first** parse's `result` (and the second listener then self-removes on that first result, dropping its own `result` when it eventually arrives). The `openToken` guard in `page.tsx` does not help here: open B's token check passes (its own token is current), so it commits open **A's** model under open B's filename. Genuine correctness bug under rapid repeat-open of large files.
- **Suggestion:** Carry a per-request token in `ParseRequest` (e.g. `{ type: "parse"; id: number; text }`), echo it in each `ParseMessage`, and have each listener ignore messages whose `id` does not match its request (mirroring the `openToken` discipline). Alternatively serialize in-flight worker parses (queue one at a time) or terminate/recreate the worker per parse so messages cannot cross. Add a test that overlaps two `parseModel` calls and asserts each resolves its own result.

### WR-2 (worker load failure leaves the UI stuck in "loading" with no error or fallback)
- **File:** web/lib/parseModel.ts:61-73, 80-106
- **Severity:** Warning
- **Description:** `getWorker` sets `worker.onerror = () => { worker = null }`, but the in-flight `parseInWorker` promise is never settled (no `reject`) on worker load/init failure. If the module worker fails to bootstrap — the exact Turbopack/`output:'export'` regression RESEARCH R-1 flags as HIGH — the first >2 MB open hangs with `status: "loading"` and no error toast, and there is no fallback to the synchronous parse path (RESEARCH §4.1 explicitly calls for "falls back to main thread"). `parseModel.test.ts` only verifies worker *recreation* on error (test 5), not that the pending promise rejects.
- **Suggestion:** On `onerror`, reject the pending promise(s) (e.g. track the active resolver or close over it), so `page.tsx`'s catch surfaces a `PARSE` error. Consider falling back to `parseStaad(text, onProgress)` synchronously when worker construction fails, to preserve PERF-01's responsiveness guarantee. Add a test asserting the pending promise rejects on `onerror`.

### WR-3 (native read failures are not mapped to UNREADABLE and are silently swallowed)
- **File:** web/lib/fileService.ts:112-114; web/components/NativeOpenControl.tsx:36-40
- **Severity:** Warning
- **Description:** In `readNativeFile`, only `blob.text()` (line 117) is wrapped in the try/catch that maps to `FileServiceError` UNREADABLE. The `fetch(webPath)` and `fetch(webPath).blob()` calls (lines 112-114) are outside it, so a network/plugin read failure throws a raw (non-`FileServiceError`) error. In `NativeOpenControl`, the catch (lines 36-40) re-throws only `FileServiceError` and silently swallows every other error — so a failed native read surfaces nothing to the user: no toast, no `setError`, and the picker-dismissed no-op path is indistinguishable from a real failure. `probeContentLength`'s fetch (133-138) is likewise unguarded.
- **Suggestion:** Wrap the whole `convertFileSrc → fetch → blob → text` read sequence in the UNREADABLE try/catch (or have `NativeOpenControl` catch non-`FileServiceError` and rethrow as `FileServiceError` UNREADABLE), so native read failures reach `page.tsx`'s `ERROR_CODE_MAP` and render an error instead of vanishing.

### INFO-1 (native size guard is best-effort; double-fetch of the file)
- **File:** web/lib/fileService.ts:104-114, 133-138
- **Severity:** Info
- **Description:** `probeContentLength` issues a full GET (not a HEAD) to read `content-length`, then the read path issues a second GET (line 114) — the file is transferred twice. If the converted local URL's response lacks a reliable `content-length`, the probe returns 0 (line 138), the `TOO_LARGE` guard silently passes, and an oversized native file is fully read before any rejection — weakening FILE-04's "before any read" guarantee on Android. This is acknowledged in the code comment but is worth confirming against the actual Capacitor local server.
- **Suggestion:** Use a HEAD request for the probe, and consider a defensive post-read size assertion (or a hard cap) so TOO_LARGE can still fire if content-length is absent.

### INFO-2 (`ParseProgress.stage` is dead API surface)
- **File:** packages/parser/src/types.ts:197-200, packages/parser/src/index.ts:83-86
- **Severity:** Info
- **Description:** `ParseProgress` is exported and tested, and its `stage?: string` field is documented, but `parseStaad`'s `onProgress` is typed `(fraction: number) => void` and the worker protocol (staad.worker.ts) relays only a bare number — `stage` is never produced or consumed anywhere. Minor contract/implementation mismatch and dead surface on the public API.
- **Suggestion:** Either drop the unused `stage` field (and its test) or thread `stage` through the callback so the contract matches the implementation.

### INFO-3 (dead `start` script after static export)
- **File:** web/package.json:8
- **Severity:** Info
- **Description:** With `output: "export"` (next.config.ts:10), `next build` emits a static bundle to `out/` with no Node server, so `next start` fails. The `"start": "next start"` script is now misleading for anyone running the web app; it is not used by the Android flow.
- **Suggestion:** Replace it with a static-serve script (e.g. `"start": "npx serve out"`) or remove it.

## Summary

6 findings (0 critical, 3 warnings, 3 info) across 18 files.

The phase is well-aligned with the locked contracts: the parser's optional `onProgress` is genuinely non-breaking (verified by tests A-D and the monotonic per-block fraction 0.1 → 0.15–0.95 → 1.0), the native read avoids base64 entirely (blob fetch + `convertFileSrc`), picker cancel is a strict no-op, keystore secrets are kept out of tracked files (git-ignored `*.jks`/`keystore.properties` + env fallback), AGP is pinned to 8.13.x with `proguard-android-optimize.txt`, the worker URL is a static literal module-worker, and `LoadingOverlay` carries correct `role="progressbar"`/`aria-valuenow`/`aria-live`/`aria-busy` with the glass tokens and reduced-motion/transparency/contrast variants. Type-level and FILE-04 guard ordering (size before `blob.text()`) are sound.

The three warnings are the meaningful items. The highest-priority is **WR-1**: the singleton worker broadcasts every `result` to all attached listeners, so overlapping large-file opens cross-resolve and the page commits the wrong model — the `openToken` guard cannot catch it. **WR-2** and **WR-3** are robustness gaps (worker load failure hangs the loading state with no fallback; native read failures are silently swallowed instead of surfacing as UNREADABLE). All three are readily addressable with a request token in the worker protocol, rejection/fallback on worker error, and widening the UNREADABLE try/catch to the full native fetch path.
