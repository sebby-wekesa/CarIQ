import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api";
import { MESSAGE_COLUMNS, type ChatMessage } from "@/lib/messages/types";

/**
 * New messages since `after`, plus when the other person last read yours. The chat polls this
 * every few seconds while open. Row-level security limits it to the buyer and the seller's side
 * (the seller, or the dealer's staff).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const after = request.nextUrl.searchParams.get("after");
  let query = auth.supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", id).order("created_at").limit(100);
  if (after && !Number.isNaN(Date.parse(after))) query = query.gt("created_at", after);

  const { data: convo } = await auth.supabase.from("conversations").select("buyer_id").eq("id", id).maybeSingle();
  if (!convo) return Response.json({ error: "Not found" }, { status: 404 });

  // "Yours" is your side of the chat: for dealer staff, anything the team sent.
  let mine = auth.supabase.from("messages").select("created_at").eq("conversation_id", id).not("read_at", "is", null);
  mine = convo.buyer_id === auth.userId ? mine.eq("sender_id", auth.userId) : mine.neq("sender_id", convo.buyer_id);

  const [fresh, lastRead] = await Promise.all([
    query,
    mine.order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (fresh.error) return Response.json({ error: "Could not load messages" }, { status: 500 });

  return Response.json(
    { messages: (fresh.data ?? []) as ChatMessage[], readUpTo: lastRead.data?.created_at ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
