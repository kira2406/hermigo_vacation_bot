// src/tools/serp.tool.ts
import { getJson } from "serpapi";
import dotenv from "dotenv";

dotenv.config();


// ── Types ─────────────────────────────────────────────────────────────────────

type TripadvisorSearchType = "a" | "r" | "A" | "h" | "g" | "f";

export type TripadvisorPlace = {
  position?: number;
  title?: string;
  place_id?: number | string;
  place_type?: string;
  link?: string;
  description?: string;
  rating?: number;
  reviews?: number;
  thumbnail?: string;
};

export type HotelResult = {
  name: string;
  pricePerNight: number;
  description: string;
  location: string;
  rating: number | null;
  thumbnail: string | null;
  propertyToken: string | null;
};

export type HotelSearchResponse = {
  results: HotelResult[];
  rawProperties: any[];
};

// export type FlightResult = {
//   airline: string;
//   departure: string;
//   arrival: string;
//   pricePerPerson: number;
//   duration: string;
// };

// ── Search Hotels ─────────────────────────────────────────────────────────────

export async function searchTripadvisorPlaces(
  query: string,
  ssrc: TripadvisorSearchType = "a",
  limit = 5
): Promise<TripadvisorPlace[]> {
  if (!process.env.SERPAPI_API_KEY) {
    throw new Error("SERPAPI_API_KEY is missing");
  }

  const results = await getJson({
    engine: "tripadvisor",
    q: query,
    ssrc,
    limit,
    api_key: process.env.SERPAPI_API_KEY,
  });

  return (results.places ?? []).slice(0, limit);
}

export async function searchHotels(
  destination: string,
  checkIn: string,
  checkOut: string,
  adults = 1,
  limit = 5,
): Promise<HotelSearchResponse> {
  if (!process.env.SERPAPI_API_KEY) {
    throw new Error("SERPAPI_API_KEY is missing");
  }

  const params = {
    engine: "google_hotels",
    q: destination,
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults,
    currency: "USD",
    no_cache: true,
    api_key: process.env.SERPAPI_API_KEY,
  };

  const response = await getJson(params);

  if (response.search_metadata?.status === "Success") {
    console.log(`[SERPAPI] Hotels: Found ${response.properties?.length ?? 0} results for "${destination}"`);
  } else {
    console.warn("[SERPAPI] Hotels: Search metadata status is not 'Success'");
  }

  const properties = response.properties ?? [];

  const rawProperties: any[] = response.properties ?? [];

  const results = rawProperties.slice(0, limit).map((h: any): HotelResult => ({
    name: h.name ?? "Unknown Hotel",
    pricePerNight: h.rate_per_night?.extracted_lowest ?? 0,
    description: h.description ?? h.nearby_places?.[0]?.name ?? "No description available",
    location: h.neighborhood ?? h.location ?? destination,
    rating: h.overall_rating ?? null,
    thumbnail: h.images?.[0]?.thumbnail ?? null,
    propertyToken: h.property_token ?? null,
  }));

  return { results, rawProperties };
}

export type FlightResult = {
  airline: string;
  departure: string;
  arrival: string;
  pricePerPerson: number;
  duration: string;
  departureToken: string;  // needed for round trip second call
  bookingToken?: string;   // available after second call
  bookingLink?: string;    // final booking URL
};

const BASE_PARAMS = {
  engine: "google_flights",
  currency: "USD",
  hl: "en",
  api_key: process.env.SERPAPI_API_KEY,
};

// ── Call 1: Search outbound flights ──────────────────────────────────────────
export async function searchDepartureFlights(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string,
  adults: number = 1,
  limit = 5,
): Promise<FlightResult[]> {
  const params = {
    ...BASE_PARAMS,
    departure_id: origin,
    arrival_id: destination,
    outbound_date: departDate,
    return_date: returnDate,
    adults,
    type: "1", // 1 = round trip, 2 = one way
  };
  const results = await getJson(params);
  const flights = [
    ...(results.best_flights ?? []),
    ...(results.other_flights ?? []),
  ];

  console.log(`[flights] Call 1: Found ${flights.length} departure flights`);

  return flights.slice(0, limit).map((f: any): FlightResult => {
    const leg = f.flights?.[0] ?? {};
    return {
      airline: leg.airline ?? f.airline ?? "Unknown",
      departure: leg.departure_airport?.time ?? departDate,
      arrival: leg.arrival_airport?.time ?? "",
      pricePerPerson: f.price ?? 0,
      duration: f.total_duration ? `${Math.floor(f.total_duration / 60)}h ${f.total_duration % 60}m` : "N/A",
      departureToken: f.departure_token ?? "",
    };
  });
}

// ── Call 2: Select a departure flight → get return flights + booking_token ───
export async function searchReturnFlights(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string,
  departureToken: string | null | undefined,
  adults: number = 1,
  limit = 5,
): Promise<FlightResult[]> {
  const params = {
    ...BASE_PARAMS,
    departure_id: origin,
    arrival_id: destination,
    outbound_date: departDate,
    return_date: returnDate,
    adults,
    type: "1",
    departure_token: departureToken, // ← key param
  };

  const results = await getJson(params);
  const flights = [
    ...(results.best_flights ?? []),
    ...(results.other_flights ?? []),
  ];

  console.log(`[flights] Call 2: Found ${flights.length} return flights`);

  return flights.slice(0, limit).map((f: any): FlightResult => {
    const leg = f.flights?.[0] ?? {};
    return {
      airline: leg.airline ?? f.airline ?? "Unknown",
      departure: leg.departure_airport?.time ?? returnDate,
      arrival: leg.arrival_airport?.time ?? "",
      pricePerPerson: f.price ?? 0,
      duration: f.total_duration ? `${Math.floor(f.total_duration / 60)}h ${f.total_duration % 60}m` : "N/A",
      departureToken: f.departure_token ?? "",
      bookingToken: f.booking_token ?? "", // ← now available
    };
  });
}

// ── Call 3: Get booking URL from booking_token ───────────────────────────────
export async function getFlightBookingLink(
  origin: string,
  destination: string | null,
  departDate: string | null,
  returnDate: string | null,
  bookingToken: string | null | undefined,
  adults: number = 1,
): Promise<string | null> {
  const params = {
    ...BASE_PARAMS,
    departure_id: origin,
    arrival_id: destination,
    outbound_date: departDate,
    return_date: returnDate,
    adults,
    type: "1",
    booking_token: bookingToken, // ← final call
  };

  const results = await getJson(params);
  console.log(`[flights] Call 3: booking link fetched`);

  // serpapi returns booking options under different keys
  const bookingOptions = results.booking_options ?? results.flights_results ?? [];
  return bookingOptions?.[0]?.link ?? results.search_metadata?.google_flights_url ?? null;
}