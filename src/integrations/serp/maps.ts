// src/integrations/serpapi/maps.ts
import { getJson } from "serpapi";
import { env } from "../../config/env.js";

export interface PlaceResult {
  name: string;
  address: string;
  rating?: number;
  types: string[];
  placeId: string;
  location: { lat: number; lng: number };
}

export async function searchPlacesInCity(city: string, query: string = "tourist attractions", limit: number = 10): Promise<PlaceResult[]> {
  console.log(`[SerpAPI - Maps] Searching: "${query} in ${city}"`);

  const data = await getJson({
    engine: "google_maps",
    q: `${query} in ${city}`,
    type: "search",
    api_key: env.SERPAPI_API_KEY,
  });

  const results = data.local_results ?? [];
  return results.slice(0, limit).map((p: any) => ({
    name: p.title,
    address: p.address ?? "",
    rating: p.rating,
    types: p.type ? [p.type] : [],
    placeId: p.place_id ?? "",
    location: {
      lat: p.gps_coordinates?.latitude ?? 0,
      lng: p.gps_coordinates?.longitude ?? 0,
    },
  }));
}

// Group places by proximity using coordinates (haversine distance)
export async function groupNearbyPlaces(
  places: PlaceResult[],
  maxPerDay: number = 3
): Promise<PlaceResult[][]> {
  const days: PlaceResult[][] = [];
  const remaining = [...places];

  while (remaining.length > 0) {
    const anchor = remaining.shift()!;
    const dayGroup: PlaceResult[] = [anchor];

    // Sort remaining by haversine distance from anchor
    const withDistance = remaining.map((place) => ({
      place,
      distance: haversineDistance(anchor.location, place.location),
    }));
    withDistance.sort((a, b) => a.distance - b.distance);

    // Pick closest places for this day
    for (let i = 0; i < maxPerDay - 1 && withDistance.length > 0; i++) {
      const closest = withDistance.shift()!;
      dayGroup.push(closest.place);
      remaining.splice(remaining.indexOf(closest.place), 1);
    }

    days.push(dayGroup);
  }

  return days;
}

// Haversine formula — distance between two lat/lng points in km
function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;

  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}