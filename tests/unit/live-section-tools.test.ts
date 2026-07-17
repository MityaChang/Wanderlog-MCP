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

describe("live add section tools", () => {
  it("appends a new custom section at the end when afterSection is omitted", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          { mode: "dayPlan", date: "2026-04-01", heading: "", blocks: [] },
          { mode: "dayPlan", date: "2026-04-02", heading: "", blocks: [] },
        ],
      },
    });

    const result = await client.addSection({
      tripId: "trip-key",
      heading: "Food & Drink",
    });

    expect(result).toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Food & Drink"),
    });

    expect(mutationClient.submitted).toHaveLength(1);
    const [ops] = mutationClient.submitted;
    expect(ops).toHaveLength(1);
    const [op] = ops!;
    expect(op!.p).toEqual(["itinerary", "sections", 2]);
    expect(op!.li).toMatchObject({
      type: "normal",
      mode: "placeList",
      heading: "Food & Drink",
      text: { ops: [{ insert: "\n" }] },
      date: null,
      blocks: [],
      placeMarkerColor: "#3498db",
      placeMarkerIcon: "map-marker",
    });
    expect(typeof (op!.li as Record<string, unknown>).id).toBe("number");
  });

  it("uses empty heading when heading input is omitted", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: { sections: [] },
    });

    await client.addSection({ tripId: "trip-key" });

    const [ops] = mutationClient.submitted;
    const [op] = ops!;
    expect((op!.li as Record<string, unknown>).heading).toBe("");
  });

  it("accepts an explicit empty heading through the MCP tool", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: { sections: [] },
    });
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    const definitions = new Map<
      string,
      {
        inputSchema?: Record<
          string,
          { safeParse: (input: unknown) => unknown }
        >;
      }
    >();
    const server = {
      registerTool: (
        name: string,
        definition: {
          inputSchema?: Record<
            string,
            { safeParse: (input: unknown) => unknown }
          >;
        },
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        definitions.set(name, definition);
        handlers.set(name, handler);
      },
    };

    registerTripTools(server as never, client, draftStore);

    const headingSchema = definitions.get("wanderlog_add_section")?.inputSchema
      ?.heading;
    expect(headingSchema?.safeParse("")).toMatchObject({ success: true });

    await handlers.get("wanderlog_add_section")?.({
      tripId: "trip-key",
      heading: "",
    });

    expect(
      (mutationClient.submitted[0]?.[0]?.li as Record<string, unknown>).heading,
    ).toBe("");
  });

  it("inserts a new section immediately after a uniquely matched section", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          { mode: "dayPlan", date: "2026-04-01", heading: "Day 1", blocks: [] },
          {
            type: "normal",
            mode: "placeList",
            heading: "Places to Visit",
            blocks: [],
          },
          { mode: "dayPlan", date: "2026-04-02", heading: "Day 2", blocks: [] },
        ],
      },
    });

    const result = await client.addSection({
      tripId: "trip-key",
      heading: "Food & Drink",
      afterSection: "Places to Visit",
    });

    expect(result).toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Food & Drink"),
    });

    expect(mutationClient.submitted).toHaveLength(1);
    const [ops] = mutationClient.submitted;
    expect(ops![0]!.p).toEqual(["itinerary", "sections", 2]);
  });

  it("normalizes heading for afterSection match (case and hyphen/whitespace)", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Must-See Spots",
            blocks: [],
          },
        ],
      },
    });

    await client.addSection({
      tripId: "trip-key",
      heading: "New Section",
      afterSection: "must see spots",
    });

    const [ops] = mutationClient.submitted;
    expect(ops![0]!.p).toEqual(["itinerary", "sections", 1]);
  });

  it("throws a clear error and submits no operation when afterSection heading is not found", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Places to Visit",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.addSection({
        tripId: "trip-key",
        heading: "Food & Drink",
        afterSection: "Nonexistent Section",
      }),
    ).rejects.toThrow('"Nonexistent Section"');

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("throws a clear error and submits no operation when afterSection matches multiple sections", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Places to Visit",
            blocks: [],
          },
          {
            type: "normal",
            mode: "placeList",
            heading: "Places to Visit",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.addSection({
        tripId: "trip-key",
        heading: "Food & Drink",
        afterSection: "Places to Visit",
      }),
    ).rejects.toThrow('"Places to Visit"');

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("registers wanderlog_add_section and routes calls to client.addSection", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          { mode: "dayPlan", date: "2026-04-01", heading: "", blocks: [] },
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

    expect(handlers.has("wanderlog_add_section")).toBe(true);

    await handlers.get("wanderlog_add_section")?.({
      tripId: "trip-key",
      heading: "Food & Drink",
    });

    expect(mutationClient.submitted).toHaveLength(1);
  });
});

