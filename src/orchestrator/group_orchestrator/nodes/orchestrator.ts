import Anthropic from "@anthropic-ai/sdk";
import { orchestratorTools, DATA_RETRIEVAL_TOOLS } from "../../agents/tools/index.js";
import type { VacationGraphState } from "../state.js";
import type { Decision } from "../state.js";

const anthropic = new Anthropic();
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

    DELEGATION RULES (HIGHEST PRIORITY — follow these before anything else):
    - If vacationState is "destination" → ALWAYS delegate to "destination", no exceptions
    - If vacationState is "itinerary" → ALWAYS delegate to "itinerary", no exceptions  
    - If vacationState is "accommodation" → ALWAYS delegate to "accommodation", no exceptions
      This includes: hotel questions, flight questions, origin city mentions, budget discussions,
      booking confirmations, or ANY travel logistics. The accommodation agent handles ALL of it.

    ONLY use send_message for off-topic summaries or clarifications that don't require a specialist.

    TOOL RULES:
    - "ignore": Truly off-topic, no vacation relevance. Wait for at least ${Math.ceil(state.participantCount / 2)} people to weigh in.
    - "send_reaction": A simple reaction is enough for off-topic messages (agreement, excitement, laughter).
    - "send_message": ONLY for edge cases with zero specialist relevance. If in doubt — delegate instead.
        CRITICAL: Use "---" to split into separate messages. 1-2 sentences per message max.
    - "delegate": Default choice whenever the current phase is active. When in doubt, delegate.

    You MUST call exactly one tool. Do not respond with plain text.

    EXAMPLES:
    - Current phase: "destination", Message: "shall we confirm shanghai?" → delegate to "destination"
    - Current phase: "itinerary", Message: "when should we go?" → delegate to "itinerary"
  `;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Conversation history:\n${formattedHistory}\n\nLatest message from ${state.sender}: ${state.text}`,
    },
  ];

  let loopCount = 0;
  let lastToolName: string | null = null;
  let lastToolArgs: any = null;

  while (loopCount < MAX_TOOL_LOOPS) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools: orchestratorTools,
      tool_choice: { type: "any" }, // always call a tool
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) break;

    const toolUse = toolUseBlocks[0];
    lastToolName = toolUse && toolUse.name || null;
    lastToolArgs = toolUse && toolUse.input as any || null;

    // Orchestrator has no data retrieval tools — exit immediately
    const hasDataTools = toolUseBlocks.some((b) =>
      DATA_RETRIEVAL_TOOLS?.orchestrator?.has(b.name)
    );
    if (!hasDataTools) break;

    // Future-proofing: if data tools are ever added, feed results back and loop
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: toolUseBlocks.map((b) => ({
        type: "tool_result" as const,
        tool_use_id: b.id,
        content: "ok",
      })),
    });

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