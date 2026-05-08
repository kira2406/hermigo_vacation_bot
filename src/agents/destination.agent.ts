import OpenAI from "openai";
import { searchTripadvisorPlaces } from "./tools/tripadvisor.tool.js";
import { updateVacationState, updateDestination, storeBotMessage, storeReaction } from "../services/conversation.service.js";
import { DATA_RETRIEVAL_TOOLS, destinationTools } from "./tools/index.js";
import { sendMessage, sendReaction, type Reaction } from "../linq/client.js";

const openai = new OpenAI();
const MAX_TOOL_LOOPS = 5
const DRY_RUN = process.env.DRY_RUN === "true";
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

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

const FALLBACK = "I looked into some options but couldn't form a response.";

const SYSTEM_MESSAGE = `
You are a destination specialist for a vacation planner accessible via text message in a group chat.

## What You Do
- Help groups decide on a travel destination by suggesting activities and tourism options
- Search TripAdvisor for activities and attractions in cities
- Recommend destinations when groups are in conflict
- Confirm the destination once the group reaches full consensus

## Tools
- "search_tripadvisor_attractions": Use when you need real data about a city's attractions
- "send_message": Send a text to the group with the search results. YOU MUST INCLUDE the attractions from the search in your message.
- "send_reaction": React to the latest message — use sparingly.
- "confirm_destination": Call THIS when:
  1. You've already shown the group attractions for a city AND
  2. The group has explicitly agreed/confirmed the location (e.g., "yes", "let's go", "confirmed", "shanghai is perfect")
  DO NOT call this on first search — wait for explicit agreement from the group.

## Workflow
1. Group debating → SEARCH for cities
2. After SEARCH → SEND_MESSAGE with attractions
3. Group says "yes, let's confirm" or similar → SEND_MESSAGE acknowledging + CONFIRM_DESTINATION
4. CONFIRM_DESTINATION locks in the city and advances to itinerary planning

## CRITICAL
- ALWAYS include search results in send_message
- Format each attraction as: "Place Name : One sentence description"
- Use --- to separate each attraction into its own message part
- ONLY call confirm_destination when the group has EXPLICITLY asked to confirm/lock in the location
- After confirm_destination, do NOT send more messages — the state has advanced

## Response Style
You are texting — write like a helpful friend.

CRITICAL: Mirror how humans actually text:
- Use "---" to split your response into separate messages sent individually
- Each message should be 1-2 sentences max
- ALWAYS split longer responses with ---
- This is NOT optional

Guidelines:
- NO markdown (no bullets, headers, bold, numbered lists)
- Be concise and conversational
- Skip apostrophes — "dont", "cant", "im", "thats"
- No ratings, no links, no image references

CONFLICT response style:
- Brief recommendation with a one-line reason
- Top 3-5 activities: "Place Name : One sentence"
- Separate each with ---

CONSENSUS response style:
- "Here's what to do in [city]:"
- Top 5 attractions: "Place Name : One sentence"
- Separate each with ---
- End with --- and a short question like "How do these sound?"

Then when group confirms:
- "Awesome! [City] it is!" or similar acknowledgment
- Call confirm_destination to lock it in

## Reactions
React to messages sparingly — text responses are always preferred. Use reactions only as supplements.

Standard: love, like, dislike, laugh, emphasize, question
Custom: any emoji

RULES:
1. Default to text — reactions are supplementary
2. Never react without also sending text unless its truly just an acknowledgment
3. Never write "[reacted with ...]" in your text
`;


