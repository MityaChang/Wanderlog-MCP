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

  it("registers live expense tools while keeping add expense local-draft wording", () => {
    const { client } = createClient(createBudgetTrip());
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

    expect(handlers.has("wanderlog_list_expenses")).toBe(true);
    expect(handlers.has("wanderlog_edit_expense")).toBe(true);
    expect(handlers.has("wanderlog_remove_expense")).toBe(true);
    expect(definitions.get("wanderlog_add_expense")?.description).toBe(
      "Save an expense draft for a trip.",
    );
  });
});
