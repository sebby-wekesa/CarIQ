import "server-only";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_COLUMNS, type ChatMessage } from "./types";

export async function getMyConversations() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) {
    console.error("[messages] my_conversations failed", error);
    return null;
  }
  return data ?? [];
}

export type ConversationSummary = NonNullable<Awaited<ReturnType<typeof getMyConversations>>>[number];

/** The conversation (if the signed-in person is in it) and its latest 200 messages, oldest first. */
export async function getConversation(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const [summary, messages] = await Promise.all([
    supabase.rpc("my_conversations", { p_id: id }),
    supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const row = summary.data?.[0];
  if (!row) return null;
  return { summary: row, messages: ((messages.data ?? []) as ChatMessage[]).reverse() };
}

/** First names of the dealer's staff, for labelling a colleague's replies in a dealer chat. */
export async function getDealerColleagues(listingId: string): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data: listing } = await supabase.from("listings").select("dealer_id").eq("id", listingId).maybeSingle();
  if (!listing?.dealer_id) return {};
  const { data: team } = await supabase.rpc("dealer_team", { p_dealer_id: listing.dealer_id });
  return Object.fromEntries(
    (team ?? [])
      .filter((m) => m.profile_id && m.full_name)
      .map((m) => [m.profile_id!, m.full_name!.trim().split(/\s+/)[0]!]),
  );
}
