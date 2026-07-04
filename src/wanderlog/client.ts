import type {
  RawWanderlogTrip,
  RawWanderlogTripDay,
  RawWanderlogTripItem,
  RawWanderlogTripSection,
  TripDay,
  TripDetail,
  TripItem,
  TripSummary,
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
    const response = await this.fetchImpl(
      `https://wanderlog.com${LIST_TRIPS_PATH}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          cookie: `connect.sid=${this.config.wanderlogCookie}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Wanderlog request failed with status ${response.status}.`,
      );
    }

    return mapTripSummaries(await readJsonResponse(response));
  }

  async getTrip(
    tripId: string,
    options: { day?: number } = {},
  ): Promise<TripDetail | null> {
    const response = await this.fetchImpl(
      `https://wanderlog.com${getTripPath(tripId)}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          cookie: `connect.sid=${this.config.wanderlogCookie}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Wanderlog request failed with status ${response.status}.`,
      );
    }

    return mapTripDetail(await readJsonResponse(response), options);
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
