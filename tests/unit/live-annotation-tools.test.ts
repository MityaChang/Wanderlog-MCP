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

describe("live place annotation tools", () => {
  it("annotates one matching place with note and time ops", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [
              {
                type: "place",
                place: { name: "Tokyo Station" },
                startTime: "09:00",
              },
            ],
          },
        ],
      },
    });

    await expect(
      client.annotatePlace({
        tripId: "trip-key",
        place: "Tokyo Station",
        note: "Pick up bento before boarding.",
        startTime: "10:00",
        endTime: "11:00",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Updated Tokyo Station"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0, "text"],
          t: "rich-text",
          o: [{ insert: "Pick up bento before boarding.\n" }],
        },
        {
          p: ["itinerary", "sections", 0, "blocks", 0, "startTime"],
          oi: "10:00",
          od: "09:00",
        },
        {
          p: ["itinerary", "sections", 0, "blocks", 0, "endTime"],
          oi: "11:00",
        },
      ],
    ]);
  });

  it("registers live note and place annotation tools without changing remaining local draft wording", async () => {
    const { client } = createClient({
      title: "Japan Golden Route",
      itinerary: { sections: [] },
    });
    const definitions = new Map<string, { description?: string }>();
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    const server = {
      registerTool: (
        name: string,
        definition: { description?: string },
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        definitions.set(name, definition);
        handlers.set(name, handler);
      },
    };

    registerTripTools(server as never, client, draftStore);

    expect(handlers.has("wanderlog_annotate_place")).toBe(true);
    expect(handlers.has("wanderlog_edit_note")).toBe(true);
    expect(handlers.has("wanderlog_remove_note")).toBe(true);
    expect(definitions.get("wanderlog_add_checklist")?.description).toBe(
      "Add a checklist to one live Wanderlog day section.",
    );
  });
});
