// src/tools/tripadvisor.tool.ts
import { getJson } from "serpapi";
import dotenv from "dotenv";
import type { TripadvisorPlace } from "../../services/tripadvisor.service.js";

dotenv.config();

type TripadvisorSearchType = "a" | "r" | "A" | "h" | "g" | "f";

export async function searchTripadvisorPlaces(
  query: string,
  ssrc: TripadvisorSearchType = "a",
  limit = 5
): Promise<TripadvisorPlace[]> {
  if (!process.env.SERPAPI_API_KEY) {
    throw new Error("SERPAPI_API_KEY is missing");
  }

  // 1. Log the Request "Body" (Parameters)
  const params = {
    engine: "tripadvisor",
    q: query,
    ssrc,
    limit,
    no_cache: true,
    api_key: process.env.SERPAPI_API_KEY,
  };

  // 2. Execute Request
  const results = await getJson(params);

  // 4. Verification Logs
  if (results.search_metadata?.status === "Success") {
    console.log(`[SERPAPI] Success: Found ${results.places?.length || 0} places.`);
  } else {
    console.log("[SERPAPI] Warning: Search metadata status is not 'Success'");
  }

  return (results.places ?? []).slice(0, limit);
}