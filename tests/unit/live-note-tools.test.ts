import { describe, expect, it } from "vitest";

import type { Json0Op } from "../../src/ot/apply.js";
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

describe("live note tools", () => {
  it("adds a note block to the requested day section", async () => {
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
      client.addNote({
        tripId: "trip-key",
        day: "2026-04-01",
        text: "Reserve airport limousine bus seats.",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Added note"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0],
          li: {
            type: "note",
            text: {
              ops: [{ insert: "Reserve airport limousine bus seats.\n" }],
            },
          },
        },
      ],
    ]);
  });

  it("edits one matching note block with a rich-text op", async () => {
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [
              {
                type: "note",
                text: {
                  ops: [{ insert: "Pick up rail pass at Tokyo Station\n" }],
                },
              },
            ],
          },
        ],
      },
    });

    await expect(
      client.editNote({
        tripId: "trip-key",
        oldText: "rail pass",
        newText: "Suica card",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Updated note"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0, "text"],
          t: "rich-text",
          o: [{ retain: 8 }, { delete: 9 }, { insert: "Suica card" }],
        },
      ],
    ]);
  });

  it("keeps the mutation cache current after rich-text note edits", async () => {
    const { client } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [
              {
                type: "note",
                text: { ops: [{ insert: "Pick up rail pass\n" }] },
              },
            ],
          },
        ],
      },
    });

    await client.editNote({
      tripId: "trip-key",
      oldText: "rail pass",
      newText: "Suica card",
    });

    await expect(
      client.removeNote({ tripId: "trip-key", text: "Suica card" }),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Removed note"),
    });
  });

  it("removes one matching note block with a list delete op", async () => {
    const noteBlock = {
      type: "note",
      text: { ops: [{ insert: "Book teamLab tickets\n" }] },
    };
    const { client, mutationClient } = createClient({
      title: "Japan Golden Route",
      itinerary: {
        sections: [
          {
            mode: "dayPlan",
            date: "2026-04-01",
            blocks: [noteBlock],
          },
        ],
      },
    });

    await expect(
      client.removeNote({ tripId: "trip-key", text: "teamLab" }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Removed note"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0],
          ld: noteBlock,
        },
      ],
    ]);
  });
});
