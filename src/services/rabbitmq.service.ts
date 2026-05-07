import amqplib, { type ChannelModel, type Channel } from "amqplib";

export const QUEUES = {
  WEBHOOK_EVENTS: "webhook.events",
} as const;

let connection: ChannelModel;
let channel: Channel;

export async function connectRabbitMQ(): Promise<void> {
  connection = await amqplib.connect(process.env.RABBITMQ_URL || "amqp://admin:password@localhost:5672");
  channel = await connection.createChannel();

  // Durable: survives RabbitMQ restarts
  await channel.assertQueue(QUEUES.WEBHOOK_EVENTS, { durable: true });

  console.log("🐇 RabbitMQ connected");
}

export function getChannel(): Channel {
  if (!channel) throw new Error("RabbitMQ channel not initialized");
  return channel;
}