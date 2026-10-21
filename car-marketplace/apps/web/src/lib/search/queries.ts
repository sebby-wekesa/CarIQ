import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { PAGE_SIZE, type SearchFilters, type SearchSort } from "@cm/shared";
import type { Database } from "@cm/db";
import { createPublicClient } from "@/lib/supabase/public";
import { CARD_COLUMNS, type ListingCardData } from "@/lib/listings/queries";

type Overview = Database["public"]["Views"]["listing_overview"]["Row"];
type OrderColumn = keyof Overview & string;
type SortOrder = { column: OrderColumn; ascending: boolean; nullsFirst?: boolean };

/** Each sort, then newest first, then id so paging never repeats or skips a car. */
const ORDERS: Record<SearchSort, SortOrder[]> = {
  recommended: [
    { column: "featured_until", ascending: false, nullsFirst: false },
    { column: "boosted_until", ascending: false, nullsFirst: false },
    { column: "published_at", ascending: false },
    { column: "id", ascending: false },
  ],
  newest: [{ column: "published_at", ascending: false }, { column: "id", ascending: false }],
  price_asc: [{ column: "price_kes", ascending: true }, { column: "published_at", ascending: false }, { column: "id", ascending: false }],
  price_desc: [{ column: "price_kes", ascending: false }, { column: "published_at", ascending: false }, { column: "id", ascending: false }],
  mileage_asc: [{ column: "mileage_km", ascending: true }, { column: "published_at", ascending: false }, { column: "id", ascending: false }],
  year_desc: [{ column: "year", ascending: false }, { column: "published_at", ascending: false }, { column: "id", ascending: false }],
};

export type SearchResult = { cards: ListingCardData[]; total: number };

/**
 * One page of live cars for a search. Cached per search for a few minutes and dropped as soon
 * as any listing changes (tag "listings"). Returns null when the database can't be reached so
 * pages can say so instead of claiming there are no cars.
 */
export async function searchListings(filters: SearchFilters, sort: SearchSort, page: number): Promise<SearchResult | null> {
  "use cache";
  cacheTag("listings");
  try {
    const from = (page - 1) * PAGE_SIZE;
    let query = createPublicClient()
      .rpc("search_listings", { p_filters: filters }, { count: "exact" })
      .select(CARD_COLUMNS);
    for (const { column, ascending, nullsFirst } of ORDERS[sort]) query = query.order(column, { ascending, nullsFirst });
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

    // Asking for a page past the end: PostgREST answers 416. Report the real total instead.
    if (error?.code === "PGRST103") {
      cacheLife("minutes");
      return { cards: [], total: await countListings(filters) ?? 0 };
    }
    if (error) throw error;
    cacheLife("minutes");
    return { cards: (data ?? []) as ListingCardData[], total: count ?? 0 };
  } catch (error) {
    console.error("[search] Could not search listings", error);
    cacheLife("minutes");
    return null;
  }
}

/** How many live cars match: the filter sheet's "Show 23 cars" button. */
export async function countListings(filters: SearchFilters): Promise<number | null> {
  "use cache";
  cacheTag("listings");
  try {
    const { count, error } = await createPublicClient()
      .rpc("search_listings", { p_filters: filters }, { count: "exact", head: true });
    if (error) throw error;
    cacheLife("minutes");
    return count ?? 0;
  } catch (error) {
    console.error("[search] Could not count listings", error);
    cacheLife("minutes");
    return null;
  }
}

export type Facet = {
  makeSlug: string | null;
  makeName: string | null;
  modelSlug: string | null;
  modelName: string | null;
  countySlug: string | null;
  countyName: string | null;
  listings: number;
  minPrice: number | null;
  maxPrice: number | null;
};

/** Live car counts per make, model, county and their combinations. */
export async function getFacets(): Promise<Facet[]> {
  "use cache";
  cacheTag("listings");
  try {
    // This is a read-only STABLE function, so GET lets PostgREST retry transient failures.
    const { data, error } = await createPublicClient().rpc("listing_facets", {}, { get: true });
    if (error) throw error;
    cacheLife("minutes");
    return (data ?? []).map((f) => ({
      makeSlug: f.make_slug,
      makeName: f.make_name,
      modelSlug: f.model_slug,
      modelName: f.model_name,
      countySlug: f.county_slug,
      countyName: f.county_name,
      listings: f.listings ?? 0,
      minPrice: f.min_price_kes,
      maxPrice: f.max_price_kes,
    }));
  } catch (error) {
    const details = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("[search] Could not load facets", details ?? String(error));
    cacheLife("minutes");
    return [];
  }
}

/** The facet row for exactly this make / model / county combination, if it has cars. */
export function facetFor(facets: Facet[], f: { make?: string; model?: string; county?: string }): Facet | undefined {
  return facets.find(
    (x) =>
      x.makeSlug === (f.make ?? null) &&
      x.modelSlug === (f.make ? (f.model ?? null) : null) &&
      x.countySlug === (f.county ?? null),
  );
}

/** Up to four other live cars like this one: same model first, then same make and body. */
export async function getSimilarListings(listing: {
  id: string;
  make_slug: string | null;
  model_slug: string | null;
  body_type: string | null;
}): Promise<ListingCardData[]> {
  "use cache";
  cacheTag("listings");
  cacheLife("minutes");
  if (!listing.make_slug) return [];
  const db = createPublicClient();
  const pick = async (filters: SearchFilters) => {
    const { data } = await db
      .rpc("search_listings", { p_filters: filters })
      .select(CARD_COLUMNS)
      .neq("id", listing.id)
      .order("published_at", { ascending: false })
      .limit(4);
    return (data ?? []) as ListingCardData[];
  };
  try {
    const sameModel = listing.model_slug ? await pick({ make: listing.make_slug, model: listing.model_slug }) : [];
    if (sameModel.length >= 4 || !listing.body_type) return sameModel;
    const sameBody = await pick({ make: listing.make_slug, body: [listing.body_type as never] });
    const seen = new Set(sameModel.map((c) => c.id));
    return [...sameModel, ...sameBody.filter((c) => !seen.has(c.id))].slice(0, 4);
  } catch (error) {
    console.error("[search] Could not load similar listings", error);
    return [];
  }
}

/** Every live listing's URL parts, for the sitemap. */
export async function getSitemapListings(): Promise<{ id: string; title: string | null; updatedAt: string | null }[]> {
  "use cache";
  cacheTag("listings");
  try {
    const { data, error } = await createPublicClient()
      .from("listing_overview")
      .select("id, title, updated_at")
      .eq("is_public", true)
      .order("published_at", { ascending: false })
      .limit(45000);
    if (error) throw error;
    cacheLife("hours");
    return (data ?? []).map((r) => ({ id: r.id ?? "", title: r.title, updatedAt: r.updated_at })).filter((r) => r.id);
  } catch (error) {
    console.error("[search] Could not load sitemap listings", error);
    cacheLife("minutes");
    return [];
  }
}
