// src/services/linq.service.ts
import { client } from "../lib/linq.js";
import { storeBotMessage } from "./conversation.service.js";

type BuiltInReaction =
  | "love"
  | "like"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question";

type SendReactionInput = {
  chatId: string;
  messageId: string;
  reaction: BuiltInReaction;
};

function getLinqPhoneNumber(): string {
  const phoneNumber = process.env.LINQ_PHONE_NUMBER;

  if (!phoneNumber) {
    throw new Error("LINQ_PHONE_NUMBER is missing");
  }

  return phoneNumber;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function createGroupChat(sender: string, participants: string[]) {
  try {
    console.log("📞 Sender:", sender);
    console.log("📞 Participants:", participants);

    if (!participants || participants.length === 0) {
      throw new Error("Participants list is empty");
    }

    const text = `Hey everyone 👋 ${sender} started a trip planning chat ✈️`;

    const chat = await client.chats.create({
      from: getLinqPhoneNumber(),
      to: participants,
      message: {
        parts: [
          {
            type: "text",
            value: text,
          },
        ],
      },
    });

    return chat;
  } catch (err: unknown) {
    console.error("❌ Linq createGroupChat error:", getErrorMessage(err));
    throw err;
  }
}

export async function sendMessageToChat(chatId: string, text: string) {
  try {
    if (!chatId || !text) {
      throw new Error("chatId and text are required");
    }

    const message = await client.chats.messages.send(chatId, {
      message: {
        parts: [
          {
            type: "text",
            value: text,
          },
        ],
      },
    });

    await storeBotMessage({
      chatId,
      content: text,
      rawPayload: message,
    });

    return message;
  } catch (err: unknown) {
    console.error("❌ Linq sendMessageToChat error:", getErrorMessage(err));
    throw err;
  }
}

export async function sendReactionToChat({
  chatId,
  messageId,
  reaction,
}: SendReactionInput) {
  try {
    if (!chatId || !messageId || !reaction) {
      throw new Error("chatId, messageId, and reaction are required");
    }

    console.log("📤 Sending reaction:", { chatId, messageId, reaction });

    const data = await client.messages.addReaction(messageId, {
      type: reaction,
      operation: "add",
    });

    console.log("✅ Reaction sent:", data);

    return data;
  } catch (err: unknown) {
    console.error("❌ Reaction error:", getErrorMessage(err));
    throw err;
  }
}

export async function removeReactionFromChat({
  chatId,
  messageId,
  reaction,
}: SendReactionInput) {
  try {
    if (!chatId || !messageId || !reaction) {
      throw new Error("chatId, messageId, and reaction are required");
    }

    console.log("📤 Removing reaction:", { chatId, messageId, reaction });

    const data = await client.messages.addReaction(messageId, {
      type: reaction,
      operation: "remove",
    });

    console.log("✅ Reaction removed:", data);

    return data;
  } catch (err: unknown) {
    console.error("❌ Remove reaction error:", getErrorMessage(err));
    throw err;
  }
}