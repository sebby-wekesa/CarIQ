"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrors, listingDetailsSchema, listingStartSchema } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getOwnedListing } from "@/lib/listings/owned";
import { DOCUMENT_BUCKET, PHOTO_BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export type FormState = { errors?: Record<string, string>; saved?: boolean; values?: Record<string, unknown> };

function invalidate(listingId: string) {
  updateTag(`listing:${listingId}`);
  updateTag("listings");
}

// -----------------------------------------------------------------------------
// Step one: chassis number, model and year create the draft and its Passport.
// -----------------------------------------------------------------------------
export async function startListing(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser("/sell/new");
  const values = {
    chassis: String(formData.get("chassis") ?? ""),
    modelId: String(formData.get("modelId") ?? ""),
    makeId: String(formData.get("makeId") ?? ""),
    year: String(formData.get("year") ?? ""),
    dealerId: String(formData.get("dealerId") ?? ""),
  };
  const parsed = listingStartSchema.safeParse(values);
  const dealerId = /^[0-9a-f-]{36}$/i.test(values.dealerId) ? values.dealerId : undefined;
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data: listingId, error } = await supabase.rpc("start_listing", {
    p_model_id: parsed.data.modelId,
    p_year: parsed.data.year,
    p_chassis: parsed.data.chassis.display,
    p_dealer_id: dealerId,
  });
  if (error || !listingId) {
    console.error("[sell] start_listing failed", error);
    return { errors: { _form: friendlyDbError(error, "The draft could not be created. Try again.") }, values };
  }
  redirect(`/sell/${listingId}`);
}

// -----------------------------------------------------------------------------
// The details form on the editor.
// -----------------------------------------------------------------------------
export async function saveListingDetails(listingId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(`/sell/${listingId}`);
  const values = Object.fromEntries(
    [
      "modelId", "year", "condition", "bodyType", "fuelType", "transmission", "drivetrain", "engineCc", "colour",
      "plate", "mileageKm", "priceKes", "negotiable", "countyCode", "town", "description",
    ].map((key) => [key, formData.get(key) ?? undefined]),
  );
  const features = formData.getAll("features").map(String);
  const parsed = listingDetailsSchema.safeParse({ ...values, features });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { ...values, features } };

  const supabase = await createClient();
  const listing = await getOwnedListing(supabase, user.id, listingId);
  if (!listing) return { errors: { _form: "This listing isn't yours to edit." } };

  const d = parsed.data;
  const { error } = await supabase
    .from("listings")
    .update({
      model_id: d.modelId,
      year: d.year,
      condition: d.condition,
      body_type: d.bodyType,
      fuel_type: d.fuelType,
      transmission: d.transmission,
      drivetrain: d.drivetrain,
      engine_cc: d.engineCc,
      colour: d.colour,
      mileage_km: d.mileageKm,
      price_kes: d.priceKes,
      negotiable: d.negotiable,
      county_code: d.countyCode,
      town: d.town,
      description: d.description,
      features: d.features,
    })
    .eq("id", listingId);
  if (error) {
    console.error("[sell] details update failed", error);
    return { errors: { _form: friendlyDbError(error) }, values: { ...values, features } };
  }

  const identity = await supabase
    .from("listing_identity")
    .update({ registration_number: d.plate })
    .eq("listing_id", listingId);
  if (identity.error) {
    return { errors: { plate: friendlyDbError(identity.error, "The number plate could not be saved.") } };
  }

  invalidate(listingId);
  refresh();
  return { saved: true };
}

// -----------------------------------------------------------------------------
// Status changes
// -----------------------------------------------------------------------------
const TRANSITIONS = {
  submit: "pending_review",
  withdraw: "draft",
  pause: "paused",
  reactivate: "live",
  sold: "sold",
  renew: "pending_review",
} as const;

export type StatusIntent = keyof typeof TRANSITIONS;
export type StatusState = { error?: string; done?: StatusIntent };

