import { END } from "@langchain/langgraph";
import type { VacationGraphState } from "./state.js";

export function routeDecision(state: VacationGraphState) {
  const action = state.decision?.action;

  if (!action || action === "ignore") return END;
  if (action === "react" || action === "reply") return "execute";

  if (action === "delegate") {
    if (state.decision?.targetAgent === "destination") return "destinationAgent";
  }

  return END;
}