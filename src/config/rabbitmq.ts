import amqplib, { type ChannelModel, type Channel } from "amqplib";
import { env } from "./env.js";

export const QUEUES = {
  WEBHOOK_EVENTS: "webhook.events",
  LINQ_EVENTS: "linq.events"
} as const;

let connection: ChannelModel;
let channel: Channel;

export async function connectRabbitMQ(): Promise<void> {
  connection = await amqplib.connect(env.RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertQueue(QUEUES.WEBHOOK_EVENTS, { durable: true });
  await channel.assertQueue(QUEUES.LINQ_EVENTS, { durable: true });

  console.log("[RabbitMQ] connected");
}

export function getChannel(): Channel {
  if (!channel) throw new Error("[RabbitMQ] channel not initialized");
  return channel;
}