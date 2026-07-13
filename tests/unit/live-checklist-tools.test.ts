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
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  }),
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
};

describe("live checklist tools", () => {
  it("adds a checklist block with default title to the requested day section", async () => {
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
      client.addChecklist({
        tripId: "trip-key",
        day: "2026-04-01",
        items: ["Passport", "Rail pass", "Adapter"],
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Added checklist"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0],
          li: {
            type: "checklist",
            title: "Checklist",
            items: [
              { checked: false, text: { ops: [{ insert: "Passport\n" }] } },
              { checked: false, text: { ops: [{ insert: "Rail pass\n" }] } },
              { checked: false, text: { ops: [{ insert: "Adapter\n" }] } },
            ],
          },
        },
      ],
    ]);
  });

  it("preserves item order and uses the supplied title", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [
              { type: "note", text: { ops: [{ insert: "Existing note.\n" }] } },
            ],
          },
        ],
      },
    });

    await client.addChecklist({
      tripId: "trip-key",
      day: "2026-04-01",
      title: "Packing list",
      items: ["Camera", "Sunscreen"],
    });

    expect(mutationClient.submitted[0]).toEqual([
      {
        p: ["itinerary", "sections", 0, "blocks", 1],
        li: {
          type: "checklist",
          title: "Packing list",
          items: [
            { checked: false, text: { ops: [{ insert: "Camera\n" }] } },
            { checked: false, text: { ops: [{ insert: "Sunscreen\n" }] } },
          ],
        },
      },
    ]);
  });

  it("falls back to the first live day section when day is omitted", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [],
          },
          {
            mode: "dayPlan",
            date: "2026-04-02",
            blocks: [],
          },
        ],
      },
    });

    await client.addChecklist({
      tripId: "trip-key",
      items: ["Book taxi"],
    });

    expect(mutationClient.submitted[0]?.[0]?.p).toEqual([
      "itinerary",
      "sections",
      0,
      "blocks",
      0,
    ]);
  });

  it("routes wanderlog_add_checklist through client.addChecklist without creating a draft", async () => {
    let addedChecklist: unknown = null;
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

    const trackingDraftStore: DraftItineraryStore = {
      ...draftStore,
      create: async (input) => {
        createdDraft = input;
        return {
          ...input,
          draftId: "draft-1",
          createdAt: "2026-07-10T00:00:00.000Z",
          updatedAt: "2026-07-10T00:00:00.000Z",
        };
      },
    };

    registerTripTools(
      server as never,
      {
        addChecklist: async (input) => {
          addedChecklist = input;
          return { tripId: "trip-key", message: "Added checklist." };
        },
        addExpense: async () => ({
          tripId: "trip-key",
          message: "Added expense.",
        }),
        addHotel: async () => ({
          tripId: "trip-key",
          message: "Added hotel.",
        }),
        addNote: async () => ({ tripId: "trip-key", message: "Added note." }),
        addPlace: async () => ({ tripId: "trip-key", message: "Added place." }),
        annotatePlace: async () => ({
          tripId: "trip-key",
          message: "Updated place.",
        }),
        createTrip: async () => ({
          id: "trip-key",
          numericId: 1,
          title: "Trip",
          destination: "Japan",
          startDate: "2026-04-01",
          endDate: "2026-04-07",
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
        searchGuides: async () => ({
          geo: { id: 1, name: "Japan", country: null },
          guides: [],
        }),
        searchPlaces: async () => [],
        updateTripDates: async () => ({
          tripId: "trip-key",
          message: "Updated trip dates.",
        }),
      },
      trackingDraftStore,
    );

    const result = await handlers.get("wanderlog_add_checklist")?.({
      tripId: "trip-key",
      items: ["Passport", "Adapter"],
      day: "day 1",
    });

    expect(addedChecklist).toEqual({
      tripId: "trip-key",
      items: ["Passport", "Adapter"],
      day: "day 1",
    });
    expect(createdDraft).toBeNull();
    expect(result).toMatchObject({
      structuredContent: {
        result: { tripId: "trip-key", message: "Added checklist." },
      },
    });
  });
});
