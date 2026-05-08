import OpenAI from "openai";
import { orchestratorTools, DATA_RETRIEVAL_TOOLS } from "../../../agents/tools/index.js";
import type { VacationGraphState } from "../state.js";
import type { Decision } from "../state.js";

const openai = new OpenAI();
const MAX_TOOL_LOOPS = 3;

export async function orchestratorNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {
  const formattedHistory = state.history
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  const systemPrompt = `
    You are the routing brain for "VacationBot", an assistant helping a group of ${state.participantCount} friends plan a vacation.
    Current Phase: ${state.vacationState}.

    TASK: Read the latest message and call the appropriate tool.

    DELEGATION RULES (HIGHEST PRIORITY):
  - If vacationState is "destination" and the group is discussing locations → ALWAYS delegate to "destination"
  - If vacationState is "itinerary" and the group is discussing dates or activities → ALWAYS delegate to "itinerary"
  - If vacationState is "accommodation" and the group is discussing hotels → ALWAYS delegate to "accommodation"

    ONLY use send_message for off-topic summaries or clarifications that don't require a specialist.

    TOOL RULES:
  - "ignore": Group is still casually chatting. Wait for at least ${Math.ceil(state.participantCount / 2)} people to weigh in.
  - "send_reaction": A simple reaction is enough for off-topic messages (agreement, excitement, laughter).
  - "send_message": Only for simple clarifications or summaries unrelated to the current phase.
      CRITICAL: Use "---" to split into separate messages. 1-2 sentences per message max.
  - "delegate": When group is discussing the current phase topic. Specialist agents handle:
      * "destination" → location discussions, confirming cities, suggesting activities
      * "itinerary" → date discussions, activity planning, itinerary confirmation
      * "accommodation" → hotel searches, booking discussions

  You MUST call exactly one tool. Do not respond with plain text.

  EXAMPLES:
  - Current phase: "destination", Message: "shall we confirm shanghai?" → delegate to "destination"
  - Current phase: "itinerary", Message: "when should we go?" → delegate to "itinerary"
  `;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Conversation history:\n${formattedHistory}\n\nLatest message from ${state.sender}: ${state.text}`,
    },
  ];

  let loopCount = 0;
  let lastToolName: string | null = null;
  let lastToolArgs: any = null;

  while (loopCount < MAX_TOOL_LOOPS) {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4-nano",
      messages,
      tools: orchestratorTools,
      tool_choice: "required", // ✅ always call a tool
      temperature: 0.2,
    });

    const message = response.choices[0].message;
    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) break;

    const toolCall = toolCalls[0];
    if (toolCall.type !== "function") break;

    // Parse args
    let args: any;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("❌ Failed to parse orchestrator tool args");
      break;
    }

    lastToolName = toolCall.function.name;
    lastToolArgs = args;

    // Orchestrator has no data retrieval tools — exit immediately
    const hasDataTools = toolCalls.some(
      (tc) => tc.type === "function" && DATA_RETRIEVAL_TOOLS.orchestrator.has(tc.function.name)
    );
    if (!hasDataTools) break; // ✅ decision made, no need to loop

    // Future-proofing: if data tools are ever added, handle the loop
    messages.push(message);
    for (const tc of toolCalls) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: "ok",
      });
    }

    loopCount++;
  }

  // ── No decision made ─────────────────────────────────────────────────────

  if (!lastToolName || !lastToolArgs) {
    console.warn("[Orchestrator] made no tool call — defaulting to ignore");
    return { decision: { action: "ignore", reasoning: "No tool call made" } };
  }

  console.log(`[Orchestrator] decision: [${lastToolName}]`, lastToolArgs);

  // ── Map tool call → Decision ──────────────────────────────────────────────

  const decision: Decision = (() => {
    switch (lastToolName) {
      case "send_reaction":
      case "send_message":
      case "ignore":
        return {
          action: "ignore",
          reasoning: lastToolArgs.reasoning,
        };

      case "delegate":
        return {
          action: "delegate",
          targetAgent: lastToolArgs.targetAgent,
          reasoning: lastToolArgs.reasoning,
        };
      default:
        console.warn(`[Orchestrator] Unknown orchestrator tool: ${lastToolName}`);
        return { action: "ignore", reasoning: "Unknown tool" };
    }
  })();

  return { decision };
}