import type {
  AddChecklistInput,
  AddHotelInput,
  AddNoteInput,
  AddPlaceInput,
  CreatedTrip,
  CreateTripInput,
  PlaceSearchResult,
  RawWanderlogGeo,
  RawWanderlogPlaceSuggestion,
  RawWanderlogTrip,
  RawWanderlogTripDay,
  RawWanderlogTripItem,
  RawWanderlogTripSection,
  SearchPlacesInput,
  TripDay,
  TripDetail,
  TripItem,
  TripMutationResult,
  TripSummary,
  WanderlogCreateTripResponse,
  WanderlogGeoAutocompleteResponse,
  WanderlogPlaceAutocompleteResponse,
  WanderlogTripDetailResponse,
  WanderlogTripListResponse,
} from "./types.js";
import type { ServerConfig } from "../config.js";

export const LIST_TRIPS_PATH = "/api/tripPlans/home";

export function getTripPath(tripId: string): string {
  return `/api/tripPlans/${encodeURIComponent(tripId)}?clientSchemaVersion=2&registerView=true`;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class WanderlogClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: ServerConfig,
    fetchImpl: FetchLike = fetch,
  ) {
    this.fetchImpl = fetchImpl;
  }

  async listTrips(): Promise<TripSummary[]> {
    return mapTripSummaries(await this.request("GET", LIST_TRIPS_PATH));
  }

  async getTrip(
    tripId: string,
    options: { day?: number } = {},
  ): Promise<TripDetail | null> {
    return mapTripDetail(
      await this.request("GET", getTripPath(tripId)),
      options,
    );
  }

  async createTrip(input: CreateTripInput): Promise<CreatedTrip> {
    const geos = mapGeos(
      await this.request(
        "GET",
        `/api/geo/autocomplete/${encodeURIComponent(input.destination)}`,
      ),
    );
    const [geo] = geos;

    if (!geo) {
      throw new Error(
        `No Wanderlog destination found for ${input.destination}.`,
      );
    }

    const raw = (await this.request("POST", "/api/tripPlans", {
      geoIds: [geo.id],
      initialMapsPlaceIds: [],
      initialEmailId: null,
      type: "plan",
      startDate: input.startDate,
      endDate: input.endDate,
      privacy: input.privacy ?? "private",
      isMapEmbed: false,
      title: input.title ?? null,
      language: "en",
    })) as WanderlogCreateTripResponse;

    if (!raw.data?.key || raw.data.id === undefined || raw.data.id === null) {
      throw new Error("Wanderlog trip creation returned no trip data.");
    }

    return {
      id: raw.data.key,
      numericId: raw.data.id,
      title: raw.data.title ?? input.title ?? `Trip to ${geo.name}`,
      destination: formatGeoLabel(geo),
      startDate: input.startDate,
      endDate: input.endDate,
      url: `https://wanderlog.com/view/${raw.data.key}`,
    };
  }

  async searchPlaces(input: SearchPlacesInput): Promise<PlaceSearchResult[]> {
    const request = {
      input: input.query,
      sessiontoken: crypto.randomUUID(),
      location: { latitude: input.latitude, longitude: input.longitude },
      radius: 15000,
      language: "en",
    };
    const raw = (await this.request(
      "GET",
      `/api/placesAPI/autocomplete/v2?request=${encodeURIComponent(JSON.stringify(request))}`,
    )) as WanderlogPlaceAutocompleteResponse;

    return (raw.data ?? [])
      .filter(
        (
          place,
        ): place is RawWanderlogPlaceSuggestion & { place_id: string } => {
          return (
            typeof place.place_id === "string" && place.place_id.length > 0
          );
        },
      )
      .map((place) => ({
        id: place.place_id,
        title:
          place.structured_formatting?.main_text ??
          place.description ??
          "Untitled place",
        description: place.structured_formatting?.secondary_text ?? null,
      }));
  }

  async addPlace(input: AddPlaceInput): Promise<TripMutationResult> {
    return this.mutationTransportNotImplemented(input.tripId, "add places");
  }

  async addNote(input: AddNoteInput): Promise<TripMutationResult> {
    return this.mutationTransportNotImplemented(input.tripId, "add notes");
  }

  async addHotel(input: AddHotelInput): Promise<TripMutationResult> {
    return this.mutationTransportNotImplemented(input.tripId, "add hotels");
  }

  async addChecklist(input: AddChecklistInput): Promise<TripMutationResult> {
    return this.mutationTransportNotImplemented(input.tripId, "add checklists");
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: "application/json",
      cookie: `connect.sid=${this.config.wanderlogCookie}`,
    };

    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await this.fetchImpl(`https://wanderlog.com${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Wanderlog request failed with status ${response.status}.`,
      );
    }

    return readJsonResponse(response);
  }

  private mutationTransportNotImplemented(
    tripId: string,
    action: string,
  ): Promise<TripMutationResult> {
    throw new Error(
      `Wanderlog mutation transport is not implemented yet, so this server cannot ${action} in trip ${tripId}. Create the trip with wanderlog_create_trip, search candidates with wanderlog_search_places, then implement the ShareDB mutation transport before writing itinerary blocks.`,
    );
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "Wanderlog returned HTML instead of JSON. Check that WANDERLOG_COOKIE is fresh and the Wanderlog API path is still valid.",
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(
      "Wanderlog returned invalid JSON. Check that the Wanderlog API response shape is still supported.",
    );
  }
}

