import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Database } from "@cm/db";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type DealerRole = Database["public"]["Enums"]["dealer_role"];
export type DealerStatus = Database["public"]["Enums"]["dealer_status"];
export type MyDealer = {
  id: string;
  name: string;
  slug: string;
  status: DealerStatus;
  trusted: boolean;
  role: DealerRole;
  rejection_reason: string | null;
  missing_documents: string[];
};

/** Dealerships the signed-in person belongs to, oldest membership first. */
export const getMyDealers = cache(async (): Promise<MyDealer[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_dealers");
  if (error) {
    console.error("[dealers] my_dealers failed", error);
    return [];
  }
  return (data ?? []).map((d) => ({
    id: d.id!,
    name: d.name!,
    slug: d.slug!,
    status: d.status!,
    trusted: Boolean(d.trusted),
    role: d.role!,
    rejection_reason: d.rejection_reason,
    missing_documents: d.missing_documents ?? [],
  }));
});

/** The dealership, if the signed-in person is on its team; otherwise a 404. */
export async function requireDealer(id: string, returnTo: string) {
  const user = await requireUser(returnTo);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const dealer = (await getMyDealers()).find((d) => d.id === id);
  if (!dealer) notFound();
  return { user, dealer };
}

export const canManage = (role: DealerRole) => role === "owner" || role === "manager";

/** Full dealer row (for the showroom form and the overview). */
export async function getDealerRow(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dealers")
    .select("id, name, slug, phone, county_code, town, address, description, opening_hours, accepts_calls, accepts_whatsapp, status, verified_at, trusted")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getDealerStock(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dealer_stock", { p_dealer_id: id });
  if (error) console.error("[dealers] dealer_stock failed", error);
  return data ?? [];
}

export type StockRow = Awaited<ReturnType<typeof getDealerStock>>[number];

export type DealerLead = {
  created_at: string;
  lead_type: Database["public"]["Enums"]["lead_type"];
  listing_id: string;
  listing_title: string;
  buyer_name: string | null;
  conversation_id: string | null;
  unread: number;
};

export async function getDealerLeads(id: string, limit = 200): Promise<DealerLead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dealer_leads", { p_dealer_id: id, p_limit: limit });
  if (error) console.error("[dealers] dealer_leads failed", error);
  return (data ?? []).map((l) => ({
    created_at: l.created_at!,
    lead_type: l.lead_type!,
    listing_id: l.listing_id!,
    listing_title: l.listing_title ?? "Car",
    buyer_name: l.buyer_name,
    conversation_id: l.conversation_id,
    unread: Number(l.unread ?? 0),
  }));
}

/** How many leads arrived in the last `days` days. */
export function countRecentLeads(leads: DealerLead[], days: number): number {
  const since = Date.now() - days * 86_400_000;
  return leads.filter((l) => Date.parse(l.created_at) > since).length;
}
