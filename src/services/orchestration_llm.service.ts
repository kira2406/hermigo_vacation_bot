import OpenAI from "openai";

// ==========================================
// 1. Initialize the LLM Client
// ==========================================
// The client automatically picks up process.env.OPENAI_API_KEY
const openai = new OpenAI();

/**
 * Sends a prompt to the LLM and returns the response as a JSON string.
 * @param prompt The complete system instruction and conversation history.
 * @returns A stringified JSON object containing the bot's decision.
 */
export async function generateLlmResponse(prompt: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      // gpt-4o-mini is incredibly fast and cost-effective for frequent group chat polling
      model: "gpt-4o-mini", 
      messages: [
        {
          role: "system",
          content: prompt
        }
      ],
      // 🔥 CRITICAL: Forces the LLM to output pure JSON
      response_format: { type: "json_object" },
      
      // Lower temperature makes the bot's routing decisions more logical and consistent
      temperature: 0.2, 
    });

    const outputText = response.choices[0]?.message?.content;

    if (!outputText) {
      throw new Error("Received empty response from the LLM.");
    }

    return outputText;

  } catch (error) {
    console.error("❌ Error generating OpenAI response:", error);
    
    // Return a safe fallback JSON string so the orchestrator doesn't crash
    // The orchestrator will parse this and choose to "ignore" the message
    return JSON.stringify({
      action: "ignore",
      reasoning: "Fallback triggered due to OpenAI generation error."
    });
  }
}