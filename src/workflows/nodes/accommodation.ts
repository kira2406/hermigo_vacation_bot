import { accommodationAgent } from "../agents/accommodation.agent.js";
import type { VacationGraphState } from "../state.js";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
const DRY_RUN = process.env.DRY_RUN === "true";

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
    history
      .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
      .join("\n"),
    participantCount,
    destination,
    startDate ? new Date(startDate).toISOString().split("T")[0] : undefined,
    endDate ? new Date(endDate).toISOString().split("T")[0] : undefined,
    currentAccommodation ?? null,
    isGroup
  );

  return {};
}