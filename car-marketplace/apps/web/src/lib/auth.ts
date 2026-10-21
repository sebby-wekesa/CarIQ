import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { formatKenyanPhone, normalizeKenyanPhone } from "@cm/shared";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  /** Display format, e.g. +254 712 345 678 */
  phone: string | null;
  fullName: string | null;
  countyCode: number | null;
  /** True until the user has told us their name and county. */
  needsProfile: boolean;
};

/**
 * The data access layer's single way to know who is signed in. Reads the request
 * cookies, so callers must sit inside a <Suspense> boundary (Cache Components).
 * Deduplicated per request with React cache().
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Session checks read the clock (token expiry), so keep them out of prerendering
  // and runtime prefetches entirely: this only ever runs for a real request.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, county_code")
    .eq("id", claims.sub)
    .maybeSingle();

  const rawPhone = typeof claims.phone === "string" ? claims.phone : "";
  const e164 = rawPhone ? normalizeKenyanPhone(rawPhone) : null;

  return {
    id: claims.sub,
    phone: e164 ? formatKenyanPhone(e164) : rawPhone || null,
    fullName: profile?.full_name ?? null,
    countyCode: profile?.county_code ?? null,
    needsProfile: !profile?.full_name || !profile?.county_code,
  };
});

/** For pages and actions that only make sense signed in. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}
