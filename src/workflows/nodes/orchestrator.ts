import type { VacationGraphState, Decision } from "../state.js";
import { orchestratorAgent } from "../agents/orchestator.agent.js";
import { sendMessage, sendReaction, type Reaction } from "../../linq/client.js";
import { storeBotMessage, storeReaction } from "../../services/conversation.service.js";
import { delay, formatChatHistory } from "../../util/helper.js";
import { env } from "../../config/env.js";

async function handleSendMessage(state: VacationGraphState, content: string) {
  const parts = content.split("---").map((p) => p.trim()).filter(Boolean);
  
  for (const part of parts) {
    if (env.DRY_RUN) {
      console.log(`[DRY RUN] orchestrator reply: "${part}"`);
    } else {
      await sendMessage(state.chatId, part);
      await delay(1500);
    }
  }
  await storeBotMessage({ chatId: state.chatId, content });
}

async function handleSendReaction(state: VacationGraphState, emoji: string) {
  if (!state.messageId) {
    return console.warn("[Orchestrator Node] Cannot react: messageId is undefined");
  }
  
  if (env.DRY_RUN) {
    console.log(`[DRY RUN] orchestrator react: "${emoji}"`);
  } else {
    await sendReaction(state.messageId, { type: emoji } as Reaction, "add");
  }

  await storeReaction({
    chatId: state.chatId,
    isGroup: state.isGroup,
    sender: "HermigoBot",
    reaction: emoji,
    actorType: "bot",
    rawPayload: {},
  });
}

export async function orchestratorNode(
  state: VacationGraphState
): Promise<Partial<VacationGraphState>> {
  console.log("[Orchestrator Node] triggered");

  try {
    const { toolName, toolArgs } = await orchestratorAgent(
      formatChatHistory(state.history),
      state.sender,
      state.text,
      state.participantCount,
      state.vacationState,
      state.isGroup
    );

    // ── No decision made ──
    if (!toolName || !toolArgs) {
      console.warn("[Orchestrator Node] made no tool call — defaulting to ignore");
      return { decision: { action: "ignore", reasoning: "No tool call made" } };
    }

    console.log(`[Orchestrator Node] decision: [${toolName}]`, toolArgs);

    // ── Handle Side Effects ──
    if (toolName === "send_message") {
      await handleSendMessage(state, toolArgs.content);
      return { decision: { action: "ignore", reasoning: "Handled message directly" } };
    }

    if (toolName === "send_reaction") {
      await handleSendReaction(state, toolArgs.emoji);
      return { decision: { action: "ignore", reasoning: "Handled reaction directly" } };
    }

    // ── Map remaining tool calls → Decision ──
    const decision: Decision = {
      action: toolName as Decision["action"],
      reasoning: toolArgs.reasoning,
      ...(toolArgs.participants && { participants: toolArgs.participants }),
      ...(toolArgs.targetAgent && { targetAgent: toolArgs.targetAgent }),
    };

    return { decision };
    
  } catch (error) {
    console.error("[Orchestrator Node] failed:", error);
    // Safe fallback to prevent the graph from crashing
    return { decision: { action: "ignore", reasoning: "Agent execution failed" } }; 
  }
}