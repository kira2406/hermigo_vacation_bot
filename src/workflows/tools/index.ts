import Anthropic from "@anthropic-ai/sdk";

const ignoreTool: Anthropic.Tool = {
  name: "ignore",
  description: "Let the humans converse. No action needed yet.",
  input_schema: {
    type: "object",
    properties: {
      reasoning: { type: "string" },
    },
    required: ["reasoning"],
  },
};

const sendReactionTool: Anthropic.Tool = {
  name: "send_reaction",
  description: "Send a lightweight reaction to the message.",
  input_schema: {
    type: "object",
    properties: {
      emoji: {
        type: "string",
        enum: ["love", "like", "dislike", "laugh", "emphasize", "question"],
      },
      reasoning: { type: "string" },
    },
    required: ["emoji", "reasoning"],
  },
};

const sendMessageTool: Anthropic.Tool = {
  name: "send_message",
  description: "Send messages. Each message can have its own thumbnail. Use the messages array to send multiple messages with different images.",
  input_schema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        description: "Array of messages to send sequentially",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "Message text" },
            thumbnail: { type: "string", description: "Optional image URL for this specific message" },
          },
          required: ["content"],
        },
      },
      // Keep content + thumbnail for backward compat with single messages
      content: { type: "string", description: "Single message content. Use --- to split. Use messages array instead if each part needs a different image." },
      thumbnail: { type: "string", description: "Single thumbnail applied to all parts. Use messages array instead for per-message images." },
    },
  },
};

const createGroupTool: Anthropic.Tool = {
  name: "create_group",
  description:
    "Create a new group chat with the specified participants. Call this when the orchestrator determines that a solo conversation should be escalated to a group chat. The tool will return the new chat ID, which will be used for all subsequent messages.",
  input_schema: {
    type: "object",
    properties: {
      participants: {
        type: "array",
        items: { type: "string" },
        description: "Phone numbers of participants to add to the new group chat",
      },
      reasoning: { type: "string" },
    },
    required: ["participants", "reasoning"],
  },
};

const delegateTool: Anthropic.Tool = {
  name: "delegate",
  description:
    "Delegate to a specialist agent for deep-dive tasks. Choose this for any message that requires expertise or detailed handling in a specific phase.",
  input_schema: {
    type: "object",
    properties: {
      targetAgent: {
        type: "string",
        enum: ["destination", "itinerary", "accommodation"],
      },
      reasoning: { type: "string" },
    },
    required: ["targetAgent", "reasoning"],
  },
};

const searchTripAdvisorTool: Anthropic.Tool = {
    name: "search_tripadvisor_attractions",
    description:
      "Search for attractions, landmarks, and things to do on TripAdvisor to match user interests.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "City and activity type (e.g. 'Tokyo hiking' or 'Paris art museums')",
        },
        limit: { type: "number", default: 5 },
      },
      required: ["query"],
    },
  };

const confirmDestinationTool: Anthropic.Tool = {
  name: "confirm_destination",
  description:
    "Lock in the destination and advance to itinerary planning. Call ONLY when the group has explicitly confirmed the location.",
  input_schema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "The confirmed destination city name",
      },
    },
    required: ["city"],
  },
};

const changeDestinationTool: Anthropic.Tool = {
name: "change_destination",
description: "Use when the user wants to change a previously confirmed destination and pick a new one. Resets back to destination planning.",
input_schema: {
  type: "object", 
  properties: {
    reasoning: { type: "string" }
  },
  required: ["reasoning"]
}
}

const searchPlacesTool: Anthropic.Tool =
{
  name: "search_places",
  description:
    "Search for tourist attractions and activities in a city using Google Maps via SerpAPI.",
  input_schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "The destination city" },
      type: {
        type: "string",
        description:
          "Type of place (e.g. tourist_attraction, restaurant, museum)",
        default: "tourist_attraction",
      },
      limit: { type: "number", default: 10 },
    },
    required: ["city"],
  },
};

const saveDatesTool: Anthropic.Tool =
{
  name: "save_dates",
  description:
    "Persist the agreed travel dates. Call when the group confirms start and end dates.",
  input_schema: {
    type: "object",
    properties: {
      startDate: {
        type: "string",
        description: "ISO date string (e.g. 2026-07-10)",
      },
      endDate: {
        type: "string",
        description: "ISO date string (e.g. 2026-07-15)",
      },
    },
    required: ["startDate", "endDate"],
  },
};

