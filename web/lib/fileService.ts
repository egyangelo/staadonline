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