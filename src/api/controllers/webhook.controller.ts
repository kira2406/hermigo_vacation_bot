import type { Request, Response } from "express";
import { publishWebhookEvent } from "../../services/publisher.service.js";

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
    console.error("[Webhook controller] Webhook error:", err);
    return res.sendStatus(500);
  }
}