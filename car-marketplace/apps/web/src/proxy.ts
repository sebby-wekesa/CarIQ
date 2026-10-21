import { NextResponse, type NextRequest } from "next/server";
import { countyBySlug, listingIdFromSlug, parseSearch, searchHref } from "@cm/shared";
import { dealerExists } from "@/lib/dealers/known";
import { knownSlugs } from "@/lib/search/known-slugs";
import { updateSession } from "@/lib/supabase/proxy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function proxy(request: NextRequest) {
  return tidySearchUrl(request) ?? (await unknownSearchPage(request)) ?? (await unknownDealer(request)) ?? updateSession(request);
}

/** /dealers/<slug> for a dealer that doesn't exist (or isn't approved): a real 404. */
async function unknownDealer(request: NextRequest): Promise<NextResponse | null> {
  const match = request.nextUrl.pathname.match(/^\/dealers\/([^/]+)\/?$/);
  if (!match) return null;
  const exists = await dealerExists(decodeURIComponent(match[1]!));
  return exists === false ? NextResponse.rewrite(new URL("/_not-found-dealer", request.url)) : null;
}

/**
 * /cars/<unknown make>, a model of the wrong make, an unknown county or a malformed path: answer
 * 404 here. Once the page starts streaming it can only show a not-found screen with status 200.
 */
async function unknownSearchPage(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/cars/")) return null;
  const parsed = parseSearch(pathname.split("/").slice(2).filter(Boolean), {});
  const { make, model, county } = parsed.filters;
  let missing = !parsed.valid || Boolean(county && !countyBySlug(county));
  if (!missing && make) {
    const known = await knownSlugs();
    if (known) missing = !known.makes.has(make) || Boolean(model && !known.models.has(`${make}/${model}`));
  }
  // Any path outside the app's routes renders the not-found page with a real 404.
  return missing ? NextResponse.rewrite(new URL("/_not-found-search", request.url)) : null;
}

/**
 * One URL per search. Plain HTML forms and old links arrive as /cars?make=toyota&county=mombasa
 * or with empty fields; send them to /cars/toyota/in/mombasa. Sprint 1 links to /cars/<id>
 * go to the listing's new address.
 */
function tidySearchUrl(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/cars" && !pathname.startsWith("/cars/")) return null;
  const segments = pathname.split("/").slice(2).filter(Boolean);

  if (segments.length === 1 && UUID.test(segments[0]!)) {
    const url = request.nextUrl.clone();
    url.pathname = `/listings/${listingIdFromSlug(segments[0]!)}`;
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  const keys = [...searchParams.keys()];
  const untidy =
    ["make", "model", "county"].some((k) => searchParams.has(k)) ||
    [...searchParams.values()].some((v) => v.trim() === "") ||
    keys.length !== new Set(keys).size;
  if (!untidy) return null;

  const parsed = parseSearch(segments, searchParams);
  if (!parsed.valid) return null;
  const target = new URL(searchHref(parsed.filters, { sort: parsed.sort, page: parsed.page }), request.url);
  for (const key of ["since", "save"]) {
    const value = searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: [
    // Everything except static files and images.
    "/((?!_next/static|_next/image|icon.svg|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff2?)$).*)",
  ],
};
