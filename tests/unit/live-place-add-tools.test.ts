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

describe("live place add tools", () => {
  it("adds a place block to the requested day section", async () => {
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
      client.addPlace({
        tripId: "trip-key",
        day: "2026-04-01",
        place: "Tokyo Station",
        note: "Pick up bento before boarding.",
        startTime: "10:00",
        endTime: "11:00",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Added Tokyo Station"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "sections", 0, "blocks", 0],
          li: {
            type: "place",
            place: { name: "Tokyo Station" },
            text: {
              ops: [{ insert: "Pick up bento before boarding.\n" }],
            },
            startTime: "10:00",
            endTime: "11:00",
          },
        },
      ],
    ]);
  });
});
