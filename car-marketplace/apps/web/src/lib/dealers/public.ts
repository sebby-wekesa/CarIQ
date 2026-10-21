import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { countyByCode } from "@cm/shared";
import { CARD_COLUMNS, type ListingCardData } from "@/lib/listings/queries";
import { createPublicClient } from "@/lib/supabase/public";

export type PublicDealer = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  countyName: string | null;
  countySlug: string | null;
  town: string | null;
  address: string | null;
  description: string | null;
  openingHours: string | null;
  acceptsCalls: boolean;
  acceptsWhatsapp: boolean;
  verifiedAt: string | null;
  cards: ListingCardData[];
};

/** An approved dealer's showroom and live stock, or null. Visitors only ever see approved dealers. */
export async function getPublicDealer(slug: string): Promise<PublicDealer | null> {
  "use cache";
  cacheTag(`dealer:${slug}`, "dealers", "listings");
  cacheLife("minutes");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;

  const db = createPublicClient();
  const { data: dealer } = await db
    .from("dealers")
    .select("id, name, slug, phone, county_code, town, address, description, opening_hours, accepts_calls, accepts_whatsapp, verified_at, status")
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  if (!dealer) return null;

  const { data: cards } = await db
    .from("listing_overview")
    .select(CARD_COLUMNS)
    .eq("dealer_id", dealer.id)
    .eq("is_public", true)
    .order("published_at", { ascending: false })
    .limit(500);

  const county = countyByCode(dealer.county_code);
  return {
    id: dealer.id,
    name: dealer.name,
    slug: dealer.slug,
    phone: dealer.phone,
    countyName: county?.name ?? null,
    countySlug: county?.slug ?? null,
    town: dealer.town,
    address: dealer.address,
    description: dealer.description,
    openingHours: dealer.opening_hours,
    acceptsCalls: dealer.accepts_calls,
    acceptsWhatsapp: dealer.accepts_whatsapp,
    verifiedAt: dealer.verified_at,
    cards: cards ?? [],
  };
}

export type DealerSummary = { name: string; slug: string; countyName: string | null; town: string | null; liveCars: number; verifiedAt: string | null };

/** Every verified dealer with how many cars it has on sale, most stock first. */
export async function getVerifiedDealers(): Promise<DealerSummary[]> {
  "use cache";
  cacheTag("dealers", "listings");
  try {
    const db = createPublicClient();
    const [dealers, stock] = await Promise.all([
      db.from("dealers").select("id, name, slug, county_code, town, verified_at").eq("status", "approved").order("name").limit(1000),
      db.from("listing_overview").select("dealer_id").eq("is_public", true).not("dealer_id", "is", null).limit(20000),
    ]);
    if (dealers.error) throw dealers.error;
    const counts = new Map<string, number>();
    for (const row of stock.data ?? []) if (row.dealer_id) counts.set(row.dealer_id, (counts.get(row.dealer_id) ?? 0) + 1);
    cacheLife("minutes");
    return (dealers.data ?? [])
      .map((d) => ({
        name: d.name,
        slug: d.slug,
        countyName: countyByCode(d.county_code)?.name ?? null,
        town: d.town,
        liveCars: counts.get(d.id) ?? 0,
        verifiedAt: d.verified_at,
      }))
      .sort((a, b) => b.liveCars - a.liveCars || a.name.localeCompare(b.name));
  } catch (error) {
    console.error("[dealers] Could not load dealers", error);
    cacheLife("minutes");
    return [];
  }
}
