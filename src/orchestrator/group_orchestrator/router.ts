import { END } from "@langchain/langgraph";
import type { VacationGraphState } from "./state.js";

export function routeDecision(state: VacationGraphState) {
  const action = state.decision?.action;

  if (!action || action === "ignore") return END;
  // if (action === "react" || action === "reply") return "execute";

  if (action === "delegate") {
    const target = state.decision?.targetAgent;
    if (target === "destination") return "destinationAgent";
    if (target === "itinerary") return "itineraryAgent";
  }

  return END;
}