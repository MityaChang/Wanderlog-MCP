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
  RenameDayInput,
  TripDay,
  TripDetail,
  TripExpense,
  TripItem,
  TripSummary,
  UpdateTripDatesInput,
} from "../wanderlog/types.js";

type TripClient = Pick<
  WanderlogClient,
  | "addChecklist"
  | "addExpense"
  | "addHotel"
  | "addNote"
  | "addPlace"
  | "annotatePlace"
  | "createTrip"
  | "editExpense"
  | "editNote"
  | "getGuide"
  | "getTrip"
  | "listExpenses"
  | "listTrips"
  | "renameDay"
  | "removeExpense"
  | "removeNote"
  | "removePlace"
  | "searchGuides"
  | "searchPlaces"
  | "updateTripDates"
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
  day: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional guide itinerary day number."),
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

const annotatePlaceSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  place: z.string().min(1).describe("Existing place name to update."),
  note: z.string().min(1).optional().describe("Inline place note."),
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

const removePlaceSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  place: z
    .string()
    .min(1)
    .describe(
      "Natural-language reference to the place to remove. Supports ordinal prefixes for duplicates: '1st X', '2nd X', 'last X'. Supports day filters: 'X on day 2' or 'X on 2026-04-02'.",
    ),
};

const editNoteSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  oldText: z.string().min(1).describe("Existing note text to replace."),
  newText: z.string().describe("Replacement note text."),
};

const removeNoteSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  text: z.string().min(1).describe("Note text to match and remove."),
};

const expenseFilterSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  description: z
    .string()
    .min(1)
    .optional()
    .describe("Optional case-insensitive expense description filter."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Optional exact expense date, YYYY-MM-DD."),
  amount: z.number().positive().optional().describe("Optional exact amount."),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe("Optional ISO 4217 currency code, e.g. USD."),
};

const editExpenseSchema = {
  ...expenseFilterSchema,
  description: z
    .string()
    .min(1)
    .describe("Case-insensitive expense description to edit."),
  newDescription: z.string().min(1).optional().describe("New description."),
  newAmount: z.number().positive().optional().describe("New amount."),
  newCurrency: z
    .string()
    .length(3)
    .optional()
    .describe("New ISO 4217 currency code, e.g. EUR."),
  newCategory: z.string().min(1).optional().describe("New category."),
  newDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("New expense date, YYYY-MM-DD."),
};

const removeExpenseSchema = {
  ...expenseFilterSchema,
  description: z
    .string()
    .min(1)
    .describe("Case-insensitive expense description to remove."),
};

const updateTripDatesSchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("New first day of the trip, YYYY-MM-DD."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("New last day of the trip, YYYY-MM-DD."),
  force: z
    .boolean()
    .optional()
    .describe("Allow removing day sections that contain itinerary blocks."),
};

