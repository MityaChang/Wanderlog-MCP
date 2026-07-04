import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  CreateDraftInput,
  DraftItem,
  DraftItineraryStore,
} from "../drafts/store.js";
import type { WanderlogClient } from "../wanderlog/client.js";
import type {
  CreatedTrip,
  GuideSearchResult,
  PlaceSearchResult,
  TripDay,
  TripDetail,
  TripItem,
  TripSummary,
} from "../wanderlog/types.js";

type TripClient = Pick<
  WanderlogClient,
  | "createTrip"
  | "getGuide"
  | "getTrip"
  | "listTrips"
  | "searchGuides"
  | "searchPlaces"
>;

const tripIdSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip ID, for example 12345."),
};

const getTripSchema = {
  ...tripIdSchema,
  day: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional itinerary day number."),
};

const createTripSchema = {
  destination: z
    .string()
    .min(1)
    .describe("City or region name to plan around, for example Lisbon."),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("First day of the trip, YYYY-MM-DD."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Last day of the trip, YYYY-MM-DD."),
  title: z.string().min(1).optional().describe("Optional custom trip title."),
  privacy: z
    .enum(["private", "friends", "public"])
    .optional()
    .describe("Trip visibility. Defaults to private."),
};

const searchPlacesSchema = {
  query: z
    .string()
    .min(1)
    .describe("What to search for, for example sushi restaurant or museum."),
  latitude: z.number().describe("Latitude used to bias place search."),
  longitude: z.number().describe("Longitude used to bias place search."),
};

const searchGuidesSchema = {
  destination: z
    .string()
    .min(1)
    .describe(
      "Destination to search public Wanderlog guides for, for example Vietnam or Kyoto.",
    ),
};

const getGuideSchema = {
  guideKey: z
    .string()
    .min(1)
    .describe("Guide key returned by wanderlog_search_guides."),
};

const addPlaceSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  place: z.string().min(1).describe("Place name to add to the trip."),
  day: z
    .string()
    .min(1)
    .optional()
    .describe("Optional day, date, or ISO date."),
  note: z.string().min(1).optional().describe("Optional inline place note."),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe("Optional start time in HH:mm."),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe("Optional end time in HH:mm."),
};

const addNoteSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  text: z.string().min(1).describe("Plain-text note content."),
  day: z
    .string()
    .min(1)
    .optional()
    .describe("Optional day, date, or ISO date."),
};

const addHotelSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  hotel: z.string().min(1).describe("Hotel name to add."),
  checkIn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Check-in date, YYYY-MM-DD."),
  checkOut: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Check-out date, YYYY-MM-DD."),
};

const addChecklistSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  items: z.array(z.string().min(1)).min(1).describe("Checklist items."),
  title: z.string().min(1).optional().describe("Optional checklist title."),
  day: z
    .string()
    .min(1)
    .optional()
    .describe("Optional day, date, or ISO date."),
};

const addExpenseSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  title: z.string().min(1).describe("Expense title."),
  amount: z.number().positive().describe("Expense amount."),
  currency: z.string().length(3).describe("ISO 4217 currency code, e.g. USD."),
  paidBy: z.string().min(1).describe("Name of the person who paid."),
  splitWith: z
    .array(z.string().min(1))
    .optional()
    .describe("Names of people splitting the expense."),
  note: z.string().min(1).optional().describe("Optional expense note."),
};

const listDraftsSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
};

const updateDraftSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  draftId: z.string().min(1).describe("Draft ID to update."),
  place: z.string().min(1).optional(),
  day: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  text: z.string().min(1).optional(),
  hotel: z.string().min(1).optional(),
  checkIn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  checkOut: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  title: z.string().min(1).optional(),
  items: z.array(z.string().min(1)).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  paidBy: z.string().min(1).optional(),
  splitWith: z.array(z.string().min(1)).optional(),
};

const deleteDraftSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  draftId: z.string().min(1).describe("Draft ID to delete."),
};

const exportDraftsSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
};

