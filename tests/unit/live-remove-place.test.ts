import { describe, expect, it } from "vitest";

import type { DraftItineraryStore } from "../../src/drafts/store.js";
import type { Json0Op } from "../../src/ot/apply.js";
import { registerTripTools } from "../../src/tools/trips.js";
import { WanderlogClient } from "../../src/wanderlog/client.js";
import type { TripMutationClientFactory } from "../../src/wanderlog/trip-cache.js";
import { TripMutationCache } from "../../src/wanderlog/trip-cache.js";

class FakeMutationClient {
  readonly submitted: Json0Op[][] = [];

  constructor(private snapshot: unknown) {}

  async subscribe(): Promise<{ version: number; snapshot: unknown }> {
    return { version: 1, snapshot: this.snapshot };
  }

  async submit(ops: Json0Op[]): Promise<void> {
    this.submitted.push(ops);
  }

  close(): void {}
}

function createClient(snapshot: unknown): {
  client: WanderlogClient;
  mutationClient: FakeMutationClient;
} {
  const mutationClient = new FakeMutationClient(snapshot);
  const factory: TripMutationClientFactory = () => mutationClient;
  const cache = new TripMutationCache(factory);
  const client = new WanderlogClient(
    { wanderlogCookie: "s%3Asecret-cookie" },
    fetch,
    cache,
  );

  return { client, mutationClient };
}

const draftStore: DraftItineraryStore = {
  create: async (input) => ({
    ...input,
    draftId: "draft-1",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
  }),
  list: async () => [],
  update: async () => ({
    kind: "note",
    tripId: "trip-key",
    draftId: "draft-1",
    text: "draft",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
  }),
  delete: async () => ({
    kind: "note",
    tripId: "trip-key",
    draftId: "draft-1",
    text: "draft",
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
  }),
  exportTrip: async () => "Local Wanderlog drafts",
};

describe("live remove place tools", () => {
  it("removes a uniquely matched place with one ld operation", async () => {
    const placeBlock = { type: "place", place: { name: "Tokyo Station" } };
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [placeBlock],
          },
        ],
      },
    });

    await expect(
      client.removePlace({
        tripId: "trip-key",
        place: "Tokyo Station",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Tokyo Station"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0],
          ld: placeBlock,
        },
      ],
    ]);
  });

  it("removes the correct duplicate via ordinal selection", async () => {
    const block0 = { type: "place", place: { name: "Tsukiji Market" } };
    const block1 = { type: "place", place: { name: "Tsukiji Market" } };
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [block0, block1],
          },
        ],
      },
    });

    await expect(
      client.removePlace({
        tripId: "trip-key",
        place: "2nd Tsukiji Market",
      }),
    ).resolves.toMatchObject({ tripId: "trip-key" });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 1],
          ld: block1,
        },
      ],
    ]);
  });

  it("throws a clear error and submits no operation when place is not found", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [{ type: "place", place: { name: "Tokyo Station" } }],
          },
        ],
      },
    });

    await expect(
      client.removePlace({
        tripId: "trip-key",
        place: "Nonexistent Place",
      }),
    ).rejects.toThrow('No place matching "Nonexistent Place" found.');

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("throws a clear error listing candidates when multiple places match and submits no operation", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [
              { type: "place", place: { name: "Tokyo Station" } },
              { type: "place", place: { name: "Tokyo Station" } },
            ],
          },
        ],
      },
    });

    await expect(
      client.removePlace({
        tripId: "trip-key",
        place: "Tokyo Station",
      }),
    ).rejects.toThrow('Multiple places matching "Tokyo Station" found:');

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("registers wanderlog_remove_place and routes calls to client.removePlace", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [{ type: "place", place: { name: "Tokyo Station" } }],
          },
        ],
      },
    });
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    const server = {
      registerTool: (
        name: string,
        _definition: unknown,
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        handlers.set(name, handler);
      },
    };

    registerTripTools(server as never, client, draftStore);

    expect(handlers.has("wanderlog_remove_place")).toBe(true);

    await handlers.get("wanderlog_remove_place")?.({
      tripId: "trip-key",
      place: "Tokyo Station",
    });

    expect(mutationClient.submitted).toHaveLength(1);
  });
});
