import Anthropic from "@anthropic-ai/sdk";
import { searchTripadvisorPlaces } from "../../integrations/serp/travel.js";
import {
  updateVacationState,
  updateDestination,
  storeBotMessage,
  storeReaction,
} from "../../services/conversation.service.js";
import { sendMessage, sendReaction, type Reaction } from "../../linq/client.js";
import { cleanResponse, delay } from "../../util/helper.js";
import { anthropic } from "../../services/llm.service.js";
import { DATA_RETRIEVAL_TOOLS, destinationTools } from "../tools/index.js";
import { env } from "../../config/env.js";

const MAX_TOOL_LOOPS = 5;

export async function destinationAgent(
  chatId: string,
  messageId: string | undefined,
  history: string,
  recent_history: string,
  participantCount: number,
  isGroup: boolean,
): Promise<void> {

  const SYSTEM_MESSAGE = `
You are a destination specialist for a vacation planner accessible via text message${isGroup ? " in a group chat" : ""}.

## What You Do
- Help ${isGroup ? "groups" : "someone"} decide on a travel destination by suggesting activities and tourism options
- Search TripAdvisor for activities and attractions in cities
${isGroup ? "- Recommend destinations when groups are in conflict\n- Confirm the destination once the group reaches full consensus" : "- Confirm the destination once the user agrees"}

## Tools
- "search_tripadvisor_attractions": Use when you need real data about a city's attractions
- "send_message": Use the messages array to send multiple messages. Each attraction gets its own entry with content AND thumbnail.
  ALWAYS include both content and thumbnail for each message. Format each attraction as: "Place Name : One sentence description"
  Format:
  {
    "messages": [
      { "content": "Senso-ji Temple : Ancient Buddhist temple in Asakusa", "thumbnail": "https://..." },
      { "content": "Shibuya Crossing : The worlds busiest pedestrian crossing", "thumbnail": "https://..." }
    ]
  }
  Do NOT use --- splitting when each message needs a different image.
  Do NOT call send_message multiple times. Pack all 3-5 attractions into one call like:
  "Place A : description---Place B : description---Place C : description"
${isGroup ? `
  - "send_reaction": React to the latest message — use sparingly.
  "ignore": Truly off-topic, no vacation relevance. Wait for at least ${Math.ceil(participantCount / 2)} people to weigh in.
  ` : ""}
- "confirm_destination": Call THIS when:
  1. You've already shown ${isGroup ? "the group" : "the user"} attractions for a city AND
  2. ${isGroup ? "The group has explicitly agreed/confirmed" : "The user has explicitly agreed/confirmed"} the location.
  DO NOT call this on first search — wait for explicit agreement.
- "change_destination": Call when the user wants to change a previously confirmed destination.
  This clears the current destination and restarts destination planning.
  After calling this, search for new city attractions as normal.

## Workflow
1. ${isGroup ? "Group debating" : "User deciding"} → SEARCH for cities
2. After SEARCH → SEND_MESSAGE with attractions
3. ${isGroup ? "Group" : "User"} says "yes, let's confirm" or similar → SEND_MESSAGE acknowledging + CONFIRM_DESTINATION
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

Guidelines:
- NO markdown (no bullets, headers, bold, numbered lists)
- Be concise and conversational
- Skip apostrophes — "dont", "cant", "im", "thats"
- No ratings, no links, no image references

${isGroup ? `CONFLICT response style:
- Brief recommendation with a one-line reason
- Top 3-5 activities: "Place Name : One sentence"
- Separate each with ---

CONSENSUS response style:` : "SUGGESTION response style:"}
- "Here's what to do in [city]:"
- Top 2 attractions: "Place Name : One sentence"
- Separate each with ---
- End with --- and a short question like "How do these sound?"

Then when ${isGroup ? "group" : "user"} confirms:
- "Awesome! [City] it is!" or similar acknowledgment
- Call confirm_destination to lock it in

${isGroup ? `
## Reactions
React to messages sparingly — text responses are always preferred. Use reactions only as supplements.

Standard: love, like, dislike, laugh, emphasize, question
Custom: any emoji

RULES:
1. Default to text — reactions are supplementary
2. Never react without also sending text unless its truly just an acknowledgment
3. Never write "[reacted with ...]" in your text` : ""}
`;


  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `
      ${SYSTEM_MESSAGE}

      ${isGroup
        ? `The group has ${participantCount} people. ALL ${participantCount} must agree before calling confirm_destination.`
        : `This is a solo trip planning session. Confirm destination when the user agrees.`
      }

      Conversation history:
      ${history}
            `.trim(),
    },
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: destinationTools(isGroup),
    messages,
  });

  // console.log(`[destination] "initial response:", ${JSON.stringify(response)}]`);

  let loopCount = 0;

  while (response.stop_reason === "tool_use" && loopCount < MAX_TOOL_LOOPS) {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    messages.push({ role: "assistant", content: response.content });

    const hasDataTools = toolUseBlocks.some((b) =>
      DATA_RETRIEVAL_TOOLS?.destination?.has(b.name)
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const { id, name, input } = block;
      const args = input as any;

      // ── search_tripadvisor_attractions ──────────────────────────────────

      if (name === "search_tripadvisor_attractions") {
        try {
          console.log(`[destination] searching tripadvisor for: "${args.query}"`);
          const result = await searchTripadvisorPlaces(args.query, "A", args.limit);
          console.log(`[destination] tripadvisor returned ${result?.length ?? 0} results`);

          const formattedResults = (result || [])
            .map(
              (place: any) =>
                `${place.title} - ${place.description || "No description available"} - Location: ${place.location} - Ratings: ${place.rating || "N/A"} - Thumbnail: ${place.thumbnail || "N/A"}`
            )
            .join("\n");

          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: formattedResults || "No results found",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[destination] tripadvisor error:`, msg);
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: `Error searching TripAdvisor: ${msg}`,
          });
        }

      // ── send_message ────────────────────────────────────────────────────

      } else if (name === "send_message") {
        if (args.messages && Array.isArray(args.messages)) {
          for (const msg of args.messages) {
            const text = cleanResponse(msg.content?.trim() ?? "");
            if (!text) continue;

            const media = msg.thumbnail ? [{ url: msg.thumbnail }] : undefined;

            if (env.DRY_RUN) {
              console.log(`[DRY RUN] reply: "${text}"${msg.thumbnail ? ` [image: ${msg.thumbnail}]` : ""}`);
            } else {
              await sendMessage(chatId, text, undefined, undefined, media);
              await delay(1500);
            }
          }} else if (args.content) {
          const parts = (args.content as string)
            .split("---")
            .map((p: string) => cleanResponse(p.trim()))
            .filter(Boolean);

          for (const part of parts) {
            const media = args.thumbnail ? [{ url: args.thumbnail }] : undefined;

            if (env.DRY_RUN) {
              console.log(`[DRY RUN] reply: "${part}"${args.thumbnail ? ` [image: ${args.thumbnail}]` : ""}`);
            } else {
              await sendMessage(chatId, part, undefined, undefined, media);
              await delay(1500);
            }
          }

          await storeBotMessage({ chatId, content: args.content });
        }

        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── send_reaction ───────────────────────────────────────────────────

      } else if (name === "send_reaction") {
        if (!messageId) {
          console.warn("[destination] Cannot react: messageId is undefined");
        } else if (env.DRY_RUN) {
          console.log(`[DRY RUN] react: "${args.emoji}"`);
        } else {
          await sendReaction(messageId, { type: args.emoji } as Reaction, "add");
        }

        await storeReaction({
          chatId,
          isGroup: true,
          sender: "HermigoBot",
          reaction: args.emoji,
          actorType: "bot",
          rawPayload: {},
        });
        console.log(`[destination] reacted with: ${args.emoji}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── ignore ──────────────────────────────────────────────────────────

      } else if (name === "ignore") {
        console.log(`[destination] ignoring: ${args.reasoning}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── confirm_destination ─────────────────────────────────────────────

      } else if (name === "confirm_destination") {
        console.log(`[destination] Destination confirmed`);
        const city = args.city as string;
        await updateDestination(chatId, city);
        await updateVacationState(chatId, "itinerary");
        console.log(`[destination] Destination confirmed: ${city} → itinerary`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: `Destination locked as ${city}. State advanced to itinerary. Ask the user for the dates for the trip next.`,
        });

      } else if (name === "change_destination") {
        await updateVacationState(chatId, "destination");
        await updateDestination(chatId, null); // clear the old destination
        console.log(`[destination] Destination reset — back to destination planning`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: "Destination cleared. Back to destination planning.",
        });
      } else {
        console.warn(`[destination] Unknown tool: ${name}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });
      }
    }

    messages.push({ role: "user", content: toolResults });

    const hasTerminalTool = toolUseBlocks.some(
      (b) => b.name === "confirm_destination" || b.name === "ignore"
    );

    if (hasTerminalTool) {
      break; // done — no point continuing after confirming or ignoring
    }

    
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools: destinationTools(isGroup),
      tool_choice: { type: "any" },
      messages,
    });

    loopCount++;
  }
}