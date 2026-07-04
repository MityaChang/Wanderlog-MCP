import { describe, expect, it } from "vitest";

import type { Json0Op } from "../../src/ot/apply.js";
import {
  TripMutationCache,
  type TripMutationClient,
  type TripMutationClientFactory,
} from "../../src/wanderlog/trip-cache.js";

class FakeTripMutationClient implements TripMutationClient {
  readonly submitted: Json0Op[][] = [];
  readonly started: string[];
  readonly releaseSubmit: Array<() => void> = [];
  releaseSubscribe: (() => void) | null = null;
  closeCount = 0;
  subscribeCount = 0;
  private remoteListener: ((ops: Json0Op[]) => void) | null = null;

  constructor(
    private readonly snapshot: unknown,
    started: string[] = [],
    private readonly options: {
      delaySubscribe?: boolean;
      failSubscribe?: boolean;
      failSubmit?: boolean;
    } = {},
  ) {
    this.started = started;
  }

  async subscribe(): Promise<{ version: number; snapshot: unknown }> {
    this.subscribeCount += 1;
    if (this.options.delaySubscribe) {
      await new Promise<void>((resolve) => {
        this.releaseSubscribe = resolve;
      });
    }
    if (this.options.failSubscribe) {
      throw new Error("subscribe failed");
    }
    return { version: 1, snapshot: this.snapshot };
  }

  async submit(ops: Json0Op[]): Promise<void> {
    this.submitted.push(ops);
    this.started.push(String(ops[0]?.r ?? ops[0]?.oi ?? "unknown"));
    await new Promise<void>((resolve) => {
      this.releaseSubmit.push(resolve);
    });
    if (this.options.failSubmit) {
      throw new Error("submit failed");
    }
  }

  onRemoteOp(listener: (ops: Json0Op[]) => void): void {
    this.remoteListener = listener;
  }

  emitRemoteOp(ops: Json0Op[]): void {
    this.remoteListener?.(ops);
  }

  close(): void {
    this.closeCount += 1;
  }
}

function createFactory(
  clients: Record<string, FakeTripMutationClient>,
): TripMutationClientFactory {
  return (tripId) => clients[tripId] ?? clients.default!;
}

async function flushQueuedSubmit(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("TripMutationCache", () => {
  it("subscribes once for concurrent snapshot requests", async () => {
    const client = new FakeTripMutationClient({ title: "Draft" });
    const cache = new TripMutationCache(createFactory({ default: client }));

    const [first, second] = await Promise.all([
      cache.getSnapshot("trip-1"),
      cache.getSnapshot("trip-1"),
    ]);

    expect(first).toEqual({ title: "Draft" });
    expect(second).toEqual({ title: "Draft" });
    expect(client.subscribeCount).toBe(1);
  });

  it("serializes submits for the same trip and applies accepted ops locally", async () => {
    const started: string[] = [];
    const client = new FakeTripMutationClient({ title: "Draft" }, started);
    const cache = new TripMutationCache(createFactory({ default: client }));
    await cache.getSnapshot("trip-1");

    const first = cache.submit("trip-1", [{ p: ["title"], r: "First" }]);
    const second = cache.submit("trip-1", [{ p: ["title"], r: "Second" }]);

    await flushQueuedSubmit();

    expect(started).toEqual(["First"]);
    client.releaseSubmit.shift()?.();
    await first;
    expect(started).toEqual(["First", "Second"]);
    client.releaseSubmit.shift()?.();

    await expect(second).resolves.toEqual({ title: "Second" });
    await expect(cache.getSnapshot("trip-1")).resolves.toEqual({
      title: "Second",
    });
  });

  it("allows submits for different trips to run in parallel", async () => {
    const started: string[] = [];
    const firstClient = new FakeTripMutationClient({ title: "A" }, started);
    const secondClient = new FakeTripMutationClient({ title: "B" }, started);
    const cache = new TripMutationCache(
      createFactory({ "trip-1": firstClient, "trip-2": secondClient }),
    );

    await Promise.all([
      cache.getSnapshot("trip-1"),
      cache.getSnapshot("trip-2"),
    ]);
    const first = cache.submit("trip-1", [{ p: ["title"], r: "A1" }]);
    const second = cache.submit("trip-2", [{ p: ["title"], r: "B1" }]);

    await flushQueuedSubmit();

    expect(started).toEqual(["A1", "B1"]);
    firstClient.releaseSubmit.shift()?.();
    secondClient.releaseSubmit.shift()?.();

    await Promise.all([first, second]);
  });

  it("applies remote ops to the cached snapshot", async () => {
    const client = new FakeTripMutationClient({ title: "Draft" });
    const cache = new TripMutationCache(createFactory({ default: client }));
    await cache.getSnapshot("trip-1");

    client.emitRemoteOp([{ p: ["title"], r: "Remote" }]);

    await expect(cache.getSnapshot("trip-1")).resolves.toEqual({
      title: "Remote",
    });
  });

  it("does not mutate the cached snapshot when submit fails", async () => {
    const client = new FakeTripMutationClient({ title: "Draft" }, [], {
      failSubmit: true,
    });
    const cache = new TripMutationCache(createFactory({ default: client }));
    await cache.getSnapshot("trip-1");

    const submission = cache.submit("trip-1", [{ p: ["title"], r: "Live" }]);
    await flushQueuedSubmit();
    client.releaseSubmit.shift()?.();

    await expect(submission).rejects.toThrow("submit failed");
    await expect(cache.getSnapshot("trip-1")).resolves.toEqual({
      title: "Draft",
    });
  });

  it("closes a client whose subscription fails", async () => {
    const client = new FakeTripMutationClient({ title: "Draft" }, [], {
      failSubscribe: true,
    });
    const cache = new TripMutationCache(createFactory({ default: client }));

    await expect(cache.getSnapshot("trip-1")).rejects.toThrow(
      "subscribe failed",
    );
    expect(client.closeCount).toBe(1);
  });

  it("does not cache an in-flight subscription after closeAll", async () => {
    const client = new FakeTripMutationClient({ title: "Draft" }, [], {
      delaySubscribe: true,
    });
    const cache = new TripMutationCache(createFactory({ default: client }));
    const snapshot = cache.getSnapshot("trip-1");
    await Promise.resolve();

    cache.closeAll();
    client.releaseSubscribe?.();

    await expect(snapshot).rejects.toThrow(/closed/i);
    expect(client.closeCount).toBe(1);
  });

  it("closes all cached trip clients", async () => {
    const firstClient = new FakeTripMutationClient({ title: "A" });
    const secondClient = new FakeTripMutationClient({ title: "B" });
    const cache = new TripMutationCache(
      createFactory({ "trip-1": firstClient, "trip-2": secondClient }),
    );

    await Promise.all([
      cache.getSnapshot("trip-1"),
      cache.getSnapshot("trip-2"),
    ]);
    cache.closeAll();

    expect(firstClient.closeCount).toBe(1);
    expect(secondClient.closeCount).toBe(1);
  });
});
