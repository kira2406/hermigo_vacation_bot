import { generateLlmResponse } from "../../../services/orchestration_llm.service.js";
import type { VacationGraphState } from "../state.js";

/**
 * Node: The "Routing Brain"
 * Analyzes the chat to decide if the bot should ignore, react, or delegate.
 */
export async function orchestratorNode(state: VacationGraphState): Promise<Partial<VacationGraphState>> {
  const formattedHistory = state.history
    .map(msg => `[${msg.timestamp || 'unknown'}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  const systemPrompt = `
    You are the routing brain for "VacationBot", an assistant helping a group of ${state.participantCount} friends.
    Current Phase: ${state.vacationState}.

    TASK: Your ONLY job is to read the recent conversation history and output a strict JSON object deciding your next action.

    ROUTING RULES:
    1. "ignore": Let humans converse. Wait for consensus (at least ${Math.ceil(state.participantCount / 2)} people).
    2. "react": Lightweight agreement or validation. Select "love", "like", "dislike", "laugh" ,"emphasize", "question" or a custom emoji to react to the message.
    3. "reply": You can directly answer a simple question or summarize something.
    4. "delegate": The message requires a specialist agent to handle.

    WHEN TO DELEGATE:
    - vacationState is "destination" and the group is discussing, debating, or agreeing on a location → delegate to "destination"
    - vacationState is "itinerary" and the group is discussing activities or schedule → delegate to "itinerary"
    - vacationState is "accommodation" and the group is discussing hotels or stays → delegate to "accommodation"
    Always choose "delegate" in these scenarios to allow the specialist agents to provide researched, specific suggestions instead of generic replies.
    
    CRITICAL: 
    If you choose "reply", mirror how humans actually text:
    - Use "---" to split your response into separate messages sent individually
    - Each message should be 1-2 sentences max
    - ALWAYS split longer responses into 2-4 separate messages with ---
    - This is NOT optional — multi-sentence responses MUST be split

    JSON FORMAT:
    {
      "action": "ignore" | "react" | "reply" | "delegate",
      "targetAgent": "destination" | "itinerary" | "accommodation", // Only if action is "delegate". iF "reply" OR "react", leave blank.
      "reasoning": "Briefly explain why you chose this action based on the rules.",
      "content": "If action is 'reply', the message to send. If 'react', the emoji. If 'ignore', leave blank.",
      }
  `;

  const userContext = `HISTORY:\n${formattedHistory}\n\nCURRENT MESSAGE: ${state.sender}: ${state.text}`;
  const response = await generateLlmResponse(`${systemPrompt}\n\n${userContext}`);

  try {
    return { decision: JSON.parse(response) };
  } catch (e) {
    return { decision: { action: "ignore", reasoning: "JSON Parse Error" } };
  }
}