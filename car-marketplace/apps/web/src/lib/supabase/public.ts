import "server-only";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "@cm/db";
import { env } from "@/lib/env";

/**
 * Anonymous, database-only client for public data (catalogue, live listings).
 *
 * Deliberately not the full supabase-js client: that one starts an auth session on
 * creation, which reads the clock and cannot run inside a prerendered `"use cache"`
 * function. This client never reads the request, so cached functions can use it.
 */
export function createPublicClient() {
  return new PostgrestClient<Database>(`${env.supabaseUrl}/rest/v1`, {
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` },
    schema: "public",
    // The public listing RPCs can exceed eight seconds on a cold or busy project.
    // Keep requests bounded while allowing Supabase time to finish them.
    timeout: 30_000,
  });
}
