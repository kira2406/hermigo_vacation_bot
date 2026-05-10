import Anthropic from "@anthropic-ai/sdk";
import {
  searchDepartureFlights,
  searchReturnFlights,
  getFlightBookingLink,
  searchHotels,
} from "../../integrations/serp/travel.js";
import {
  confirmFlights,
  confirmHotel,
  updateVacationState,
  storeBotMessage,
  storeReaction,
  saveDepartureSelection,
  saveReturnSelection,
  saveReturnFlightOptions,
  getReturnFlightOption,
  saveDepartureFlightOptions,
  getDepartureFlightOption,
} from "../../services/conversation.service.js";
import { accommodationTools, DATA_RETRIEVAL_TOOLS } from "../tools/index.js";
import { sendMessage, sendReaction, type Reaction } from "../../linq/client.js";
import { getHotelImages, saveHotelsToCache, getHotelBookingLink } from "../../services/hotels.service.js";
import { cleanResponse, getFlightDateConstraints } from "../../util/helper.js";
import { anthropic } from "../../services/llm.service.js";

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
  currentAccommodation: any,
  isGroup: boolean
): Promise<void> {
  const hasAccommodation = !!currentAccommodation;
  const flightsConfirmed = !!currentAccommodation?.flights?.confirmedAt;
  const hotelConfirmed = !!currentAccommodation?.hotel?.confirmedAt;

  const who = isGroup ? `ALL ${participantCount} participants` : "you";
  const whoShort = isGroup ? "the group" : "you";

  const SYSTEM_MESSAGE = `
You are an accommodation and flights specialist for a vacation planner accessible via text message${isGroup ? " in a group chat" : ""}.

## Current State
Destination: ${destination}
Travel dates: ${startDate} → ${endDate}
Flights confirmed: ${flightsConfirmed ? `YES — ${currentAccommodation.flights.airline} (${currentAccommodation.flights.departure} → ${currentAccommodation.flights.arrival})` : "NO"}
Hotel confirmed: ${hotelConfirmed ? `YES — ${currentAccommodation.hotel.name}` : "NO"}

## Two-Step Workflow

STEP 1 — FLIGHTS:
1. Ask for origin city if not mentioned
2. Call search_flights → present outbound flight options to ${whoShort}
3. ${whoShort} picks a departure flight → call select_departure_flight with its DEPARTURE_TOKEN from response → present return flight options
4. ${whoShort} picks a return flight → call select_return_flight with its BOOKING_TOKEN from response → get booking link
5. Call confirm_flights with the booking link to lock in both legs

STEP 2 — HOTELS (only after flights confirmed):
1. Call search_hotels immediately — dates are already known
2. Present each hotel with name, price, description and thumbnail image
3. ${whoShort} can ask for more photos of any hotel — call get_hotel_images and send each image via send_message with the URL as thumbnail
4. Get ${who} to agree on one hotel
5. Call confirm_hotel with the booking link to lock it in

## Current Step
${!flightsConfirmed
      ? "STEP 1 — Find and confirm flights first."
      : !hotelConfirmed
        ? "STEP 2 — Flights are confirmed. Now find and confirm a hotel."
        : `Both flights and hotel are confirmed. Congratulate ${whoShort}!`
    }

## Tools
- "search_flights": Search outbound flights. Returns options each with a DEPARTURE_TOKEN.
- "select_departure_flight": Call after ${whoShort} picks a departure. Pass the DEPARTURE_TOKEN of the chosen departure flight.
  Returns return flight options each with a BOOKING_TOKEN.
- "select_return_flight": Call after ${whoShort} picks a return flight. Pass the BOOKING_TOKEN of the chosen return flight.
  Returns the final booking link.
- "search_hotels": Search hotels at ${destination} for ${startDate} → ${endDate}. Only after flights confirmed.
- "get_hotel_images": Fetch additional images for a hotel. After calling, send each URL via send_message with the URL as thumbnail.
- "send_message": Send results to ${whoShort}. Use --- to split into separate messages, one item per message.
   For sending multiple hotel names with corresponding hotel image use
   Format:
    {
      "messages": [
        { "content": "Senso-ji Temple : Ancient Buddhist temple in Asakusa", "thumbnail": "https://..." },
        { "content": "Shibuya Crossing : The worlds busiest pedestrian crossing", "thumbnail": "https://..." }
      ]
    }
  Do NOT use --- splitting when each message needs a different image.
  Pass thumbnail URL to attach an image alongside a message.
${isGroup ? `- "send_reaction": React to the latest message — use sparingly.` : ""}
- "confirm_flights": Lock in both flight legs once ${who} explicitly agree. Always pass bookingLink.
- "confirm_hotel": Lock in hotel once ${who} explicitly agree. Only after flights confirmed. Pass bookingLink if available.

## CRITICAL
You MUST always call a tool. Never respond with plain text.
- Flight tokens (DEPARTURE_TOKEN, BOOKING_TOKEN) are long base64 strings returned as JSON fields.
- When passing tokens to tools, copy the exact string value from the JSON — character for character.
- Never reconstruct, summarize, or guess a token. If you cannot find it in the results, call send_message and ask the user to retry.

## CRITICAL TOOL SEQUENCE
- After search_flights → ALWAYS call send_message to present outbound options
- After select_departure_flight → ALWAYS call send_message to present return options
- After select_return_flight → ALWAYS call send_message to confirm booking link found + ask for agreement
- After search_hotels → ALWAYS call send_message to present hotel options with thumbnails
- After get_hotel_images → call send_message once per image URL with it as thumbnail
- After confirm_flights → ALWAYS call send_message to acknowledge + then search_hotels
- After confirm_hotel → trip is complete

## Flight Format (in send_message)
Outbound options:
- Lead with: "Here are outbound flights from [origin] to ${destination}:"
- For each flight journey, use this EXACT structure:
  Option [Number]:
  [Airline] : [Start DATE and Time] [Origin] → [Arrival Time at Connection] [Connection]
  Layover: [Layover City]
  (Repeat the above two lines if there are additional connections)
  [Airline] : [Departure Time from Last Connection] [Last Connection] → [Arrival Date and Time] [Destination]
  Total Duration: [Total Duration]
  Price: $[Price]/person
  separated by ---
- End with: "Which departure works for ${whoShort}?"

Return options:
- Lead with: "Great! Now pick a return flight:"
- For each flight journey, use this EXACT structure:
  Option [Number]:
  [Airline] : [Start DATE and Time] [Origin] → [Arrival Time at Connection] [Connection]
  Layover: [Layover City]
  (Repeat the above two lines if there are additional connections)
  [Airline] : [Departure Time from Last Connection] [Last Connection] → [Arrival Date and Time] [Destination]
  Total Duration: [Total Duration]
  Price: $[Price]/person
  separated by ---
- End with: "Which return flight works?"

## Hotel Format (in send_message)
- Lead with: "Here are some hotels in ${destination}:"
- Each hotel as its own message with thumbnail: "Hotel Name : $X/night : One sentence about highlights"
- End with: "Which looks good? You can also ask me for more photos of any hotel."

## Confirmation Rules
${isGroup ? `
- Count explicit agreements: "looks good", "book it", "lets do it", "im in", "+1"
- ALL ${participantCount} participants must confirm each step — not just a majority
- Track confirmations by sender handle — no duplicates
- If not everyone confirmed, say how many are still needed
- confirm_flights and confirm_hotel each require full group agreement independently
` : `
- Confirm when the user says "looks good", "book it", "lets do it", or similar
- Call confirm_flights / confirm_hotel immediately on explicit confirmation
`}

## Flight Search Failure
If search_flights returns no results:
- Do NOT proceed to hotels
- Tell ${whoShort} no flights were found
- Suggest nearby airports
- Ask for a different departure city

## Response Style
You are texting — write like a helpful friend.
- Use "---" to split into separate messages. Never send a long message — keep it short and conversational
- 1-2 sentences per message max
- NO markdown, NO bold, NO headers
- Skip apostrophes — "dont", "cant", "im", "thats"
- No raw links in text — booking links are sent separately
${isGroup ? `
## Reactions
React sparingly — text is always preferred. Never write "[reacted with ...]" in your text.
Standard: love, like, dislike, laugh, emphasize, question
` : ""}
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
    max_tokens: 2048,
    tools: accommodationTools(isGroup),
    tool_choice: { type: "any" },
    messages,
  });

  let loopCount = 0;

  while (response.stop_reason === "tool_use" && loopCount < MAX_TOOL_LOOPS) {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let flightSearchFailed = false;

    for (const block of toolUseBlocks) {
      const { id, name, input } = block;
      const args = input as any;

      // ── search_flights ────────────────────────────────────────────────────

      if (name === "search_flights") {
        try {
          const constraints = getFlightDateConstraints(startDate, endDate);

          if (constraints) {
            const departDate = new Date(args.departDate);
            const returnDate = new Date(args.returnDate);
            const latestDepart = new Date(constraints.latestDepartDate!);
            const earliestReturn = new Date(constraints.earliestReturnDate!);

            const errors: string[] = [];

            if (departDate > latestDepart) {
              errors.push(
                `Departure date ${args.departDate} is too late — must depart by ${constraints.latestDepartDate} to arrive before the trip starts on ${constraints.tripStart}.`
              );
            }

            if (returnDate < earliestReturn) {
              errors.push(
                `Return date ${args.returnDate} is too early — must return on or after ${constraints.earliestReturnDate} (last day of trip).`
              );
            }

            if (errors.length > 0) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: id,
                content: `Invalid flight dates:\n${errors.join("\n")}\n\nCorrect dates to use:\n- Departure: on or before ${constraints.latestDepartDate}\n- Return: on or after ${constraints.earliestReturnDate}\n\nTell ${whoShort} the correct dates and search again with the right dates.`,
              });
              continue; // skip the actual API call
            }
          }

          const flights = await searchDepartureFlights(
            args.origin,
            args.destination,
            args.departDate,
            args.returnDate,
            args.adults ?? participantCount
          );

          if (flights.length === 0) {
            flightSearchFailed = true;
            toolResults.push({
              type: "tool_result", tool_use_id: id,
              content: `No flights found from ${args.origin} to ${args.destination}. Tell ${whoShort} and ask for a different departure city.`,
            });
          } else {
            // Save options with tokens server-side
            await saveDepartureFlightOptions(
              chatId,
              flights
                .map((f, i) => ({
                  option: i + 1,
                  airline: f.airline,
                  departure: f.departure,
                  arrival: f.arrival,
                  duration: f.duration,
                  pricePerPerson: f.pricePerPerson,
                  departureToken: f.departureToken,
                }))
                .filter((f): f is typeof f & { departureToken: string } => !!f.departureToken)
            );

            // Send agent display info only — NO token
            const flightData = flights.map((f, i) => ({
              option: i + 1,
              airline: f.airline,
              departure: f.departure,
              arrival: f.arrival,
              duration: f.duration,
              pricePerPerson: f.pricePerPerson,
            }));

            toolResults.push({
              type: "tool_result", tool_use_id: id,
              content: `Outbound flight options. When user picks one, call select_departure_flight with the option NUMBER only (1, 2, 3...):\n${JSON.stringify(flightData, null, 2)}`,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          flightSearchFailed = true;
          toolResults.push({
            type: "tool_result", tool_use_id: id,
            content: `Error searching flights: ${msg}. Ask for a different departure city.`,
          });
        }

        // ── select_departure_flight ───────────────────────────────────────────

      } else if (name === "select_departure_flight") {
        try {

          const option = await getDepartureFlightOption(chatId, args.optionNumber);

          if (!option) {
            toolResults.push({
              type: "tool_result", tool_use_id: id,
              content: `Option ${args.optionNumber} not found. Ask ${whoShort} to pick again.`,
            });
          } else {

            await saveDepartureSelection(chatId, {
              airline: args.airline,      // pass from the agent's context
              departure: args.origin,
              arrival: args.destination,
              pricePerPerson: args.pricePerPerson,
              departureToken: option?.departureToken,
            });
            const returnFlights = await searchReturnFlights(
              args.origin,
              args.destination,
              args.departDate,
              args.returnDate,
              option?.departureToken,
              args.adults ?? participantCount
            );

            console.log(`[accommodation] select_departure_flight: ${returnFlights.length} return flights`);

            if (returnFlights.length === 0) {
              toolResults.push({
                type: "tool_result", tool_use_id: id,
                content: "No return flights found for this departure. Ask the user to pick a different outbound flight.",
              });
            } else {

              await saveReturnFlightOptions(
                chatId,
                returnFlights
                  .map((f, i) => ({
                    option: i + 1,
                    airline: f.airline,
                    departure: f.departure,
                    arrival: f.arrival,
                    duration: f.duration,
                    pricePerPerson: f.pricePerPerson,
                    bookingToken: f.bookingToken,
                  }))
                  .filter((f): f is typeof f & { bookingToken: string } => !!f.bookingToken)
              );

              const flightData = returnFlights.map((f, i) => ({
                option: i + 1,
                airline: f.airline,
                departure: f.departure,
                arrival: f.arrival,
                duration: f.duration,
                pricePerPerson: f.pricePerPerson,
                // NO token here
              }));

              toolResults.push({
                type: "tool_result",
                tool_use_id: id,
                content: `Return flight options. When user picks one, call select_return_flight with the option NUMBER only (1, 2, 3...):\n${JSON.stringify(flightData, null, 2)}`,
              });
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[accommodation] select_departure_flight error:`, msg);
          toolResults.push({
            type: "tool_result", tool_use_id: id,
            content: `Error fetching return flights: ${msg}`,
          });
        }

        // ── select_return_flight ──────────────────────────────────────────────

      } else if (name === "select_return_flight") {
        // Retrieve token from DB using option number — no token passing through LLM
        const option = await getReturnFlightOption(chatId, args.optionNumber);

        if (!option) {
          toolResults.push({
            type: "tool_result", tool_use_id: id,
            content: `Option ${args.optionNumber} not found. Ask the user to pick again.`,
          });
        } else {
          const bookingLink = await getFlightBookingLink(
            args.origin,
            args.destination,
            args.departDate,
            args.returnDate,
            option.bookingToken,
            args.adults ?? participantCount
          );

          await saveReturnSelection(chatId, {
            returnDeparture: option?.departure,
            returnArrival: option?.arrival,
            bookingToken: option?.bookingToken,
            bookingLink: bookingLink,
          });

          toolResults.push({
            type: "tool_result", tool_use_id: id,
            content: bookingLink
              ? `Return flight selected. Booking link ready: ${bookingLink}. Ask ${whoShort} to confirm.`
              : `Return flight selected. No direct booking link available. Ask ${whoShort} to confirm.`,
          });
        }


        // ── search_hotels ─────────────────────────────────────────────────────

      } else if (name === "search_hotels") {
        if (flightSearchFailed) {
          toolResults.push({
            type: "tool_result", tool_use_id: id,
            content: "Hotel search skipped — no flights available.",
          });
        } else {
          try {
            console.log(`[accommodation] search_hotels: "${args.destination}" (${args.checkIn} → ${args.checkOut})`);
            const { results, rawProperties } = await searchHotels(
              args.destination,
              args.checkIn,
              args.checkOut,
              args.adults ?? participantCount
            );
            console.log(`[accommodation] search_hotels: ${results.length} results`);

            if (rawProperties?.length) {
              saveHotelsToCache(rawProperties).catch((err) =>
                console.error("[hotel-cache] Failed to save:", err)
              );
            }

            const formatted = results
              .map((h) =>
                `${h.name} : $${h.pricePerNight}/night : ${h.description} : thumbnail:${h.thumbnail ?? "N/A"}`
              )
              .join("\n");

            toolResults.push({
              type: "tool_result", tool_use_id: id,
              content: formatted || "No hotels found",
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.error(`[accommodation] search_hotels error:`, msg);
            toolResults.push({
              type: "tool_result", tool_use_id: id,
              content: `Error searching hotels: ${msg}`,
            });
          }
        }

        // ── get_hotel_images ──────────────────────────────────────────────────

      } else if (name === "get_hotel_images") {
        try {
          console.log(`[accommodation] get_hotel_images: "${args.hotel_name}"`);
          const images = await getHotelImages(args.hotel_name);
          console.log(`[accommodation] get_hotel_images: ${images.length} images`);

          if (images.length <= 1) {
            toolResults.push({
              type: "tool_result", tool_use_id: id,
              content: "No additional images available for this hotel.",
            });
          } else {
            const remaining = images.slice(1, 6);
            const formatted = remaining
              .map((url, i) => `image_${i + 1}: ${url}`)
              .join("\n");
            toolResults.push({
              type: "tool_result", tool_use_id: id,
              content: `Additional images for ${args.hotel_name}. Call send_message once per image, passing each URL as the thumbnail field:\n${formatted}`,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[accommodation] get_hotel_images error:`, msg);
          toolResults.push({
            type: "tool_result", tool_use_id: id,
            content: `Error fetching images: ${msg}`,
          });
        }

        // ── send_message ──────────────────────────────────────────────────────

      } else if (name === "send_message") {
        // Handle messages array format
        if (args.messages && Array.isArray(args.messages)) {
          for (const msg of args.messages) {
            const text = cleanResponse(msg.content?.trim() ?? "");
            if (!text) continue;

            const media = msg.thumbnail ? [{ url: msg.thumbnail }] : undefined;

            if (DRY_RUN) {
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

            if (DRY_RUN) {
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
          console.warn("[accommodation] Cannot react: messageId is undefined");
          toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });
        } else {
          if (DRY_RUN) {
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
          console.log(`[accommodation] reacted with: ${args.emoji}`);
          toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });
        }

        // ── ignore ────────────────────────────────────────────────────────────

      } else if (name === "ignore") {
        console.log(`[accommodation] ignoring: ${args.reasoning}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });

        // ── confirm_flights ───────────────────────────────────────────────────

      } else if (name === "confirm_flights") {
        await confirmFlights(chatId, {
          google_flights_url: args.google_flights_url ?? null,
          confirmedBy: args.confirmedBy ?? [],
        });
        toolResults.push({
          type: "tool_result", tool_use_id: id,
          content: `Flights confirmed. Now move to STEP 2 — search and confirm a hotel.`,
        });

        // ── confirm_hotel ─────────────────────────────────────────────────────

      } else if (name === "confirm_hotel") {

        const hotelBookingLink = await getHotelBookingLink(args.hotel);

        await confirmHotel(chatId, {
          hotel: args.hotel,
          pricePerNight: args.pricePerNight,
          bookingLink: hotelBookingLink,
          confirmedBy: args.confirmedBy ?? [],
        });

        console.log(`[accommodation] Hotel confirmed: ${args.hotel} Link: ${hotelBookingLink}`);
        await updateVacationState(chatId, "complete");
        console.log(`[accommodation] Hotel confirmed: ${args.hotel} → complete`);

        // Send booking links
        const links: { label: string; url: string }[] = [
          ...(args.bookingLink ? [{ label: "Book your hotel", url: hotelBookingLink }] : []),
          ...(currentAccommodation?.flights?.bookingLink
            ? [{ label: "Book your flights", url: currentAccommodation.flights.bookingLink }]
            : []),
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
          type: "tool_result", tool_use_id: id,
          content: `Hotel confirmed. ${links.length > 0 ? "Booking links sent." : "No booking links available."} Trip planning complete!`,
        });

      } else {
        console.warn(`[accommodation] Unknown tool: ${name}`);
        toolResults.push({ type: "tool_result", tool_use_id: id, content: "ok" });
      }
    }

    messages.push({ role: "user", content: toolResults });

    // Break on terminal tool, otherwise always continue
    const hasTerminalTool = toolUseBlocks.some((b) => b.name === "confirm_hotel" || b.name === "ignore");
    if (hasTerminalTool) break;

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      tools: accommodationTools(isGroup),
      tool_choice: { type: "any" },
      messages,
    });

    loopCount++;
  }
}
