import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Database, Json } from "@cm/db";
import { createPublicClient } from "@/lib/supabase/public";

export type ListingOverview = Database["public"]["Views"]["listing_overview"]["Row"];

/** Columns a card needs; pages ask for more. */
export const CARD_COLUMNS =
  "id, title, price_kes, negotiable, mileage_km, year, county_name, town, transmission, fuel_type, condition, cover_thumb_path, photo_count, published_at, status, boosted_until, featured_until, dealer_name, dealer_verified" as const;

export type ListingCardData = Pick<
  ListingOverview,
  | "id"
  | "title"
  | "price_kes"
  | "negotiable"
  | "mileage_km"
  | "year"
  | "county_name"
  | "town"
  | "transmission"
  | "fuel_type"
  | "condition"
  | "cover_thumb_path"
  | "photo_count"
  | "published_at"
  | "status"
  | "boosted_until"
  | "featured_until"
> &
  Partial<Pick<ListingOverview, "dealer_name" | "dealer_verified">>;

export type ListingPhoto = { id: string; storage_path: string; thumb_path: string | null; width: number | null; height: number | null };

export type PassportSummary = {
  vehicle: { chassis_masked: string; model_code: string | null; is_vin17: boolean; first_seen: string } | null;
  documents: { kind: Database["public"]["Enums"]["document_kind"]; verification_level: Database["public"]["Enums"]["verification_level"]; uploaded_at: string }[];
  readings: { reading_km: number; read_on: string; source: Database["public"]["Enums"]["reading_source"]; verification_level: Database["public"]["Enums"]["verification_level"] }[];
};

export function parsePassport(value: Json | null): PassportSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as PassportSummary;
}

export type PublicListing = {
  listing: ListingOverview;
  photos: ListingPhoto[];
  passport: PassportSummary | null;
};

/** A live listing with its photos and public Passport, or null. Tagged so edits show up quickly. */
export async function getPublicListing(id: string): Promise<PublicListing | null> {
  "use cache";
  cacheTag(`listing:${id}`, "listings");
  cacheLife("minutes");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const db = createPublicClient();
  const { data: listing, error } = await db
    .from("listing_overview")
    .select("*")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw error;
  if (!listing) return null;

  const [photos, passport] = await Promise.all([
    db
      .from("listing_media")
      .select("id, storage_path, thumb_path, width, height")
      .eq("listing_id", id)
      .eq("kind", "photo")
      .order("position")
      .order("created_at"),
    db.rpc("listing_passport", { p_listing_id: id }),
  ]);
  if (photos.error) throw photos.error;

  return { listing, photos: photos.data ?? [], passport: parsePassport(passport.data ?? null) };
}

/** Newest live listings for the home page. */
export async function getLatestListings(limit = 12): Promise<{ cards: ListingCardData[]; total: number } | null> {
  "use cache";
  cacheTag("listings");
  try {
    const db = createPublicClient();
    const { data, count, error } = await db
      .from("listing_overview")
      .select(CARD_COLUMNS, { count: "exact" })
      .eq("is_public", true)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    cacheLife("minutes");
    return { cards: data ?? [], total: count ?? 0 };
  } catch (error) {
    console.error("[listings] Could not load latest listings", error);
    cacheLife("minutes");
    return null;
  }
}

export type PublicSeller = {
  id: string;
  fullName: string | null;
  countyName: string | null;
  memberSince: string;
  cards: ListingCardData[];
};

export async function getPublicSeller(id: string): Promise<PublicSeller | null> {
  "use cache";
  cacheTag(`seller:${id}`, "listings");
  cacheLife("minutes");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const db = createPublicClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, county_code, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return null;

  const [county, cards] = await Promise.all([
    profile.county_code
      ? db.from("counties").select("name").eq("code", profile.county_code).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("listing_overview")
      .select(CARD_COLUMNS)
      .eq("seller_id", id)
      .is("dealer_id", null)
      .eq("is_public", true)
      .order("published_at", { ascending: false }),
  ]);

  return {
    id: profile.id,
    fullName: profile.full_name,
    countyName: county.data?.name ?? null,
    memberSince: profile.created_at,
    cards: cards.data ?? [],
  };
}
