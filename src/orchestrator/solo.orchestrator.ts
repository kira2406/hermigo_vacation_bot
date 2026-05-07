import { sendReaction, type Reaction } from "../linq/index.js";
import { resolveContacts } from "../services/contact.service.js";
import { storeBotMessage } from "../services/conversation.service.js";
import { createGroupChat } from "../services/linq.service.js";
import { detectIntent } from "../services/llm.service.js";

// ✅ Define input type
interface SoloOrchestratorInput {
  text: string;
  sender: string;
  chatId: string;
  messageId: string
}

// ✅ Define intent response type (basic for now)
interface IntentResponse {
  intent: string;
  participants: string[];
}

export async function soloOrchestrator({
  text,
  sender,
  chatId,
  messageId
}: SoloOrchestratorInput): Promise<void> {

  // await sendReaction(
  //       messageId,
  //       {type: "laugh"} as Reaction,
  //       "add"
  //     )

  // return; // TEMPORARY EARLY EXIT FOR TESTING


  try {
    const parsed: IntentResponse = await detectIntent(text);

    console.log("🧠 Intent parsed:", parsed);

    if (parsed.intent === "create_trip") {
      // ✅ Resolve participants
      const numbers: string[] = resolveContacts(parsed.participants);

      // ✅ Include sender
      const allParticipants: string[] = [
        ...new Set([sender, ...numbers])
      ];

      if (allParticipants.length < 2) {
        console.log("⚠️ Not enough participants to create group");
        return;
      }

      console.log("👥 Final participants:", allParticipants);

      // ✅ Create group chat
      const newChatId = await createGroupChat(sender, allParticipants);

      // await storeBotMessage({
      //   chatId : newChatId,
      //   content: `Hey everyone 👋 ${sender} started a trip planning chat ✈️`
      // })

      // (Next step later: send follow-up message to newChatId)
    }

  } catch (err) {
    console.error("❌ soloOrchestrator error:", err);
  }
}