const renameDaySchema = {
  tripId: z.string().min(1).describe("Wanderlog trip key."),
  day: z
    .string()
    .min(1)
    .describe("Day to rename, for example day 2 or 2026-04-02."),
  heading: z.string().describe("New day heading. Use empty string to clear."),
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
    async ({ guideKey, day }) =>
      formatTripDetailResult(await client.getGuide(guideKey, { day })),
  );

  server.registerTool(
    "wanderlog_add_place",
    {
      title: "Add Wanderlog place",
      description: "Add a place to one live Wanderlog day section.",
      inputSchema: addPlaceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.addPlace(input)),
  );

  server.registerTool(
    "wanderlog_add_note",
    {
      title: "Add Wanderlog note",
      description: "Add a practical note to one live Wanderlog day section.",
      inputSchema: addNoteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.addNote(input)),
  );

  server.registerTool(
    "wanderlog_add_hotel",
    {
      title: "Add Wanderlog hotel",
      description: "Add a hotel to the first live Wanderlog day section.",
      inputSchema: addHotelSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.addHotel(input)),
  );

  server.registerTool(
    "wanderlog_add_checklist",
    {
      title: "Add Wanderlog checklist",
      description: "Add a checklist to one live Wanderlog day section.",
      inputSchema: addChecklistSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.addChecklist(input)),
  );

  server.registerTool(
    "wanderlog_add_expense",
    {
      title: "Add Wanderlog expense",
      description: "Add an unlinked budget expense to a live Wanderlog trip.",
      inputSchema: addExpenseSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.addExpense(input)),
  );

  server.registerTool(
    "wanderlog_annotate_place",
    {
      title: "Annotate Wanderlog place",
      description: "Update an existing Wanderlog place with a note or time.",
      inputSchema: annotatePlaceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      formatTripMutationResult(await client.annotatePlace(input)),
  );

  server.registerTool(
    "wanderlog_edit_note",
    {
      title: "Edit Wanderlog note",
      description: "Replace text in one existing Wanderlog note.",
      inputSchema: editNoteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.editNote(input)),
  );

  server.registerTool(
    "wanderlog_remove_note",
    {
      title: "Remove Wanderlog note",
      description: "Remove one existing Wanderlog note by matching its text.",
      inputSchema: removeNoteSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.removeNote(input)),
  );

  server.registerTool(
    "wanderlog_remove_place",
    {
      title: "Remove Wanderlog place",
      description:
        "Remove one existing place from a live Wanderlog trip. Use an ordinal prefix (1st, 2nd, last) or a day filter (on day 2) to resolve duplicates.",
      inputSchema: removePlaceSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.removePlace(input)),
  );

  server.registerTool(
    "wanderlog_list_expenses",
    {
      title: "List Wanderlog expenses",
      description: "List live budget expenses for a Wanderlog trip.",
      inputSchema: expenseFilterSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      formatExpenseListResult(input.tripId, await client.listExpenses(input)),
  );

  server.registerTool(
    "wanderlog_edit_expense",
    {
      title: "Edit Wanderlog expense",
      description: "Edit one live Wanderlog budget expense.",
      inputSchema: editExpenseSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => formatTripMutationResult(await client.editExpense(input)),
  );

  server.registerTool(
    "wanderlog_remove_expense",
    {
      title: "Remove Wanderlog expense",
      description: "Remove one live Wanderlog budget expense.",
      inputSchema: removeExpenseSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      formatTripMutationResult(await client.removeExpense(input)),
  );

  server.registerTool(
    "wanderlog_update_trip_dates",
    {
      title: "Update Wanderlog trip dates",
      description: "Update a live Wanderlog trip date range.",
      inputSchema: updateTripDatesSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input: UpdateTripDatesInput) =>
      formatTripMutationResult(await client.updateTripDates(input)),
  );

  server.registerTool(
    "wanderlog_rename_day",
    {
      title: "Rename Wanderlog day",
      description: "Rename the heading for one live Wanderlog day section.",
      inputSchema: renameDaySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input: RenameDayInput) =>
      formatTripMutationResult(await client.renameDay(input)),
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

export function formatExpenseListResult(
  tripId: string,
  expenses: TripExpense[],
): CallToolResult {
  if (expenses.length === 0) {
    return {
      content: [
        { type: "text", text: `No expenses found for trip ${tripId}.` },
      ],
      structuredContent: { expenses },
    };
  }

  const noun = expenses.length === 1 ? "expense" : "expenses";
  const lines = expenses.map((expense, index) => {
    const currency = expense.currency ?? "?";
    const amount = expense.amount ?? "?";
    const category = expense.category ? ` (${expense.category})` : "";
    const date = expense.date ? ` on ${expense.date}` : "";
    return `${index + 1}. ${currency} ${amount} - ${expense.description}${category}${date}`;
  });

  return {
    content: [
      {
        type: "text",
        text: `${expenses.length} ${noun} for trip ${tripId}:\n${lines.join("\n")}`,
      },
    ],
    structuredContent: { expenses },
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
