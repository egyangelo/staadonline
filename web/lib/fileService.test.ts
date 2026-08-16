/**
 * FileService contract tests (02-02 Task 3 — FILE-01..FILE-04 at the
 * platform boundary). `File` is not constructible in node — readStdFile
 * paths use duck-typed File-shaped objects with a `text()` method.
 */
import { describe, expect, it } from "vitest";
import { MAX_INPUT_LENGTH } from "@staad-online/parser";
import {
  assertValidStdFile,
  FileServiceError,
  readStdFile,
} from "./fileService";
import type { FileServiceErrorCode, OpenedFile } from "./fileService";

/** Minimal File-shaped fixture — no allocation for the huge-size case. */
function fakeFile(
  name = "model.std",
  size = 10,
  text: () => Promise<string> = () => Promise.resolve("STAAD SPACE"),
): File {
  return { name, size, text } as File;
}

/** Assert a call throws FileServiceError and return its code. */
function rejectedCode(fn: () => void): FileServiceErrorCode {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(FileServiceError);
  return (caught as FileServiceError).code;
}

describe("assertValidStdFile (FILE-04 pre-read guards)", () => {
  it("(1) a .std file passes", () => {
    expect(() => assertValidStdFile(fakeFile())).not.toThrow();
  });

  it("(2) `model.STD` passes (extension check is case-insensitive)", () => {
    expect(() => assertValidStdFile(fakeFile("model.STD"))).not.toThrow();
  });

  it("(3) `notes.txt` throws WRONG_TYPE", () => {
    expect(rejectedCode(() => assertValidStdFile(fakeFile("notes.txt")))).toBe(
      "WRONG_TYPE",
    );
  });

  it("(4) a file larger than MAX_INPUT_LENGTH throws TOO_LARGE (no allocation)", () => {
    const size = MAX_INPUT_LENGTH + 1;
    expect(rejectedCode(() => assertValidStdFile(fakeFile("big.std", size)))).toBe(
      "TOO_LARGE",
    );
  });
});

describe("readStdFile", () => {
  it("(5) resolves { name, text } matching the fake File's text() return", async () => {
    const file = fakeFile("model.std", 10, () =>
      Promise.resolve("STAAD SPACE"),
    );
    await expect(readStdFile(file)).resolves.toEqual({
      name: "model.std",
      text: "STAAD SPACE",
    });
  });

  it("(6) a rejected text() read rejects with UNREADABLE", async () => {
    const file = fakeFile("model.std", 10, () =>
      Promise.reject(new Error("disk error")),
    );
    await expect(readStdFile(file)).rejects.toBeInstanceOf(FileServiceError);
    await expect(readStdFile(file)).rejects.toMatchObject({
      code: "UNREADABLE",
    });
  });

  it("(7) File-shaped objects with a text() method are accepted (no File construction in node)", async () => {
    const opened: OpenedFile = await readStdFile(
      fakeFile("deck.std", 5, () => Promise.resolve("JOINT COORDINATES")),
    );
    expect(opened.name).toBe("deck.std");
    expect(opened.text).toBe("JOINT COORDINATES");
  });

  it("(8) readStdFile still applies the pre-read guards — wrong type is rejected before text()", async () => {
    const file = fakeFile("notes.txt", 10, () =>
      Promise.resolve("should never be read"),
    );
    await expect(readStdFile(file)).rejects.toMatchObject({
      code: "WRONG_TYPE",
    });
  });
});