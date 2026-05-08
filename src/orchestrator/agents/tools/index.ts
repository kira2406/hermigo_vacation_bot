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
  description:
    "Send a direct text reply to the group. Use --- to split into separate messages. 1-2 sentences per part max.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string" },
      reasoning: { type: "string" },
    },
    required: ["content", "reasoning"],
  },
};

// ── Orchestrator Tools ────────────────────────────────────────────────────────

export const orchestratorTools: Anthropic.Tool[] = [
  ignoreTool,
  sendReactionTool,
  sendMessageTool,
  {
    name: "delegate",
    description: "Delegate to a specialist agent for deep-dive tasks.",
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
  },
];

// ── Destination Agent Tools ───────────────────────────────────────────────────

export const destinationTools: Anthropic.Tool[] = [
  ignoreTool,
  sendReactionTool,
  sendMessageTool,
  {
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
  },
  {
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
  },
];

// ── Itinerary Agent Tools ─────────────────────────────────────────────────────

export const itineraryTools: Anthropic.Tool[] = [
  ignoreTool,
  sendReactionTool,
  sendMessageTool,
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
  },
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
  },
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
  },
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
  },
];

// ── Accommodation Agent Tools ─────────────────────────────────────────────────

export const accommodationTools: Anthropic.Tool[] = [
  ignoreTool,
  sendReactionTool,
  sendMessageTool,
  {
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
  },
  {
    name: "search_flights",
    description: "Search for flights using SerpAPI Google Flights.",
    input_schema: {
      type: "object",
      properties: {
        origin: {
          type: "string",
          description: "Origin airport code (e.g. JFK)",
        },
        destination: {
          type: "string",
          description: "Destination airport code (e.g. PVG)",
        },
        departDate: {
          type: "string",
          description: "Departure date (YYYY-MM-DD)",
        },
        returnDate: {
          type: "string",
          description: "Return date (YYYY-MM-DD)",
        },
        adults: { type: "number", default: 2 },
      },
      required: ["origin", "destination", "departDate", "returnDate"],
    },
  },
  {
  name: "confirm_flights",
  description:
    "Lock in the chosen flight once ALL participants have explicitly agreed on it.",
  input_schema: {
    type: "object",
    properties: {
      airline: { type: "string", description: "The confirmed airline" },
      departure: { type: "string" },
      arrival: { type: "string" },
      pricePerPerson: { type: "number" },
      confirmedBy: {
        type: "array",
        items: { type: "string" },
        description: "Handles of every participant who confirmed",
      },
    },
    required: ["airline", "departure", "arrival", "pricePerPerson", "confirmedBy"],
  },
},
{
  name: "confirm_hotel",
  description:
    "Lock in the chosen hotel once ALL participants have explicitly agreed on it. Only call after flights are already confirmed.",
  input_schema: {
    type: "object",
    properties: {
      hotel: { type: "string", description: "The confirmed hotel name" },
      pricePerNight: { type: "number" },
      confirmedBy: {
        type: "array",
        items: { type: "string" },
        description: "Handles of every participant who confirmed",
      },
    },
    required: ["hotel", "pricePerNight", "confirmedBy"],
  },
},
];

// ── Data retrieval tool sets (tools that require a second LLM call) ───────────

export const DATA_RETRIEVAL_TOOLS: Record<string, Set<string>> = {
  orchestrator: new Set(),
  destination: new Set(["search_tripadvisor_attractions"]),
  itinerary: new Set(["search_places"]),
  accommodation: new Set(["search_hotels", "search_flights"]),
};