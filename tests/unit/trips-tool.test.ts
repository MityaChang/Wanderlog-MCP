import { describe, expect, it } from "vitest";

import type { DraftItem } from "../../src/drafts/store.js";
import {
  formatCreatedTripResult,
  formatDraftCreatedResult,
  formatDraftDeletedResult,
  formatDraftExportResult,
  formatDraftListResult,
  formatDraftUpdatedResult,
  formatGuideSearchResult,
  formatPlaceSearchResult,
  formatTripDetailResult,
  formatTripForwardingEmailResult,
  formatTripListResult,
  formatTripUrlResult,
  registerTripTools,
} from "../../src/tools/trips.js";
import type {
  CreatedTrip,
  GuideSearchResult,
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

  it("formats guide search results with guide keys for follow-up reads", () => {
    const guides: GuideSearchResult = {
      geo: { id: 86655, name: "Vietnam", country: null },
      guides: [
        {
          id: "guide-key",
          title: "Vietnam Loop",
          author: "traveler",
          placeCount: 42,
          viewCount: 1234,
          likeCount: 56,
          blurb: "A practical route.",
          editedAt: "2026-05-03T02:05:37+00:00",
          url: "https://wanderlog.com/view/guide-key",
        },
      ],
    };

    const result = formatGuideSearchResult("Vietnam", guides);

    expect(result.content).toEqual([
      {
        type: "text",
        text:
          'Found 1 Wanderlog guide for "Vietnam" (Vietnam):\n' +
          "1. Vietnam Loop by traveler - 42 places, 1234 views [guide_key: guide-key]\n" +
          "A practical route.",
      },
    ]);
    expect(result.structuredContent).toEqual({ guides });
  });

  it("formats empty guide search results", () => {
    const guides: GuideSearchResult = {
      geo: { id: 999, name: "Smalltown", country: "Portugal" },
      guides: [],
    };

    const result = formatGuideSearchResult("Smalltown", guides);

    expect(result.content).toEqual([
      {
        type: "text",
        text: 'No public Wanderlog guides found for "Smalltown" (Smalltown, Portugal).',
      },
    ]);
    expect(result.structuredContent).toEqual({ guides });
  });
});

// ── Draft formatter tests ─────────────────────────────────────────────────────

const sampleDraft: DraftItem = {
  draftId: "draft-1",
  tripId: "lisbon-key",
  kind: "place",
  place: "Pasteis de Belem",
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

describe("formatDraftCreatedResult", () => {
  it("includes the local-only disclaimer and structured draft", () => {
    const result = formatDraftCreatedResult(sampleDraft);

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        "Saved local Wanderlog draft draft-1 for trip lisbon-key.",
      ),
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        "This is a local draft; it has not been written to Wanderlog yet.",
      ),
    });
    expect(result.structuredContent).toEqual({ draft: sampleDraft });
  });
});

describe("formatDraftListResult", () => {
  it("lists drafts as readable text and structured content", () => {
    const result = formatDraftListResult("lisbon-key", [sampleDraft]);

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(
      (result.content[0] as { type: "text"; text: string }).text,
    ).toContain("draft-1");
    expect(result.structuredContent).toEqual({ drafts: [sampleDraft] });
  });

  it("handles an empty draft list", () => {
    const result = formatDraftListResult("lisbon-key", []);

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.structuredContent).toEqual({ drafts: [] });
  });
});

describe("formatDraftUpdatedResult", () => {
  it("returns updated draft in structured content", () => {
    const result = formatDraftUpdatedResult(sampleDraft);

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(
      (result.content[0] as { type: string; text: string }).text,
    ).toContain("Updated local draft draft-1");
    expect(result.structuredContent).toEqual({ draft: sampleDraft });
  });
});

describe("formatDraftDeletedResult", () => {
  it("returns deleted draft in structured content", () => {
    const result = formatDraftDeletedResult(sampleDraft);

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(
      (result.content[0] as { type: string; text: string }).text,
    ).toContain("Deleted local draft draft-1");
    expect(result.structuredContent).toEqual({ draft: sampleDraft });
  });
});

describe("formatDraftExportResult", () => {
  it("returns export text and structured content", () => {
    const exportText =
      "Local Wanderlog drafts for trip lisbon-key\n- draft-1 [place] Pasteis de Belem";
    const result = formatDraftExportResult("lisbon-key", exportText);

    expect(result.content[0]).toMatchObject({ type: "text", text: exportText });
    expect(result.structuredContent).toEqual({
      tripId: "lisbon-key",
      export: exportText,
    });
  });
});

