import { destinationAgent } from "../../../agents/destination.agent.js";
import { updateDestination, updateVacationState } from "../../../services/conversation.service.js";
import type { VacationGraphState } from "../state.js";

/**
 * Node: Destination Specialist
 * Triggered when the Orchestrator detects conflict or consensus.
 */
export async function destinationNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {
  const formattedHistory = state.history
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  const mode = state.decision?.isConflict ? "conflict" : "consensus";

  console.log(`[Destination Agent] triggered in [${mode}] mode`);

  try {
    const content = await destinationAgent(formattedHistory, mode);

    const nextVacationState = state.decision?.isConsensus ? "itinerary" : state.vacationState;

    if (state.decision?.isConsensus) {
      await updateVacationState(state.chatId, "itinerary");

      if (state.decision.confirmedDestination) {
        await updateDestination(state.chatId, state.decision.confirmedDestination);
      }
      console.log(`[Destination Agent] consensus reached, moving to next state: ${nextVacationState}`);
    }


    console.log("[Destination Agent] result:", content);

    return {
      decision: {
        action: "reply",
        content,
        reasoning: `Resolved via Destination Agent (${mode} mode)`,
      },
    };
  } catch (error) {
    console.error("❌ Destination Agent failed:", error);
    return {
      decision: {
        action: "reply",
        content: "Sorry, I ran into an issue finding destination options. Let me try again shortly.",
        reasoning: "Destination Agent threw an error",
      },
    };
  }
}