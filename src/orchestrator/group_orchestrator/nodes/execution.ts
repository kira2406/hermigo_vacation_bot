
import { sendReaction, type Reaction, sendMessage } from "../../../linq/client.js";
import { storeBotMessage, storeReaction } from "../../../services/conversation.service.js";
import type { VacationGraphState } from "../state.js";
import dotenv from 'dotenv'
/**
 * Node: Execution Gateway
 * Handles final outputs to the Linq API and Database logging.
 */
// Clean up LLM response formatting quirks before sending
function cleanResponse(text: string): string {
  return text
    // Turn newline-dash into inline dash (e.g., "foo\n - bar" → "foo - bar")
    .replace(/\n\s*-\s*/g, ' - ')
    // Remove markdown underlines/italics (_text_ → text)
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    // Remove markdown bold (**text** → text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Remove stray asterisks used for emphasis
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1')
    // Clean up multiple spaces
    .replace(/  +/g, ' ')
    // Clean up extra newlines (but preserve intentional double-newlines for --- splits)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

dotenv.config();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DRY_RUN = process.env.DRY_RUN === "true";

export async function executionNode(state: VacationGraphState): Promise<Partial<VacationGraphState>> {
  if (!state.decision) return {};
  const { action, content } = state.decision;

  if (action === "reply" && content) {
    const parts = content.split("---").map((p) => cleanResponse(p.trim())).filter(Boolean);

    for (const part of parts) {
      if (DRY_RUN) {
        console.log(`🧪 [DRY RUN] Would send message: "${part}"`);
      } else {
        await sendMessage(state.chatId, part);
        await delay(1500);
      }
    }

    await storeBotMessage({ chatId: state.chatId, content });

  } else if (action === "react" && content) {
    if (!state.messageId) {
      console.warn("⚠️ Cannot react: messageId is undefined");
      return {};
    }

    if (DRY_RUN) {
      console.log(`🧪 [DRY RUN] Would send reaction: "${content}" to message: ${state.messageId}`);
    } else {
      await sendReaction(
        state.messageId,
        { type: content } as Reaction,
        "add"
      );
    }

    await storeReaction({
      chatId: state.chatId,
      isGroup: true,
      sender: "VacationBot",
      reaction: content,
      actorType: "bot",
      rawPayload: {},
    });
  }

  return {};
}