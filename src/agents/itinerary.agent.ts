import OpenAI from "openai";
import {
  searchPlacesInCity,
  groupNearbyPlaces,
} from "../tools/google-maps.tool.js";
import {
  updateTravelDates,
  updateItinerary,
  updateVacationState,
} from "../services/conversation.service.js";

const openai = new OpenAI();
const FALLBACK = "I ran into an issue planning the itinerary. Let me try again shortly.";

export type ItineraryAgentResult = {
  action: "ignore" | "react" | "reply";
  content: string;
  advanceState: boolean;
};

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Search for tourist attractions and activities in a city using Google Maps.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "The destination city" },
          type: {
            type: "string",
            description: "Type of place (e.g. tourist_attraction, restaurant, museum)",
            default: "tourist_attraction",
          },
          limit: { type: "number", default: 10 },
        },
        required: ["city"],
      },
    },
  },
];

const availableFunctions: Record<string, (args: any) => Promise<any>> = {
  search_places: async ({ city, type, limit }) => {
    const places = await searchPlacesInCity(city, type, limit);
    const grouped = await groupNearbyPlaces(places);
    return grouped;
  },
};

export async function itineraryAgent(
  chatId: string,
  history: string,
  participantCount: number,
  destination: string,
  currentItinerary: any[]
): Promise<ItineraryAgentResult> {
  const hasItinerary = currentItinerary && currentItinerary.length > 0;

  const systemMessage = `
    You are an itinerary specialist for a group vacation planner.
    The group has ${participantCount} people planning a trip to ${destination}.
    ${hasItinerary ? `Current itinerary: ${JSON.stringify(currentItinerary)}` : "No itinerary planned yet."}

    Read the conversation history and decide the best action:

    ACTIONS:
    1. "ignore" — Group is casually chatting, no action needed.
    2. "react" — A simple reaction is enough.
       Pick one: "love" | "like" | "dislike" | "laugh" | "emphasize" | "question"
    3. "reply" — Answer a simple question directly.
    4. "ask_dates" — No travel dates mentioned yet. Ask the group when they plan to travel.
    5. "confirm_dates" — Group has agreed on travel dates. Extract and confirm them.
    6. "build_itinerary" — Dates are confirmed. Use search_places tool to find nearby attractions
       and build a day-by-day itinerary grouped by proximity.
    7. "update_itinerary" — Group has feedback or consensus on changing specific activities.
       Only update if: the group reaches consensus OR someone directly asks you to update.
       Wait for agreement — don't update on a single complaint.
    8. "confirm_itinerary" — The ENTIRE group of ${participantCount} people has explicitly agreed
       on the itinerary. Count the confirmations in the conversation history.
       Only use this action when ALL ${participantCount} members have confirmed.
       If some but not all have confirmed, use "reply" to let the group know who hasn't confirmed yet.

    CONFIRMATION RULES (for "confirm_itinerary"):
    - Count explicit agreements in the history (e.g. "looks good", "I'm in", "let's do it", "sounds great", "+1")
    - ALL ${participantCount} participants must have agreed — not just a majority
    - If not everyone has confirmed, use "reply" and say something like:
      "Still waiting on [number] more confirmations before we lock it in!"
    - Only set action to "confirm_itinerary" when every single member has confirmed
    - Track who has confirmed by their sender handle to avoid counting duplicates

    ITINERARY FORMAT (for build_itinerary and update_itinerary):
    - Organize by day with the date as heading
    - Each activity on its own line: "Morning: Place Name : One sentence description"
    - Time slots: Morning / Afternoon / Evening
    - Separate each day with "---"
    - End with "---" and a short question like "How does this look?"
    - Keep nearby places on the same day

    FOR "confirm_dates" and "build_itinerary", extract:
    - "startDate": ISO date string (e.g. "2026-07-10")
    - "endDate": ISO date string (e.g. "2026-07-15")

    RESPONSE FORMAT (strict JSON):
    {
      "action": "ignore" | "react" | "reply" | "ask_dates" | "confirm_dates" | "build_itinerary" | "update_itinerary" | "confirm_itinerary",
      "startDate": "ISO date or null",
      "endDate": "ISO date or null",
      "confirmedBy": ["handle1", "handle2"], // list of who has confirmed so far
      "content": "Message to send, emoji if react, blank if ignore",
      "reasoning": "Brief explanation"
    }

    Keep replies short and conversational — like a text message.
    Use "---" to split longer messages.
    No markdown, no bold, no headers.
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

      const fn = availableFunctions[toolCall.function.name];
      if (!fn) {
        console.warn(`⚠️ Unknown tool: ${toolCall.function.name}`);
        continue;
      }

      let args: any;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error(`⚠️ Failed to parse args for: ${toolCall.function.name}`);
        continue;
      }

      console.log(`🔧 Itinerary Agent calling tool [${toolCall.function.name}] with args:`, args);
      const result = await fn(args);
      console.log(`✅ Tool [${toolCall.function.name}] returned ${result.length} day groups`);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
    });

    return parseItineraryResult(chatId, secondResponse.choices[0].message.content ?? "{}");
  }

  return parseItineraryResult(chatId, responseMessage.content ?? "{}");
}

async function parseItineraryResult(
  chatId: string,
  raw: string
): Promise<ItineraryAgentResult> {
  try {
    const parsed = JSON.parse(raw);
    const action = parsed.action as string;
    const content = parsed.content ?? "";
    const startDate = parsed.startDate ? new Date(parsed.startDate) : null;
    const endDate = parsed.endDate ? new Date(parsed.endDate) : null;
    const confirmedBy: string[] = parsed.confirmedBy ?? [];

    console.log(`🗓️ Itinerary Agent action: [${action}]`);
    console.log(`🗓️ Itinerary Agent content: ${content}`);

    // Save dates when confirmed
    if (
      (action === "confirm_dates" || action === "build_itinerary") &&
      startDate &&
      endDate
    ) {
      await updateTravelDates(chatId, startDate, endDate);
      console.log(`✅ Travel dates saved: ${startDate.toDateString()} → ${endDate.toDateString()}`);
    }

    // Save itinerary to DB when built or updated
    if (action === "build_itinerary" || action === "update_itinerary") {
      const itineraryItems = extractItineraryItems(content, startDate);
      if (itineraryItems.length > 0) {
        await updateItinerary(chatId, itineraryItems);
        console.log(`✅ Itinerary saved with ${itineraryItems.length} activities`);
      }
    }

    // ✅ Entire group confirmed — mark itinerary confirmed and advance state
    if (action === "confirm_itinerary") {
      await updateVacationState(chatId, "accommodation");
      console.log(`✅ Itinerary confirmed by: ${confirmedBy.join(", ")} → advancing to accommodation`);

      return {
        action: "reply",
        content: content || "Itinerary locked in! 🎉 Let's find somewhere to stay next.",
        advanceState: true,
      };
    }

    // Map internal actions to execution node actions
    const replyActions = ["ask_dates", "confirm_dates", "build_itinerary", "update_itinerary", "reply"];
    return {
      action: replyActions.includes(action) ? "reply" : action as "ignore" | "react",
      content,
      advanceState: false,
    };
  } catch {
    console.error("❌ Failed to parse itinerary agent result:", raw);
    return { action: "reply", content: FALLBACK, advanceState: false };
  }
}

// Extract structured itinerary items from the LLM's reply for DB storage
function extractItineraryItems(
  content: string,
  startDate: Date | null
): { date: Date; activity: string; confirmed: boolean }[] {
  if (!startDate) return [];

  const items: { date: Date; activity: string; confirmed: boolean }[] = [];
  const days = content.split("---").filter(Boolean);
  let dayOffset = 0;

  for (const day of days) {
    const lines = day.trim().split("\n").filter(Boolean);
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayOffset);

    for (const line of lines) {
      if (line.includes(":")) {
        items.push({ date, activity: line.trim(), confirmed: false });
      }
    }
    dayOffset++;
  }

  return items;
}