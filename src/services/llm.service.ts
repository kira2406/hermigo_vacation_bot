// import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

// export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
