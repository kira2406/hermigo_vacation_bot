import type { Request, Response } from "express";
import { soloOrchestrator } from "../orchestrator/solo.orchestrator.js";
// import { groupOrchestrator } from "../orchestrator/group.orchestrator.js";
import { storeParticipantMessage } from "../services/conversation.service.js";
import { groupOrchestrator } from "../orchestrator/group_orchestrator/index.js";
import { publishWebhookEvent } from "../services/publisher.service.js";

// ✅ Define payload shape (minimal version for now)
export interface LinqWebhookPayload {
  event_type: string;
  data: {
    parts: { value: string }[];
    sender_handle: { handle: string };
    chat: {
      id: string;
      is_group: boolean;
    },
    id: string
  };
}

export async function handleWebhook(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const data = req.body as LinqWebhookPayload;


    // ✅ Filter only incoming messages
    if (data?.event_type !== "message.received") {
      return res.sendStatus(200);
    }

    publishWebhookEvent(data); // Log raw event to RabbitMQ for worker processing

    return res.sendStatus(200); // Acknowledge immediately
  }
  catch (err) {
    console.error("❌ Webhook error:", err);
    return res.sendStatus(500);
  }
}
    // const messageId = data?.data?.message_id; // Placeholder, depends on Linq's actual payload structure

//     console.log("📨 Incoming:", message);
//     console.log("👤 Sender:", sender);
//     console.log("👥 Is Group:", isGroup);

//     // ✅ Guard clause
//     if (!message || !sender || !chatId) {
//       console.log("⚠️ Missing required fields");
//       return res.sendStatus(200);
//     }

//     // 🔥 ROUTING LOGIC
    
//     if (isGroup) {
      
//       await storeParticipantMessage({
//       chatId,
//       isGroup,
//       sender,
//       content: message,
//       rawPayload: data,
//     });

//       // await groupOrchestrator({
//       //   text: message,
//       //   sender,
//       //   chatId,
//       //   eventType: data.event_type,
//       //   messageId
//       // });

//       await groupOrchestrator({
//         chatId,
//         messageId,
//         text: message,
//         sender,
//         eventType: data.event_type
//       });


//     } else {
//       await soloOrchestrator({
//         text: message,
//         sender,
//         chatId,
//         messageId
//       });
//     }

//     return res.sendStatus(200);

//   } catch (err) {
//     console.error("❌ Webhook error:", err);
//     return res.sendStatus(500);
//   }
// }