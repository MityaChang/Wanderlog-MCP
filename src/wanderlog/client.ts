import type {
  AddChecklistInput,
  AddExpenseInput,
  AddHotelInput,
  AddNoteInput,
  AddPlaceInput,
  AnnotatePlaceInput,
  CreatedTrip,
  CreateTripInput,
  EditExpenseInput,
  EditNoteInput,
  RemovePlaceInput,
  GuideSearchResult,
  ListExpensesInput,
  PlaceSearchResult,
  RawWanderlogGeo,
  RawWanderlogGuide,
  RawWanderlogGuidesForGeo,
  RawWanderlogPlaceSuggestion,
  RawWanderlogTrip,
  RawWanderlogTripDay,
  RawWanderlogTripItem,
  RawWanderlogTripSection,
  RenameDayInput,
  RemoveExpenseInput,
  RemoveNoteInput,
  SearchGuidesInput,
  SearchPlacesInput,
  TripDay,
  TripDetail,
  TripExpense,
  TripItem,
  TripMutationResult,
  TripSummary,
  UpdateTripDatesInput,
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
import { resolvePlaceRef } from "./resolvers/place-ref.js";

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
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = input.day
      ? findDaySection(snapshot, input.day)
      : findFirstDaySection(snapshot);
    const blocks = getSectionBlocks(match.section);
    const placeBlock = createPlaceBlock(input);

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: ["itinerary", "sections", match.index, "blocks", blocks.length],
        li: placeBlock,
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Added ${input.place} to day ${match.date} in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async addNote(input: AddNoteInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = input.day
      ? findDaySection(snapshot, input.day)
      : findFirstDaySection(snapshot);
    const blocks = getSectionBlocks(match.section);
    const noteBlock = createNoteBlock(input.text);

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: ["itinerary", "sections", match.index, "blocks", blocks.length],
        li: noteBlock,
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Added note to day ${match.date} in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async addHotel(input: AddHotelInput): Promise<TripMutationResult> {
    if (input.checkOut <= input.checkIn) {
      throw new Error(
        `checkOut (${input.checkOut}) must be after checkIn (${input.checkIn}).`,
      );
    }

    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = findFirstDaySection(snapshot);
    const blocks = getSectionBlocks(match.section);

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: ["itinerary", "sections", match.index, "blocks", blocks.length],
        li: {
          type: "place",
          place: { name: input.hotel },
          hotel: { checkIn: input.checkIn, checkOut: input.checkOut },
        },
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Added ${input.hotel} to day ${match.date} in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async addExpense(input: AddExpenseInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const expenses = getRawExpenses(snapshot);
    const today = new Date().toISOString().slice(0, 10);
    const expense: Record<string, unknown> = {
      id: Date.now(),
      description: input.title,
      amount: {
        amount: input.amount,
        currencyCode: input.currency.toUpperCase(),
      },
      category: "other",
      date: today,
      associatedDate: today,
      blockId: null,
      paidBy: input.paidBy,
      splitWith: input.splitWith ?? [],
    };
    if (input.note !== undefined) {
      expense.note = input.note;
    }

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: ["itinerary", "budget", "expenses", expenses.length],
        li: expense,
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Added expense ${input.title} to ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async addChecklist(input: AddChecklistInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = input.day
      ? findDaySection(snapshot, input.day)
      : findFirstDaySection(snapshot);
    const blocks = getSectionBlocks(match.section);
    const checklistBlock = createChecklistBlock(
      input.items,
      input.title ?? "Checklist",
    );

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: ["itinerary", "sections", match.index, "blocks", blocks.length],
        li: checklistBlock,
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Added checklist to day ${match.date} in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async annotatePlace(input: AnnotatePlaceInput): Promise<TripMutationResult> {
    if (!input.note && !input.startTime && !input.endTime) {
      throw new Error(
        "At least one of note, startTime, or endTime is required.",
      );
    }

    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const resolved = resolvePlaceRef(snapshot, input.place);

    if (resolved.kind === "none") {
      throw new Error(`No place matching "${input.place}" found.`);
    }
    if (resolved.kind === "ambiguous") {
      const names = resolved.candidates.map((c) => c.name).join(", ");
      throw new Error(
        `Multiple places matching "${input.place}" found: ${names}.`,
      );
    }

    const match = resolved.match;
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

  async listExpenses(input: ListExpensesInput): Promise<TripExpense[]> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    return findExpenseMatches(snapshot, input).map(({ index, expense }) =>
      mapTripExpense(index, expense),
    );
  }

  async editExpense(input: EditExpenseInput): Promise<TripMutationResult> {
    const hasNewValue =
      input.newDescription !== undefined ||
      input.newAmount !== undefined ||
      input.newCurrency !== undefined ||
      input.newCategory !== undefined ||
      input.newDate !== undefined;
    if (!hasNewValue) {
      throw new Error("At least one new expense field is required.");
    }

    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = findSingleExpenseMatch(snapshot, input);
    const ops = buildExpenseEditOps(match.index, match.expense, input);

    if (ops.length === 0) {
      return {
        tripId: input.tripId,
        message: `No changes needed for ${formatExpenseLabel(match.expense)} in ${getSnapshotTitle(snapshot)}.`,
      };
    }

    await this.tripMutationCache.submit(input.tripId, ops);

    return {
      tripId: input.tripId,
      message: `Updated expense ${formatExpenseLabel(match.expense)} in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async removeExpense(input: RemoveExpenseInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = findSingleExpenseMatch(snapshot, input);

    await this.tripMutationCache.submit(input.tripId, [
      {
        p: ["itinerary", "budget", "expenses", match.index],
        ld: match.expense,
      },
    ]);

    return {
      tripId: input.tripId,
      message: `Removed expense ${formatExpenseLabel(match.expense)} from ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async updateTripDates(
    input: UpdateTripDatesInput,
  ): Promise<TripMutationResult> {
    if (input.endDate < input.startDate) {
      throw new Error(
        `endDate (${input.endDate}) is before startDate (${input.startDate}).`,
      );
    }

    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const ops = buildUpdateTripDateOps(snapshot, input);

    if (ops.length === 0) {
      return {
        tripId: input.tripId,
        message: `Trip dates already match ${input.startDate} to ${input.endDate}.`,
      };
    }

    await this.tripMutationCache.submit(input.tripId, ops);

    return {
      tripId: input.tripId,
      message: `Updated trip dates in ${getSnapshotTitle(snapshot)} to ${input.startDate} to ${input.endDate}.`,
    };
  }

  async renameDay(input: RenameDayInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const match = findDaySection(snapshot, input.day);
    const section = match.section;
    const oldHeading =
      typeof section.heading === "string" ? section.heading : undefined;

    if (oldHeading === input.heading) {
      return {
        tripId: input.tripId,
        message: `Day ${match.date} already has heading "${input.heading}".`,
      };
    }

    await this.tripMutationCache.submit(input.tripId, [
      createObjectSetOp(
        ["itinerary", "sections", match.index, "heading"],
        section,
        "heading",
        input.heading,
      ),
    ]);

    return {
      tripId: input.tripId,
      message: `Renamed day ${match.date} in ${getSnapshotTitle(snapshot)}.`,
    };
  }

  async removePlace(input: RemovePlaceInput): Promise<TripMutationResult> {
    const snapshot = await this.tripMutationCache.getSnapshot(input.tripId);
    const resolved = resolvePlaceRef(snapshot, input.place);

    if (resolved.kind === "none") {
      throw new Error(`No place matching "${input.place}" found.`);
    }
    if (resolved.kind === "ambiguous") {
      const names = resolved.candidates.map((c) => c.name).join(", ");
      throw new Error(
        `Multiple places matching "${input.place}" found: ${names}.`,
      );
    }

    const match = resolved.match;

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
      message: `Removed ${match.name} from ${getSnapshotTitle(snapshot)}.`,
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

function createPlaceBlock(input: AddPlaceInput): Record<string, unknown> {
  return {
    type: "place",
    place: { name: input.place },
    ...(input.note !== undefined && {
      text: { ops: [{ insert: `${input.note}\n` }] },
    }),
    ...(input.startTime !== undefined && { startTime: input.startTime }),
    ...(input.endTime !== undefined && { endTime: input.endTime }),
  };
}

function createObjectSetOp(
  path: Array<string | number>,
  source: Record<string, unknown>,
  key: string,
  value: string | number,
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

function createNoteBlock(text: string): Record<string, unknown> {
  return {
    type: "note",
    text: { ops: [{ insert: text.endsWith("\n") ? text : `${text}\n` }] },
  };
}

function createChecklistBlock(
  items: string[],
  title: string,
): Record<string, unknown> {
  return {
    type: "checklist",
    title,
    items: items.map((text) => ({
      checked: false,
      text: { ops: [{ insert: text.endsWith("\n") ? text : `${text}\n` }] },
    })),
  };
}

function findExpenseMatches(
  snapshot: unknown,
  filters: ListExpensesInput,
): Array<{ index: number; expense: Record<string, unknown> }> {
  const expenses = getRawExpenses(snapshot);
  const description = filters.description?.toLowerCase();
  const currency = filters.currency?.toUpperCase();

  return expenses.flatMap((expense, index) => {
    if (!isRecord(expense)) {
      return [];
    }
    if (description) {
      const expenseDescription = getExpenseDescription(expense).toLowerCase();
      if (!expenseDescription.includes(description)) {
        return [];
      }
    }
    if (filters.date && expense.date !== filters.date) {
      return [];
    }
    if (
      filters.amount !== undefined &&
      getExpenseAmount(expense) !== filters.amount
    ) {
      return [];
    }
    if (currency && getExpenseCurrency(expense) !== currency) {
      return [];
    }
    return [{ index, expense }];
  });
}

function findSingleExpenseMatch(
  snapshot: unknown,
  filters: RemoveExpenseInput,
): { index: number; expense: Record<string, unknown> } {
  const matches = findExpenseMatches(snapshot, filters);
  if (matches.length === 0) {
    throw new Error(`No expense matching "${filters.description}" found.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple expenses matching "${filters.description}" found.`,
    );
  }
  return matches[0]!;
}

function buildExpenseEditOps(
  index: number,
  expense: Record<string, unknown>,
  input: EditExpenseInput,
): Json0Op[] {
  const basePath = ["itinerary", "budget", "expenses", index];
  const ops: Json0Op[] = [];

  if (input.newDescription !== undefined) {
    pushExpenseSetOp(
      ops,
      [...basePath, "description"],
      expense,
      "description",
      input.newDescription,
    );
  }
  if (input.newCategory !== undefined) {
    pushExpenseSetOp(
      ops,
      [...basePath, "category"],
      expense,
      "category",
      input.newCategory,
    );
  }
  if (input.newAmount !== undefined) {
    const amount = getExpenseAmountRecord(expense);
    pushExpenseSetOp(
      ops,
      [...basePath, "amount", "amount"],
      amount,
      "amount",
      input.newAmount,
    );
  }
  if (input.newCurrency !== undefined) {
    const amount = getExpenseAmountRecord(expense);
    pushExpenseSetOp(
      ops,
      [...basePath, "amount", "currencyCode"],
      amount,
      "currencyCode",
      input.newCurrency.toUpperCase(),
    );
  }
  if (input.newDate !== undefined) {
    pushExpenseSetOp(
      ops,
      [...basePath, "date"],
      expense,
      "date",
      input.newDate,
    );
    pushExpenseSetOp(
      ops,
      [...basePath, "associatedDate"],
      expense,
      "associatedDate",
      input.newDate,
    );
  }

  return ops;
}

function pushExpenseSetOp(
  ops: Json0Op[],
  path: Array<string | number>,
  source: Record<string, unknown>,
  key: string,
  value: string | number,
): void {
  if (source[key] === value) {
    return;
  }
  ops.push(createObjectSetOp(path, source, key, value));
}

function getRawExpenses(snapshot: unknown): unknown[] {
  if (!isRecord(snapshot) || !isRecord(snapshot.itinerary)) {
    return [];
  }
  const budget = snapshot.itinerary.budget;
  if (!isRecord(budget) || !Array.isArray(budget.expenses)) {
    return [];
  }
  return budget.expenses;
}

function mapTripExpense(
  index: number,
  expense: Record<string, unknown>,
): TripExpense {
  return {
    index,
    id:
      typeof expense.id === "string" || typeof expense.id === "number"
        ? expense.id
        : null,
    amount: getExpenseAmount(expense),
    currency: getExpenseCurrency(expense),
    category: typeof expense.category === "string" ? expense.category : null,
    description: getExpenseDescription(expense),
    date: typeof expense.date === "string" ? expense.date : null,
  };
}

function formatExpenseLabel(expense: Record<string, unknown>): string {
  const currency = getExpenseCurrency(expense) ?? "?";
  const amount = getExpenseAmount(expense) ?? "?";
  return `${currency} ${amount} - ${getExpenseDescription(expense)}`;
}

function getExpenseDescription(expense: Record<string, unknown>): string {
  return typeof expense.description === "string" ? expense.description : "";
}

function getExpenseAmount(expense: Record<string, unknown>): number | null {
  const amount = getExpenseAmountRecord(expense).amount;
  return typeof amount === "number" ? amount : null;
}

function getExpenseCurrency(expense: Record<string, unknown>): string | null {
  const currency = getExpenseAmountRecord(expense).currencyCode;
  return typeof currency === "string" ? currency.toUpperCase() : null;
}

function getExpenseAmountRecord(
  expense: Record<string, unknown>,
): Record<string, unknown> {
  return isRecord(expense.amount) ? expense.amount : {};
}

function buildUpdateTripDateOps(
  snapshot: unknown,
  input: UpdateTripDatesInput,
): Json0Op[] {
  const sections = getItinerarySections(snapshot);
  const currentDaysByDate = new Map<
    string,
    { index: number; section: Record<string, unknown> }
  >();

  sections.forEach((section, index) => {
    if (
      isRecord(section) &&
      section.mode === "dayPlan" &&
      typeof section.date === "string"
    ) {
      currentDaysByDate.set(section.date, { index, section });
    }
  });

  const targetDates = enumerateDates(input.startDate, input.endDate);
  const targetDateSet = new Set(targetDates);
  const removedDays = Array.from(currentDaysByDate.entries())
    .filter(([date]) => !targetDateSet.has(date))
    .map(([date, day]) => ({ date, ...day }));

  if (!input.force) {
    const nonEmptyRemovedDays = removedDays.filter(
      ({ section }) => getSectionBlocks(section).length > 0,
    );
    if (nonEmptyRemovedDays.length > 0) {
      throw new Error(
        `Updating trip dates would delete content from ${nonEmptyRemovedDays.length} day(s). Pass force to remove them.`,
      );
    }
  }

  const ops: Json0Op[] = [];
  const removedSections = new Set(removedDays.map((day) => day.section));
  const simulatedSections = sections.filter(
    (section) => !removedSections.has(section as Record<string, unknown>),
  );

  for (const day of removedDays.sort((a, b) => b.index - a.index)) {
    ops.push({
      p: ["itinerary", "sections", day.index],
      ld: day.section,
    });
  }

  for (const date of targetDates) {
    if (currentDaysByDate.has(date)) {
      continue;
    }
    const newSection = createEmptyDaySection(date);
    const insertIndex = findDayInsertIndex(simulatedSections, date);
    ops.push({
      p: ["itinerary", "sections", insertIndex],
      li: newSection,
    });
    simulatedSections.splice(insertIndex, 0, newSection);
  }

  if (isRecord(snapshot)) {
    if (snapshot.startDate !== input.startDate) {
      ops.push(
        createObjectSetOp(
          ["startDate"],
          snapshot,
          "startDate",
          input.startDate,
        ),
      );
    }
    if (snapshot.endDate !== input.endDate) {
      ops.push(
        createObjectSetOp(["endDate"], snapshot, "endDate", input.endDate),
      );
    }
    if (snapshot.days !== targetDates.length) {
      ops.push(
        createObjectSetOp(["days"], snapshot, "days", targetDates.length),
      );
    }
  }

  return ops;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const dates: string[] = [];

  for (let time = start; time <= end; time += dayMs) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }

  return dates;
}

function parseIsoDateUtc(date: string): number {
  return Date.UTC(
    Number.parseInt(date.slice(0, 4), 10),
    Number.parseInt(date.slice(5, 7), 10) - 1,
    Number.parseInt(date.slice(8, 10), 10),
  );
}

function createEmptyDaySection(date: string): Record<string, unknown> {
  return {
    id: createMutationId(),
    type: "normal",
    mode: "dayPlan",
    heading: "",
    text: { ops: [{ insert: "\n" }] },
    date,
    blocks: [],
    placeMarkerColor: "#3498db",
    placeMarkerIcon: "map-marker",
  };
}

function createMutationId(): number {
  return Math.floor(Date.now() * 1000 + Math.random() * 1000);
}

function findDayInsertIndex(sections: unknown[], date: string): number {
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (
      isRecord(section) &&
      section.mode === "dayPlan" &&
      typeof section.date === "string" &&
      section.date > date
    ) {
      return index;
    }
  }
  return sections.length;
}

function findDaySection(
  snapshot: unknown,
  query: string,
): { index: number; section: Record<string, unknown>; date: string } {
  const normalizedQuery = normalizeSearchText(query);
  const dayOrdinal = parseDayOrdinal(normalizedQuery);
  const matches: Array<{
    index: number;
    section: Record<string, unknown>;
    date: string;
  }> = [];

  getItinerarySections(snapshot).forEach((section, index) => {
    if (!isRecord(section) || section.mode !== "dayPlan") {
      return;
    }
    const date = typeof section.date === "string" ? section.date : "";
    const heading = typeof section.heading === "string" ? section.heading : "";
    const isMatch =
      query === date ||
      normalizedQuery === normalizeSearchText(heading) ||
      dayOrdinal === matches.length + 1;

    if (isMatch && date) {
      matches.push({ index, section, date });
    }
  });

  if (matches.length === 0) {
    throw new Error(`No day matching "${query}" found.`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple days matching "${query}" found.`);
  }
  return matches[0]!;
}

function findFirstDaySection(snapshot: unknown): {
  index: number;
  section: Record<string, unknown>;
  date: string;
} {
  const match = getItinerarySections(snapshot).findIndex((section) => {
    return (
      isRecord(section) &&
      section.mode === "dayPlan" &&
      typeof section.date === "string"
    );
  });

  if (match < 0) {
    throw new Error("No day sections exist for this trip.");
  }

  const section = getItinerarySections(snapshot)[match];
  if (!isRecord(section) || typeof section.date !== "string") {
    throw new Error("No day sections exist for this trip.");
  }

  return { index: match, section, date: section.date };
}

function parseDayOrdinal(query: string): number | null {
  const match = /^day (\d+)$/.exec(query);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1]!, 10);
}

function getItinerarySections(snapshot: unknown): unknown[] {
  if (!isRecord(snapshot) || !isRecord(snapshot.itinerary)) {
    return [];
  }
  return Array.isArray(snapshot.itinerary.sections)
    ? snapshot.itinerary.sections
    : [];
}

function getSectionBlocks(section: Record<string, unknown>): unknown[] {
  return Array.isArray(section.blocks) ? section.blocks : [];
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
