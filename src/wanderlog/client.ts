import type {
  RawWanderlogTrip,
  RawWanderlogTripDay,
  RawWanderlogTripItem,
  TripDay,
  TripDetail,
  TripItem,
  TripSummary,
  WanderlogTripDetailResponse,
  WanderlogTripListResponse,
} from "./types.js";
import type { ServerConfig } from "../config.js";

export const LIST_TRIPS_PATH = "/api/trips";

export function getTripPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}`;
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

    return mapTripSummaries(await response.json());
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

    return mapTripDetail(await response.json(), options);
  }
}

export function mapTripSummaries(raw: unknown): TripSummary[] {
  const trips = isTripListResponse(raw) ? (raw.trips ?? []) : [];

  return trips
    .filter((trip): trip is RawWanderlogTrip & { id: string | number } => {
      return trip.id !== undefined && trip.id !== null;
    })
    .map((trip) => {
      const id = String(trip.id);
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
  const trip = isTripDetailResponse(raw) ? raw.trip : null;

  if (!trip || trip.id === undefined || trip.id === null) {
    return null;
  }

  const [summary] = mapTripSummaries({ trips: [trip] });

  if (!summary) {
    return null;
  }

  const days = (trip.days ?? [])
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

function mapTripDay(day: RawWanderlogTripDay): TripDay | null {
  if (typeof day.day !== "number") {
    return null;
  }

  return {
    day: day.day,
    date: day.date ?? null,
    title: day.title ?? null,
    items: (day.items ?? []).map(mapTripItem),
  };
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
    Array.isArray((raw as WanderlogTripListResponse).trips)
  );
}

function isTripDetailResponse(
  raw: unknown,
): raw is WanderlogTripDetailResponse {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as WanderlogTripDetailResponse).trip === "object" &&
    (raw as WanderlogTripDetailResponse).trip !== null
  );
}
