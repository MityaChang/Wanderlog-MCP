import type {
  AddChecklistInput,
  AddHotelInput,
  AddNoteInput,
  AddPlaceInput,
  AnnotatePlaceInput,
  CreatedTrip,
  CreateTripInput,
  EditNoteInput,
  GuideSearchResult,
  PlaceSearchResult,
  RawWanderlogGeo,
  RawWanderlogGuide,
  RawWanderlogGuidesForGeo,
  RawWanderlogPlaceSuggestion,
  RawWanderlogTrip,
  RawWanderlogTripDay,
  RawWanderlogTripItem,
  RawWanderlogTripSection,
  RemoveNoteInput,
  SearchGuidesInput,
  SearchPlacesInput,
  TripDay,
  TripDetail,
  TripItem,
  TripMutationResult,
  TripSummary,
  WanderlogCreateTripResponse,
  WanderlogGeoAutocompleteResponse,
  WanderlogGuidesForGeoResponse,
  WanderlogPlaceAutocompleteResponse,
  WanderlogTripDetailResponse,
  WanderlogTripListResponse,
} from "./types.js";
import type { ServerConfig } from "../config.js";
import type { Json0Op } from "../ot/apply.js";
import { TripMutationCache } from "./trip-cache.js";

export const LIST_TRIPS_PATH = "/api/tripPlans/home";

