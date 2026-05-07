import { destinationAgent } from "../../../agents/destination.agent.js";
import type { VacationGraphState } from "../state.js";

export async function destinationNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {
  const formattedHistory = state.history
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  console.log("🗺️ Destination Node triggered");

  try {
    const { action, content, confirmedDestination, advanceState } = await destinationAgent(
      state.chatId,
      formattedHistory,
      state.participantCount
    );

    return {
      vacationState: advanceState ? "itinerary" : state.vacationState,
      decision: {
        action, // ✅ now passes ignore/react/reply through correctly
        content,
        reasoning: advanceState
          ? `Consensus reached — destination locked as ${confirmedDestination}`
          : "Destination agent handled the conversation",
      },
    };
  } catch (error) {
    console.error("❌ Destination Node failed:", error);
    return {
      decision: {
        action: "reply",
        content: "Sorry, I ran into an issue. Let me try again shortly.",
        reasoning: "Destination Agent threw an error",
      },
    };
  }
}