import { describe, expect, it } from "vitest";

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

describe("live hotel tools", () => {
  it("appends a hotel place block to the first live day section", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.addHotel({
        tripId: "trip-key",
        hotel: "Grand Hyatt Tokyo",
        checkIn: "2026-04-01",
        checkOut: "2026-04-05",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Grand Hyatt Tokyo"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0],
          li: {
            type: "place",
            place: { name: "Grand Hyatt Tokyo" },
            hotel: { checkIn: "2026-04-01", checkOut: "2026-04-05" },
          },
        },
      ],
    ]);
  });

  it("rejects checkOut before checkIn", async () => {
    const { client } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [{ mode: "dayPlan", date: "2026-04-01", blocks: [] }],
      },
    });

    await expect(
      client.addHotel({
        tripId: "trip-key",
        hotel: "Grand Hyatt Tokyo",
        checkIn: "2026-04-05",
        checkOut: "2026-04-01",
      }),
    ).rejects.toThrow(/checkOut.*checkIn/i);
  });

  it("rejects checkOut equal to checkIn", async () => {
    const { client } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [{ mode: "dayPlan", date: "2026-04-01", blocks: [] }],
      },
    });

    await expect(
      client.addHotel({
        tripId: "trip-key",
        hotel: "Grand Hyatt Tokyo",
        checkIn: "2026-04-01",
        checkOut: "2026-04-01",
      }),
    ).rejects.toThrow(/checkOut.*checkIn/i);
  });

  it("routes wanderlog_add_hotel through the live client without creating a draft", async () => {
    let addedHotel: unknown = null;
    let createdDraft: unknown = null;
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

    registerTripTools(
      server as never,
      {
        addChecklist: async () => ({
          tripId: "trip-key",
          message: "Added checklist.",
        }),
        addExpense: async () => ({
          tripId: "trip-key",
          message: "Added expense.",
        }),
        addHotel: async (input) => {
          addedHotel = input;
          return { tripId: "trip-key", message: "Added hotel." };
        },
        addNote: async () => ({
          tripId: "trip-key",
          message: "Added note.",
        }),
        addPlace: async () => ({
          tripId: "trip-key",
          message: "Added place.",
        }),
        annotatePlace: async () => ({
          tripId: "trip-key",
          message: "Updated place.",
        }),
        createTrip: async () => ({
          id: "trip-key",
          numericId: 1,
          title: "Trip",
          destination: "Tokyo",
          startDate: "2026-04-01",
          endDate: "2026-04-05",
          url: "https://wanderlog.com/view/trip-key",
        }),
        editExpense: async () => ({
          tripId: "trip-key",
          message: "Updated expense.",
        }),
        editNote: async () => ({
          tripId: "trip-key",
          message: "Updated note.",
        }),
        getGuide: async () => null,
        getTrip: async () => null,
        listExpenses: async () => [],
        listTrips: async () => [],
        renameDay: async () => ({
          tripId: "trip-key",
          message: "Renamed day.",
        }),
        removeExpense: async () => ({
          tripId: "trip-key",
          message: "Removed expense.",
        }),
        removeNote: async () => ({
          tripId: "trip-key",
          message: "Removed note.",
        }),
        removePlace: async () => ({
          tripId: "trip-key",
          message: "Removed place.",
        }),
        searchGuides: async () => ({
          geo: { id: 1, name: "Tokyo", country: null },
          guides: [],
        }),
        searchPlaces: async () => [],
        updateTripDates: async () => ({
          tripId: "trip-key",
          message: "Updated trip dates.",
        }),
      },
      {
        create: async (input) => {
          createdDraft = input;
          return {
            ...input,
            draftId: "draft-1",
            createdAt: "2026-07-10T00:00:00.000Z",
            updatedAt: "2026-07-10T00:00:00.000Z",
          };
        },
        list: async () => [],
        update: async () => ({
          kind: "note" as const,
          tripId: "trip-key",
          draftId: "draft-1",
          text: "x",
          createdAt: "2026-07-10T00:00:00.000Z",
          updatedAt: "2026-07-10T00:00:00.000Z",
        }),
        delete: async () => ({
          kind: "note" as const,
          tripId: "trip-key",
          draftId: "draft-1",
          text: "x",
          createdAt: "2026-07-10T00:00:00.000Z",
          updatedAt: "2026-07-10T00:00:00.000Z",
        }),
        exportTrip: async () => "Local Wanderlog drafts",
      },
    );

    const result = await handlers.get("wanderlog_add_hotel")?.({
      tripId: "trip-key",
      hotel: "Grand Hyatt Tokyo",
      checkIn: "2026-04-01",
      checkOut: "2026-04-05",
    });

    expect(addedHotel).toEqual({
      tripId: "trip-key",
      hotel: "Grand Hyatt Tokyo",
      checkIn: "2026-04-01",
      checkOut: "2026-04-05",
    });
    expect(createdDraft).toBeNull();
    expect(result).toMatchObject({
      structuredContent: {
        result: { tripId: "trip-key", message: "Added hotel." },
      },
    });
  });
});
