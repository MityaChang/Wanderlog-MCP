export interface TripSummary {
  id: string;
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  url: string;
}

export interface TripDetail extends TripSummary {
  forwardingEmail: string | null;
  days: TripDay[];
  generalItems: TripItem[];
}

export interface TripDay {
  day: number;
  date: string | null;
  title: string | null;
  items: TripItem[];
}

export interface TripItem {
  type: string;
  title: string;
  note: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface RawWanderlogTrip {
  id?: string | number | null;
  name?: string | null;
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  slug?: string | null;
  forwardingEmail?: string | null;
  days?: RawWanderlogTripDay[];
  generalItems?: RawWanderlogTripItem[];
}

export interface RawWanderlogTripDay {
  day?: number | null;
  date?: string | null;
  title?: string | null;
  items?: RawWanderlogTripItem[];
}

export interface RawWanderlogTripItem {
  type?: string | null;
  title?: string | null;
  note?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface WanderlogTripListResponse {
  trips?: RawWanderlogTrip[];
}

export interface WanderlogTripDetailResponse {
  trip?: RawWanderlogTrip;
}
