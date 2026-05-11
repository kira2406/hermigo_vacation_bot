import { formatChatHistory } from "../../util/helper.js";
import { accommodationAgent } from "../agents/accommodation.agent.js";
import type { VacationGraphState } from "../state.js";

export async function accommodationNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {
  const {
    chatId,
    messageId,
    history,
    participantCount,
    destination,
    startDate,
    endDate,
    currentAccommodation,
    isGroup
  } = state;

  if (!destination) {
    console.warn("[accommodation] No destination set — cannot run");
    return {};
  }

  if (!startDate || !endDate) {
    console.warn("[accommodation] No travel dates set — cannot run");
    return {};
  }

  await accommodationAgent(
    chatId,
    messageId,
    formatChatHistory(history),
    participantCount,
    destination,
    startDate ? new Date(startDate).toISOString().split("T")[0] : undefined,
    endDate ? new Date(endDate).toISOString().split("T")[0] : undefined,
    currentAccommodation ?? null,
    isGroup
  );

  return {};
}