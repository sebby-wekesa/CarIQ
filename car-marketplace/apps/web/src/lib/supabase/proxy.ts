import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@cm/db";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { matchShortLink, resolveShortLink } from "@/lib/short-links";

/** Paths that need a signed-in user. Pages still re-check on the server. */
const PROTECTED_PREFIXES = ["/account", "/sell", "/admin", "/messages", "/m", "/s", "/saved", "/dealer"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Runs on every request: refreshes the Supabase session cookie, then does a fast,
 * optimistic redirect for protected pages. Authorisation itself lives in the
 * data layer and in row-level security, never only here.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not put code between createServerClient and getClaims — it must refresh first.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return withCookies(NextResponse.redirect(url), response);
  }

  const short = matchShortLink(pathname);
  if (signedIn && short) {
    const url = request.nextUrl.clone();
    const target = new URL(await resolveShortLink(supabase, short), request.url);
    url.pathname = target.pathname;
    url.search = target.search;
    return withCookies(NextResponse.redirect(url, 303), response);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get("next"));
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

  return response;
}

/** Carry refreshed auth cookies over to a redirect response. */
function withCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}
