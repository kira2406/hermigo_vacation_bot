import OpenAI from "openai";
import { searchTripadvisorPlaces } from "../tools/tripadvisor.tool.js";
import { updateVacationState, updateDestination } from "../services/conversation.service.js";

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
      description: "Search for attractions and activities on TripAdvisor for a given city.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "City and activity type (e.g. 'Tokyo hiking' or 'Paris art museums')",
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

export type DestinationAgentResult = {
  action: "ignore" | "react" | "reply";
  content: string;
  confirmedDestination?: string;
  advanceState: boolean;
};

export async function destinationAgent(
  chatId: string,
  history: string,
  participantCount: number
): Promise<DestinationAgentResult> {
  const systemMessage = `
  You are a destination specialist for a group vacation planner.
  The group has ${participantCount} people.

  Read the conversation history and decide the best action:

  ACTIONS:
  1. "ignore" — The group is still casually chatting about locations. Not enough signal yet.
  2. "react" — A simple reaction is enough (e.g. someone shared excitement about a city). 
     Pick one: "love" | "like" | "dislike" | "laugh" | "emphasize" | "question"
  3. "reply" — You can answer a simple location-related question directly without searching.
  4. "search_and_reply" — Deep dive needed. Use this when:
     - CONFLICT: Group is debating between cities → search each city → recommend best one
     - CONSENSUS: Group agreed on a destination → search activities there → list them
     - UNDECIDED: Group needs suggestions → search based on their interests

  RESPONSE STYLE FOR "search_and_reply":

  CONFLICT:
  - Analyze the contested locations and recommend the best one for the group
  - Keep it short and conversational — like a text message
  - Only include: your recommendation and a brief one-line reason why
  - Then list the top 3-5 activities as a simple bullet list
  - Nothing else — no ratings, no links, no images

  CONSENSUS:
  - Give a short heading like "Here's what to do in [city]:" followed by a newline
  - Each item must be formatted as: "Place Name : One short sentence description"
  - Separate each ITEM with "---" (not the name and description)
  - End with "---" followed by a short engaging question to the group like "How do these sound?"
  - No ratings, no links, no images, no extra commentary

  UNDECIDED:
  - Gently prompt the group to narrow down their options
  - Keep it to 1-2 sentences

  FOR "search_and_reply" ONLY, also set:
  - "situation": "conflict" | "consensus" | "undecided"
  - "confirmedDestination": "<city name>" if situation is "consensus", otherwise null

  RESPONSE FORMAT (strict JSON):
  {
    "action": "ignore" | "react" | "reply" | "search_and_reply",
    "situation": "conflict" | "consensus" | "undecided" | null,
    "confirmedDestination": "City name or null",
    "content": "Message if reply/search_and_reply, emoji if react, blank if ignore",
    "reasoning": "Brief explanation"
  }

  Keep replies short and conversational like a text message.
  Use "---" to split longer replies into separate messages.
  No markdown, no headers, no bold text.
`;

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
    response_format: { type: "json_object" },
  });

  const responseMessage = response.choices[0].message;
  const toolCalls = responseMessage.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    messages.push(responseMessage);

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;

      const functionName = toolCall.function.name;
      const fn = availableFunctions[functionName];

      if (!fn) {
        console.warn(`⚠️ Unknown tool: ${functionName}`);
        continue;
      }

      let args: DestinationAgentArgs;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error(`⚠️ Failed to parse args for tool: ${functionName}`);
        continue;
      }

      console.log(`🔧 Calling tool [${functionName}] with args:`, args);
      const toolResult = await fn(args);
      console.log(`✅ Tool [${functionName}] returned:`, JSON.stringify(toolResult, null, 2));

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }

    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
    });

    return parseAgentResult(chatId, secondResponse.choices[0].message.content ?? "{}");
  }

  return parseAgentResult(chatId, responseMessage.content ?? "{}");
}

async function parseAgentResult(
  chatId: string,
  raw: string
): Promise<DestinationAgentResult> {
  try {
    const parsed = JSON.parse(raw);
    const action = parsed.action as "ignore" | "react" | "reply" | "search_and_reply";
    const situation = parsed.situation as "conflict" | "consensus" | "undecided" | null;
    const content = parsed.content ?? "";
    const confirmedDestination = parsed.confirmedDestination ?? undefined;

    console.log(`🗺️ Destination Agent action: [${action}] situation: [${situation}]`);
    console.log(`🗺️ Destination Agent content: ${content}`);

    // Consensus — save to DB and advance state
    if (action === "search_and_reply" && situation === "consensus" && confirmedDestination) {
      await updateDestination(chatId, confirmedDestination);
      await updateVacationState(chatId, "itinerary");
      console.log(`✅ Destination locked: ${confirmedDestination} → state advanced to itinerary`);

      return {
        action: "reply",
        content,
        confirmedDestination,
        advanceState: true,
      };
    }

    // All other cases — map search_and_reply to reply for execution node
    return {
      action: action === "search_and_reply" ? "reply" : action,
      content,
      advanceState: false,
    };
  } catch {
    console.error("❌ Failed to parse destination agent result:", raw);
    return { action: "reply", content: FALLBACK, advanceState: false };
  }
}