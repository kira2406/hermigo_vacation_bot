import { getJson } from "serpapi";

import dotenv from "dotenv";

dotenv.config();

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