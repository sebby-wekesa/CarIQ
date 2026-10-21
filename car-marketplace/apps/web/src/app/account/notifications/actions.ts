"use server";

import { refresh, updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { saved?: boolean; error?: string };

const FREQUENCIES = ["instant", "daily", "off"] as const;
type Frequency = (typeof FREQUENCIES)[number];
const frequency = (value: FormDataEntryValue | null): Frequency =>
  (FREQUENCIES as readonly string[]).includes(String(value)) ? (String(value) as Frequency) : "daily";

export async function saveSettings(_previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser("/account/notifications");
  const supabase = await createClient();
  const settings = {
    sms_messages: formData.get("sms_messages") === "on",
    sms_search_alerts: frequency(formData.get("sms_search_alerts")),
    email_messages: formData.get("email_messages") === "on",
    email_search_alerts: frequency(formData.get("email_search_alerts")),
  };
  const contact = {
    accepts_calls: formData.get("accepts_calls") === "on",
    accepts_whatsapp: formData.get("accepts_whatsapp") === "on",
  };

  const { data: existing } = await supabase.from("notification_settings").select("profile_id").maybeSingle();
  const saved = existing
    ? await supabase.from("notification_settings").update(settings).eq("profile_id", user.id)
    : await supabase.from("notification_settings").insert(settings);
  if (saved.error) return { error: friendlyDbError(saved.error) };

  const { error } = await supabase.from("profiles").update(contact).eq("id", user.id);
  if (error) return { error: friendlyDbError(error) };
  // Listing pages show or hide the Call and WhatsApp buttons from these.
  updateTag("listings");
  return { saved: true };
}

export type EmailState = { step: "enter" | "code" | "done"; email?: string; error?: string };

export async function requestEmailCode(_previous: EmailState, formData: FormData): Promise<EmailState> {
  await requireUser("/account/notifications");
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_email_verification", { p_email: email });
  if (error) return { step: "enter", email, error: friendlyDbError(error, "We couldn't send a code. Try again.") };
  return { step: "code", email: email.toLowerCase() };
}

export async function confirmEmailCode(previous: EmailState, formData: FormData): Promise<EmailState> {
  await requireUser("/account/notifications");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_email", { p_code: String(formData.get("code") ?? "") });
  if (error) return { ...previous, step: "code", error: friendlyDbError(error, "That code didn't work. Try again.") };
  refresh();
  return { step: "done", email: data ?? previous.email };
}

export async function removeEmail(): Promise<void> {
  await requireUser("/account/notifications");
  const supabase = await createClient();
  await supabase.rpc("remove_email");
  refresh();
}
