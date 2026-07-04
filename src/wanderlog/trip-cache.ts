import { applyJson0, type Json0Op } from "../ot/apply.js";
import { ShareDbClient } from "./sharedb.js";
import type { ServerConfig } from "../config.js";

export interface TripMutationClient {
  subscribe(): Promise<{ version: number; snapshot: unknown }>;
  submit(ops: Json0Op[]): Promise<void>;
  close(): void;
  onRemoteOp?(listener: (ops: Json0Op[]) => void): void;
}

export type TripMutationClientFactory = (tripId: string) => TripMutationClient;

type CacheEntry = {
  client: TripMutationClient;
  snapshot: unknown;
};

export class TripMutationCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly subscriptions = new Map<string, Promise<CacheEntry>>();
  private readonly submitQueues = new Map<string, Promise<unknown>>();
  private isClosed = false;

  constructor(private readonly clientFactory: TripMutationClientFactory) {}

  static fromConfig(config: ServerConfig): TripMutationCache {
    return new TripMutationCache((tripId) => new ShareDbClient(config, tripId));
  }

  async getSnapshot(tripId: string): Promise<unknown> {
    return (await this.ensureEntry(tripId)).snapshot;
  }

  async submit(tripId: string, ops: Json0Op[]): Promise<unknown> {
    return this.withSubmitQueue(tripId, async () => {
      this.assertOpen();
      const entry = await this.ensureEntry(tripId);
      await entry.client.submit(ops);
      entry.snapshot = applyJson0(entry.snapshot, ops);
      return entry.snapshot;
    });
  }

  closeAll(): void {
    this.isClosed = true;
    for (const entry of this.entries.values()) {
      entry.client.close();
    }
    this.entries.clear();
    this.subscriptions.clear();
    this.submitQueues.clear();
  }

  private async ensureEntry(tripId: string): Promise<CacheEntry> {
    this.assertOpen();

    const existing = this.entries.get(tripId);
    if (existing) {
      return existing;
    }

    const pending = this.subscriptions.get(tripId);
    if (pending) {
      return pending;
    }

    const subscription = this.subscribeAndCache(tripId);
    this.subscriptions.set(tripId, subscription);
    try {
      return await subscription;
    } finally {
      this.subscriptions.delete(tripId);
    }
  }

  private async subscribeAndCache(tripId: string): Promise<CacheEntry> {
    this.assertOpen();
    const client = this.clientFactory(tripId);
    let snapshot: unknown;
    try {
      const subscription = await client.subscribe();
      snapshot = subscription.snapshot;
    } catch (error) {
      client.close();
      throw error;
    }

    if (this.isClosed) {
      client.close();
      throw new Error("Trip mutation cache is closed.");
    }

    const entry: CacheEntry = { client, snapshot };
    this.entries.set(tripId, entry);

    client.onRemoteOp?.((ops) => {
      const current = this.entries.get(tripId);
      if (!current) {
        return;
      }
      current.snapshot = applyJson0(current.snapshot, ops);
    });

    return entry;
  }

  private async withSubmitQueue<T>(
    tripId: string,
    submit: () => Promise<T>,
  ): Promise<T> {
    const previous = this.submitQueues.get(tripId) ?? Promise.resolve();
    const next = previous.then(submit, submit);
    this.submitQueues.set(
      tripId,
      next.catch(() => undefined),
    );
    return next;
  }

  private assertOpen(): void {
    if (this.isClosed) {
      throw new Error("Trip mutation cache is closed.");
    }
  }
}
