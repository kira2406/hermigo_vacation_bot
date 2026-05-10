import type { Application, Request, Response } from "express";
import express from "express";
import webhookRoutes from "./api/routes/webhook.route.js";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { Client } from "langsmith";
import { connectRabbitMQ } from "./config/rabbitmq.js";
import { startWebhookWorker } from "./workers/webhook.worker.js";

dotenv.config();

const app: Application = express();
const client = new Client();

app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "🚀 Server is running",
    status: "OK",
  });
});

app.use("/webhook", webhookRoutes);

const PORT: number = Number(process.env.PORT) || 3000;

async function bootstrap(): Promise<void> {
  try {
    await connectDB();
    console.log("[Database] connected");

    await connectRabbitMQ();
    console.log("[RabbitMQ] connected");

    await startWebhookWorker();
    console.log("[Webhook worker] started");

    app.listen(PORT, () => {
      console.log(`[Server] running on port ${PORT}`);
    });
  } catch (error) {
    console.error("[Server] Failed to bootstrap server:", error);
    process.exit(1); // crash fast if any connection fails
  }
}

bootstrap();