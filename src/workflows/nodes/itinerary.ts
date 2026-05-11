import { itineraryAgent } from "../agents/itinerary.agent.js";
import type { VacationGraphState } from "../state.js";
import { formatChatHistory } from "../../util/helper.js";

export async function itineraryNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {

  console.log("[Itinerary Node] triggered");

  try {

    await itineraryAgent(
      state.chatId,
      state.messageId,
      formatChatHistory(state.history),
      state.participantCount,
      state.destination ?? "the destination",
      state.currentItinerary ?? [],
      state.isGroup
    );

  } catch (error) {
    console.error("[Itinerary Node] failed:", error);
  }

  return {};
}