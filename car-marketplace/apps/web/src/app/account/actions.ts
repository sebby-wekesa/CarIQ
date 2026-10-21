"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrors, profileSchema } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { resolveNext } from "@/lib/short-links";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  saved?: boolean;
  errors?: Record<string, string>;
  values?: { fullName: string; countyCode: string };
};

export async function updateProfile(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser("/account");
  const values = {
    fullName: String(formData.get("fullName") ?? ""),
    countyCode: String(formData.get("countyCode") ?? ""),
  };

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, county_code: parsed.data.countyCode })
    .eq("id", user.id);

  if (error) {
    console.error("[account] Profile update failed", error);
    return { errors: { _form: "Your profile could not be saved. Try again." }, values };
  }

  // The header shows the user's name, so the shared layout must re-render too.
  refresh();

  const next = formData.get("next");
  if (typeof next === "string" && next) redirect(await resolveNext(supabase, safeNext(next)));

  return { saved: true, values: { fullName: parsed.data.fullName, countyCode: String(parsed.data.countyCode) } };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
