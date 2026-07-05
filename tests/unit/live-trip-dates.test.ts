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

function createTrip(): unknown {
  return {
    title: "Japan Golden Route",
    startDate: "2026-04-01",
    endDate: "2026-04-02",
    days: 2,
    itinerary: {
      sections: [
        {
          id: 1001,
          mode: "dayPlan",
          heading: "Tokyo Arrival",
          date: "2026-04-01",
          blocks: [],
        },
        {
          id: 1002,
          mode: "dayPlan",
          heading: "Kyoto",
          date: "2026-04-02",
          blocks: [
            {
              type: "place",
              place: { name: "Fushimi Inari" },
            },
          ],
        },
      ],
    },
  };
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

describe("live trip date tools", () => {
  it("extends a trip date range by adding empty day sections and top-level dates", async () => {
    const { client, mutationClient } = createClient(createTrip());

    await expect(
      client.updateTripDates({
        tripId: "trip-key",
        startDate: "2026-04-01",
        endDate: "2026-04-03",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Updated trip dates"),
    });

    expect(mutationClient.submitted[0]).toEqual([
      {
        p: ["itinerary", "sections", 2],
        li: expect.objectContaining({
          mode: "dayPlan",
          heading: "",
          date: "2026-04-03",
          blocks: [],
        }),
      },
      {
        p: ["endDate"],
        od: "2026-04-02",
        oi: "2026-04-03",
      },
      {
        p: ["days"],
        od: 2,
        oi: 3,
      },
    ]);
  });

  it("refuses to shorten a trip when removed days contain blocks unless forced", async () => {
    const { client, mutationClient } = createClient(createTrip());

    await expect(
      client.updateTripDates({
        tripId: "trip-key",
        startDate: "2026-04-01",
        endDate: "2026-04-01",
      }),
    ).rejects.toThrow(/would delete content/);

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("shortens a trip with force by deleting removed day sections", async () => {
    const trip = createTrip() as { itinerary: { sections: unknown[] } };
    const removedSection = trip.itinerary.sections[1];
    const { client, mutationClient } = createClient(trip);

    await expect(
      client.updateTripDates({
        tripId: "trip-key",
        startDate: "2026-04-01",
        endDate: "2026-04-01",
        force: true,
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Updated trip dates"),
    });

    expect(mutationClient.submitted[0]).toEqual([
      {
        p: ["itinerary", "sections", 1],
        ld: removedSection,
      },
      {
        p: ["endDate"],
        od: "2026-04-02",
        oi: "2026-04-01",
      },
      {
        p: ["days"],
        od: 2,
        oi: 1,
      },
    ]);
  });

  it("renames one day section heading", async () => {
    const { client, mutationClient } = createClient(createTrip());

    await expect(
      client.renameDay({
        tripId: "trip-key",
        day: "2026-04-02",
        heading: "Kyoto Temples",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Renamed day"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 1, "heading"],
          od: "Kyoto",
          oi: "Kyoto Temples",
        },
      ],
    ]);
  });

  it("registers live trip date and day-name tools", () => {
    const { client } = createClient(createTrip());
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    const server = {
      registerTool: (
        name: string,
        _definition: { description?: string },
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        handlers.set(name, handler);
      },
    };

    registerTripTools(server as never, client, draftStore);

    expect(handlers.has("wanderlog_update_trip_dates")).toBe(true);
    expect(handlers.has("wanderlog_rename_day")).toBe(true);
  });
});
