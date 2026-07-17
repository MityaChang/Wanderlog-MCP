import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { readConfig } from "./config.js";
import {
  createDefaultDraftItineraryStore,
  type DraftItineraryStore,
} from "./drafts/store.js";
import { WANDERLOG_SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerTripTools } from "./tools/trips.js";
import { WanderlogClient } from "./wanderlog/client.js";

type TripClient = Pick<
  WanderlogClient,
  | "addChecklist"
  | "addExpense"
  | "addHotel"
  | "addNote"
  | "addPlace"
  | "addSection"
  | "annotatePlace"
  | "createTrip"
  | "deleteSection"
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
  | "updateSection"
  | "updateTripDates"
>;

export function createServer(
  client?: TripClient,
  draftStore: DraftItineraryStore = createDefaultDraftItineraryStore(),
): McpServer {
  const server = new McpServer(
    {
      name: "wanderlog-itinerary-mcp",
      version: "0.1.0",
    },
    {
      instructions: WANDERLOG_SERVER_INSTRUCTIONS,
    },
  );

  registerTripTools(
    server,
    client ?? new WanderlogClient(readConfig(process.env)),
    draftStore,
  );

  return server;
}
