import { env } from "@/lib/env";

type Known = { at: number; makes: Set<string>; models: Set<string> };

let cache: Known | null = null;
let inflight: Promise<Known | null> | null = null;
const TTL = 10 * 60_000;

/**
 * Make and model slugs for the proxy, so /cars/<typo> can answer a real 404 before the page
 * starts streaming. Kept in memory for ten minutes; null when the database can't be reached
 * (the page then shows its own not-found screen, with noindex).
 */
export async function knownSlugs(): Promise<Known | null> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  inflight ??= load().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function load(): Promise<Known | null> {
  const headers = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
  try {
    const [makes, models] = await Promise.all(
      ["makes?select=id,slug", "models?select=make_id,slug"].map(async (path) => {
        const response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(2000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }),
    );
    const makeSlug = new Map<number, string>((makes as { id: number; slug: string }[]).map((m) => [m.id, m.slug]));
    cache = {
      at: Date.now(),
      makes: new Set(makeSlug.values()),
      models: new Set((models as { make_id: number; slug: string }[]).map((m) => `${makeSlug.get(m.make_id)}/${m.slug}`)),
    };
    return cache;
  } catch (error) {
    console.error("[proxy] Could not load make and model slugs", error);
    return cache;
  }
}
