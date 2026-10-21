import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@cm/db";
import { env } from "@/lib/env";

/**
 * Service-role client: bypasses row-level security. Use only for system-owned work such as
 * delivery, view counting, and payment finalization. Never use it instead of session RLS to
 * authorize a user's reads or writes; verify identity and ownership with the session client first.
 */
export function createAdminClient(secretKey: string) {
  return createClient<Database>(env.supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