export function registerTripTools(
  server: McpServer,
  client: TripClient,
  draftStore: DraftItineraryStore,
): void {
  server.registerTool(
    "wanderlog_list_trips",
    {
      title: "List Wanderlog trips",
      description: "List trips in the authenticated Wanderlog account.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => formatTripListResult(await client.listTrips()),
  );

  server.registerTool(
    "wanderlog_get_trip",
    {
      title: "Get Wanderlog trip",
      description: "View a full Wanderlog itinerary, or filter to one day.",
      inputSchema: getTripSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tripId, day }) =>
      formatTripDetailResult(await client.getTrip(tripId, { day })),
  );

  server.registerTool(
    "wanderlog_get_trip_url",
    {
      title: "Get Wanderlog trip URL",
      description: "Get a shareable wanderlog.com link for a trip.",
      inputSchema: tripIdSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tripId }) => formatTripUrlResult(await client.getTrip(tripId)),
  );

  server.registerTool(
    "wanderlog_get_trip_forwarding_email",
    {
      title: "Get Wanderlog trip import email",
      description: "Get a trip's trip+<id>@wanderlog.com import address.",
      inputSchema: tripIdSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tripId }) =>
      formatTripForwardingEmailResult(await client.getTrip(tripId)),
  );

  server.registerTool(
    "wanderlog_create_trip",
    {
      title: "Create Wanderlog trip",
      description: "Create a new Wanderlog trip with destination and dates.",
      inputSchema: createTripSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatCreatedTripResult(await client.createTrip(input)),
  );

  server.registerTool(
    "wanderlog_search_places",
    {
      title: "Search Wanderlog places",
      description: "Find real-world places near a latitude and longitude.",
      inputSchema: searchPlacesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      formatPlaceSearchResult(input.query, await client.searchPlaces(input)),
  );

  server.registerTool(
    "wanderlog_search_guides",
    {
      title: "Search Wanderlog guides",
      description: "Find public Wanderlog guides for a destination.",
      inputSchema: searchGuidesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      formatGuideSearchResult(
        input.destination,
        await client.searchGuides(input),
      ),
  );

  server.registerTool(
    "wanderlog_get_guide",
    {
      title: "Get Wanderlog guide",
      description:
        "Read a public Wanderlog guide returned by wanderlog_search_guides.",
      inputSchema: getGuideSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ guideKey }) =>
      formatTripDetailResult(await client.getGuide(guideKey)),
  );

  server.registerTool(
    "wanderlog_add_place",
    {
      title: "Add Wanderlog place",
      description: "Save a place draft for a day or unscheduled trip list.",
      inputSchema: addPlaceSchema,
      annotations: localDraftAnnotations,
    },
    async ({ tripId, place, day, note, startTime, endTime }) => {
      const input: CreateDraftInput = {
        kind: "place",
        tripId,
        place,
        ...(day !== undefined && { day }),
        ...(note !== undefined && { note }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
      };
      return formatDraftCreatedResult(await draftStore.create(input));
    },
  );

  server.registerTool(
    "wanderlog_add_note",
    {
      title: "Add Wanderlog note",
      description:
        "Save a practical note draft for a day or unscheduled trip list.",
      inputSchema: addNoteSchema,
      annotations: localDraftAnnotations,
    },
    async ({ tripId, text, day }) => {
      const input: CreateDraftInput = {
        kind: "note",
        tripId,
        text,
        ...(day !== undefined && { day }),
      };
      return formatDraftCreatedResult(await draftStore.create(input));
    },
  );

  server.registerTool(
    "wanderlog_add_hotel",
    {
      title: "Add Wanderlog hotel",
      description: "Save a lodging draft with check-in and check-out dates.",
      inputSchema: addHotelSchema,
      annotations: localDraftAnnotations,
    },
    async ({ tripId, hotel, checkIn, checkOut }) => {
      const input: CreateDraftInput = {
        kind: "hotel",
        tripId,
        hotel,
        ...(checkIn !== undefined && { checkIn }),
        ...(checkOut !== undefined && { checkOut }),
      };
      return formatDraftCreatedResult(await draftStore.create(input));
    },
  );

  server.registerTool(
    "wanderlog_add_checklist",
    {
      title: "Add Wanderlog checklist",
      description: "Save a trip-level or day-level checklist draft.",
      inputSchema: addChecklistSchema,
      annotations: localDraftAnnotations,
    },
    async ({ tripId, items, title, day }) => {
      const input: CreateDraftInput = {
        kind: "checklist",
        tripId,
        title: title ?? "Checklist",
        items,
        ...(day !== undefined && { day }),
      };
      return formatDraftCreatedResult(await draftStore.create(input));
    },
  );

  server.registerTool(
    "wanderlog_add_expense",
    {
      title: "Add Wanderlog expense",
      description: "Save an expense draft for a trip.",
      inputSchema: addExpenseSchema,
      annotations: localDraftAnnotations,
    },
    async ({ tripId, title, amount, currency, paidBy, splitWith, note }) => {
      const input: CreateDraftInput = {
        kind: "expense",
        tripId,
        title,
        amount,
        currency,
        paidBy,
        splitWith: splitWith ?? [],
        ...(note !== undefined && { note }),
      };
      return formatDraftCreatedResult(await draftStore.create(input));
    },
  );

  server.registerTool(
    "wanderlog_list_drafts",
    {
      title: "List Wanderlog drafts",
      description: "List all local drafts for a trip.",
      inputSchema: listDraftsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ tripId }) =>
      formatDraftListResult(tripId, await draftStore.list(tripId)),
  );

  server.registerTool(
    "wanderlog_update_draft",
    {
      title: "Update Wanderlog draft",
      description: "Update a local draft by draft ID.",
      inputSchema: updateDraftSchema,
      annotations: localDraftAnnotations,
    },
    async ({ tripId, draftId, ...patch }) =>
      formatDraftUpdatedResult(await draftStore.update(tripId, draftId, patch)),
  );

  server.registerTool(
    "wanderlog_delete_draft",
    {
      title: "Delete Wanderlog draft",
      description: "Delete a local draft by draft ID.",
      inputSchema: deleteDraftSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ tripId, draftId }) =>
      formatDraftDeletedResult(await draftStore.delete(tripId, draftId)),
  );

  server.registerTool(
    "wanderlog_export_drafts",
    {
      title: "Export Wanderlog drafts",
      description: "Export all local drafts for a trip as a readable summary.",
      inputSchema: exportDraftsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ tripId }) =>
      formatDraftExportResult(tripId, await draftStore.exportTrip(tripId)),
  );
}

const localDraftAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export function formatCreatedTripResult(trip: CreatedTrip): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          `Created ${trip.title} for ${trip.destination} (${trip.startDate} to ${trip.endDate}).\n` +
          `Trip key: ${trip.id}\n` +
          `URL: ${trip.url}\n\n` +
          "Next: search for real places with wanderlog_search_places, then add places, practical notes, lodging, and a checklist.",
      },
    ],
    structuredContent: { trip },
  };
}

export function formatPlaceSearchResult(
  query: string,
  places: PlaceSearchResult[],
): CallToolResult {
  if (places.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No Wanderlog places found for "${query}".`,
        },
      ],
      structuredContent: { places },
    };
  }

  const placeLines = places.map((place, index) => {
    const description = place.description ? ` - ${place.description}` : "";

    return `${index + 1}. ${place.title}${description} [place_id: ${place.id}]`;
  });

  return {
    content: [
      {
        type: "text",
        text: `Found ${places.length} places for "${query}":\n${placeLines.join("\n")}`,
      },
    ],
    structuredContent: { places },
  };
}

export function formatGuideSearchResult(
  query: string,
  guides: GuideSearchResult,
): CallToolResult {
  const destination = formatGuideDestination(guides.geo);

  if (guides.guides.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No public Wanderlog guides found for "${query}" (${destination}).`,
        },
      ],
      structuredContent: { guides },
    };
  }

  const guideLines = guides.guides.map((guide, index) => {
    const metrics = [
      guide.placeCount === null ? null : `${guide.placeCount} places`,
      guide.viewCount === null ? null : `${guide.viewCount} views`,
    ].filter((metric): metric is string => metric !== null);
    const metricsText = metrics.length > 0 ? ` - ${metrics.join(", ")}` : "";
    const blurb = guide.blurb ? `\n${guide.blurb}` : "";

    return `${index + 1}. ${guide.title} by ${guide.author}${metricsText} [guide_key: ${guide.id}]${blurb}`;
  });

  const noun = guides.guides.length === 1 ? "guide" : "guides";

  return {
    content: [
      {
        type: "text",
        text: `Found ${guides.guides.length} Wanderlog ${noun} for "${query}" (${destination}):\n${guideLines.join("\n")}`,
      },
    ],
    structuredContent: { guides },
  };
}

function formatGuideDestination(geo: GuideSearchResult["geo"]): string {
  return geo.country ? `${geo.name}, ${geo.country}` : geo.name;
}

export function formatTripMutationResult(result: {
  message: string;
  tripId: string;
}): CallToolResult {
  return {
    content: [{ type: "text", text: result.message }],
    structuredContent: { result },
  };
}

