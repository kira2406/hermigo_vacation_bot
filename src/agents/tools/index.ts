import OpenAI from "openai";

// ── Orchestrator Tools ────────────────────────────────────────────────────────

export const orchestratorTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "ignore",
      description: "Let the humans converse. No action needed yet.",
      parameters: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
        },
        required: ["reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_reaction",
      description: "Send a lightweight reaction to the message.",
      parameters: {
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
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a direct text reply to the group. Use --- to split into separate messages. 1-2 sentences per part max.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["content", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delegate",
      description: "Delegate to a specialist agent for deep-dive tasks.",
      parameters: {
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
  },
];

// ── Destination Agent Tools ───────────────────────────────────────────────────

export const destinationTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "ignore",
      description: "Let the humans converse. No action needed yet.",
      parameters: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
        },
        required: ["reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_reaction",
      description: "Send a lightweight reaction to the message.",
      parameters: {
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
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a direct text reply to the group. Use --- to split into separate messages. 1-2 sentences per part max.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["content", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tripadvisor_attractions",
      description: "Search for attractions, landmarks, and things to do on TripAdvisor to match user interests.",
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
  {
  type: "function",
  function: {
    name: "confirm_destination",
    description: "Lock in the destination and advance to itinerary planning. Call ONLY when the group has explicitly confirmed the location.",
    parameters: {
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
},
];

// ── Itinerary Agent Tools ─────────────────────────────────────────────────────

export const itineraryTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "ignore",
      description: "Let the humans converse. No action needed yet.",
      parameters: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
        },
        required: ["reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_reaction",
      description: "Send a lightweight reaction to the message.",
      parameters: {
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
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a direct text reply to the group. Use --- to split into separate messages. 1-2 sentences per part max.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["content", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Search for tourist attractions and activities in a city using Google Maps via SerpAPI.",
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

// ── Accommodation Agent Tools ─────────────────────────────────────────────────

export const accommodationTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "ignore",
      description: "Let the humans converse. No action needed yet.",
      parameters: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
        },
        required: ["reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_reaction",
      description: "Send a lightweight reaction to the message.",
      parameters: {
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
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a direct text reply to the group. Use --- to split into separate messages. 1-2 sentences per part max.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["content", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_hotels",
      description: "Search for hotels at the destination using SerpAPI Google Hotels.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string" },
          checkIn: { type: "string", description: "Check-in date (YYYY-MM-DD)" },
          checkOut: { type: "string", description: "Check-out date (YYYY-MM-DD)" },
          adults: { type: "number", default: 2 },
        },
        required: ["destination", "checkIn", "checkOut"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Search for flights using SerpAPI Google Flights.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Origin airport code (e.g. JFK)" },
          destination: { type: "string", description: "Destination airport code (e.g. PVG)" },
          departDate: { type: "string", description: "Departure date (YYYY-MM-DD)" },
          returnDate: { type: "string", description: "Return date (YYYY-MM-DD)" },
          adults: { type: "number", default: 2 },
        },
        required: ["origin", "destination", "departDate", "returnDate"],
      },
    },
  },
];

// ── Data retrieval tool sets (tools that require a second LLM call) ───────────

export const DATA_RETRIEVAL_TOOLS: Record<string, Set<string>> = {
  orchestrator: new Set(), // orchestrator tools are all fire-and-forget
  destination: new Set(["search_tripadvisor_attractions"]),
  itinerary: new Set(["search_places"]),
  accommodation: new Set(["search_hotels", "search_flights"]),
};