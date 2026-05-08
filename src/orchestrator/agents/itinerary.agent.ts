import Anthropic from "@anthropic-ai/sdk";
import {
  searchPlacesInCity,
  groupNearbyPlaces,
} from "./tools/google-maps.tool.js";
import {
  updateTravelDates,
  updateItinerary,
  updateVacationState,
  storeBotMessage,
  storeReaction,
} from "../../services/conversation.service.js";
import { sendMessage, sendReaction, type Reaction } from "../../linq/client.js";
import { itineraryTools, DATA_RETRIEVAL_TOOLS } from "./tools/index.js";

const anthropic = new Anthropic();
const MAX_TOOL_LOOPS = 5;
const DRY_RUN = process.env.DRY_RUN === "true";
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const SYSTEM_MESSAGE = `
You are an itinerary specialist for a group vacation planner accessible via text message in a group chat.

## What You Do
- Help groups plan a day-by-day itinerary for their trip
- Search Google Maps for attractions grouped by proximity
- Track travel dates and get group confirmation on the itinerary
- Advance to accommodation planning once the full group confirms

## Tools
- "search_places": Use to find tourist attractions, restaurants, and activities in the destination city
- "send_message": Send a text to the group. Use "---" to split into separate messages.
- "send_reaction": React to the latest message — use sparingly.
- "save_dates": Call when the group agrees on travel dates. Pass startDate and endDate as ISO strings.
- "save_itinerary": Call after building or updating the itinerary. Pass the structured list of activities.
- "confirm_itinerary": Call ONLY when ALL participants have explicitly confirmed the itinerary.
  Count confirmations by sender handle — no duplicates. Do NOT call until every member has confirmed.

## Workflow
1. No dates yet → ask the group when they plan to travel
2. Dates mentioned → confirm them with save_dates
3. Dates confirmed → search_places → send_message with day-by-day itinerary
4. Group gives feedback → update itinerary (only on consensus or direct request)
5. ALL members confirm → send_message acknowledging + confirm_itinerary

## Itinerary Format (in send_message)
- Organize by day with the date as a heading
- Each activity: "Morning: Place Name : One sentence description"
- Time slots: Morning / Afternoon / Evening
- Separate each day with "---"
- End with "---" and a short question like "How does this look?"
- Keep nearby places on the same day

## Confirmation Rules
- Count explicit agreements: "looks good", "I'm in", "let's do it", "sounds great", "+1"
- ALL participants must confirm — not just a majority
- If not everyone has confirmed, tell the group how many confirmations are still needed
- Only call confirm_itinerary when every single member has confirmed

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

## Reactions
React sparingly — text is always preferred. Never write "[reacted with ...]" in your text.
Standard: love, like, dislike, laugh, emphasize, question
Custom: any emoji
`;

export async function itineraryAgent(
  chatId: string,
  messageId: string | undefined,
  history: string,
  participantCount: number,
  destination: string,
  currentItinerary: any[]
): Promise<void> {
  const hasItinerary = currentItinerary && currentItinerary.length > 0;

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `
${SYSTEM_MESSAGE}

The group has ${participantCount} people planning a trip to ${destination}.
${hasItinerary ? `Current itinerary: ${JSON.stringify(currentItinerary)}` : "No itinerary planned yet."}
ALL ${participantCount} must confirm before calling confirm_itinerary.

Conversation history:
${history}
      `.trim(),
    },
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: itineraryTools,
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
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── send_reaction ─────────────────────────────────────────────────────

      } else if (name === "send_reaction") {
        if (!messageId) {
          console.warn("[itinerary] Cannot react: messageId is undefined");
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
          content: "Itinerary confirmed. State advanced to accommodation.",
        });

      } else {
        console.warn(`[itinerary] Unknown tool: ${name}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });
      }
    }

    messages.push({ role: "user", content: toolResults });

    // Only continue the loop if a data-fetching tool needs its result fed back
    if (hasDataTools) {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        tools: itineraryTools,
        messages,
      });
    } else {
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