describe("registerTripTools", () => {
  it("routes add-place through the live client", async () => {
    let addedPlace: unknown = null;
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

    registerTripTools(
      server as never,
      {
        addChecklist: async () => ({
          tripId: "trip-key",
          message: "Added checklist.",
        }),
        addExpense: async () => ({
          tripId: "trip-key",
          message: "Added expense.",
        }),
        addHotel: async () => ({
          tripId: "trip-key",
          message: "Added hotel.",
        }),
        addNote: async () => ({
          tripId: "trip-key",
          message: "Added note.",
        }),
        addPlace: async (input) => {
          addedPlace = input;
          return { tripId: "trip-key", message: "Added place." };
        },
        annotatePlace: async () => ({
          tripId: "trip-key",
          message: "Updated place.",
        }),
        createTrip: async () => ({
          id: "trip-key",
          numericId: 1,
          title: "Trip",
          destination: "Vietnam",
          startDate: "2026-06-01",
          endDate: "2026-06-02",
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
        removePlace: async () => ({
          tripId: "trip-key",
          message: "Removed place.",
        }),
        searchGuides: async () => ({
          geo: { id: 1, name: "Vietnam", country: null },
          guides: [],
        }),
        searchPlaces: async () => [],
        updateTripDates: async () => ({
          tripId: "trip-key",
          message: "Updated trip dates.",
        }),
      },
      {
        create: async (input) => {
          createdDraft = input;
          return {
            ...input,
            draftId: "draft-1",
            createdAt: "2026-07-04T00:00:00.000Z",
            updatedAt: "2026-07-04T00:00:00.000Z",
          };
        },
        list: async () => [],
        update: async () => sampleDraft,
        delete: async () => sampleDraft,
        exportTrip: async () => "Local Wanderlog drafts for trip trip-key",
      },
    );

    const result = await handlers.get("wanderlog_add_place")?.({
      tripId: "trip-key",
      place: "Tokyo Station",
      day: "day 1",
      note: "Pick up bento.",
    });

    expect(addedPlace).toEqual({
      tripId: "trip-key",
      place: "Tokyo Station",
      day: "day 1",
      note: "Pick up bento.",
    });
    expect(createdDraft).toBeNull();
    expect(result).toMatchObject({
      structuredContent: {
        result: { tripId: "trip-key", message: "Added place." },
      },
    });
  });

  it("routes add-note through the live client", async () => {
    let addedNote: unknown = null;
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

    registerTripTools(
      server as never,
      {
        addChecklist: async () => ({
          tripId: "trip-key",
          message: "Added checklist.",
        }),
        addExpense: async () => ({
          tripId: "trip-key",
          message: "Added expense.",
        }),
        addHotel: async () => ({
          tripId: "trip-key",
          message: "Added hotel.",
        }),
        addNote: async (input) => {
          addedNote = input;
          return { tripId: "trip-key", message: "Added note." };
        },
        addPlace: async () => ({
          tripId: "trip-key",
          message: "Added place.",
        }),
        annotatePlace: async () => ({
          tripId: "trip-key",
          message: "Updated place.",
        }),
        createTrip: async () => ({
          id: "trip-key",
          numericId: 1,
          title: "Trip",
          destination: "Vietnam",
          startDate: "2026-06-01",
          endDate: "2026-06-02",
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
        removePlace: async () => ({
          tripId: "trip-key",
          message: "Removed place.",
        }),
        searchGuides: async () => ({
          geo: { id: 1, name: "Vietnam", country: null },
          guides: [],
        }),
        searchPlaces: async () => [],
        updateTripDates: async () => ({
          tripId: "trip-key",
          message: "Updated trip dates.",
        }),
      },
      {
        create: async (input) => {
          createdDraft = input;
          return {
            ...input,
            draftId: "draft-1",
            createdAt: "2026-07-04T00:00:00.000Z",
            updatedAt: "2026-07-04T00:00:00.000Z",
          };
        },
        list: async () => [],
        update: async () => sampleDraft,
        delete: async () => sampleDraft,
        exportTrip: async () => "Local Wanderlog drafts for trip trip-key",
      },
    );

    const result = await handlers.get("wanderlog_add_note")?.({
      tripId: "trip-key",
      text: "Book train seats.",
      day: "day 1",
    });

    expect(addedNote).toEqual({
      tripId: "trip-key",
      text: "Book train seats.",
      day: "day 1",
    });
    expect(createdDraft).toBeNull();
    expect(result).toMatchObject({
      structuredContent: {
        result: { tripId: "trip-key", message: "Added note." },
      },
    });
  });

  it("passes the optional guide day filter to the client", async () => {
    let guideRequest: { guideKey: string; options?: { day?: number } } | null =
      null;
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

    registerTripTools(
      server as never,
      {
        addChecklist: async () => ({
          tripId: "trip-key",
          message: "Added checklist.",
        }),
        addExpense: async () => ({
          tripId: "trip-key",
          message: "Added expense.",
        }),
        addHotel: async () => ({
          tripId: "trip-key",
          message: "Added hotel.",
        }),
        addNote: async () => ({
          tripId: "trip-key",
          message: "Added note.",
        }),
        addPlace: async () => ({
          tripId: "trip-key",
          message: "Added place.",
        }),
        annotatePlace: async () => ({
          tripId: "trip-key",
          message: "Updated place.",
        }),
        createTrip: async () => ({
          id: "trip-key",
          numericId: 1,
          title: "Trip",
          destination: "Vietnam",
          startDate: "2026-06-01",
          endDate: "2026-06-02",
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
        getGuide: async (guideKey, options) => {
          guideRequest = { guideKey, options };
          return null;
        },
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
        removePlace: async () => ({
          tripId: "trip-key",
          message: "Removed place.",
        }),
        searchGuides: async () => ({
          geo: { id: 1, name: "Vietnam", country: null },
          guides: [],
        }),
        searchPlaces: async () => [],
        updateTripDates: async () => ({
          tripId: "trip-key",
          message: "Updated trip dates.",
        }),
      },
      {
        create: async (input) => ({
          ...input,
          draftId: "draft-1",
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
        }),
        list: async () => [],
        update: async () => sampleDraft,
        delete: async () => sampleDraft,
        exportTrip: async () => "Local Wanderlog drafts for trip trip-key",
      },
    );

    await handlers.get("wanderlog_get_guide")?.({
      guideKey: "guide-key",
      day: 2,
    });

    expect(guideRequest).toEqual({
      guideKey: "guide-key",
      options: { day: 2 },
    });
  });

  it("routes add-hotel through the live client", async () => {
    let addedHotel: unknown = null;
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

    registerTripTools(
      server as never,
      {
        addChecklist: async () => ({
          tripId: "trip-key",
          message: "Added checklist.",
        }),
        addExpense: async () => ({
          tripId: "trip-key",
          message: "Added expense.",
        }),
        addHotel: async (input) => {
          addedHotel = input;
          return { tripId: "trip-key", message: "Added hotel." };
        },
        addNote: async () => ({
          tripId: "trip-key",
          message: "Added note.",
        }),
        addPlace: async () => ({
          tripId: "trip-key",
          message: "Added place.",
        }),
        annotatePlace: async () => ({
          tripId: "trip-key",
          message: "Updated place.",
        }),
        createTrip: async () => ({
          id: "trip-key",
          numericId: 1,
          title: "Trip",
          destination: "Tokyo",
          startDate: "2026-04-01",
          endDate: "2026-04-05",
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
        removePlace: async () => ({
          tripId: "trip-key",
          message: "Removed place.",
        }),
        searchGuides: async () => ({
          geo: { id: 1, name: "Tokyo", country: null },
          guides: [],
        }),
        searchPlaces: async () => [],
        updateTripDates: async () => ({
          tripId: "trip-key",
          message: "Updated trip dates.",
        }),
      },
      {
        create: async (input) => {
          createdDraft = input;
          return {
            ...input,
            draftId: "draft-1",
            createdAt: "2026-07-10T00:00:00.000Z",
            updatedAt: "2026-07-10T00:00:00.000Z",
          };
        },
        list: async () => [],
        update: async () => sampleDraft,
        delete: async () => sampleDraft,
        exportTrip: async () => "Local Wanderlog drafts for trip trip-key",
      },
    );

    const result = await handlers.get("wanderlog_add_hotel")?.({
      tripId: "trip-key",
      hotel: "Grand Hyatt Tokyo",
      checkIn: "2026-04-01",
      checkOut: "2026-04-05",
    });

    expect(addedHotel).toEqual({
      tripId: "trip-key",
      hotel: "Grand Hyatt Tokyo",
      checkIn: "2026-04-01",
      checkOut: "2026-04-05",
    });
    expect(createdDraft).toBeNull();
    expect(result).toMatchObject({
      structuredContent: {
        result: { tripId: "trip-key", message: "Added hotel." },
      },
    });
  });
});
