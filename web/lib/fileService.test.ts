/**
 * FileService contract tests (02-02 Task 3 — FILE-01..FILE-04 at the
 * platform boundary). `File` is not constructible in node — readStdFile
 * paths use duck-typed File-shaped objects with a `text()` method.
 */
import { describe, expect, it, vi } from "vitest";
import { MAX_INPUT_LENGTH } from "@staad-online/parser";
import { Capacitor } from "@capacitor/core";
import {
  assertValidStdFile,
  FileServiceError,
  readNativeFile,
  readStdFile,
} from "./fileService";
import type { FileServiceErrorCode, OpenedFile } from "./fileService";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    convertFileSrc: vi.fn(
      (path: string) => `http://localhost/_capacitor_file_/${path}`,
    ),
  },
}));

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

describe("readNativeFile — native Capacitor branch (04-02, D-01/D-02, PLAT-03)", () => {
  it("(1) web blob branch: resolves { name, text } matching the picked blob (no convertFileSrc/fetch)", async () => {
    const picked = { name: "model.std", blob: new Blob(["STAAD SPACE"]) };
    await expect(readNativeFile(picked)).resolves.toEqual({
      name: "model.std",
      text: "STAAD SPACE",
    });
  });

  it("(2) cancel no-op: empty name / undefined resolve undefined (FILE-03 strict no-op)", async () => {
    await expect(readNativeFile({ name: "" })).resolves.toBeUndefined();
    await expect(readNativeFile(undefined as never)).resolves.toBeUndefined();
  });

  it("(3) WRONG_TYPE rejects before the blob is read", async () => {
    const unreadableBlob = {
      size: 10,
      text: () => {
        throw new Error("must not be read");
      },
    } as unknown as Blob;
    await expect(
      readNativeFile({ name: "notes.txt", blob: unreadableBlob }),
    ).rejects.toMatchObject({ code: "WRONG_TYPE" });
  });

  it("(4) TOO_LARGE fires BEFORE text() — the blob's text() is never called", async () => {
    const tooLargeBlob = {
      size: MAX_INPUT_LENGTH + 1,
      text: () => {
        throw new Error("must not be read");
      },
    } as unknown as Blob;
    await expect(
      readNativeFile({ name: "big.std", blob: tooLargeBlob }),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("(5) a blob whose text() rejects rejects with UNREADABLE", async () => {
    const badBlob = {
      size: 10,
      text: () => Promise.reject(new Error("disk error")),
    } as unknown as Blob;
    await expect(
      readNativeFile({ name: "model.std", blob: badBlob }),
    ).rejects.toBeInstanceOf(FileServiceError);
    await expect(
      readNativeFile({ name: "model.std", blob: badBlob }),
    ).rejects.toMatchObject({ code: "UNREADABLE" });
  });

  it("(6) native path: convertFileSrc → fetch blob — asserts both the resolved OpenedFile and the content URI", async () => {
    const convertSpy = Capacitor.convertFileSrc as ReturnType<typeof vi.fn>;
    convertSpy.mockClear();
    const fetchMock = vi.fn(async () => ({
      headers: { get: () => "16" },
      blob: async () => new Blob(["STAAD SPACE"]),
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const opened = await readNativeFile({
        name: "model.std",
        path: "content://x",
      });
      expect(convertSpy).toHaveBeenCalledWith("content://x");
      expect(fetchMock).toHaveBeenCalled();
      expect(opened).toEqual({ name: "model.std", text: "STAAD SPACE" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});