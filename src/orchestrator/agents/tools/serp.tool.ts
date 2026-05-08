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
};

export type FlightResult = {
  airline: string;
  departure: string;
  arrival: string;
  pricePerPerson: number;
  duration: string;
};

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
  adults = 2,
  limit = 5
): Promise<HotelResult[]> {
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

  const results = await getJson(params);

  if (results.search_metadata?.status === "Success") {
    console.log(`[SERPAPI] Hotels: Found ${results.properties?.length ?? 0} results for "${destination}"`);
  } else {
    console.warn("[SERPAPI] Hotels: Search metadata status is not 'Success'");
  }

  const properties = results.properties ?? [];

  return properties.slice(0, limit).map((h: any): HotelResult => ({
    name: h.name ?? "Unknown Hotel",
    pricePerNight: h.rate_per_night?.lowest ?? h.total_rate?.lowest ?? 0,
    description: h.description ?? h.nearby_places?.[0]?.name ?? "No description available",
    location: h.neighborhood ?? h.location ?? destination,
    rating: h.overall_rating ?? null,
  }));
}

// ── Search Flights ────────────────────────────────────────────────────────────

export async function searchFlights(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string,
  adults = 2,
  limit = 5
): Promise<FlightResult[]> {
  if (!process.env.SERPAPI_API_KEY) {
    throw new Error("SERPAPI_API_KEY is missing");
  }

  const params = {
    engine: "google_flights",
    departure_id: origin,
    arrival_id: destination,
    outbound_date: departDate,
    return_date: returnDate,
    adults,
    currency: "USD",
    type: "1", // 1 = round trip
    no_cache: true,
    api_key: process.env.SERPAPI_API_KEY,
  };

  const results = await getJson(params);

  if (results.search_metadata?.status === "Success") {
    console.log(`[SERPAPI] Flights: Found ${results.best_flights?.length ?? 0} best flights for ${origin} → ${destination}`);
  } else {
    console.warn("[SERPAPI] Flights: Search metadata status is not 'Success'");
  }

  // SerpAPI returns best_flights and other_flights — prefer best_flights
  const flights = [
    ...(results.best_flights ?? []),
    ...(results.other_flights ?? []),
  ];

  return flights.slice(0, limit).map((f: any): FlightResult => {
    const leg = f.flights?.[0] ?? {};
    return {
      airline: leg.airline ?? f.airline ?? "Unknown Airline",
      departure: leg.departure_airport?.time ?? departDate,
      arrival: leg.arrival_airport?.time ?? returnDate,
      pricePerPerson: f.price ? Math.round(f.price / adults) : 0,
      duration: f.total_duration
        ? `${Math.floor(f.total_duration / 60)}h ${f.total_duration % 60}m`
        : "Unknown",
    };
  });
}