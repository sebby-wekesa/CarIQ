import { createClient } from "@/lib/supabase/server";
import { filtersKey, type BuyerState } from "@/lib/buyer/state";

const PRIVATE = { "Cache-Control": "private, no-store" };

/** The signed-in buyer's favourites, saved searches and unread alerts, for client components. */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return Response.json({ signedIn: false } satisfies BuyerState, { headers: PRIVATE });

  const userId = data.claims.sub;
  const [favourites, searches, unread, unreadMessages] = await Promise.all([
    supabase.from("favourites").select("listing_id").order("created_at", { ascending: false }).limit(500),
    supabase.from("saved_searches").select("id, filters"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "saved_search_match").is("read_at", null),
    supabase.rpc("my_unread_messages"),
  ]);
  if (favourites.error || searches.error) {
    console.error("[me] Could not load buyer state", favourites.error ?? searches.error);
    return Response.json({ error: "Could not load your saved items." }, { status: 503, headers: PRIVATE });
  }

  const state: BuyerState = {
    signedIn: true,
    userId,
    favourites: favourites.data.map((f) => f.listing_id),
    savedSearches: searches.data.map((s) => ({ id: s.id, key: filtersKey(s.filters) })),
    unread: unread.count ?? 0,
    unreadMessages: unreadMessages.data ?? 0,
  };
  return Response.json(state, { headers: PRIVATE });
}
