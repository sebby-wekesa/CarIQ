import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cm/db";

export type OwnedListing = {
  id: string;
  status: Database["public"]["Enums"]["listing_status"];
  seller_id: string;
  dealer_id: string | null;
};

/**
 * The listing, if the signed-in user may edit it (its seller, or staff of its dealer).
 * Live listings are readable by everyone, so visibility alone is not ownership.
 * Row-level security still has the final say on every write.
 */
export async function getOwnedListing(
  supabase: SupabaseClient<Database>,
  userId: string,
  listingId: string,
): Promise<OwnedListing | null> {
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return null;

  const { data: listing } = await supabase
    .from("listings")
    .select("id, status, seller_id, dealer_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return null;
  if (listing.seller_id === userId) return listing;

  if (listing.dealer_id) {
    const { data: member } = await supabase
      .from("dealer_members")
      .select("profile_id")
      .eq("dealer_id", listing.dealer_id)
      .eq("profile_id", userId)
      .maybeSingle();
    if (member) return listing;
  }
  return null;
}
