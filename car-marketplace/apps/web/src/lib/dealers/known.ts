import { env } from "@/lib/env";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TTL = 60_000;
const seen = new Map<string, { at: number; exists: boolean }>();

/**
 * Whether /dealers/<slug> is an approved dealer, for a real 404 from the proxy. Answers are kept
 * for a minute; null when the database can't be reached (the page then shows its own not-found).
 */
export async function dealerExists(slug: string): Promise<boolean | null> {
  if (!SLUG.test(slug) || slug.length > 80) return false;
  const hit = seen.get(slug);
  if (hit && Date.now() - hit.at < TTL) return hit.exists;
  try {
    const response = await fetch(
      `${env.supabaseUrl}/rest/v1/dealers?select=slug&status=eq.approved&slug=eq.${encodeURIComponent(slug)}`,
      { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` }, signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const exists = ((await response.json()) as unknown[]).length > 0;
    if (seen.size > 5000) seen.clear();
    seen.set(slug, { at: Date.now(), exists });
    return exists;
  } catch (error) {
    console.error("[proxy] Could not check dealer", error);
    return null;
  }
}
