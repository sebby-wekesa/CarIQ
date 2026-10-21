"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  MAX_STOCK_ROWS,
  dealerApplicationSchema,
  dealerProfileSchema,
  fieldErrors,
  staffInviteSchema,
  type StockImportRow,
} from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { DEALER_DOCUMENT_BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export type FormState = { errors?: Record<string, string>; values?: Record<string, unknown>; saved?: boolean; message?: string };

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------
export async function applyDealer(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser("/dealer");
  const values = Object.fromEntries(
    ["name", "phone", "countyCode", "town", "address", "kraPin", "businessRegNo", "description"].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ]),
  );
  const parsed = dealerApplicationSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const d = parsed.data;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("apply_dealer", {
    p_name: d.name,
    p_county_code: d.countyCode,
    p_town: d.town,
    p_phone: d.phone,
    p_kra_pin: d.kraPin,
    p_business_reg_no: d.businessRegNo ?? undefined,
    p_address: d.address ?? undefined,
    p_description: d.description ?? undefined,
  });
  if (error || !id) {
    console.error("[dealer] apply_dealer failed", error);
    return { errors: { _form: friendlyDbError(error, "Your application could not be saved. Try again.") }, values };
  }
  redirect(`/dealer/${id}?welcome=1`);
}

export async function resubmitDealer(dealerId: string): Promise<FormState> {
  await requireUser(`/dealer/${dealerId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_dealer", { p_dealer_id: dealerId });
  if (error) return { errors: { _form: friendlyDbError(error) } };
  refresh();
  return { saved: true };
}

export async function deleteDealerDocument(dealerId: string, documentId: string): Promise<FormState> {
  await requireUser(`/dealer/${dealerId}`);
  if (!isId(documentId)) return { errors: { _form: "Document not found." } };
  const supabase = await createClient();
  const { data: removed, error } = await supabase
    .from("dealer_documents")
    .delete()
    .eq("id", documentId)
    .eq("dealer_id", dealerId)
    .select("storage_path");
  if (error || !removed?.length) return { errors: { _form: friendlyDbError(error, "That document can't be removed now.") } };
  await supabase.storage.from(DEALER_DOCUMENT_BUCKET).remove(removed.map((r) => r.storage_path));
  refresh();
  return { saved: true };
}

// -----------------------------------------------------------------------------
// Showroom details
// -----------------------------------------------------------------------------
export async function saveDealerProfile(dealerId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser(`/dealer/${dealerId}/showroom`);
  const values = {
    phone: String(formData.get("phone") ?? ""),
    town: String(formData.get("town") ?? ""),
    address: String(formData.get("address") ?? ""),
    openingHours: String(formData.get("openingHours") ?? ""),
    description: String(formData.get("description") ?? ""),
    acceptsCalls: formData.get("acceptsCalls") === "on",
    acceptsWhatsapp: formData.get("acceptsWhatsapp") === "on",
  };
  const parsed = dealerProfileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dealers")
    .update({
      phone: d.phone,
      town: d.town,
      address: d.address,
      opening_hours: d.openingHours,
      description: d.description,
      accepts_calls: d.acceptsCalls,
      accepts_whatsapp: d.acceptsWhatsapp,
    })
    .eq("id", dealerId)
    .select("slug");
  if (error || !data?.length) {
    return { errors: { _form: friendlyDbError(error, "Only owners and managers can change the showroom.") }, values };
  }
  updateTag(`dealer:${data[0]!.slug}`);
  updateTag("listings");
  refresh();
  return { saved: true, values };
}

// -----------------------------------------------------------------------------
// Team
// -----------------------------------------------------------------------------
export async function inviteStaff(dealerId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser(`/dealer/${dealerId}/team`);
  const values = { phone: String(formData.get("phone") ?? ""), role: String(formData.get("role") ?? "") };
  const parsed = staffInviteSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_dealer_staff", {
    p_dealer_id: dealerId,
    p_phone: parsed.data.phone,
    p_role: parsed.data.role,
  });
  if (error) {
    const duplicate = error.code === "23505";
    return { errors: { phone: duplicate ? "That person is already on the team." : friendlyDbError(error) }, values };
  }
  refresh();
  return {
    saved: true,
    message:
      data === "added"
        ? "Added. They can open the dealer dashboard straight away, and we've sent them an SMS."
        : "Invite sent by SMS. They join the team the first time they sign in with that number.",
  };
}

export async function changeStaffRole(dealerId: string, profileId: string, role: string): Promise<FormState> {
  await requireUser(`/dealer/${dealerId}/team`);
  if (!isId(profileId) || !["owner", "manager", "sales"].includes(role)) return { errors: { _form: "Choose a role." } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dealer_members")
    .update({ role: role as "owner" | "manager" | "sales" })
    .eq("dealer_id", dealerId)
    .eq("profile_id", profileId)
    .select("profile_id");
  if (error || !data?.length) return { errors: { _form: friendlyDbError(error, "Only owners can change roles.") } };
  refresh();
  return { saved: true };
}

export async function removeStaff(dealerId: string, profileId: string): Promise<FormState> {
  const user = await requireUser(`/dealer/${dealerId}/team`);
  if (!isId(profileId)) return { errors: { _form: "Not found." } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dealer_members")
    .delete()
    .eq("dealer_id", dealerId)
    .eq("profile_id", profileId)
    .select("profile_id");
  if (error || !data?.length) return { errors: { _form: friendlyDbError(error, "Only owners can remove people.") } };
  if (profileId === user.id) redirect("/dealer");
  refresh();
  return { saved: true };
}

export async function cancelInvite(dealerId: string, inviteId: string): Promise<FormState> {
  await requireUser(`/dealer/${dealerId}/team`);
  if (!isId(inviteId)) return { errors: { _form: "Not found." } };
  const supabase = await createClient();
  const { data, error } = await supabase.from("dealer_invites").delete().eq("id", inviteId).eq("dealer_id", dealerId).select("id");
  if (error || !data?.length) return { errors: { _form: friendlyDbError(error, "That invite can't be cancelled.") } };
  refresh();
  return { saved: true };
}

// -----------------------------------------------------------------------------
// Stock
// -----------------------------------------------------------------------------
export type ImportResult = { row: number; ok: boolean; listing_id?: string; error?: string };

/** Rows were checked in the browser; the database checks them again, one by one. */
export async function importStock(
  dealerId: string,
  rows: StockImportRow[],
): Promise<{ results?: ImportResult[]; error?: string }> {
  await requireUser(`/dealer/${dealerId}/upload`);
  if (!Array.isArray(rows) || rows.length === 0) return { error: "No cars to import." };
  if (rows.length > MAX_STOCK_ROWS) return { error: `Import up to ${MAX_STOCK_ROWS} cars at a time.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_dealer_stock", { p_dealer_id: dealerId, p_rows: rows });
  if (error) {
    console.error("[dealer] import failed", error);
    return { error: friendlyDbError(error, "The import didn't go through. Nothing was saved. Try again.") };
  }
  const results = (data as ImportResult[]).map((r) => ({ ...r, error: r.error ? friendlyImportError(r.error) : undefined }));
  refresh();
  return { results };
}

/** Database messages for a single row, in words a dealer can act on. */
function friendlyImportError(message: string): string {
  if (/listings_one_active_per_vehicle|already has a listing/i.test(message)) return "This car is already listed.";
  if (/listing_identity.*registration_number|registration_number_check/i.test(message)) return "The number plate isn't valid.";
  if (/violates|constraint|invalid input|null value|syntax/i.test(message)) return "Some details in this row aren't valid. Check it and try again.";
  return message;
}

export async function submitReadyStock(dealerId: string): Promise<FormState> {
  await requireUser(`/dealer/${dealerId}/stock`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_ready_dealer_stock", { p_dealer_id: dealerId });
  if (error) return { errors: { _form: friendlyDbError(error) } };
  const row = data?.[0];
  const counts = { submitted: row?.submitted ?? 0, published: row?.published ?? 0, not_ready: row?.not_ready ?? 0 };
  updateTag("listings");
  refresh();
  const parts: string[] = [];
  if (counts.published) parts.push(`${counts.published} went live`);
  if (counts.submitted - counts.published) parts.push(`${counts.submitted - counts.published} sent for review`);
  if (counts.not_ready) parts.push(`${counts.not_ready} still need photos or details`);
  return { saved: true, message: parts.length ? `${parts.join(", ")}.` : "No drafts to submit." };
}

/** A short-lived link to one of the dealership's own documents. */
export async function dealerDocumentLink(documentId: string): Promise<{ url?: string; error?: string }> {
  await requireUser("/dealer");
  if (!isId(documentId)) return { error: "Document not found." };
  const supabase = await createClient();
  const { data: doc } = await supabase.from("dealer_documents").select("storage_path").eq("id", documentId).maybeSingle();
  if (!doc) return { error: "Document not found." };
  const { data } = await supabase.storage.from(DEALER_DOCUMENT_BUCKET).createSignedUrl(doc.storage_path, 300);
  return data?.signedUrl ? { url: data.signedUrl } : { error: "The document could not be opened." };
}
