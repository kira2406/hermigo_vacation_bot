import { formatChatHistory } from "../../util/helper.js";
import { destinationAgent } from "../agents/destination.agent.js";
import type { VacationGraphState } from "../state.js";

export async function destinationNode(
  state: VacationGraphState
): Promise<void> {

  console.log("[Destination Node] triggered");

  try {
    await destinationAgent(
      state.chatId,
      state.messageId,
      formatChatHistory(state.history),
      formatChatHistory(state.recent_messages),
      state.participantCount,
      state.isGroup
    );

  } catch (error) {
    console.error("[Destination Node] failed:", error);
  }
}