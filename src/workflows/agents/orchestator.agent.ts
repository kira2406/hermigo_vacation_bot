import Anthropic from "@anthropic-ai/sdk";
import { orchestratorTools, DATA_RETRIEVAL_TOOLS } from "../tools/index.js";

const MAX_TOOL_LOOPS = 3;
const anthropic = new Anthropic();

export interface OrchestratorAgentResult {
  toolName: string | null;
  toolArgs: any | null;
}

export async function orchestratorAgent(
  formattedHistory: string,
  sender: string,
  text: string,
  participantCount: number,
  vacationState: string,
  isGroup: boolean
): Promise<OrchestratorAgentResult> {
  const systemPrompt = `
    You are the routing brain for "HermigoBot", an assistant helping a group of ${participantCount} friends plan a vacation.
    Current Phase: ${vacationState}.

    TASK: Read the latest message and call the appropriate tool.

    DELEGATION RULES (HIGHEST PRIORITY — follow these before anything else):
    - If vacationState is "destination" → ALWAYS delegate to "destination", no exceptions
    - If vacationState is "itinerary" → delegate to "itinerary", UNLESS the user wants to change the destination (e.g. "actually let's go somewhere else", "change destination", "I changed my mind about the city") → then delegate to "destination"
    - If vacationState is "accommodation" → ALWAYS delegate to "accommodation", no exceptions
      This includes: hotel questions, flight questions, origin city mentions, budget discussions,
      booking confirmations, or ANY travel logistics. The accommodation agent handles ALL of it.

    ONLY use send_message for off-topic summaries or clarifications that don't require a specialist.

    TOOL RULES:
    - "send_message": ONLY for edge cases with zero specialist relevance. If in doubt — delegate instead.
        CRITICAL: Use "---" to split into separate messages. 1-2 sentences per message max.
    - "delegate": Default choice whenever the current phase is active. When in doubt, delegate.
      ${!isGroup ? `
    - "create_group": Use when the user mentions specific people they want to travel with.
    - Never use "ignore" or "send_reaction" alone in a 1-1 chat.
  ` : `
    - "ignore": Truly off-topic, no vacation relevance. Wait for at least ${Math.ceil(participantCount / 2)} people to weigh in.
    - "send_reaction": A simple reaction is enough for off-topic messages.
  `}

    You MUST call exactly one tool. Do not respond with plain text.
  `;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Conversation history:\n${formattedHistory}\n\nLatest message from ${sender}: ${text}`,
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
      tools: orchestratorTools(isGroup),
      tool_choice: { type: "any" },
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) break;

    const toolUse = toolUseBlocks[0];
    lastToolName = toolUse?.name || null;
    lastToolArgs = toolUse?.input as any || null;

    // Check if the agent called a data retrieval tool
    const hasDataTools = toolUseBlocks.some((b) =>
      DATA_RETRIEVAL_TOOLS?.orchestrator?.has(b.name)
    );
    
    if (!hasDataTools) break; // If it's a final routing decision, exit loop

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

  return { toolName: lastToolName, toolArgs: lastToolArgs };
}