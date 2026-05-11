import amqp, { type Channel, type ChannelModel } from "amqplib";
import { env } from "../config/env.js";

const RABBITMQ_URL = env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export const LINQ_EVENTS_QUEUE = "linq.events";

export async function getRabbitChannel() {
  if (channel) return channel;

  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertQueue(LINQ_EVENTS_QUEUE, {
    durable: true,
  });

  return channel;
}

export async function publishLinqEvent(event: any) {
  const ch = await getRabbitChannel();

  const eventId = event.event_id;

  ch.sendToQueue(
    LINQ_EVENTS_QUEUE,
    Buffer.from(JSON.stringify(event)),
    {
      persistent: true,
      messageId: eventId,
      contentType: "application/json",
    }
  );
}