describe("live update section tools", () => {
  it("renames a custom section and submits one JSON0 heading replacement op", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    const result = await client.updateSection({
      tripId: "trip-key",
      section: "Food & Drink",
      heading: "Restaurants",
    });

    expect(result).toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Restaurants"),
    });

    expect(mutationClient.submitted).toHaveLength(1);
    const [ops] = mutationClient.submitted;
    expect(ops).toHaveLength(1);
    const [op] = ops!;
    expect(op!.p).toEqual(["itinerary", "sections", 0, "heading"]);
    expect(op!.oi).toBe("Restaurants");
    expect(op!.od).toBe("Food & Drink");
  });

  it("clears the section heading when an explicit empty string is passed", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    await client.updateSection({
      tripId: "trip-key",
      section: "Food & Drink",
      heading: "",
    });

    const [ops] = mutationClient.submitted;
    const [op] = ops!;
    expect(op!.p).toEqual(["itinerary", "sections", 0, "heading"]);
    expect(op!.oi).toBe("");
    expect(op!.od).toBe("Food & Drink");
  });

  it("normalizes the section reference for a custom-section rename", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    await client.updateSection({
      tripId: "trip-key",
      section: "food & drink",
      heading: "Restaurants",
    });

    expect(mutationClient.submitted[0]?.[0]?.p).toEqual([
      "itinerary",
      "sections",
      0,
      "heading",
    ]);
  });

  it("returns a no-op result without submitting when heading is unchanged", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    const result = await client.updateSection({
      tripId: "trip-key",
      section: "Food & Drink",
      heading: "Food & Drink",
    });

    expect(mutationClient.submitted).toHaveLength(0);
    expect(result.message).toMatch(/no change|already/i);
  });

  it("rejects day-plan sections and suggests wanderlog_rename_day", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            heading: "Day 1",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.updateSection({
        tripId: "trip-key",
        section: "Day 1",
        heading: "New Heading",
      }),
    ).rejects.toThrow(/rename_day/);

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("rejects the default place list section (places to visit) without submitting", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Places to Visit",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.updateSection({
        tripId: "trip-key",
        section: "Places to Visit",
        heading: "My Spots",
      }),
    ).rejects.toThrow(/default place list/i);

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("rejects the default place list section (places) without submitting", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Places",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.updateSection({
        tripId: "trip-key",
        section: "Places",
        heading: "My Spots",
      }),
    ).rejects.toThrow(/default place list/i);

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it.each(["hotels", "flights", "transit"])(
    "rejects system section type %s without submitting",
    async (sectionType) => {
      const heading =
        sectionType.charAt(0).toUpperCase() + sectionType.slice(1);
      const { client, mutationClient } = createClient({
        title: "Japan Golden Route",
        itinerary: {
          sections: [
            {
              type: sectionType,
              mode: "placeList",
              heading,
              blocks: [],
            },
          ],
        },
      });

      await expect(
        client.updateSection({
          tripId: "trip-key",
          section: heading,
          heading: "New Name",
        }),
      ).rejects.toThrow(/system section/i);

      expect(mutationClient.submitted).toHaveLength(0);
    },
  );

  it("rejects a missing section without submitting", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.updateSection({
        tripId: "trip-key",
        section: "Nonexistent Section",
        heading: "Something",
      }),
    ).rejects.toThrow('"Nonexistent Section"');

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("rejects an ambiguous section (multiple matches) without submitting", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.updateSection({
        tripId: "trip-key",
        section: "Food & Drink",
        heading: "Restaurants",
      }),
    ).rejects.toThrow(/"Food & Drink"/);

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("registers wanderlog_update_section and routes calls to client.updateSection", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
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

    expect(handlers.has("wanderlog_update_section")).toBe(true);

    await handlers.get("wanderlog_update_section")?.({
      tripId: "trip-key",
      section: "Food & Drink",
      heading: "Restaurants",
    });

    expect(mutationClient.submitted).toHaveLength(1);
  });
});

