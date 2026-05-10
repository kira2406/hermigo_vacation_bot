import Anthropic from "@anthropic-ai/sdk";
import type { VacationGraphState } from "../state.js";
import type { Decision } from "../state.js";
import { sendMessage, sendReaction, type Reaction } from "../../linq/client.js";
import { storeBotMessage, storeReaction } from "../../services/conversation.service.js";
import { anthropic } from "../../services/llm.service.js";
import { DATA_RETRIEVAL_TOOLS, orchestratorTools } from "../tools/index.js";

const MAX_TOOL_LOOPS = 3;
const DRY_RUN = process.env.DRY_RUN === "true";
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function orchestratorNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {

  const formattedHistory = state.history
    .map((msg) => `[${msg.timestamp || "unknown"}] ${msg.sender}: ${msg.content}`)
    .join("\n");

  const systemPrompt = `
    You are the routing brain for "HermigoBot", an assistant helping a group of ${state.participantCount} friends plan a vacation.
    Current Phase: ${state.vacationState}.

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
      ${!state.isGroup ? `
    - "create_group": Use when the user mentions specific people they want to travel with.
    - Never use "ignore" or "send_reaction" alone in a 1-1 chat.
  ` : `
    - "ignore": Truly off-topic, no vacation relevance. Wait for at least ${Math.ceil(state.participantCount / 2)} people to weigh in.
    - "send_reaction": A simple reaction is enough for off-topic messages.
  `}

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
      tools: orchestratorTools(state.isGroup),
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

    const hasDataTools = toolUseBlocks.some((b) =>
      DATA_RETRIEVAL_TOOLS?.orchestrator?.has(b.name)
    );
    if (!hasDataTools) break;

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

  // ── Execute send_message ──────────────────────────────────────────────────

  if (lastToolName === "send_message") {
    const parts = (lastToolArgs.content as string)
      .split("---")
      .map((p: string) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (DRY_RUN) {
        console.log(`[DRY RUN] orchestrator reply: "${part}"`);
      } else {
        await sendMessage(state.chatId, part);
        await delay(1500);
      }
    }

    await storeBotMessage({ chatId: state.chatId, content: lastToolArgs.content });
    return { decision: { action: "ignore", reasoning: "Orchestrator handled message directly" } };
  }

  // ── Execute send_reaction ─────────────────────────────────────────────────

  if (lastToolName === "send_reaction") {
    if (!state.messageId) {
      console.warn("[Orchestrator] Cannot react: messageId is undefined");
    } else if (DRY_RUN) {
      console.log(`[DRY RUN] orchestrator react: "${lastToolArgs.emoji}"`);
    } else {
      await sendReaction(state.messageId, { type: lastToolArgs.emoji } as Reaction, "add");
    }

    await storeReaction({
      chatId: state.chatId,
      isGroup: state.isGroup,
      sender: "HermigoBot",
      reaction: lastToolArgs.emoji,
      actorType: "bot",
      rawPayload: {},
    });

    console.log(`[Orchestrator] reacted with: ${lastToolArgs.emoji}`);
    return { decision: { action: "ignore", reasoning: "Orchestrator handled reaction directly" } };
  }

  // ── Map remaining tool calls → Decision ───────────────────────────────────

  const decision: Decision = (() => {
    switch (lastToolName) {
      case "ignore":
        return {
          action: "ignore",
          reasoning: lastToolArgs.reasoning,
        };

      case "create_group":
        return {
          action: "create_group",
          participants: lastToolArgs.participants,
          reasoning: lastToolArgs.reasoning,
        };

      case "delegate":
        return {
          action: "delegate",
          targetAgent: lastToolArgs.targetAgent,
          reasoning: lastToolArgs.reasoning,
        };

      default:
        console.warn(`[Orchestrator] Unknown tool: ${lastToolName}`);
        return { action: "ignore", reasoning: "Unknown tool" };
    }
  })();

  return { decision };
}