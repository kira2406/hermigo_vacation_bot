import OpenAI from "openai";
import { searchTripadvisorPlaces } from "../tools/tripadvisor.tool.js";

const openai = new OpenAI();

type DestinationAgentArgs = {
  query: string;
  limit?: number;
};

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_tripadvisor_attractions",
      description:
        "Search for attractions, landmarks, and things to do on TripAdvisor to match user interests.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The city and type of activity (e.g., 'London hiking' or 'Paris art museums')",
          },
          limit: { type: "number", default: 5 },
        },
        required: ["query"],
      },
    },
  },
];

const availableFunctions: Record<string, (args: DestinationAgentArgs) => Promise<any>> = {
  search_tripadvisor_attractions: async ({ query, limit }) => {
    return await searchTripadvisorPlaces(query, "A", limit);
  },
};

const FALLBACK = "I looked into some options but couldn't form a response.";

export async function destinationAgent(
  history: string,
  mode: "conflict" | "consensus"
): Promise<string> {
  const systemMessage =
  mode === "conflict"
    ? `You are a travel assistant helping a group choose a destination.
       Analyze the contested locations and recommend the best one for the group.
       Keep your response short and conversational — like a text message.
       Only include: your recommendation and a brief one-line reason why.
       Then list the top 3-5 activities there as a simple bullet list. Nothing else.`
    : `You are a travel assistant helping a group plan their trip.
       The group has chosen a destination. List the top 5 attractions or activities there.
       Format: Give a small heading followed by a simple bullet list with just the place name and one short sentence. Separate each list item with "---". Add --- after the list and your short sentence.
       No ratings, no links, no images, no headers, no extra commentary.
       Keep it short and conversational — like a text message.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: history },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.2,
  });

  const responseMessage = response.choices[0].message;
  const toolCalls = responseMessage.tool_calls;

  // No tool calls — return direct response
  if (!toolCalls || toolCalls.length === 0) {
    console.log("[Destination Agent] no tool calls, responding directly");
    return responseMessage.content ?? FALLBACK;
  }

  // Append assistant message with tool calls to history
  messages.push(responseMessage);

  // Execute each tool call
  for (const toolCall of toolCalls) {
    if (toolCall.type !== "function") continue; // ✅ narrows to ChatCompletionMessageToolCall

  const functionName = toolCall.function.name;
  const functionArgsString = toolCall.function.arguments;

    if (!functionName || !functionArgsString) continue;

    const fn = availableFunctions[functionName];
    if (!fn) {
      console.warn(`⚠️ Unknown tool called: ${functionName}`);
      continue;
    }

    let args: DestinationAgentArgs;
    try {
      args = JSON.parse(functionArgsString);
    } catch {
      console.error(`⚠️ Failed to parse args for tool: ${functionName}`);
      continue;
    }

    console.log(`[Destination Agent] calling tool: [${functionName}] with args:`, args);

    const toolResult = await fn(args);

    console.log(`[Destination Agent] Tool [${functionName}] returned:`, JSON.stringify(toolResult, null, 2));

    // ✅ Correct tool message shape — no `name` field
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
    });
  }

  // Final LLM call with tool results
  const secondResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  const finalDecision = secondResponse.choices[0].message.content ?? FALLBACK;

  console.log("[Destination Agent] final decision:", finalDecision);

  return finalDecision;
}