const saveItineraryTool: Anthropic.Tool =
{
  name: "save_itinerary",
  description:
    "Persist the built or updated itinerary to the database. Call after building or updating the day-by-day plan.",
  input_schema: {
    type: "object",
    properties: {
      activities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "ISO date string for this activity",
            },
            activity: {
              type: "string",
              description:
                "Full activity line, e.g. 'Morning: Senso-ji Temple : Ancient Buddhist temple in Asakusa'",
            },
          },
          required: ["date", "activity"],
        },
      },
    },
    required: ["activities"],
  },
};

const confirmItineraryTool: Anthropic.Tool =
{
  name: "confirm_itinerary",
  description:
    "Lock in the itinerary and advance to accommodation planning. Call ONLY when ALL participants have explicitly confirmed.",
  input_schema: {
    type: "object",
    properties: {
      confirmedBy: {
        type: "array",
        items: { type: "string" },
        description: "Handles of every participant who has confirmed",
      },
    },
    required: ["confirmedBy"],
  },
};

const searchHotelsTool: Anthropic.Tool = {
  name: "search_hotels",
  description:
    "Search for hotels at the destination using SerpAPI Google Hotels.",
  input_schema: {
    type: "object",
    properties: {
      destination: { type: "string" },
      checkIn: { type: "string", description: "Check-in date (YYYY-MM-DD)" },
      checkOut: {
        type: "string",
        description: "Check-out date (YYYY-MM-DD)",
      },
      adults: { type: "number", default: 2 },
    },
    required: ["destination", "checkIn", "checkOut"],
  },
};

// const searchFlightsTool: Anthropic.Tool = {
//   name: "search_flights",
//   description: "Search for flights using SerpAPI Google Flights.",
//   input_schema: {
//     type: "object",
//     properties: {
//       origin: {
//         type: "string",
//         description: "Origin airport code (e.g. JFK)",
//       },
//       destination: {
//         type: "string",
//         description: "Destination airport code (e.g. PVG)",
//       },
//       departDate: {
//         type: "string",
//         description: "Departure date (YYYY-MM-DD)",
//       },
//       returnDate: {
//         type: "string",
//         description: "Return date (YYYY-MM-DD)",
//       },
//       adults: { type: "number", default: 2 },
//     },
//     required: ["origin", "destination", "departDate", "returnDate"],
//   },
// };

// const confirmFlightsTool: Anthropic.Tool =
// {
// name: "confirm_flights",
// description:
//   "Lock in the chosen flight once ALL participants have explicitly agreed on it.",
// input_schema: {
//   type: "object",
//   properties: {
//     airline: { type: "string", description: "The confirmed airline" },
//     departure: { type: "string" },
//     arrival: { type: "string" },
//     pricePerPerson: { type: "number" },
//     confirmedBy: {
//       type: "array",
//       items: { type: "string" },
//       description: "Handles of every participant who confirmed",
//     },
//   },
//   required: ["airline", "departure", "arrival", "pricePerPerson", "confirmedBy"],
// },
// };

const confirmHotelTool: Anthropic.Tool =
{
  name: "confirm_hotel",
  description:
    "Lock in the chosen hotel once ALL participants have explicitly agreed on it. Only call after flights are already confirmed.",
  input_schema: {
    type: "object",
    properties: {
      hotel: { type: "string", description: "The confirmed hotel name" },
      pricePerNight: { type: "number" },
      link: {
        type: "string",
        description: "Pass the booking URL referred by variable named link in response of searchHotels tool call. Pass exactly as returned — do not modify.",
      },
      confirmedBy: {
        type: "array",
        items: { type: "string" },
        description: "Handles of every participant who confirmed",
      },
    },
    required: ["hotel", "pricePerNight", "confirmedBy"],
  },
};

const getHotelImagesTool: Anthropic.Tool = {
  name: "get_hotel_images",
  description: "Fetch additional images for a specific hotel when the user asks to see more photos.",
  input_schema: {
    type: "object",
    properties: {
      hotel_name: { type: "string", description: "Name of the hotel to fetch images for" }
    },
    required: ["hotel_name"]
  }
}