export async function destinationAgent(
  chatId: string,
  messageId: string | undefined,
  history: string,
  recent_history: string,
  participantCount: number
): Promise<void> {
  
   const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${SYSTEM_MESSAGE}\n\nThe group has ${participantCount} people. ALL ${participantCount} must agree before calling confirm_destination.`,
    },
    { role: "user", content: history },
  ];

  let response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools: destinationTools,
    tool_choice: "auto",
    temperature: 0.2,
  });

  let loopCount = 0;

  while (
    response.choices[0].finish_reason === "tool_calls" &&
    loopCount < MAX_TOOL_LOOPS
  ) {
    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls ?? [];

    // Append assistant message to history
    messages.push(assistantMessage);

    const hasDataTools = toolCalls.some(
      (tc) =>
        tc.type === "function" &&
        DATA_RETRIEVAL_TOOLS.destination.has(tc.function.name)
    );

    const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;

      const { name, arguments: rawArgs } = toolCall.function;

      let args: any;
      try {
        args = JSON.parse(rawArgs);
      } catch {
        console.error(`[destination] Failed to parse args for: ${name}`);
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Error: failed to parse arguments",
        });
        continue;
      }

      // ── search_tripadvisor_attractions ──────────────────────────────────

      if (name === "search_tripadvisor_attractions") {
        try {
          console.log(`[destination] searching tripadvisor for: "${args.query}"`);
          const result = await searchTripadvisorPlaces(args.query, "A", args.limit);
          console.log(`[destination] tripadvisor returned ${result?.length ?? 0} results`);

          const formattedResults = (result || [])
          .map((place: any) => `${place.title} - ${place.description || "No description available"} - Location: ${place.location} - Ratings: ${place.rating || "N/A"}`)
          .join("\n");

          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: formattedResults || "No results found",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[destination] tripadvisor error:`, msg);
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error searching TripAdvisor: ${msg}`,
          });
        }

      // ── send_message ────────────────────────────────────────────────────

      } else if (name === "send_message") {

        const parts = (args.content as string)
          .split("---")
          .map((p: string) => cleanResponse(p.trim()))
          .filter(Boolean);

        for (const part of parts) {
          if (DRY_RUN) {
            console.log(`[DRY RUN] reply: "${part}"`);
          } else {
            await sendMessage(chatId, part);
            await delay(1500);
          }
        }

        await storeBotMessage({ chatId, content: args.content });
        toolResults.push({ role: "tool", tool_call_id: toolCall.id, content: "ok" });

      // ── send_reaction ───────────────────────────────────────────────────

      } else if (name === "send_reaction") {
        if (!messageId) {
          console.warn("[destination] Cannot react: messageId is undefined");
        } else if (DRY_RUN) {
          console.log(`[DRY RUN] react: "${args.emoji}"`);
        } else {
          await sendReaction(messageId, { type: args.emoji } as Reaction, "add");
        }

        await storeReaction({
          chatId,
          isGroup: true,
          sender: "VacationBot",
          reaction: args.emoji,
          actorType: "bot",
          rawPayload: {},
        });
        console.log(`[destination] reacted with: ${args.emoji}`);
        toolResults.push({ role: "tool", tool_call_id: toolCall.id, content: "ok" });

      // ── confirm_destination ─────────────────────────────────────────────

      } else if (name === "confirm_destination") {
        const city = args.city as string;
        await updateDestination(chatId, city);
        await updateVacationState(chatId, "itinerary");
        console.log(`[destination] Destination confirmed: ${city} → itinerary`);
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Destination locked as ${city}. State advanced to itinerary.`,
        });

      } else {
        console.warn(`[destination] Unknown tool: ${name}`);
        toolResults.push({ role: "tool", tool_call_id: toolCall.id, content: "ok" });
      }
    }

    for (const toolResult of toolResults) {
        messages.push(toolResult);
      }
  
    // Only continue loop if data tools need results fed back
    if (hasDataTools) {
  
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: destinationTools,
        tool_choice: "auto",
        temperature: 0.2,
      });

    } else {
      // Fire-and-forget only — we are done
      break;
    }

    loopCount++;
  }

}

function cleanResponse(text: string): string {
  return text
    .replace(/\n\s*-\s*/g, " - ")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1")
    .replace(/  +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}