describe("live delete section tools", () => {
  it("submits one JSON0 list delete for a unique custom section including all its blocks", async () => {
    const customSection = {
      type: "normal",
      mode: "placeList",
      heading: "Food & Drink",
      blocks: [
        { type: "place", place: { name: "Ramen Ichiran" } },
        { type: "note", text: { ops: [{ insert: "Great ramen spot\n" }] } },
      ],
    };
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          { mode: "dayPlan", date: "2026-04-01", heading: "Day 1", blocks: [] },
          customSection,
        ],
      },
    });

    const result = await client.deleteSection({
      tripId: "trip-key",
      section: "Food & Drink",
    });

    expect(result).toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Food & Drink"),
    });

    expect(mutationClient.submitted).toHaveLength(1);
    const [ops] = mutationClient.submitted;
    expect(ops).toHaveLength(1);
    const [op] = ops!;
    expect(op!.p).toEqual(["itinerary", "sections", 1]);
    expect(op!.ld).toBe(customSection);
    expect((op!.ld as Record<string, unknown>).blocks).toHaveLength(2);
  });

  it("rejects a day-plan section without submitting any operation", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            heading: "Day 1",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.deleteSection({ tripId: "trip-key", section: "Day 1" }),
    ).rejects.toThrow(/day/i);

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it.each([
    ["places to visit", "Places to Visit"],
    ["places", "Places"],
  ])(
    "rejects the default place list (normalized heading %s) without submitting",
    async (_normalized, heading) => {
      const { client, mutationClient } = createClient({
        title: "Japan Golden Route",
        itinerary: {
          sections: [
            {
              type: "normal",
              mode: "placeList",
              heading,
              blocks: [],
            },
          ],
        },
      });

      await expect(
        client.deleteSection({
          tripId: "trip-key",
          section: _normalized,
        }),
      ).rejects.toThrow(/default place list/i);

      expect(mutationClient.submitted).toHaveLength(0);
    },
  );

  it.each(["hotels", "flights", "transit"])(
    "rejects system section type %s without submitting",
    async (sectionType) => {
      const heading =
        sectionType.charAt(0).toUpperCase() + sectionType.slice(1);
      const { client, mutationClient } = createClient({
        title: "Japan Golden Route",
        itinerary: {
          sections: [
            {
              type: sectionType,
              mode: "placeList",
              heading,
              blocks: [],
            },
          ],
        },
      });

      await expect(
        client.deleteSection({ tripId: "trip-key", section: heading }),
      ).rejects.toThrow(/system section/i);

      expect(mutationClient.submitted).toHaveLength(0);
    },
  );

  it("rejects a missing section without submitting", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.deleteSection({
        tripId: "trip-key",
        section: "Nonexistent Section",
      }),
    ).rejects.toThrow('"Nonexistent Section"');

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("rejects an ambiguous section (multiple matches) without submitting", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
          {
            type: "normal",
            mode: "placeList",
            heading: "Food & Drink",
            blocks: [],
          },
        ],
      },
    });

    await expect(
      client.deleteSection({
        tripId: "trip-key",
        section: "Food & Drink",
      }),
    ).rejects.toThrow(/"Food & Drink"/);

    expect(mutationClient.submitted).toHaveLength(0);
  });

  it("registers wanderlog_delete_section as a destructive live tool and routes calls to client.deleteSection", async () => {
    const customSection = {
      type: "normal",
      mode: "placeList",
      heading: "Food & Drink",
      blocks: [],
    };
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: { sections: [customSection] },
    });
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    const annotations = new Map<string, Record<string, unknown>>();
    const server = {
      registerTool: (
        name: string,
        definition: { annotations?: Record<string, unknown> },
        handler: (input: unknown) => Promise<unknown>,
      ) => {
        handlers.set(name, handler);
        if (definition.annotations) {
          annotations.set(name, definition.annotations);
        }
      },
    };

    registerTripTools(server as never, client, draftStore);

    expect(handlers.has("wanderlog_delete_section")).toBe(true);
    expect(annotations.get("wanderlog_delete_section")?.destructiveHint).toBe(
      true,
    );

    await handlers.get("wanderlog_delete_section")?.({
      tripId: "trip-key",
      section: "Food & Drink",
    });

    expect(mutationClient.submitted).toHaveLength(1);
  });
});
