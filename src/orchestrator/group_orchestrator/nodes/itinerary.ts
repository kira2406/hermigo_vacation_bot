import { itineraryAgent } from "../../../agents/itinerary.agent.js";
import { getOrCreateConversation } from "../../../services/conversation.service.js";
import type { VacationGraphState } from "../state.js";

export async function itineraryNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {
  const formattedHistory = state.history
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  console.log("🗓️ Itinerary Node triggered");

  try {
    // Fetch destination and current itinerary from DB
    const conversation = await getOrCreateConversation({ chatId: state.chatId });
    const destination = conversation.destination ?? "the destination";
    const currentItinerary = conversation.itinerary ?? [];

    const { action, content, advanceState } = await itineraryAgent(
      state.chatId,
      formattedHistory,
      state.participantCount,
      destination,
      currentItinerary
    );

    return {
      decision: {
        action,
        content,
        reasoning: "Handled by Itinerary Agent",
      },
    };
  } catch (error) {
    console.error("❌ Itinerary Node failed:", error);
    return {
      decision: {
        action: "reply",
        content: "Sorry, I ran into an issue with the itinerary. Let me try again shortly.",
        reasoning: "Itinerary Agent threw an error",
      },
    };
  }
}