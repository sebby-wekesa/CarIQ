"use server";

import { refresh } from "next/cache";
import { describeSearch, isEmptySearch, normalizeFilters, searchFiltersSchema } from "@cm/shared";
import { getCatalogue, resolveSearchNames } from "@/lib/catalogue";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export type BuyerActionResult = { ok: true; id?: string; already?: boolean } | { ok: false; signIn?: boolean; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function signedInClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? supabase : null;
}

/** Add a car to, or remove it from, the signed-in buyer's saved cars. */
export async function setFavourite(listingId: string, saved: boolean): Promise<BuyerActionResult> {
  if (!UUID.test(listingId)) return { ok: false, message: "That car wasn't found." };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, signIn: true, message: "Sign in to save cars." };

  if (saved) {
    const { error } = await supabase.from("favourites").insert({ listing_id: listingId });
    if (error && error.code !== "23505") {
      if (error.code === "42501") return { ok: false, message: "This car is no longer for sale." };
      return { ok: false, message: friendlyDbError(error, "That car didn't save. Try again.") };
    }
    return { ok: true };
  }
  const { error } = await supabase.from("favourites").delete().eq("listing_id", listingId);
  if (error) return { ok: false, message: friendlyDbError(error, "That car wasn't removed. Try again.") };
  return { ok: true };
}

/** Save the given search under a plain-words name. Saving the same search twice is a no-op. */
export async function saveSearch(rawFilters: unknown): Promise<BuyerActionResult> {
  const parsed = searchFiltersSchema.safeParse(rawFilters);
  if (!parsed.success) return { ok: false, message: "That search can't be saved. Change a filter and try again." };
  const filters = normalizeFilters(parsed.data);
  if (isEmptySearch(filters)) return { ok: false, message: "Pick at least one filter, then save the search." };

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, signIn: true, message: "Sign in to save searches." };

  const names = resolveSearchNames(await getCatalogue(), filters);
  const name = describeSearch(filters, { make: names.make?.name, model: names.model?.name, county: names.countyName });

  const { data, error } = await supabase.from("saved_searches").insert({ name, filters }).select("id").single();
  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("saved_searches").select("id").eq("filters", JSON.stringify(filters)).maybeSingle();
    return { ok: true, id: existing?.id, already: true };
  }
  if (error) return { ok: false, message: friendlyDbError(error, "That search didn't save. Try again.") };
  return { ok: true, id: data.id };
}

export async function deleteSavedSearch(id: string): Promise<BuyerActionResult> {
  if (!UUID.test(id)) return { ok: false, message: "That search wasn't found." };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, signIn: true, message: "Sign in to manage searches." };
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  if (error) return { ok: false, message: friendlyDbError(error, "That search wasn't deleted. Try again.") };
  refresh();
  return { ok: true };
}

export async function setSearchAlerts(id: string, enabled: boolean): Promise<BuyerActionResult> {
  if (!UUID.test(id)) return { ok: false, message: "That search wasn't found." };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, signIn: true, message: "Sign in to manage searches." };
  const { error } = await supabase.from("saved_searches").update({ alerts_enabled: enabled }).eq("id", id);
  if (error) return { ok: false, message: friendlyDbError(error, "That didn't save. Try again.") };
  refresh();
  return { ok: true };
}
