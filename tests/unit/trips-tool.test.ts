import { describe, expect, it } from "vitest";

import {
  formatCreatedTripResult,
  formatPlaceSearchResult,
  formatTripDetailResult,
  formatTripForwardingEmailResult,
  formatTripListResult,
  formatTripUrlResult,
} from "../../src/tools/trips.js";
import type {
  CreatedTrip,
  PlaceSearchResult,
  TripDetail,
  TripSummary,
} from "../../src/wanderlog/types.js";

describe("formatTripListResult", () => {
  it("formats trip summaries as readable text and structured content", () => {
    const trips: TripSummary[] = [
      {
        id: "12345",
        title: "Japan Golden Route",
        destination: "Japan",
        startDate: "2026-04-01",
        endDate: "2026-04-14",
        url: "https://wanderlog.com/view/12345/japan-golden-route",
      },
      {
        id: "67890",
        title: "Lisbon Long Weekend",
        destination: "Lisbon",
        startDate: null,
        endDate: null,
        url: "https://wanderlog.com/view/67890",
      },
    ];

    const result = formatTripListResult(trips);

    expect(result.content).toEqual([
      {
        type: "text",
        text:
          "Found 2 Wanderlog trips:\n" +
          "- Japan Golden Route (Japan, 2026-04-01 to 2026-04-14): https://wanderlog.com/view/12345/japan-golden-route\n" +
          "- Lisbon Long Weekend (Lisbon, dates not set): https://wanderlog.com/view/67890",
      },
    ]);
    expect(result.structuredContent).toEqual({ trips });
  });

  it("formats an empty trip list", () => {
    const result = formatTripListResult([]);

    expect(result.content).toEqual([
      {
        type: "text",
        text: "No Wanderlog trips found.",
      },
    ]);
    expect(result.structuredContent).toEqual({ trips: [] });
  });
});

describe("formatTripDetailResult", () => {
  it("formats a trip detail with day sections and general items", () => {
    const trip: TripDetail = {
      id: "12345",
      title: "Japan Golden Route",
      destination: "Japan",
      startDate: "2026-04-01",
      endDate: "2026-04-14",
      url: "https://wanderlog.com/view/12345/japan-golden-route",
      forwardingEmail: "trip+12345@wanderlog.com",
      days: [
        {
          day: 1,
          date: "2026-04-01",
          title: "Tokyo Arrival",
          items: [
            {
              type: "place",
              title: "Tokyo Station",
              note: "Pick up rail pass.",
              startTime: "10:00",
              endTime: "11:00",
            },
          ],
        },
      ],
      generalItems: [
        {
          type: "checklist",
          title: "Pre-trip checklist",
          note: "Passport and rail pass.",
          startTime: null,
          endTime: null,
        },
      ],
    };

    const result = formatTripDetailResult(trip);

    expect(result.content[0]).toEqual({
      type: "text",
      text:
        "Japan Golden Route (Japan, 2026-04-01 to 2026-04-14)\n" +
        "https://wanderlog.com/view/12345/japan-golden-route\n\n" +
        "Day 1 - Tokyo Arrival - 2026-04-01\n" +
        "- [place] Tokyo Station (10:00-11:00): Pick up rail pass.\n\n" +
        "General list\n" +
        "- [checklist] Pre-trip checklist: Passport and rail pass.",
    });
    expect(result.structuredContent).toEqual({ trip });
  });

  it("formats a missing trip detail", () => {
    expect(formatTripDetailResult(null)).toEqual({
      content: [{ type: "text", text: "Wanderlog trip not found." }],
      structuredContent: { trip: null },
    });
  });
});

describe("trip link formatters", () => {
  const trip: TripDetail = {
    id: "12345",
    title: "Japan Golden Route",
    destination: "Japan",
    startDate: "2026-04-01",
    endDate: "2026-04-14",
    url: "https://wanderlog.com/view/12345/japan-golden-route",
    forwardingEmail: "trip+12345@wanderlog.com",
    days: [],
    generalItems: [],
  };

  it("formats the shareable trip URL", () => {
    expect(formatTripUrlResult(trip)).toEqual({
      content: [
        {
          type: "text",
          text: "Japan Golden Route: https://wanderlog.com/view/12345/japan-golden-route",
        },
      ],
      structuredContent: {
        tripId: "12345",
        url: "https://wanderlog.com/view/12345/japan-golden-route",
      },
    });
  });

  it("formats the trip forwarding email", () => {
    expect(formatTripForwardingEmailResult(trip)).toEqual({
      content: [
        {
          type: "text",
          text: "Japan Golden Route import email: trip+12345@wanderlog.com",
        },
      ],
      structuredContent: {
        tripId: "12345",
        forwardingEmail: "trip+12345@wanderlog.com",
      },
    });
  });
});

describe("v0.2 itinerary-building formatters", () => {
  it("formats a created trip with next-step guidance", () => {
    const trip: CreatedTrip = {
      id: "lisbon-key",
      numericId: 789,
      title: "Lisbon Long Weekend",
      destination: "Lisbon, Portugal",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      url: "https://wanderlog.com/view/lisbon-key",
    };

    const result = formatCreatedTripResult(trip);

    expect(result.content).toEqual([
      {
        type: "text",
        text:
          "Created Lisbon Long Weekend for Lisbon, Portugal (2026-06-01 to 2026-06-05).\n" +
          "Trip key: lisbon-key\n" +
          "URL: https://wanderlog.com/view/lisbon-key\n\n" +
          "Next: search for real places with wanderlog_search_places, then add places, practical notes, lodging, and a checklist.",
      },
    ]);
    expect(result.structuredContent).toEqual({ trip });
  });

  it("formats place search results for concise selection", () => {
    const places: PlaceSearchResult[] = [
      {
        id: "place-123",
        title: "Time Out Market Lisboa",
        description: "Lisbon, Portugal",
      },
      {
        id: "place-456",
        title: "MAAT",
        description: null,
      },
    ];

    const result = formatPlaceSearchResult("food hall", places);

    expect(result.content).toEqual([
      {
        type: "text",
        text:
          'Found 2 places for "food hall":\n' +
          "1. Time Out Market Lisboa - Lisbon, Portugal [place_id: place-123]\n" +
          "2. MAAT [place_id: place-456]",
      },
    ]);
    expect(result.structuredContent).toEqual({ places });
  });

  it("formats empty place search results", () => {
    const result = formatPlaceSearchResult("ramen", []);

    expect(result.content).toEqual([
      {
        type: "text",
        text: 'No Wanderlog places found for "ramen".',
      },
    ]);
    expect(result.structuredContent).toEqual({ places: [] });
  });
});
