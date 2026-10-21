import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|curl|wget|python|axios/i;

/**
 * Count a listing view. Visitors are identified by a daily, salted hash of their network address
 * and browser, never stored in the clear; the database counts each one once a day and ignores the
 * seller's own team.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/listings/[id]/view">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 204 });
  const agent = request.headers.get("user-agent") ?? "";
  if (!agent || BOTS.test(agent)) return new Response(null, { status: 204 });

  const secret = serverEnv().supabaseSecretKey;
  if (!secret) return new Response(null, { status: 204 });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || request.headers.get("x-real-ip") || "unknown";
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  const visitor = createHmac("sha256", secret).update(`${day}|${ip}|${agent}`).digest("hex").slice(0, 40);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const viewer = typeof data?.claims?.sub === "string" ? data.claims.sub : undefined;

  // The one platform write a visitor triggers: a narrow RPC only the service role can call.
  const { error } = await createAdminClient(secret).rpc("record_listing_view", {
    p_listing_id: id,
    p_visitor: visitor,
    p_viewer: viewer,
  });
  if (error) console.error("[views] record_listing_view failed", error.message);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
