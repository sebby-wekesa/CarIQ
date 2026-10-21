import { searchFiltersSchema, searchHref } from "@cm/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cm/db";

/**
 * SMS links are short to keep texts in one segment: /m/<8 hex> for a chat, /s/<8 hex> for a saved
 * search, /saved for all saved searches. They're resolved in the proxy (after sign-in) because
 * that works for every kind of request, including the redirect that follows signing in.
 */
export function matchShortLink(pathname: string): { kind: "m" | "s"; code: string } | { kind: "saved" } | null {
  if (pathname === "/saved" || pathname === "/saved/") return { kind: "saved" };
  const m = pathname.match(/^\/([ms])\/([0-9a-f]{8})\/?$/i);
  return m ? { kind: m[1]!.toLowerCase() as "m" | "s", code: m[2]!.toLowerCase() } : null;
}

export async function resolveShortLink(
  supabase: SupabaseClient<Database>,
  link: NonNullable<ReturnType<typeof matchShortLink>>,
): Promise<string> {
  if (link.kind === "saved") return "/account/saved/searches";
  if (link.kind === "m") {
    const { data } = await supabase.from("conversations").select("id").order("created_at", { ascending: false }).limit(1000);
    const match = data?.find((c) => c.id.startsWith(link.code));
    return match ? `/messages/${match.id}` : "/messages";
  }
  const { data } = await supabase.from("saved_searches").select("id");
  const match = data?.find((s) => s.id.startsWith(link.code));
  return match ? openSavedSearch(supabase, match.id) : "/account/saved/searches";
}

/** Marks a saved search seen and returns its results URL, with cars since the last visit badged. */
export async function openSavedSearch(supabase: SupabaseClient<Database>, id: string): Promise<string> {
  const { data, error } = await supabase.rpc("open_saved_search", { p_id: id });
  const row = data?.[0];
  const filters = searchFiltersSchema.safeParse(row?.filters);
  if (error || !row || !filters.success) return "/account/saved/searches";
  const href = searchHref(filters.data);
  return row.previously_seen_at
    ? `${href}${href.includes("?") ? "&" : "?"}since=${encodeURIComponent(row.previously_seen_at)}`
    : href;
}

/**
 * After signing in, Next.js navigates to `next` from inside a Server Action, which can't follow a
 * proxy redirect to a page. So a short link as `next` is resolved here, straight to its page.
 */
export async function resolveNext(supabase: SupabaseClient<Database>, next: string): Promise<string> {
  const link = matchShortLink(next.split("?")[0] ?? next);
  return link ? resolveShortLink(supabase, link) : next;
}