const searchFlightsTool: Anthropic.Tool = {
  name: "search_flights",
  description:
    "Search for outbound flights. Departure flight must arrive at destination BEFORE the trip start date. Return flight must depart on or after the last day of the trip.",
  input_schema: {
    type: "object",
    properties: {
      origin: { type: "string" },
      destination: { type: "string" },
      departDate: {
        type: "string",
        description: "Departure date in YYYY-MM-DD format. Must be BEFORE the trip start date to allow time to arrive.",
      },
      returnDate: {
        type: "string",
        description: "Return date in YYYY-MM-DD format. Must be ON or AFTER the last day of the trip.",
      },
      adults: { type: "number" },
    },
    required: ["origin", "destination", "departDate", "returnDate"],
  },
};

const selectDepartureFlightTool: Anthropic.Tool = {
  name: "select_departure_flight",
  description: "Call after user picks a departure flight. Pass the option number (1, 2, 3) the user selected — NOT a token.",
  input_schema: {
    type: "object",
    properties: {
      origin: { type: "string" },
      destination: { type: "string" },
      departDate: { type: "string" },
      returnDate: { type: "string" },
      optionNumber: {
        type: "number",
        description: "The option number (1, 2, 3...) the user picked from the departure flight list.",
      },
      adults: { type: "number" },
    },
    required: ["origin", "destination", "departDate", "returnDate", "optionNumber"],
  },
};

const selectReturnFlightTool: Anthropic.Tool = {
  name: "select_return_flight",
  description: "Call after user picks a return flight. Pass the option number (1, 2, 3) the user selected — NOT a token.",
  input_schema: {
    type: "object",
    properties: {
      origin: { type: "string" },
      destination: { type: "string" },
      departDate: { type: "string" },
      returnDate: { type: "string" },
      optionNumber: {
        type: "number",
        description: "The option number (1, 2, 3...) the user picked from the return flight list.",
      },
      adults: { type: "number" },
    },
    required: ["origin", "destination", "departDate", "returnDate", "optionNumber"],
  },
};

const confirmFlightsTool: Anthropic.Tool = {
  name: "confirm_flights",
  description:
    "Lock in the chosen flights once ALL participants have explicitly agreed. Always pass the bookingLink from select_return_flight.",
  input_schema: {
    type: "object",
    properties: {
      google_flights_url: { type: "string", description: "Pass the Google Flights URL of chosen flight from select_return_flight response" },
      confirmedBy: {
        type: "array",
        items: { type: "string" },
        description: "Handles of every participant who confirmed",
      },
    },
    required: ["google_flights_url", "confirmedBy"],
  },
};

// ── Orchestrator Tools ────────────────────────────────────────────────────────

export function orchestratorTools(isGroup: boolean): Anthropic.Tool[] {
  const base = [delegateTool, sendMessageTool, ignoreTool, sendReactionTool];
  
  if (isGroup) {
    return [...base, ignoreTool, sendReactionTool];
  } else {
    return [...base, createGroupTool];
  }
}

// ── Destination Agent Tools ───────────────────────────────────────────────────

export function destinationTools(isGroup: boolean): Anthropic.Tool[] {
  return [delegateTool, sendMessageTool, searchTripAdvisorTool, confirmDestinationTool, changeDestinationTool, ignoreTool, sendReactionTool];
}

// ── Itinerary Agent Tools ─────────────────────────────────────────────────────

export function itineraryTools(isGroup: boolean): Anthropic.Tool[] {
  return [delegateTool, sendMessageTool, searchPlacesTool, saveDatesTool, saveItineraryTool, confirmItineraryTool, ignoreTool, sendReactionTool];
}

// ── Accommodation Agent Tools ─────────────────────────────────────────────────

export function accommodationTools(isGroup: boolean): Anthropic.Tool[] {
  return [delegateTool, sendMessageTool, searchHotelsTool, searchFlightsTool, selectDepartureFlightTool, selectReturnFlightTool, confirmFlightsTool, confirmHotelTool, getHotelImagesTool,  ignoreTool, sendReactionTool];
}

// ── Data retrieval tool sets (tools that require a second LLM call) ───────────

export const DATA_RETRIEVAL_TOOLS: Record<string, Set<string>> = {
  orchestrator: new Set(),
  destination: new Set(["search_tripadvisor_attractions"]),
  itinerary: new Set(["search_places"]),
  accommodation: new Set([
    "search_flights",
    "select_departure_flight",
    "select_return_flight",
    "search_hotels",
    "get_hotel_images",
  ]),
};