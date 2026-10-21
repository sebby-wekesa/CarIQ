"use server";

import { refresh, updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export type DealerReviewState = { error?: string; done?: string };

export async function reviewDealer(dealerId: string, _previous: DealerReviewState, formData: FormData): Promise<DealerReviewState> {
  await requireUser("/admin/dealers");
  const decision = formData.get("decision") === "reject" ? "reject" : "approve";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_dealer", {
    p_dealer_id: dealerId,
    p_decision: decision,
    p_reason: String(formData.get("reason") ?? ""),
    p_trusted: formData.get("trusted") === "on",
  });
  if (error) return { error: friendlyDbError(error, "The decision could not be saved. Try again.") };
  updateTag("listings");
  updateTag("dealers");
  refresh();
  return { done: decision === "approve" ? "Approved. The owner gets an SMS." : "Sent back with your reason. The owner gets an SMS." };
}

export async function setDealerTrust(dealerId: string, trusted: boolean): Promise<DealerReviewState> {
  await requireUser("/admin/dealers");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_dealer_trust", { p_dealer_id: dealerId, p_trusted: trusted });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { done: trusted ? "Cars from this dealer now go live on submission." : "Cars from this dealer now wait for review." };
}
