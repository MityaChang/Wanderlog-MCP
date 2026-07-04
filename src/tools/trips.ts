import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { WanderlogClient } from "../wanderlog/client.js";
import type {
  CreatedTrip,
  PlaceSearchResult,
  TripDay,
  TripDetail,
  TripItem,
  TripSummary,
} from "../wanderlog/types.js";

type TripClient = Pick<
  WanderlogClient,
  | "addChecklist"
  | "addHotel"
  | "addNote"
  | "addPlace"
  | "createTrip"
  | "getTrip"
  | "listTrips"
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

export function registerTripTools(server: McpServer, client: TripClient): void {
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
    "wanderlog_add_place",
    {
      title: "Add Wanderlog place",
      description: "Add a place to a day or unscheduled trip list.",
      inputSchema: addPlaceSchema,
      annotations: mutationAnnotations,
    },
    async (input) => formatTripMutationResult(await client.addPlace(input)),
  );

  server.registerTool(
    "wanderlog_add_note",
    {
      title: "Add Wanderlog note",
      description: "Add a practical note to a day or unscheduled trip list.",
      inputSchema: addNoteSchema,
      annotations: mutationAnnotations,
    },
    async (input) => formatTripMutationResult(await client.addNote(input)),
  );

  server.registerTool(
    "wanderlog_add_hotel",
    {
      title: "Add Wanderlog hotel",
      description: "Add lodging with check-in and check-out dates.",
      inputSchema: addHotelSchema,
      annotations: mutationAnnotations,
    },
    async (input) => formatTripMutationResult(await client.addHotel(input)),
  );

  server.registerTool(
    "wanderlog_add_checklist",
    {
      title: "Add Wanderlog checklist",
      description: "Add a trip-level or day-level checklist.",
      inputSchema: addChecklistSchema,
      annotations: mutationAnnotations,
    },
    async (input) => formatTripMutationResult(await client.addChecklist(input)),
  );
}

const mutationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
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
