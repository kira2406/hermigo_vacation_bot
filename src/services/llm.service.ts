import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ✅ Define response type
export interface IntentResponse {
  intent: "create_trip" | "unknown";
  participants: string[];
}

export async function detectIntent(text: string): Promise<IntentResponse> {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
          Extract intent and participants.

          Return JSON:
          {
            "intent": "",
            "participants": []
          }

          Possible intents:
          - create_trip
          - unknown
          `
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const raw = response.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Empty response from LLM");
    }

    const parsed = JSON.parse(raw) as IntentResponse;

    // ✅ Safety fallback
    return {
      intent: parsed.intent || "unknown",
      participants: Array.isArray(parsed.participants)
        ? parsed.participants
        : []
    };

  } catch (err) {
    console.error("❌ LLM detectIntent error:", err);

    // ✅ Fallback response (VERY IMPORTANT)
    return {
      intent: "unknown",
      participants: []
    };
  }
}