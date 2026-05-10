// services/hotel-cache.service.ts
import { HotelCache } from "../models/hotels.model.js";

function mapProperty(p: any) {
  return {
    name: p.name,
    description: p.description ?? null,
    link: p.link ?? null,
    type: p.type ?? null,
    overall_rating: p.overall_rating ?? null,
    reviews: p.reviews ?? null,
    hotel_class: p.hotel_class ?? null,
    amenities: p.amenities ?? [],
    images: (p.images ?? []).map((img: any) => ({
      thumbnail: img.thumbnail ?? null,
      original_image: img.original_image ?? null,
    })),
    gps_coordinates: p.gps_coordinates
      ? {
          latitude: p.gps_coordinates.latitude,
          longitude: p.gps_coordinates.longitude,
        }
      : null,
    nearby_places: (p.nearby_places ?? []).map((place: any) => ({
      name: place.name,
      transportations: (place.transportations ?? []).map((t: any) => ({
        type: t.type,
        duration: t.duration,
      })),
    })),
    cachedAt: new Date(),
  };
}

export async function saveHotelsToCache(properties: any[]): Promise<void> {
  if (!properties?.length) return;

  const ops = properties
    .filter((p) => !!p.property_token) // skip entries without a token
    .map((p) => ({
      updateOne: {
        filter: { _id: p.property_token },
        update: { $set: mapProperty(p) },
        upsert: true,
      },
    }));

  if (!ops.length) {
    console.warn("[hotel-cache] No valid properties to save");
    return;
  }

  const result = await HotelCache.bulkWrite(ops);
  console.log(
    `[hotel-cache] Saved ${result.upsertedCount} new, updated ${result.modifiedCount} existing hotels`
  );
}

export async function getHotelByToken(propertyToken: string) {
  return HotelCache.findById(propertyToken);
}

export async function getHotelByName(hotelName: string) {
  return HotelCache.findOne({
    name: { $regex: new RegExp(hotelName, "i") },
  });
}

export async function getHotelImages(hotelName: string): Promise<string[]> {
  const hotel = await getHotelByName(hotelName);
  if (!hotel?.images?.length) return [];
  return hotel.images
    .map((img) => img.thumbnail)
    .filter((t): t is string => !!t);
}

export async function getHotelBookingLink(hotelName: string): Promise<string> {
  const hotel = await getHotelByName(hotelName);
  if (!hotel?.link) return "No Booking Link Available";
  return hotel.link;
}

export async function getAdditionalHotelImages(
  hotelName: string,
  skip: number = 1,  // skip first since it was already shown
  limit: number = 5
): Promise<string[]> {
  const images = await getHotelImages(hotelName);
  return images.slice(skip, skip + limit);
}