import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server.ts";

describe("createServer", () => {
  it("creates an MCP server with a connect method", () => {
    const server = createServer({
      addChecklist: async () => ({
        tripId: "test-trip",
        message: "Added checklist.",
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
      createTrip: async () => ({
        id: "test-trip",
        numericId: 123,
        title: "Test trip",
        destination: "Test destination",
        startDate: "2026-01-01",
        endDate: "2026-01-02",
        url: "https://wanderlog.com/view/test-trip",
      }),
      getTrip: async () => null,
      listTrips: async () => [],
      searchPlaces: async () => [],
    });

    expect(typeof server.connect).toBe("function");
  });
});
