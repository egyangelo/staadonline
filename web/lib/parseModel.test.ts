/**
 * parseModel contract tests (04-03, D-03/D-04/D-05, PERF-01/PERF-02).
 *
 * Covers the threshold branch: files <= WORKER_THRESHOLD parse synchronously
 * on the main thread via parseStaad (no Worker); files > WORKER_THRESHOLD
 * dispatch to a singleton module Worker created with the literal static URL
 * `new URL('./staad.worker.ts', import.meta.url)` and `{ type: 'module' }`,
 * relaying progress and resolving the structured-cloned ParseResult (T-04-15,
 * T-04-13, T-04-14).
 *
 * Runs in the vitest node environment, so the real Worker/window globals are
 * stubbed: `window` satisfies the client-only construction guard and `Worker`
 * is a fake that records construction + drives message events.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStaad, type ParseResult } from "@staad-online/parser";
import { parseModel, WORKER_THRESHOLD } from "./parseModel";
import type { ParseMessage, ParseRequest } from "./parseModel";

vi.mock("@staad-online/parser", () => ({
  parseStaad: vi.fn(),
}));

/** Fake Worker recording construction and capturing message listeners. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners = new Set<(msg: { data: unknown }) => void>();
  posted: unknown[] = [];
  onerror: (() => void) | null = null;

  constructor(
    public url: string | URL,
    public options?: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }

  addEventListener(_type: string, cb: (msg: { data: unknown }) => void): void {
    this.listeners.add(cb);
  }

  removeEventListener(
    _type: string,
    cb: (msg: { data: unknown }) => void,
  ): void {
    this.listeners.delete(cb);
  }

  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }

  emit(msg: ParseMessage): void {
    for (const cb of [...this.listeners]) cb({ data: msg } as never);
  }
}

function sampleResult(): ParseResult {
  return {
    model: {
      nodes: [],
      members: [],
        elements: [],
      sections: new Map(),
      supports: [],
      loadCases: [],
      groups: new Map(),
      units: { length: "M", force: "KN" },
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    },
    warnings: [],
  };
}

describe("parseModel (04-03 threshold branch)", () => {
  beforeEach(() => {
    vi.mocked(parseStaad).mockReset();
    vi.unstubAllGlobals();
  });

  it("(1) small text parses synchronously — no Worker constructed, parseStaad(text, onProgress) called directly", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.instances = [];
    const result = sampleResult();
    vi.mocked(parseStaad).mockReturnValue(result);
    const text = "STAAD SPACE";
    const onProgress = vi.fn();
    await expect(parseModel(text, onProgress)).resolves.toBe(result);
    expect(parseStaad).toHaveBeenCalledWith(text, onProgress);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("(2) large text dispatches to a module Worker with literal URL; progress forwarded; result resolves", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", FakeWorker);
    const before = FakeWorker.instances.length;
    const text = "x".repeat(WORKER_THRESHOLD + 1);
    const onProgress = vi.fn();
    const result = sampleResult();
    const promise = parseModel(text, onProgress);
    expect(FakeWorker.instances.length).toBe(before + 1);
    const inst = FakeWorker.instances[FakeWorker.instances.length - 1];
    expect(String(inst.url)).toContain("staad.worker.ts");
    expect(inst.options?.type).toBe("module");
    inst.emit({ type: "progress", fraction: 0.5 });
    inst.emit({ type: "result", result });
    await expect(promise).resolves.toBe(result);
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(parseStaad).not.toHaveBeenCalled();
  });

  it("(3) singleton worker is reused across opens — no second construction", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", FakeWorker);
    const before = FakeWorker.instances.length;
    const text = "x".repeat(WORKER_THRESHOLD + 1);
    const result = sampleResult();
    const p1 = parseModel(text);
    const w1 = FakeWorker.instances[FakeWorker.instances.length - 1];
    w1.emit({ type: "result", result });
    await p1;
    const p2 = parseModel(text);
    const w2 = FakeWorker.instances[FakeWorker.instances.length - 1];
    w2.emit({ type: "result", result });
    await p2;
    expect(FakeWorker.instances.length).toBe(before);
    expect(w1).toBe(w2);
  });

  it("(4) worker error message rejects with an Error", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", FakeWorker);
    const text = "x".repeat(WORKER_THRESHOLD + 1);
    const promise = parseModel(text);
    const inst = FakeWorker.instances[FakeWorker.instances.length - 1];
    inst.emit({ type: "error", message: "boom" });
    await expect(promise).rejects.toThrow("boom");
  });

  it("(5) worker.onerror nulls the singleton so the next parse recreates it (T-04-14)", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", FakeWorker);
    const before = FakeWorker.instances.length;
    const text = "x".repeat(WORKER_THRESHOLD + 1);
    const p1 = parseModel(text);
    const w1 = FakeWorker.instances[FakeWorker.instances.length - 1];
    w1.emit({ type: "result", result: sampleResult() });
    await p1;
    w1.onerror?.();
    const p2 = parseModel(text);
    const w2 = FakeWorker.instances[FakeWorker.instances.length - 1];
    w2.emit({ type: "result", result: sampleResult() });
    await p2;
    expect(FakeWorker.instances.length).toBe(before + 1);
    expect(w2).not.toBe(w1);
  });
});
