import mongoose from "mongoose";

// ==========================================
// 1. MongoDB Schema & Model Definition
// ==========================================
const conversationSchema = new mongoose.Schema({
  chatId: { 
    type: String, 
    required: true, 
    unique: true // Ensures we don't create duplicate chat records
  },
  isGroup: { 
    type: Boolean, 
    default: true 
  },
  // Track the state of the Vacation planning
  vacationState: { 
    type: String, 
    enum: ["destination", "itinerary", "accommodation", "complete"],
    default: "destination" 
  },
  participants: [{ type: String }], // Array of sender handles
  accommodation: {
  flights: {
    airline: { type: String, default: null },
    departure: { type: String, default: null },
    arrival: { type: String, default: null },
    pricePerPerson: { type: Number, default: null },
    bookingLink: { type: String, default: null },
    confirmedBy: [{ type: String }],
    confirmedAt: { type: Date, default: null },
  },
  hotel: {
    name: { type: String, default: null },
    pricePerNight: { type: Number, default: null },
    bookingLink: { type: String, default: null },
    confirmedBy: [{ type: String }],
    confirmedAt: { type: Date, default: null },
  },
},
  
  // ✈️ NEW: Core Vacation Details
  destination: { 
    type: String, 
    default: null // Will be populated once the group decides
  },
  travelDates: {
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null }
  },
  
  // 🏨 NEW: Hotel Options & Voting
  hotels: [{
    name: String,
    pricePerNight: Number,
    url: String
  }],

  // 🗺️ NEW: Itinerary Tracking
  itinerary: [{
    date: Date,
    activity: String,
    confirmed: { type: Boolean, default: false }
  }],

  events: [{
    eventType: { type: String, required: true }, // e.g., "message.received", "message.sent", "reaction.sent"
    actorType: { type: String, enum: ["participant", "bot"], required: true },
    sender: { type: String, required: true },
    content: { type: String }, // Optional, used for messages
    reaction: { type: String }, // Optional, used for reactions
    rawPayload: { type: mongoose.Schema.Types.Mixed }, // Store the raw webhook data just in case
    timestamp: { type: Date, default: Date.now }
  }],

  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the 'updatedAt' timestamp automatically before saving
conversationSchema.pre("save", async function () {
  this.updatedAt = new Date();
});

export const Conversation = mongoose.model("Conversation", conversationSchema);