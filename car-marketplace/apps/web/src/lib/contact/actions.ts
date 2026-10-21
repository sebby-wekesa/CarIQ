"use server";

import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export type RevealResult = { ok: true; phone: string } | { ok: false; signIn?: boolean; message: string };

/** Gives a signed-in buyer the seller's number for a call or WhatsApp, logging the lead. */
export async function revealContact(listingId: string, kind: "call" | "whatsapp"): Promise<RevealResult> {
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || (kind !== "call" && kind !== "whatsapp")) {
    return { ok: false, message: "That car wasn't found." };
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, signIn: true, message: "Sign in to contact sellers." };

  const { data, error } = await supabase.rpc("contact_seller", { p_listing_id: listingId, p_kind: kind });
  const row = data?.[0];
  if (error || !row?.phone) {
    return { ok: false, message: friendlyDbError(error, "We couldn't get the seller's number. Try again.") };
  }
  return { ok: true, phone: row.phone };
}
