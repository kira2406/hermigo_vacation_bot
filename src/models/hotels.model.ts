// models/hotel-cache.model.ts
import mongoose from "mongoose";

const hotelCacheSchema = new mongoose.Schema({
  _id: { type: String }, // propertyToken as primary key
  name: { type: String, required: true },
  description: { type: String },
  link: { type: String },
  type: { type: String },
  overall_rating: { type: Number },
  reviews: { type: Number },
  hotel_class: { type: String },
  amenities: [{ type: String }],
  images: [{
    thumbnail: { type: String },
    original_image: { type: String },
  }],
  gps_coordinates: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  nearby_places: [{
    name: { type: String },
    transportations: [{
      type: { type: String },
      duration: { type: String },
    }]
  }],
  cachedAt: { type: Date, default: Date.now, expires: 86400 }, // 24hr TTL
});

export const HotelCache = mongoose.model("HotelCache", hotelCacheSchema);