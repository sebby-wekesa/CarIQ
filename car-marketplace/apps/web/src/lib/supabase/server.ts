import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@cm/db";
import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create one per request — never share it. Acts as the signed-in user, so every
 * query goes through row-level security.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