export function formatTripListResult(trips: TripSummary[]): CallToolResult {
  if (trips.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No Wanderlog trips found.",
        },
      ],
      structuredContent: { trips },
    };
  }

  const tripLines = trips.map((trip) => {
    const destination = trip.destination ?? "destination not set";
    const dates =
      trip.startDate && trip.endDate
        ? `${trip.startDate} to ${trip.endDate}`
        : "dates not set";

    return `- ${trip.title} (${destination}, ${dates}): ${trip.url}`;
  });

  return {
    content: [
      {
        type: "text",
        text: `Found ${trips.length} Wanderlog trips:\n${tripLines.join("\n")}`,
      },
    ],
    structuredContent: { trips },
  };
}

export function formatTripDetailResult(
  trip: TripDetail | null,
): CallToolResult {
  if (!trip) {
    return {
      content: [{ type: "text", text: "Wanderlog trip not found." }],
      structuredContent: { trip },
    };
  }

  const destination = trip.destination ?? "destination not set";
  const dates =
    trip.startDate && trip.endDate
      ? `${trip.startDate} to ${trip.endDate}`
      : "dates not set";
  const sections = [
    `${trip.title} (${destination}, ${dates})\n${trip.url}`,
    ...trip.days.map(formatDaySection),
  ];

  if (trip.generalItems.length > 0) {
    sections.push(
      `General list\n${trip.generalItems.map(formatItem).join("\n")}`,
    );
  }

  return {
    content: [{ type: "text", text: sections.join("\n\n") }],
    structuredContent: { trip },
  };
}

export function formatTripUrlResult(trip: TripDetail | null): CallToolResult {
  if (!trip) {
    return {
      content: [{ type: "text", text: "Wanderlog trip not found." }],
      structuredContent: { tripId: null, url: null },
    };
  }

  return {
    content: [{ type: "text", text: `${trip.title}: ${trip.url}` }],
    structuredContent: { tripId: trip.id, url: trip.url },
  };
}

export function formatTripForwardingEmailResult(
  trip: TripDetail | null,
): CallToolResult {
  if (!trip) {
    return {
      content: [{ type: "text", text: "Wanderlog trip not found." }],
      structuredContent: { tripId: null, forwardingEmail: null },
    };
  }

  if (!trip.forwardingEmail) {
    return {
      content: [{ type: "text", text: `${trip.title} has no import email.` }],
      structuredContent: { tripId: trip.id, forwardingEmail: null },
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `${trip.title} import email: ${trip.forwardingEmail}`,
      },
    ],
    structuredContent: {
      tripId: trip.id,
      forwardingEmail: trip.forwardingEmail,
    },
  };
}

export function formatDraftCreatedResult(draft: DraftItem): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          `Saved local Wanderlog draft ${draft.draftId} for trip ${draft.tripId}.\n` +
          "This is a local draft; it has not been written to Wanderlog yet.",
      },
    ],
    structuredContent: { draft },
  };
}

export function formatDraftListResult(
  tripId: string,
  drafts: DraftItem[],
): CallToolResult {
  if (drafts.length === 0) {
    return {
      content: [
        { type: "text", text: `No local drafts found for trip ${tripId}.` },
      ],
      structuredContent: { drafts },
    };
  }

  const lines = drafts.map((d) => `- ${d.draftId} [${d.kind}]`);
  return {
    content: [
      {
        type: "text",
        text: `Found ${drafts.length} local draft(s) for trip ${tripId}:\n${lines.join("\n")}`,
      },
    ],
    structuredContent: { drafts },
  };
}

export function formatDraftUpdatedResult(draft: DraftItem): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `Updated local draft ${draft.draftId} for trip ${draft.tripId}.`,
      },
    ],
    structuredContent: { draft },
  };
}

export function formatDraftDeletedResult(draft: DraftItem): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `Deleted local draft ${draft.draftId} for trip ${draft.tripId}.`,
      },
    ],
    structuredContent: { draft },
  };
}

export function formatDraftExportResult(
  tripId: string,
  exportText: string,
): CallToolResult {
  return {
    content: [{ type: "text", text: exportText }],
    structuredContent: { tripId, export: exportText },
  };
}

function formatDaySection(day: TripDay): string {
  const heading = [`Day ${day.day}`, day.title, day.date]
    .filter(Boolean)
    .join(" - ");

  if (day.items.length === 0) {
    return heading;
  }

  return `${heading}\n${day.items.map(formatItem).join("\n")}`;
}

function formatItem(item: TripItem): string {
  const timeRange =
    item.startTime && item.endTime
      ? ` (${item.startTime}-${item.endTime})`
      : "";
  const note = item.note ? `: ${item.note}` : "";

  return `- [${item.type}] ${item.title}${timeRange}${note}`;
}
