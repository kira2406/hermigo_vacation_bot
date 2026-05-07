import { getChannel, QUEUES } from "../services/rabbitmq.service.js";
import { groupOrchestrator } from "../orchestrator/group_orchestrator/index.js";
import { soloOrchestrator } from "../orchestrator/solo.orchestrator.js";
import { storeParticipantMessage } from "../services/conversation.service.js";
import type { LinqWebhookPayload } from "../controllers/webhook.controller.js";

export async function startWebhookWorker(): Promise<void> {
  const channel = getChannel();

  // Only process 1 message at a time per worker instance
  channel.prefetch(1);

  console.log("⚙️ Webhook worker started, waiting for events...");

  channel.consume(QUEUES.WEBHOOK_EVENTS, async (msg) => {
    if (!msg) return;

    const messageId = msg.properties.messageId;

    try {
      const payload = JSON.parse(msg.content.toString()) as LinqWebhookPayload;

      const message = payload.data?.parts?.[0]?.value;
      const sender = payload.data?.sender_handle?.handle;
      const chatId = payload.data?.chat?.id;
      const isGroup = payload.data?.chat?.is_group;

      if (!message || !sender || !chatId) {
        console.warn("⚠️ Missing required fields, discarding message");
        channel.ack(msg); // ✅ ack to remove from queue
        return;
      }

      console.log(`⚙️ Processing event: ${messageId}`);

      if (isGroup) {
        await storeParticipantMessage({
          chatId,
          isGroup,
          sender,
          content: message,
          rawPayload: payload,
        });

        await groupOrchestrator({
          chatId,
          messageId,
          text: message,
          sender,
          eventType: payload.event_type,
        });
      } else {
        await soloOrchestrator({ text: message, sender, chatId, messageId });
      }

      channel.ack(msg); // ✅ remove from queue on success

    } catch (error) {
      console.error(`❌ Worker failed for message ${messageId}:`, error);
      // nack + requeue: false = discard after failure (avoids infinite loops)
      channel.nack(msg, false, false);
    }
  });
}