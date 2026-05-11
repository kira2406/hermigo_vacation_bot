import { env } from "../../../config/env.js";
import { storeBotMessage, storeReaction } from "../../../services/conversation.service.js";
import { cleanResponse, delay } from "../../../util/helper.js";
import { sendMessage, sendReaction, type Reaction } from "../../../linq/client.js";

export async function handleSendMessage(chatId: string, args: any): Promise<void> {
  // Handle array of messages format
  if (args.messages && Array.isArray(args.messages)) {
    for (const msg of args.messages) {
      const text = cleanResponse(msg.content?.trim() ?? "");
      if (!text) continue;
      const media = msg.thumbnail ? [{ url: msg.thumbnail }] : undefined;

      if (env.DRY_RUN) {
        console.log(`[DRY RUN] reply: "${text}"${msg.thumbnail ? ` [image]` : ""}`);
      } else {
        await sendMessage(chatId, text, undefined, undefined, media);
        await delay(1500);
      }
    }
    // Store aggregate in DB
    const fullContent = args.messages.map((m: any) => m.content).join("\n");
    await storeBotMessage({ chatId, content: fullContent });
    
  } 
  // Handle single string format
  else if (args.content) {
    const parts = (args.content as string)
      .split("---")
      .map((p) => cleanResponse(p.trim()))
      .filter(Boolean);

    for (const part of parts) {
      const media = args.thumbnail ? [{ url: args.thumbnail }] : undefined;
      
      if (env.DRY_RUN) {
        console.log(`[DRY RUN] reply: "${part}"`);
      } else {
        await sendMessage(chatId, part, undefined, undefined, media);
        await delay(1500);
      }
    }
    await storeBotMessage({ chatId, content: args.content });
  } else {
    console.warn("[Shared Handler] send_message called with no content or messages — skipping");
  }
}

export async function handleSendReaction(
  chatId: string, 
  messageId: string | undefined, 
  emoji: string, 
  isGroup: boolean
): Promise<void> {
  if (!messageId) {
    return console.warn("[Shared Handler] Cannot react: messageId is undefined");
  }
  
  if (env.DRY_RUN) {
    console.log(`[DRY RUN] react: "${emoji}"`);
  } else {
    await sendReaction(messageId, { type: emoji } as Reaction, "add");
  }

  await storeReaction({ 
    chatId, 
    isGroup, 
    sender: "HermigoBot", 
    reaction: emoji, 
    actorType: "bot", 
    rawPayload: {} 
  });
}