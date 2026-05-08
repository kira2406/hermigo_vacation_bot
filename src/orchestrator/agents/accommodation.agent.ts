import Anthropic from "@anthropic-ai/sdk";
import { searchHotels, searchFlights } from "./tools/serp.tool.js";
import {
  confirmFlights,
  confirmHotel,
  updateVacationState,
  storeBotMessage,
  storeReaction,
  getConfirmedFlightLink,
  getConfirmedHotelLink,
} from "../../services/conversation.service.js";
import { DATA_RETRIEVAL_TOOLS, accommodationTools } from "./tools/index.js";
import { sendMessage, sendReaction, type Reaction } from "../../linq/client.js";

const anthropic = new Anthropic();
const MAX_TOOL_LOOPS = 5;
const DRY_RUN = process.env.DRY_RUN === "true";
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function accommodationAgent(
  chatId: string,
  messageId: string | undefined,
  history: string,
  participantCount: number,
  destination: string,
  startDate: string | undefined,
  endDate: string | undefined,
  currentAccommodation: any
): Promise<void> {
  const hasAccommodation = !!currentAccommodation;
  const flightsConfirmed = !!currentAccommodation?.flights?.confirmedAt;
  const hotelConfirmed = !!currentAccommodation?.hotel?.confirmedAt;

  const SYSTEM_MESSAGE = `
You are an accommodation and flights specialist for a group vacation planner accessible via text message in a group chat.

## Current State
Destination: ${destination}
Travel dates: ${startDate} → ${endDate}
Flights confirmed: ${flightsConfirmed ? `YES — ${currentAccommodation.flights.airline} (${currentAccommodation.flights.departure} → ${currentAccommodation.flights.arrival})` : "NO"}
Hotel confirmed: ${hotelConfirmed ? `YES — ${currentAccommodation.hotel.name}` : "NO"}

## Two-Step Workflow
You handle flights and hotels as TWO separate confirmation steps in order:

STEP 1 — FLIGHTS (do this first):
1. Ask for origin city if not mentioned
2. Call search_flights when origin is known
3. Present flight options
4. Get ALL ${participantCount} members to agree on one flight
5. Call confirm_flights to lock it in

STEP 2 — HOTELS (only after flights confirmed):
1. Call search_hotels immediately — dates are already known
2. Present hotel options  
3. Get ALL ${participantCount} members to agree on one hotel
4. Call confirm_hotel to lock it in and complete the trip

## Current Step
${!flightsConfirmed ? "STEP 1 — Find and confirm flights first." : !hotelConfirmed ? "STEP 2 — Flights are confirmed. Now find and confirm a hotel." : "Both flights and hotel are confirmed. Congratulate the group!"}

## Tools
- "search_flights": Search flights from the group's origin to ${destination}
- "search_hotels": Search hotels at ${destination} for ${startDate} → ${endDate}
- "send_message": Send results to the group. ALWAYS include actual details from search results.
- "send_reaction": React to the latest message — use sparingly.
- "confirm_flights": Lock in flights once ALL ${participantCount} participants explicitly agree.
- "confirm_hotel": Lock in hotel once ALL ${participantCount} participants explicitly agree. Only after flights confirmed.

## Flight Format (in send_message)
- Lead with: "Here are flights from [origin] to ${destination}:"
- Each flight: "Airline : Departure → Arrival : $X/person : Duration"
- Separate each with ---
- End with: "Which flight works for everyone?"

## Hotel Format (in send_message)
- Lead with: "Here are some hotels in ${destination}:"
- Each hotel: "Hotel Name : $X/night : One sentence about highlights"
- Separate each with ---
- End with: "Which of these looks good?"

## Confirmation Rules
- Count explicit agreements per step: "looks good", "book it", "lets do it", "im in", "+1"
- ALL ${participantCount} participants must confirm each step — not just a majority
- Track confirmations by sender handle — no duplicates
- If not everyone confirmed, say how many are still needed
- confirm_flights and confirm_hotel each require full group agreement independently

## Flight Search Failure
If search_flights returns no results:
- Do NOT search or show hotels
- Tell the group no flights were found from that city
- Suggest nearby airports if relevant
- Ask for a different departure city

## Response Style
You are texting — write like a helpful friend.
- Use "---" to split into separate messages
- 1-2 sentences per message max
- NO markdown, NO bold, NO headers
- Skip apostrophes — "dont", "cant", "im", "thats"
- No links, no image references
  `.trim();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `
${SYSTEM_MESSAGE}

${hasAccommodation ? `Current accommodation state: ${JSON.stringify(currentAccommodation)}` : "No accommodation booked yet."}

Conversation history:
${history}
      `.trim(),
    },
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: accommodationTools,
    messages,
  });

  let loopCount = 0;

  while (response.stop_reason === "tool_use" && loopCount < MAX_TOOL_LOOPS) {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    messages.push({ role: "assistant", content: response.content });

    const hasDataTools = toolUseBlocks.some((b) =>
      DATA_RETRIEVAL_TOOLS?.accommodation?.has(b.name)
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let flightSearchFailed = false;

    for (const block of toolUseBlocks) {
      const { id, name, input } = block;
      const args = input as any;

      // ── search_flights ────────────────────────────────────────────────────

      if (name === "search_flights") {
        try {
          console.log(`[accommodation] searching flights: ${args.origin} → ${args.destination} (${args.departDate} / ${args.returnDate})`);
          const results = await searchFlights(
            args.origin,
            args.destination,
            args.departDate,
            args.returnDate,
            args.adults ?? participantCount
          );
          console.log(`[accommodation] search_flights returned ${results.length} results`);

          if (results.length === 0) {
            flightSearchFailed = true;
            toolResults.push({
              type: "tool_result",
              tool_use_id: id,
              content: `No flights found from ${args.origin} to ${args.destination}. Do NOT search or show hotels. Tell the group and ask for a different departure city or nearby airport.`,
            });
          } else {
            const formatted = results
              .map((f) => `${f.airline} : ${f.departure} → ${f.arrival} : $${f.pricePerPerson}/person : ${f.duration}`)
              .join("\n");
            toolResults.push({
              type: "tool_result",
              tool_use_id: id,
              content: formatted,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[accommodation] search_flights error:`, msg);
          flightSearchFailed = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: `Error searching flights from ${args.origin}: ${msg}. Do NOT show hotels. Ask for a different departure city.`,
          });
        }

      // ── search_hotels ─────────────────────────────────────────────────────

      } else if (name === "search_hotels") {
        if (flightSearchFailed) {
          console.log(`[accommodation] Skipping hotel search — flights not found`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: "Hotel search skipped — no flights available. Do not show hotel results.",
          });
        } else {
          try {
            console.log(`[accommodation] searching hotels in: "${args.destination}" (${args.checkIn} → ${args.checkOut})`);
            const results = await searchHotels(
              args.destination,
              args.checkIn,
              args.checkOut,
              args.adults ?? participantCount
            );
            console.log(`[accommodation] search_hotels returned ${results.length} results`);

            const formatted = (results || [])
              .map((h) => `${h.name} : $${h.pricePerNight}/night : ${h.description}`)
              .join("\n");

            toolResults.push({
              type: "tool_result",
              tool_use_id: id,
              content: formatted || "No hotels found",
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.error(`[accommodation] search_hotels error:`, msg);
            toolResults.push({
              type: "tool_result",
              tool_use_id: id,
              content: `Error searching hotels: ${msg}`,
            });
          }
        }

      // ── send_message ──────────────────────────────────────────────────────

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
          console.warn("[accommodation] Cannot react: messageId is undefined");
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
        console.log(`[accommodation] reacted with: ${args.emoji}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── ignore ────────────────────────────────────────────────────────────

      } else if (name === "ignore") {
        console.log(`[accommodation] ignoring: ${args.reasoning}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

      // ── confirm_flights ───────────────────────────────────────────────────

      } else if (name === "confirm_flights") {
        await confirmFlights(chatId, {
          airline: args.airline,
          departure: args.departure,
          arrival: args.arrival,
          pricePerPerson: args.pricePerPerson,
          confirmedBy: args.confirmedBy ?? [],
        });
        console.log(`[accommodation] Flights confirmed: ${args.airline}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: `Flights confirmed: ${args.airline}. Now move to STEP 2 — search and confirm a hotel.`,
        });

      // ── confirm_hotel ─────────────────────────────────────────────────────

      } else if (name === "confirm_hotel") {
        await confirmHotel(chatId, {
          hotel: args.hotel,
          pricePerNight: args.pricePerNight,
          confirmedBy: args.confirmedBy ?? [],
        });
        await updateVacationState(chatId, "complete");
        console.log(`[accommodation] Hotel confirmed: ${args.hotel} → complete`);

         // Fetch confirmed flight link from DB to send alongside hotel link
        const flightLink = await getConfirmedFlightLink(chatId);
        const hotelLink = await getConfirmedHotelLink(chatId);

        const links: { label: string; url: string }[] = [
            ...(flightLink ? [{ label: "Book your flights", url: flightLink }] : []),
            ...(hotelLink ? [{ label: "Book your hotel", url: hotelLink }] : []),
        ];

        for (const link of links) {
            const msg = `${link.label}: ${link.url}`;
            if (DRY_RUN) {
            console.log(`[DRY RUN] booking link: "${msg}"`);
            } else {
            await sendMessage(chatId, msg);
            await delay(1500);
            }
            await storeBotMessage({ chatId, content: msg });
        }

        
        toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: `Hotel confirmed: ${args.hotel}. ${links.length > 0 ? "Booking links sent to group." : "No booking links available."} Trip planning complete!`,
        });

      } else {
        console.warn(`[accommodation] Unknown tool: ${name}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (hasDataTools) {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        tools: accommodationTools,
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