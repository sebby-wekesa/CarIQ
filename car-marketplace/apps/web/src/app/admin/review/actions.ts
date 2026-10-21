"use server";

import { refresh, updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export type ReviewState = { error?: string; done?: "approve" | "reject" };

export async function reviewListing(listingId: string, _previous: ReviewState, formData: FormData): Promise<ReviewState> {
  await requireUser("/admin/review");
  const decision = formData.get("decision") === "reject" ? "reject" : "approve";
  const reason = String(formData.get("reason") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_listing", {
    p_listing_id: listingId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) return { error: friendlyDbError(error, "The decision could not be saved. Try again.") };

  updateTag(`listing:${listingId}`);
  updateTag("listings");
  refresh();
  return { done: decision };
}
