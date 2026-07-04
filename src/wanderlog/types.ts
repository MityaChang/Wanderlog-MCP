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

export interface CreateTripInput {
  destination: string;
  startDate: string;
  endDate: string;
  title?: string;
  privacy?: "private" | "friends" | "public";
}

export interface CreatedTrip {
  id: string;
  numericId: number;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  url: string;
}

export interface SearchPlacesInput {
  query: string;
  latitude: number;
  longitude: number;
}

export interface PlaceSearchResult {
  id: string;
  title: string;
  description: string | null;
}

export interface TripMutationResult {
  tripId: string;
  message: string;
}

export interface AddPlaceInput {
  tripId: string;
  place: string;
  day?: string;
  note?: string;
  startTime?: string;
  endTime?: string;
}

export interface AddNoteInput {
  tripId: string;
  text: string;
  day?: string;
}

export interface AddHotelInput {
  tripId: string;
  hotel: string;
  checkIn: string;
  checkOut: string;
}

export interface AddChecklistInput {
  tripId: string;
  items: string[];
  title?: string;
  day?: string;
}

export interface RawWanderlogGeo {
  id?: number | null;
  name?: string | null;
  countryName?: string | null;
  stateName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface RawWanderlogPlaceSuggestion {
  place_id?: string | null;
  description?: string | null;
  structured_formatting?: {
    main_text?: string | null;
    secondary_text?: string | null;
  } | null;
}

export interface RawWanderlogTrip {
  id?: string | number | null;
  key?: string | null;
  name?: string | null;
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  slug?: string | null;
  forwardingEmail?: string | null;
  days?: RawWanderlogTripDay[];
  generalItems?: RawWanderlogTripItem[];
  itinerary?: {
    sections?: RawWanderlogTripSection[];
  };
}

export interface RawWanderlogTripSection {
  id?: number | null;
  mode?: string | null;
  title?: string | null;
  heading?: string | null;
  date?: string | null;
  items?: RawWanderlogTripItem[];
  blocks?: RawWanderlogTripItem[];
}

export interface RawWanderlogTripDay {
  day?: number | null;
  date?: string | null;
  title?: string | null;
  heading?: string | null;
  items?: RawWanderlogTripItem[];
  blocks?: RawWanderlogTripItem[];
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
  ownTripPlans?: RawWanderlogTrip[];
  friendsTripPlans?: RawWanderlogTrip[];
  friendsPrivateSharedTripPlans?: RawWanderlogTrip[];
}

export interface WanderlogTripDetailResponse {
  trip?: RawWanderlogTrip;
  tripPlan?: RawWanderlogTrip;
}

export interface WanderlogGeoAutocompleteResponse {
  data?: RawWanderlogGeo[];
}

export interface WanderlogCreateTripResponse {
  data?: {
    key?: string | null;
    viewKey?: string | null;
    id?: number | null;
    title?: string | null;
  };
}

export interface WanderlogPlaceAutocompleteResponse {
  data?: RawWanderlogPlaceSuggestion[];
}
