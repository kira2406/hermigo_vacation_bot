import { itineraryAgent } from "../../agents/itinerary.agent.js";
import { getOrCreateConversation } from "../../../services/conversation.service.js";
import type { VacationGraphState } from "../state.js";

export async function itineraryNode(
  state: VacationGraphState
): Promise<void> {
  const formattedHistory = state.history
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  console.log("[Itinerary Node] triggered");

  try {
    // Fetch destination and current itinerary from DB
    const conversation = await getOrCreateConversation({ chatId: state.chatId });
    const destination = conversation.destination ?? "the destination";
    const currentItinerary = conversation.itinerary ?? [];

    await itineraryAgent(
      state.chatId,
      state.messageId,
      formattedHistory,
      state.participantCount,
      destination,
      currentItinerary
    );

  } catch (error) {
    console.error("[Itinerary Node] failed:", error);
  }
}