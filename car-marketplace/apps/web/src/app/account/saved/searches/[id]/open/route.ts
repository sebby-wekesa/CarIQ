import { openSavedSearch } from "@/lib/short-links";
import { createClient } from "@/lib/supabase/server";

/**
 * Opening a saved search: mark it seen (clears its "new" count and alerts), then show the
 * results with cars listed since the previous visit badged as new.
 */
export async function GET(request: Request, ctx: RouteContext<"/account/saved/searches/[id]/open">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.redirect(new URL("/account/saved/searches", request.url), 303);
  const target = await openSavedSearch(await createClient(), id);
  return Response.redirect(new URL(target, request.url), 303);
}
