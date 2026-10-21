import type { NextRequest } from "next/server";
import { parseSearch } from "@cm/shared";
import { countListings } from "@/lib/search/queries";

/** How many cars a search would show, for the mobile filter sheet's "Show 23 cars" button. */
export async function GET(request: NextRequest) {
  const { filters } = parseSearch([], request.nextUrl.searchParams);
  const count = await countListings(filters);
  if (count === null) return Response.json({ error: "Search is unavailable right now." }, { status: 503 });
  return Response.json({ count }, { headers: { "Cache-Control": "public, max-age=30" } });
}
