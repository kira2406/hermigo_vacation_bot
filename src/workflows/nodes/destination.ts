import { destinationAgent } from "../agents/destination.agent.js";
import type { VacationGraphState } from "../state.js";

export async function destinationNode(
  state: VacationGraphState
): Promise<void> {
  const formattedHistory = state.history
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");
  const formattedRecentMessages = state.recent_messages
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  console.log("[Destination Node] triggered");

  try {
    await destinationAgent(
      state.chatId,
      state.messageId,
      formattedHistory,
      formattedRecentMessages,
      state.participantCount,
      state.isGroup
    );

  } catch (error) {
    console.error("[Destination Node] failed:", error);
  }
}