export function mapTripSummaries(raw: unknown): TripSummary[] {
  const trips = isTripListResponse(raw)
    ? [
        ...(raw.trips ?? []),
        ...(raw.ownTripPlans ?? []),
        ...(raw.friendsPrivateSharedTripPlans ?? []),
        ...(raw.friendsTripPlans ?? []),
      ]
    : [];

  return trips
    .filter((trip): trip is RawWanderlogTrip => {
      return getTripIdentifier(trip) !== null;
    })
    .map((trip) => {
      const id = getTripIdentifier(trip) ?? "";
      const slug =
        typeof trip.slug === "string" && trip.slug.length > 0
          ? trip.slug
          : null;

      return {
        id,
        title: trip.name ?? trip.title ?? "Untitled trip",
        destination: trip.destination ?? null,
        startDate: trip.startDate ?? null,
        endDate: trip.endDate ?? null,
        url: slug
          ? `https://wanderlog.com/view/${id}/${slug}`
          : `https://wanderlog.com/view/${id}`,
      };
    });
}

export function mapTripDetail(
  raw: unknown,
  options: { day?: number } = {},
): TripDetail | null {
  const trip = isTripDetailResponse(raw) ? (raw.trip ?? raw.tripPlan) : null;

  if (!trip || getTripIdentifier(trip) === null) {
    return null;
  }

  const [summary] = mapTripSummaries({ trips: [trip] });

  if (!summary) {
    return null;
  }

  const rawDays = trip.days ?? trip.itinerary?.sections ?? [];
  const days = rawDays
    .map(mapTripDay)
    .filter((day): day is TripDay => day !== null)
    .filter((day) => options.day === undefined || day.day === options.day);

  return {
    ...summary,
    forwardingEmail: trip.forwardingEmail ?? null,
    days,
    generalItems: (trip.generalItems ?? []).map(mapTripItem),
  };
}

function mapTripDay(
  day: RawWanderlogTripDay | RawWanderlogTripSection,
  index: number,
): TripDay | null {
  const dayNumber =
    "day" in day && typeof day.day === "number" ? day.day : index + 1;

  return {
    day: dayNumber,
    date: day.date ?? null,
    title: getTripDayTitle(day),
    items: getTripDayItems(day).map(mapTripItem),
  };
}

function getTripDayTitle(
  day: RawWanderlogTripDay | RawWanderlogTripSection,
): string | null {
  if ("heading" in day) {
    return day.heading ?? null;
  }

  return day.title ?? null;
}

function getTripDayItems(
  day: RawWanderlogTripDay | RawWanderlogTripSection,
): RawWanderlogTripItem[] {
  if ("blocks" in day) {
    return day.blocks ?? [];
  }

  return day.items ?? [];
}

function getTripIdentifier(trip: RawWanderlogTrip): string | null {
  if (typeof trip.key === "string" && trip.key.length > 0) {
    return trip.key;
  }

  if (trip.id !== undefined && trip.id !== null) {
    return String(trip.id);
  }

  return null;
}

function mapGeos(
  raw: unknown,
): Array<RawWanderlogGeo & { id: number; name: string }> {
  const data = (raw as WanderlogGeoAutocompleteResponse).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(
    (geo): geo is RawWanderlogGeo & { id: number; name: string } =>
      typeof geo.id === "number" &&
      typeof geo.name === "string" &&
      geo.name.length > 0,
  );
}

function formatGeoLabel(geo: RawWanderlogGeo & { name: string }): string {
  if (geo.stateName && geo.countryName) {
    return `${geo.name}, ${geo.stateName}, ${geo.countryName}`;
  }

  if (geo.countryName) {
    return `${geo.name}, ${geo.countryName}`;
  }

  return geo.name;
}

function mapTripItem(item: RawWanderlogTripItem): TripItem {
  return {
    type: item.type ?? "item",
    title: item.title ?? "Untitled item",
    note: item.note ?? null,
    startTime: item.startTime ?? null,
    endTime: item.endTime ?? null,
  };
}

function isTripListResponse(raw: unknown): raw is WanderlogTripListResponse {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (Array.isArray((raw as WanderlogTripListResponse).trips) ||
      Array.isArray((raw as WanderlogTripListResponse).ownTripPlans) ||
      Array.isArray(
        (raw as WanderlogTripListResponse).friendsPrivateSharedTripPlans,
      ) ||
      Array.isArray((raw as WanderlogTripListResponse).friendsTripPlans))
  );
}

function isTripDetailResponse(
  raw: unknown,
): raw is WanderlogTripDetailResponse {
  return (
    typeof raw === "object" &&
    raw !== null &&
    ((typeof (raw as WanderlogTripDetailResponse).trip === "object" &&
      (raw as WanderlogTripDetailResponse).trip !== null) ||
      (typeof (raw as WanderlogTripDetailResponse).tripPlan === "object" &&
        (raw as WanderlogTripDetailResponse).tripPlan !== null))
  );
}