export function getTripPath(tripId: string): string {
  return `/api/tripPlans/${encodeURIComponent(tripId)}?clientSchemaVersion=2&registerView=true`;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class WanderlogClient {
  private readonly fetchImpl: FetchLike;
  private readonly tripMutationCache: TripMutationCache;

  constructor(
    private readonly config: ServerConfig,
    fetchImpl: FetchLike = fetch,
    tripMutationCache: TripMutationCache = TripMutationCache.fromConfig(config),
  ) {
    this.fetchImpl = fetchImpl;
    this.tripMutationCache = tripMutationCache;
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

  async searchGuides(input: SearchGuidesInput): Promise<GuideSearchResult> {
    const geos = mapGeos(
      await this.request(
        "GET",
        `/api/geo/autocomplete/${encodeURIComponent(input.destination)}`,
      ),
    ).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const [geo] = geos;

    if (!geo) {
      throw new Error(
        `No Wanderlog destination found for ${input.destination}.`,
      );
    }

    const raw = (await this.request(
      "GET",
      `/api/tripPlans/browse/guides/${encodeURIComponent(String(geo.id))}`,
    )) as WanderlogGuidesForGeoResponse;
    const guidesForGeo = raw.data?.geoWithGoodGuides;

    if (!guidesForGeo) {
      return {
        geo: { id: geo.id, name: geo.name, country: geo.countryName ?? null },
        guides: [],
      };
    }

    return mapGuideSearchResult(guidesForGeo, geo);
  }

  async getGuide(
    guideKey: string,
    options: { day?: number } = {},
  ): Promise<TripDetail | null> {
    return mapTripDetail(
      await this.request(
        "GET",
        `/api/tripPlans/${encodeURIComponent(guideKey)}?clientSchemaVersion=2`,
      ),
      options,
    );
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

  async annotatePlace(input: AnnotatePlaceInput): Promise<TripMutationResult> {
    if (!input.note && !input.startTime && !input.endTime) {
      throw new Error(
        "At least one of note, startTime, or endTime is required.",
      );
    }

    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = findPlaceBlock(snapshot, input.place);
    const block = match.block as Record<string, unknown>;
    const path = [
      "itinerary",
      "sections",
      match.sectionIndex,
      "blocks",
      match.blockIndex,
    ];
    const ops: Json0Op[] = [];

    if (input.note) {
      ops.push({
        p: [...path, "text"],
        t: "rich-text",
        o: [{ insert: `${input.note}\n` }],
      });
    }
    if (input.startTime) {
      ops.push(
        createObjectSetOp(
          [...path, "startTime"],
          block,
          "startTime",
          input.startTime,
        ),
      );
    }
    if (input.endTime) {
      ops.push(
        createObjectSetOp(
          [...path, "endTime"],
          block,
          "endTime",
          input.endTime,
        ),
      );
    }

    await this.tripMutationCache.submit(input.tripId, ops);

    return {
      tripId: input.tripId,
      message: `Updated ${match.name} in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async editNote(input: EditNoteInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = findNoteTextMatch(snapshot, input.oldText);
    const replacementOps: Array<Record<string, unknown>> = [];
    if (match.offset > 0) {
      replacementOps.push({ retain: match.offset });
    }
    replacementOps.push({ delete: input.oldText.length });
    if (input.newText.length > 0) {
      replacementOps.push({ insert: input.newText });
    }

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: [
          "itinerary",
          "sections",
          match.sectionIndex,
          "blocks",
          match.blockIndex,
          "text",
        ],
        t: "rich-text",
        o: replacementOps,
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Updated note in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async removeNote(input: RemoveNoteInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = findNoteTextMatch(snapshot, input.text);

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: [
          "itinerary",
          "sections",
          match.sectionIndex,
          "blocks",
          match.blockIndex,
        ],
        ld: match.block,
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Removed note from ${getSnapshotTitle(snapshot)}.`,
    };
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

function mapGuideSearchResult(
  raw: RawWanderlogGuidesForGeo,
  resolvedGeo: RawWanderlogGeo & { id: number; name: string },
): GuideSearchResult {
  return {
    geo: {
      id: typeof raw.id === "number" ? raw.id : resolvedGeo.id,
      name: raw.name ?? resolvedGeo.name,
      country: raw.countryName ?? resolvedGeo.countryName ?? null,
    },
    guides: (raw.guides ?? [])
      .filter(
        (
          guide,
        ): guide is RawWanderlogGuide & { key: string; title: string } => {
          return (
            typeof guide.key === "string" &&
            guide.key.length > 0 &&
            typeof guide.title === "string" &&
            guide.title.length > 0
          );
        },
      )
      .map((guide) => ({
        id: guide.key,
        title: guide.title,
        author: guide.user?.username ?? "unknown",
        placeCount: guide.placeCount ?? null,
        viewCount: guide.viewCount ?? null,
        likeCount: guide.likeCount ?? null,
        blurb: guide.authorBlurb ?? null,
        editedAt: guide.editedAt ?? null,
        url: `https://wanderlog.com/view/${guide.key}`,
      })),
  };
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

function createObjectSetOp(
  path: Array<string | number>,
  source: Record<string, unknown>,
  key: string,
  value: string,
): Json0Op {
  const op: Json0Op = { p: path, oi: value };
  if (key in source) {
    op.od = source[key];
  }
  return op;
}

function findPlaceBlock(
  snapshot: unknown,
  placeName: string,
): { sectionIndex: number; blockIndex: number; block: unknown; name: string } {
  const matches: Array<{
    sectionIndex: number;
    blockIndex: number;
    block: unknown;
    name: string;
  }> = [];
  const normalizedPlace = normalizeSearchText(placeName);

  forEachBlock(snapshot, (block, sectionIndex, blockIndex) => {
    if (!isRecord(block) || block.type !== "place" || !isRecord(block.place)) {
      return;
    }
    const name = typeof block.place.name === "string" ? block.place.name : "";
    if (normalizeSearchText(name) === normalizedPlace) {
      matches.push({ sectionIndex, blockIndex, block, name });
    }
  });

  if (matches.length === 0) {
    throw new Error(`No place matching "${placeName}" found.`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple places matching "${placeName}" found.`);
  }
  return matches[0]!;
}

function findNoteTextMatch(
  snapshot: unknown,
  query: string,
): {
  sectionIndex: number;
  blockIndex: number;
  block: unknown;
  offset: number;
} {
  const matches: Array<{
    sectionIndex: number;
    blockIndex: number;
    block: unknown;
    offset: number;
  }> = [];
  const lowerQuery = query.toLowerCase();

  forEachBlock(snapshot, (block, sectionIndex, blockIndex) => {
    if (!isRecord(block) || block.type !== "note") {
      return;
    }
    const text = extractDeltaText(block.text);
    const offset = text.toLowerCase().indexOf(lowerQuery);
    if (offset >= 0) {
      matches.push({ sectionIndex, blockIndex, block, offset });
    }
  });

  if (matches.length === 0) {
    throw new Error(`No note matching "${query}" found.`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple notes matching "${query}" found.`);
  }
  return matches[0]!;
}

function forEachBlock(
  snapshot: unknown,
  visitor: (block: unknown, sectionIndex: number, blockIndex: number) => void,
): void {
  if (!isRecord(snapshot) || !isRecord(snapshot.itinerary)) {
    return;
  }
  const sections = snapshot.itinerary.sections;
  if (!Array.isArray(sections)) {
    return;
  }
  sections.forEach((section, sectionIndex) => {
    if (!isRecord(section) || !Array.isArray(section.blocks)) {
      return;
    }
    section.blocks.forEach((block, blockIndex) => {
      visitor(block, sectionIndex, blockIndex);
    });
  });
}

function extractDeltaText(delta: unknown): string {
  if (!isRecord(delta) || !Array.isArray(delta.ops)) {
    return "";
  }
  return delta.ops
    .map((op) => {
      if (!isRecord(op) || typeof op.insert !== "string") {
        return "";
      }
      return op.insert;
    })
    .join("");
}

function getSnapshotTitle(snapshot: unknown): string {
  if (isRecord(snapshot) && typeof snapshot.title === "string") {
    return `"${snapshot.title}"`;
  }
  return "the trip";
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/[\s\-–—]+/g, " ")
    .trim()
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
