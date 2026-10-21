import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { countyNameFor } from "@cm/shared";
import type { Database } from "@cm/db";
import { createPublicClient } from "@/lib/supabase/public";

export type CatalogueMake = { id: number; name: string; slug: string; isPopular: boolean };
export type CatalogueModel = {
  id: number;
  makeId: number;
  name: string;
  slug: string;
  bodyType: Database["public"]["Enums"]["body_type"] | null;
};
export type Catalogue = { makes: CatalogueMake[]; models: CatalogueModel[] };

/** Makes and models for pickers and the home page. Changes rarely, so cached for days. */
export async function getCatalogue(): Promise<Catalogue | null> {
  "use cache";
  cacheTag("catalogue");
  try {
    const db = createPublicClient();
    const [makes, models] = await Promise.all([
      db.from("makes").select("id, name, slug, is_popular").order("sort_order").order("name"),
      db.from("models").select("id, make_id, name, slug, body_type").order("name"),
    ]);
    if (makes.error) throw makes.error;
    if (models.error) throw models.error;
    cacheLife("days");
    return {
      makes: makes.data.map((m) => ({ id: m.id, name: m.name, slug: m.slug, isPopular: m.is_popular })),
      models: models.data.map((m) => ({ id: m.id, makeId: m.make_id, name: m.name, slug: m.slug, bodyType: m.body_type })),
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("[catalogue] Could not load makes and models", details ?? String(error));
    cacheLife("minutes");
    return null;
  }
}

/** Display names for the slugs in a search; undefined for slugs the catalogue doesn't know. */
export function resolveSearchNames(
  catalogue: Catalogue | null,
  filters: { make?: string; model?: string; county?: string },
): { make?: CatalogueMake; model?: CatalogueModel; countyName?: string } {
  const make = filters.make ? catalogue?.makes.find((m) => m.slug === filters.make) : undefined;
  const model =
    make && filters.model ? catalogue?.models.find((m) => m.makeId === make.id && m.slug === filters.model) : undefined;
  return { make, model, countyName: countyNameFor(filters.county) };
}
