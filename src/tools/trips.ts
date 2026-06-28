import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { WanderlogClient } from "../wanderlog/client.js";
import type {
  TripDay,
  TripDetail,
  TripItem,
  TripSummary,
} from "../wanderlog/types.js";

type TripClient = Pick<WanderlogClient, "getTrip" | "listTrips">;

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
