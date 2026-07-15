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

function createBudgetTrip(): unknown {
  return {
    title: "Japan Golden Route",
    itinerary: {
      budget: {
        expenses: [
          {
            id: 90001,
            amount: { amount: 12.5, currencyCode: "USD" },
            category: "food",
            description: "Lunch at Ichiran Ramen",
            date: "2026-04-01",
            associatedDate: "2026-04-01",
            paidByUserId: 123,
          },
          {
            id: 90002,
            amount: { amount: 8, currencyCode: "USD" },
            category: "publicTransit",
            description: "Subway day pass",
            date: "2026-04-01",
            associatedDate: "2026-04-01",
            paidByUserId: 123,
          },
        ],
      },
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
    kind: "expense",
    tripId: "trip-key",
    draftId: "draft-1",
    title: "Snack",
    amount: 5,
    currency: "USD",
    paidBy: "Alex",
    splitWith: [],
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
  }),
  delete: async () => ({
    kind: "expense",
    tripId: "trip-key",
    draftId: "draft-1",
    title: "Snack",
    amount: 5,
    currency: "USD",
    paidBy: "Alex",
    splitWith: [],
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
  }),
  exportTrip: async () => "Local Wanderlog drafts",
};

describe("live expense tools", () => {
  it("lists expenses with optional filters", async () => {
    const { client } = createClient(createBudgetTrip());

    await expect(
      client.listExpenses({ tripId: "trip-key", currency: "usd" }),
    ).resolves.toEqual([
      {
        index: 0,
        id: 90001,
        amount: 12.5,
        currency: "USD",
        category: "food",
        description: "Lunch at Ichiran Ramen",
        date: "2026-04-01",
      },
      {
        index: 1,
        id: 90002,
        amount: 8,
        currency: "USD",
        category: "publicTransit",
        description: "Subway day pass",
        date: "2026-04-01",
      },
    ]);
  });

  it("edits one matched expense with field-level JSON0 ops", async () => {
    const { client, mutationClient } = createClient(createBudgetTrip());

    await expect(
      client.editExpense({
        tripId: "trip-key",
        description: "subway",
        newDescription: "Metro 72h pass",
        newAmount: 9.5,
        newCurrency: "eur",
        newDate: "2026-04-02",
      }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Updated expense"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "budget", "expenses", 1, "description"],
          od: "Subway day pass",
          oi: "Metro 72h pass",
        },
        {
          p: ["itinerary", "budget", "expenses", 1, "amount", "amount"],
          od: 8,
          oi: 9.5,
        },
        {
          p: ["itinerary", "budget", "expenses", 1, "amount", "currencyCode"],
          od: "USD",
          oi: "EUR",
        },
        {
          p: ["itinerary", "budget", "expenses", 1, "date"],
          od: "2026-04-01",
          oi: "2026-04-02",
        },
        {
          p: ["itinerary", "budget", "expenses", 1, "associatedDate"],
          od: "2026-04-01",
          oi: "2026-04-02",
        },
      ],
    ]);
  });

  it("removes one matched expense with a list delete op", async () => {
    const trip = createBudgetTrip() as {
      itinerary: { budget: { expenses: unknown[] } };
    };
    const removedExpense = trip.itinerary.budget.expenses[1];
    const { client, mutationClient } = createClient(trip);

    await expect(
      client.removeExpense({ tripId: "trip-key", description: "subway" }),
    ).resolves.toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Removed expense"),
    });

    expect(mutationClient.submitted).toEqual([
      [
        {
          p: ["itinerary", "budget", "expenses", 1],
          ld: removedExpense,
        },
      ],
    ]);
  });

  it("appends an unlinked expense via JSON0 li op", async () => {
    const { client, mutationClient } = createClient(createBudgetTrip());

    const result = await client.addExpense({
      tripId: "trip-key",
      title: "Dinner at Nobu",
      amount: 45.5,
      currency: "usd",
      paidBy: "Alex",
      splitWith: ["Sam"],
    });

    expect(result).toMatchObject({
      tripId: "trip-key",
      message: expect.stringContaining("Dinner at Nobu"),
    });

    expect(mutationClient.submitted).toHaveLength(1);
    const [ops] = mutationClient.submitted;
    expect(ops).toHaveLength(1);
    const [op] = ops!;
    expect(op!.p).toEqual(["itinerary", "budget", "expenses", 2]);
    expect(op!.ld).toBeUndefined();
    expect(op!.li).toMatchObject({
      description: "Dinner at Nobu",
      amount: { amount: 45.5, currencyCode: "USD" },
      blockId: null,
      paidBy: "Alex",
      splitWith: ["Sam"],
    });
  });

  it("preserves optional expense note and defaults splitWith to an empty list", async () => {
    const { client, mutationClient } = createClient(createBudgetTrip());

    await client.addExpense({
      tripId: "trip-key",
      title: "Coffee",
      amount: 4.5,
      currency: "USD",
      paidBy: "Alex",
      note: "Use the station kiosk.",
    });

    expect(mutationClient.submitted[0]?.[0]?.li).toMatchObject({
      description: "Coffee",
      paidBy: "Alex",
      splitWith: [],
      note: "Use the station kiosk.",
    });
  });

  it("routes wanderlog_add_expense through the live client", async () => {
    const { client, mutationClient } = createClient(createBudgetTrip());
    let createdDraft: unknown = null;
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    const definitions = new Map<string, { description?: string }>();
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
    const trackingDraftStore: DraftItineraryStore = {
      ...draftStore,
      create: async (input) => {
        createdDraft = input;
        return {
          ...input,
          draftId: "draft-1",
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
        };
      },
    };

    registerTripTools(server as never, client, trackingDraftStore);

    await handlers.get("wanderlog_add_expense")?.({
      tripId: "trip-key",
      title: "Shinkansen pass",
      amount: 120,
      currency: "USD",
      paidBy: "Alex",
    });

    expect(createdDraft).toBeNull();
    expect(mutationClient.submitted).toHaveLength(1);
    expect(definitions.get("wanderlog_add_expense")?.description).not.toBe(
      "Save an expense draft for a trip.",
    );
  });
});
