// src/services/conversation.service.ts
import { Conversation } from "../models/conversation.model.js";

export interface GetOrCreateParams {
  chatId: string;
  isGroup?: boolean;
}

export async function getOrCreateConversation({ chatId, isGroup = true }: GetOrCreateParams) {
  try {
    // 1. Attempt to find the existing conversation
    let conversation = await Conversation.findOne({ chatId });

    // 2. If it exists, simply return it
    if (conversation) {
      return conversation;
    }

    // 3. If it does not exist, create a new document
    conversation = new Conversation({
      chatId,
      isGroup,
      participants: [], 
      events: [],
      // Destination, dates, hotels, and itinerary will initialize as empty/null automatically
    });

    await conversation.save();
    console.log(`[MongoDB] Created new conversation record for chatId: ${chatId}`);

    return conversation;

  } catch (error) {
    console.error(`[MongoDB] Error in getOrCreateConversation for chatId ${chatId}:`, error);
    throw error; // Rethrow so your webhook handler catches it and returns a 500
  }
}

export async function storeParticipantMessage({
  chatId,
  isGroup,
  sender,
  content,
  rawPayload,
}: {
  chatId: string;
  isGroup: boolean;
  sender: string;
  content: string;
  rawPayload: unknown;
}) {
  // ✅ Fixed: Passed as an object
  const conversation = await getOrCreateConversation({ chatId, isGroup });

  conversation.events.push({
    eventType: "message.received",
    actorType: "participant",
    sender,
    content,
    rawPayload,
  });

  await conversation.save();

  return conversation;
}

export async function storeBotMessage({
  chatId,
  content,
  rawPayload = {},
}: {
  chatId: string;
  content: string;
  rawPayload?: unknown;
}) {
  // ✅ Fixed: Passed as an object. Assuming bot messages in this context imply a group, or we default to true.
  const conversation = await getOrCreateConversation({ chatId, isGroup: true });

  conversation.events.push({
    eventType: "message.sent",
    actorType: "bot",
    sender: "VacationBot",
    content,
    rawPayload,
  });

  await conversation.save();

  return conversation;
}

export async function storeReaction({
  chatId,
  isGroup,
  sender,
  reaction,
  actorType,
  rawPayload,
}: {
  chatId: string;
  isGroup: boolean;
  sender: string;
  reaction: string;
  actorType: "participant" | "bot";
  rawPayload: unknown;
}) {
  // ✅ Fixed: Passed as an object
  const conversation = await getOrCreateConversation({ chatId, isGroup });

  conversation.events.push({
    eventType: actorType === "bot" ? "reaction.sent" : "reaction.received",
    actorType,
    sender,
    reaction,
    rawPayload,
  });

  await conversation.save();

  return conversation;
}

export async function updateVacationState(
  chatId: string,
  vacationState: "destination" | "itinerary" | "accommodation" | "complete"
): Promise<void> {
  try {
    await Conversation.findOneAndUpdate(
      { chatId },
      { vacationState },
      { new: true }
    );

    console.log(`[MongoDB] Vacation state updated to [${vacationState}] for chat: ${chatId}`);
  } catch (error) {
    console.error(`[MongoDB] Failed to update vacation state for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function updateDestination(
  chatId: string,
  destination: string
): Promise<void> {
  try {
    await Conversation.findOneAndUpdate(
      { chatId },
      { destination },
      { new: true }
    );

    console.log(`[MongoDB] Destination updated to [${destination}] for chat: ${chatId}`);
  } catch (error) {
    console.error(`[MongoDB] Failed to update destination for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function updateTravelDates(
  chatId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  try {
    await Conversation.findOneAndUpdate(
      { chatId },
      { travelDates: { startDate, endDate } },
      { new: true }
    );
    console.log(`[MongoDB] Travel dates updated for chat: ${chatId} → ${startDate.toDateString()} to ${endDate.toDateString()}`);
  } catch (error) {
    console.error(`[MongoDB] Failed to update travel dates for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function updateItinerary(
  chatId: string,
  itinerary: { date: Date; activity: string; confirmed: boolean }[]
): Promise<void> {
  try {
    await Conversation.findOneAndUpdate(
      { chatId },
      { itinerary },
      { new: true }
    );
    console.log(`[MongoDB] Itinerary updated for chat: ${chatId} with ${itinerary.length} activities`);
  } catch (error) {
    console.error(`[MongoDB] Failed to update itinerary for chatId ${chatId}:`, error);
    throw error;
  }
}


export async function updateAccommodation(
  chatId: string,
  accommodation: {
    hotel: string;
    confirmedBy: string[];
  }
): Promise<void> {
  try {
    await Conversation.findOneAndUpdate(
      { chatId },
      { accommodation },
      { new: true }
    );
    console.log(`[MongoDB] Accommodation updated for chat: ${chatId} — ${accommodation.hotel}`);
  } catch (error) {
    console.error(`[MongoDB] Failed to update accommodation for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function confirmFlights(
  chatId: string,
  flights: {
    airline: string;
    departure: string;
    arrival: string;
    pricePerPerson: number;
    confirmedBy: string[];
  }
): Promise<void> {
  try {
    await Conversation.findOneAndUpdate(
      { chatId },
      {
        "accommodation.flights": {
          ...flights,
          confirmedAt: new Date(),
        },
      },
      { new: true }
    );
    console.log(`[MongoDB] Flights confirmed for chat: ${chatId} — ${flights.airline}`);
  } catch (error) {
    console.error(`[MongoDB] Failed to confirm flights for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function confirmHotel(
  chatId: string,
  hotel: {
    hotel: string;
    pricePerNight: number;
    confirmedBy: string[];
  }
): Promise<void> {
  try {
    await Conversation.findOneAndUpdate(
      { chatId },
      {
        "accommodation.hotel": {
          name: hotel.hotel,
          pricePerNight: hotel.pricePerNight,
          confirmedBy: hotel.confirmedBy,
          confirmedAt: new Date(),
        },
      },
      { new: true }
    );
    console.log(`[MongoDB] Hotel confirmed for chat: ${chatId} — ${hotel.hotel}`);
  } catch (error) {
    console.error(`[MongoDB] Failed to confirm hotel for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function getConfirmedFlightLink(
  chatId: string
): Promise<string | null> {
  try {
    const conversation = await Conversation.findOne(
      { chatId },
      { "accommodation.flights.bookingLink": 1 }
    );
    return conversation?.accommodation?.flights?.bookingLink ?? null;
  } catch (error) {
    console.error(`[MongoDB] Failed to fetch flight booking link for chatId ${chatId}:`, error);
    return null;
  }
}

export async function getConfirmedHotelLink(
  chatId: string
): Promise<string | null> {
  try {
    const conversation = await Conversation.findOne(
      { chatId },
      { "accommodation.hotel.bookingLink": 1 }
    );
    return conversation?.accommodation?.hotel?.bookingLink ?? null;
  } catch (error) {
    console.error(`[MongoDB] Failed to fetch hotel booking link for chatId ${chatId}:`, error);
    return null;
  }
}