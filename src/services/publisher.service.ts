import { getChannel, QUEUES } from "./rabbitmq.service.js";
import type { LinqWebhookPayload } from "../controllers/webhook.controller.js";

export function publishWebhookEvent(payload: LinqWebhookPayload): void {
  const channel = getChannel();
  const messageId = payload.data?.id;

  channel.sendToQueue(
    QUEUES.WEBHOOK_EVENTS,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,          // survives RabbitMQ restarts
      messageId,                 // ✅ RabbitMQ deduplication key
      contentType: "application/json",
    }
  );

  console.log(`📤 Event published to queue: ${messageId}`);
}