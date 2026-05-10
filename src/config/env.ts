import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3000"),
  MONGO_URI: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string(),
  LINQ_API_BASE_URL: z.string().url(),
  LINQ_API_TOKEN: z.string(),
  LINQ_PHONE_NUMBER: z.string(),
});

export const env = envSchema.parse(process.env);