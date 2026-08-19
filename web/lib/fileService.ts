/**
 * FileService — the ONLY place file bytes cross into the app (D-10,
 * ARCHITECTURE.md Pattern 4 platform boundary, web branch).
 *
 * Web branch: hidden `<input type="file" accept=".std">` + native HTML5
 * drag-and-drop. The pick wiring stays in the UI layer (02-06/02-07) but
 * MUST call `readStdFile`; the native branch (Capacitor file-picker) is
 * stubbed here for Phase 4.
 *
 * FILE-03 by construction: hidden-input `onChange` only fires when a file is
 * *selected* — dismissing the picker (or dropping nothing) never invokes it,
 * so cancel is a strict no-op that never mutates parse/model state.
 *
 * FILE-04 guards (extension + size) fire BEFORE any read/parse (T-02-01,
 * T-02-02): wrong-type and oversize inputs throw typed, stable
 * FileServiceError codes the UI renders as the UI-SPEC error copy.
 */

import { MAX_INPUT_LENGTH } from "@staad-online/parser";
import { Capacitor } from "@capacitor/core";
import type { PickedFile } from "@capawesome/capacitor-file-picker";

/** A successfully opened local .std file: name + full text content. */
export interface OpenedFile {
  name: string;
  text: string;
}

/** Stable, machine-readable failure codes for the UI error copy (FILE-04). */
export type FileServiceErrorCode = "WRONG_TYPE" | "TOO_LARGE" | "UNREADABLE";

/** Typed error thrown at the platform boundary — never raw strings. */
export class FileServiceError extends Error {
  readonly code: FileServiceErrorCode;

  constructor(code: FileServiceErrorCode, message: string) {
    super(message);
    this.name = "FileServiceError";
    this.code = code;
  }
}

/**
 * Pre-read FILE-04 guards. `file` is a structurally-minimal File shape
 * (`{ name, size }`) so guards stay testable in node without constructing
 * a real File. Throws FileServiceError WRONG_TYPE / TOO_LARGE.
 */
export function assertValidStdFile(file: { name: string; size: number }): void {
  if (!file.name.toLowerCase().endsWith(".std")) {
    throw new FileServiceError(
      "WRONG_TYPE",
      "Please choose a .std file (a STAAD input deck).",
    );
  }
  if (file.size > MAX_INPUT_LENGTH) {
    throw new FileServiceError(
      "TOO_LARGE",
      "File too large or unreadable — STAAD Online reads .std decks up to 64 MB.",
    );
  }
}

/**
 * Validate then read a selected File as text (File.text(), never base64 —
 * PITFALLS P6). The size guard fires BEFORE text() allocates (T-02-01).
 * Reads that throw are wrapped in FileServiceError UNREADABLE so the UI
 * never receives a raw DOM error.
 */
export async function readStdFile(file: File): Promise<OpenedFile> {
  assertValidStdFile(file);
  try {
    const text = await file.text();
    return { name: file.name, text };
  } catch (e) {
    throw new FileServiceError(
      "UNREADABLE",
      `Could not read ${file.name} — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Native branch (Capacitor file-picker) of the FileService platform boundary
 * (D-01, D-02, ARCHITECTURE.md Pattern 4). Opens a user-picked `.std` via the
 * streaming blob path only — content URI → Capacitor.convertFileSrc →
 * fetch().blob() → blob.text() — NO base64 anywhere (PLAT-03, PITFALLS P6).
 *
 * Reuses the existing FILE-04 guards + FileServiceError codes unchanged:
 * `assertValidStdFile` (WRONG_TYPE / TOO_LARGE) and UNREADABLE on read throw.
 * Guard ordering (RESEARCH R-5 / FILE-04): size is probed BEFORE `blob.text()`
 * so TOO_LARGE fires before any text materializes. Picker cancel (empty name /
 * undefined picked) is a strict no-op returning undefined — no beginLoading, no
 * store write, no error (FILE-03).
 *
 * `picked` takes the picker's structural shape ({ name, path?, blob? }); on web
 * `blob` is present, on Android/iOS `path` is a content:// URI that must be
 * rewritten via `Capacitor.convertFileSrc` — never `fetch('content://…')` raw
 * (RESEARCH R-3).
 */
export async function readNativeFile(
  picked: { name: string; path?: string; blob?: Blob },
): Promise<OpenedFile | undefined> {
  if (!picked?.name) return undefined; // FILE-03 strict no-op
  const size = picked.blob
    ? picked.blob.size
    : await probeContentLength(picked.path);
  assertValidStdFile({ name: picked.name, size });
  let blob: Blob;
  if (picked.blob) {
    blob = picked.blob; // web branch (already a real Blob)
  } else {
    const webPath = Capacitor.convertFileSrc(picked.path!); // content:// -> http://localhost/_capacitor_file_/... (R-3)
    // NO base64: convertFileSrc + fetch .blob() streams from disk backing (D-01 / PLAT-03)
    blob = await (await fetch(webPath)).blob();
  }
  try {
    const text = await blob.text();
    return { name: picked.name, text };
  } catch (e) {
    throw new FileServiceError(
      "UNREADABLE",
      `Could not read ${picked.name} — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Cheap pre-read size probe for the native path (RESEARCH R-5 / FILE-04): the
 * picker file has no reliable `.size` up front, so read content-length via a
 * fetch of the converted URL. Returns 0 when no path is present — a 0 size
 * passes the TOO_LARGE guard and falls through to the UNREADABLE/read path.
 */
async function probeContentLength(path?: string): Promise<number> {
  if (!path) return 0;
  const webPath = Capacitor.convertFileSrc(path);
  const res = await fetch(webPath);
  const len = Number(res.headers.get("content-length") ?? 0);
  return Number.isFinite(len) && len > 0 ? len : 0;
}