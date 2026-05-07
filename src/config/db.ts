// src/config/db.ts
import mongoose from "mongoose";

export async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("❌ MONGO_URI not defined");
    }

    await mongoose.connect(uri);

    console.log("✅ MongoDB connected");

    // ✅ ADD IT HERE
    mongoose.connection.on("disconnected", () => {
      console.log("⚠️ MongoDB disconnected");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB error:", err);
    });

  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}