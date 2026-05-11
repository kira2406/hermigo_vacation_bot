import Anthropic from "@anthropic-ai/sdk";

import {
  updateTravelDates,
  updateItinerary,
  updateVacationState,
  storeBotMessage,
  storeReaction,
} from "../../services/conversation.service.js";
import { sendMessage, sendReaction, type Reaction } from "../../linq/client.js";
import { itineraryTools, DATA_RETRIEVAL_TOOLS } from "../tools/index.js";
import { cleanResponse, delay } from "../../util/helper.js";
import { anthropic } from "../../services/llm.service.js";
import { groupNearbyPlaces, searchPlacesInCity } from "../../integrations/serp/maps.js";
import { env } from "../../config/env.js";

const MAX_TOOL_LOOPS = 5;

export async function itineraryAgent(
  chatId: string,
  messageId: string | undefined,
  history: string,
  participantCount: number,
  destination: string,
  currentItinerary: any[],
  isGroup: boolean
): Promise<void> {

  const SYSTEM_MESSAGE = `
You are an itinerary specialist for a vacation planner accessible via text message${isGroup ? " in a group chat" : ""}.

## What You Do
- Help ${isGroup ? "groups" : "someone"} plan a day-by-day itinerary for their trip
- Search Google Maps for attractions grouped by proximity
- Track travel dates and get ${isGroup ? "group" : ""} confirmation on the itinerary
- Advance to accommodation planning once ${isGroup ? "the full group confirms" : "the user confirms"}

## Tools
- "search_places": Use to find tourist attractions, restaurants, and activities in the destination city
- "send_message": Send a text${isGroup ? " to the group" : ""}. Use "---" to split into separate messages.
${isGroup ? `- "send_reaction": React to the latest message — use sparingly.` : ""}
- "save_dates": Call when ${isGroup ? "the group agrees" : "the user confirms"} on travel dates. Pass startDate and endDate as ISO strings.
- "save_itinerary": Call after building or updating the itinerary. Pass the structured list of activities.
- "confirm_itinerary": Call ONLY when ${isGroup ? `ALL ${participantCount} participants have explicitly confirmed` : "the user has explicitly confirmed"} the itinerary.
  ${isGroup ? "Count confirmations by sender handle — no duplicates. Do NOT call until every member has confirmed." : ""}

## Workflow
1. No dates yet → ask ${isGroup ? "the group" : "the user"} when they plan to travel
2. Dates mentioned → confirm them with save_dates
3. Dates confirmed → search_places → send_message with day-by-day itinerary
4. ${isGroup ? "Group" : "User"} gives feedback → update itinerary ${isGroup ? "(only on consensus or direct request)" : ""}
5. ${isGroup ? "ALL members confirm" : "User confirms"} → send_message acknowledging + confirm_itinerary

## Itinerary Format (in send_message)
- Organize by day with the date as a heading
- Each activity: "Morning: Place Name : One sentence description"
- Time slots: Morning / Afternoon / Evening
- Separate each day with "---"
- End with "---" and a short question like "How does this look?"
- Keep nearby places on the same day

## Confirmation Rules
${isGroup ? `
- Count explicit agreements: "looks good", "I'm in", "let's do it", "sounds great", "+1"
- ALL ${participantCount} participants must confirm — not just a majority
- If not everyone has confirmed, tell the group how many confirmations are still needed
- Only call confirm_itinerary when every single member has confirmed
` : `
- Confirm when the user says "looks good", "let's do it", "sounds great", or similar
- Call confirm_itinerary immediately on explicit confirmation
`}

## Response Style
You are texting — write like a helpful friend. Keep the tone casual and concise.

CRITICAL: Mirror how humans actually text:
- Use "---" to split your response into separate messages sent individually
- Each message should be 1-2 sentences max
- ALWAYS split longer responses with ---

Guidelines:
You MUST always call a tool. Never respond with plain text.
- NO markdown (no bullets, headers, bold, numbered lists)
- Be concise and conversational
- Skip apostrophes — "dont", "cant", "im", "thats"
- No ratings, no links, no image references
${isGroup ? `
## Reactions
React sparingly — text is always preferred. Never write "[reacted with ...]" in your text.
Standard: love, like, dislike, laugh, emphasize, question
Custom: any emoji
` : ""}
`;

  const hasItinerary = currentItinerary && currentItinerary.length > 0;

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `
${SYSTEM_MESSAGE}

${isGroup
  ? `The group has ${participantCount} people planning a trip to ${destination}.
ALL ${participantCount} must confirm before calling confirm_itinerary.`
  : `This is a solo trip to ${destination}.
Confirm itinerary when the user explicitly agrees.`
}
${hasItinerary ? `Current itinerary: ${JSON.stringify(currentItinerary)}` : "No itinerary planned yet."}

Conversation history:
${history}
      `.trim(),
    },
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: itineraryTools(isGroup),
    tool_choice: { type: "any" },
    messages,
  });

  let loopCount = 0;

  while (response.stop_reason === "tool_use" && loopCount < MAX_TOOL_LOOPS) {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    // Append assistant turn to history
    messages.push({ role: "assistant", content: response.content });

    const hasDataTools = toolUseBlocks.some((b) =>
      DATA_RETRIEVAL_TOOLS?.itinerary?.has(b.name)
    );

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const { id, name, input } = block;
      const args = input as any;

      // ── search_places ────────────────────────────────────────────────────

      if (name === "search_places") {
        try {
          console.log(`[itinerary] searching places in: "${args.city}" type: "${args.type ?? "tourist_attraction"}"`);
          const places = await searchPlacesInCity(args.city, args.type ?? "tourist_attraction", args.limit ?? 10);
          const grouped = await groupNearbyPlaces(places);
          console.log(`[itinerary] search_places returned ${grouped.length} day groups`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: JSON.stringify(grouped),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[itinerary] search_places error:`, msg);
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: `Error searching places: ${msg}`,
          });
        }

      // ── send_message ─────────────────────────────────────────────────────

      } else if (name === "send_message") {
        // Handle messages array format
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
    }

    const fullContent = args.messages.map((m: any) => m.content).join("\n");
    await storeBotMessage({ chatId, content: fullContent });

  } else if (args.content) {
    // Handle single content string
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

  } else {
    console.warn("[accommodation] send_message called with no content or messages — skipping");
  }

  toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── send_reaction ─────────────────────────────────────────────────────

      } else if (name === "send_reaction") {
        if (!messageId) {
          console.warn("[itinerary] Cannot react: messageId is undefined");
        } else if (env.DRY_RUN) {
          console.log(`[DRY RUN] react: "${args.emoji}"`);
        } else {
          await sendReaction(messageId, { type: args.emoji } as Reaction, "add");
        }

        await storeReaction({
          chatId,
          isGroup,
          sender: "HermigoBot",
          reaction: args.emoji,
          actorType: "bot",
          rawPayload: {},
        });
        console.log(`[itinerary] reacted with: ${args.emoji}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── save_dates ────────────────────────────────────────────────────────

      } else if (name === "save_dates") {
        try {
          const startDate = new Date(args.startDate);
          const endDate = new Date(args.endDate);
          await updateTravelDates(chatId, startDate, endDate);
          console.log(`[itinerary] Travel dates saved: ${startDate.toDateString()} → ${endDate.toDateString()}`);
          toolResults.push({ type: "tool_result", tool_use_id: id, content: "Dates saved." });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[itinerary] save_dates error:`, msg);
          toolResults.push({ type: "tool_result", tool_use_id: id, content: `Error saving dates: ${msg}` });
        }

      // ── save_itinerary ────────────────────────────────────────────────────

      } else if (name === "save_itinerary") {
        try {
          const items = (args.activities as any[]).map((a: any) => ({
            date: new Date(a.date),
            activity: a.activity,
            confirmed: false,
          }));
          if (items.length > 0) {
            await updateItinerary(chatId, items);
            console.log(`[itinerary] Itinerary saved with ${items.length} activities`);
          }
          toolResults.push({ type: "tool_result", tool_use_id: id, content: "Itinerary saved." });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[itinerary] save_itinerary error:`, msg);
          toolResults.push({ type: "tool_result", tool_use_id: id, content: `Error saving itinerary: ${msg}` });
        }

      // ── confirm_itinerary ─────────────────────────────────────────────────

      } else if (name === "confirm_itinerary") {
        await updateVacationState(chatId, "accommodation");
        const confirmedBy: string[] = args.confirmedBy ?? [];
        console.log(`[itinerary] Itinerary confirmed by: ${confirmedBy.join(", ")} → advancing to accommodation`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: "Itinerary confirmed. State advanced to accommodation. Suggest next steps for booking hotels and flights.",
        });

      } else {
        console.warn(`[itinerary] Unknown tool: ${name}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });
      }
    }

    messages.push({ role: "user", content: toolResults });

    const hasTerminalTool = toolUseBlocks.some(
      (b) => b.name === "confirm_itinerary" || b.name === "ignore"
    );

    if (hasTerminalTool) {
      break;
    }

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools: itineraryTools(isGroup),
      tool_choice: { type: "any" },
      messages,
    });

    loopCount++;
  }
}