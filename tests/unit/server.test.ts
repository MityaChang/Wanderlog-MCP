import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server.ts";

describe("createServer", () => {
  it("creates an MCP server with a connect method", () => {
    const server = createServer(
      {
        addChecklist: async () => ({
          tripId: "test-trip",
          message: "Added checklist.",
        }),
        addExpense: async () => ({
          tripId: "test-trip",
          message: "Added expense.",
        }),
        addHotel: async () => ({
          tripId: "test-trip",
          message: "Added hotel.",
        }),
        addNote: async () => ({
          tripId: "test-trip",
          message: "Added note.",
        }),
        addPlace: async () => ({
          tripId: "test-trip",
          message: "Added place.",
        }),
        addSection: async () => ({
          tripId: "test-trip",
          message: "Added section.",
        }),
        annotatePlace: async () => ({
          tripId: "test-trip",
          message: "Updated place.",
        }),
        createTrip: async () => ({
          id: "test-trip",
          numericId: 123,
          title: "Test trip",
          destination: "Test destination",
          startDate: "2026-01-01",
          endDate: "2026-01-02",
          url: "https://wanderlog.com/view/test-trip",
        }),
        editExpense: async () => ({
          tripId: "test-trip",
          message: "Updated expense.",
        }),
        editNote: async () => ({
          tripId: "test-trip",
          message: "Updated note.",
        }),
        getGuide: async () => null,
        getTrip: async () => null,
        listExpenses: async () => [],
        listTrips: async () => [],
        renameDay: async () => ({
          tripId: "test-trip",
          message: "Renamed day.",
        }),
        removeExpense: async () => ({
          tripId: "test-trip",
          message: "Removed expense.",
        }),
        removeNote: async () => ({
          tripId: "test-trip",
          message: "Removed note.",
        }),
        removePlace: async () => ({
          tripId: "test-trip",
          message: "Removed place.",
        }),
        searchGuides: async () => ({
          geo: { id: 1, name: "Test destination", country: null },
          guides: [],
        }),
        searchPlaces: async () => [],
        updateTripDates: async () => ({
          tripId: "test-trip",
          message: "Updated trip dates.",
        }),
        updateSection: async () => ({
          tripId: "test-trip",
          message: "Renamed section.",
        }),
        deleteSection: async () => ({
          tripId: "test-trip",
          message: "Deleted section.",
        }),
      },
      {
        create: async (input) => ({
          ...input,
          draftId: "draft-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        list: async () => [],
        update: async (tripId, draftId, patch) => ({
          kind: "note" as const,
          text: "x",
          draftId,
          tripId,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          ...patch,
        }),
        delete: async (tripId, draftId) => ({
          kind: "note" as const,
          text: "x",
          draftId,
          tripId,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        exportTrip: async (tripId) =>
          `Local Wanderlog drafts for trip ${tripId}`,
      },
    );

    expect(typeof server.connect).toBe("function");
  });
});
