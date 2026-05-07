
import { sendReaction, type Reaction } from "../../../linq/client.js";
import { storeBotMessage, storeReaction } from "../../../services/conversation.service.js";
import { sendMessageToChat } from "../../../services/linq.service.js";
import type { VacationGraphState } from "../state.js";

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


export async function executionNode(state: VacationGraphState): Promise<Partial<VacationGraphState>> {


  if (!state.decision) return {};
  const { action, content } = state.decision;

  if (action === "reply" && content) {

    const parts = content.split("---").map((p) => cleanResponse(p.trim())).filter(Boolean);

    for (const part of parts) {
    await sendMessageToChat(state.chatId, part); // ✅ await each one before sending next
    await delay(1500); // ✅ pause between messages like a human would
  }
    await storeBotMessage({ chatId: state.chatId, content });
    
  } else if (action === "react" && content) {
    if (!state.messageId) {
      console.warn("⚠️ Cannot react: messageId is undefined");
      return {};
    }

    await sendReaction(
      state.messageId,
      { type: content } as Reaction,
      "add"
    );
    await storeReaction({
      chatId: state.chatId,
      isGroup: true,
      sender: "VacationBot",
      reaction: content,
      actorType: "bot",
      rawPayload: {}
    });
  }

  return {};
}