export async function changeListingStatus(listingId: string, _previous: StatusState, formData: FormData): Promise<StatusState> {
  const user = await requireUser(`/sell/${listingId}`);
  const intent = String(formData.get("intent") ?? "") as StatusIntent;
  if (!(intent in TRANSITIONS)) return { error: "Choose what to do with this listing." };

  const supabase = await createClient();
  const listing = await getOwnedListing(supabase, user.id, listingId);
  if (!listing) return { error: "This listing isn't yours to change." };

  const { error } = await supabase.from("listings").update({ status: TRANSITIONS[intent] }).eq("id", listingId);
  if (error) return { error: friendlyDbError(error, "The listing could not be updated. Try again.") };

  invalidate(listingId);
  refresh();
  return { done: intent };
}

export async function deleteDraft(listingId: string): Promise<{ error?: string }> {
  const user = await requireUser(`/sell/${listingId}`);
  const supabase = await createClient();
  const listing = await getOwnedListing(supabase, user.id, listingId);
  if (!listing) return { error: "This listing isn't yours to delete." };
  if (listing.status !== "draft") return { error: "Only drafts can be deleted. Pause or mark the car sold instead." };

  const [photos, documents] = await Promise.all([
    supabase.from("listing_media").select("storage_path, thumb_path").eq("listing_id", listingId),
    supabase.from("vehicle_documents").select("storage_path").eq("listing_id", listingId),
  ]);

  const { error } = await supabase.from("listings").delete().eq("id", listingId).eq("status", "draft");
  if (error) return { error: friendlyDbError(error, "The draft could not be deleted. Try again.") };

  const photoPaths = (photos.data ?? []).flatMap((p) => [p.storage_path, p.thumb_path].filter(Boolean) as string[]);
  const documentPaths = (documents.data ?? []).map((d) => d.storage_path);
  await Promise.all([
    photoPaths.length ? supabase.storage.from(PHOTO_BUCKET).remove(photoPaths) : null,
    documentPaths.length ? supabase.storage.from(DOCUMENT_BUCKET).remove(documentPaths) : null,
  ]);

  redirect("/sell");
}

// -----------------------------------------------------------------------------
// Photos and documents (uploads go through the API routes)
// -----------------------------------------------------------------------------
export async function deletePhoto(listingId: string, mediaId: string): Promise<{ error?: string }> {
  await requireUser(`/sell/${listingId}`);
  const supabase = await createClient();
  const { data: media } = await supabase
    .from("listing_media")
    .select("id, storage_path, thumb_path")
    .eq("id", mediaId)
    .eq("listing_id", listingId)
    .maybeSingle();
  if (!media) return { error: "That photo is already gone." };

  const { error } = await supabase.from("listing_media").delete().eq("id", mediaId);
  if (error) return { error: friendlyDbError(error, "The photo could not be removed. Try again.") };
  await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([media.storage_path, media.thumb_path].filter(Boolean) as string[]);

  invalidate(listingId);
  refresh();
  return {};
}

export async function reorderPhotos(listingId: string, mediaIds: string[]): Promise<{ error?: string }> {
  await requireUser(`/sell/${listingId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_listing_media", { p_listing_id: listingId, p_media_ids: mediaIds });
  if (error) return { error: friendlyDbError(error, "The new order could not be saved. Try again.") };
  invalidate(listingId);
  refresh();
  return {};
}

export async function deleteDocument(listingId: string, documentId: string): Promise<{ error?: string }> {
  await requireUser(`/sell/${listingId}`);
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("vehicle_documents")
    .select("id, storage_path, verification_level")
    .eq("id", documentId)
    .eq("listing_id", listingId)
    .maybeSingle();
  if (!document) return { error: "That document is already gone." };
  if (document.verification_level !== "provided") return { error: "Checked documents stay on the car's Passport." };

  const { error } = await supabase.from("vehicle_documents").delete().eq("id", documentId);
  if (error) return { error: friendlyDbError(error, "The document could not be removed. Try again.") };
  await supabase.storage.from(DOCUMENT_BUCKET).remove([document.storage_path]);

  refresh();
  return {};
}

/** A short-lived link so the owner (or an admin) can open a private document. */
export async function documentLink(documentId: string): Promise<{ url?: string; error?: string }> {
  await requireUser("/sell");
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("vehicle_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) return { error: "Document not found." };
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 120);
  if (error || !data) return { error: "The document could not be opened. Try again." };
  return { url: data.signedUrl };
}
