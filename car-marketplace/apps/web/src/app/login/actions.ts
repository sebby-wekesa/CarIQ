"use server";

import { redirect } from "next/navigation";
import { fieldErrors, otpSchema, phoneSchema } from "@cm/shared";
import { friendlyAuthError } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";
import { resolveNext } from "@/lib/short-links";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "phone" | "code";
  /** E.164 once validated; whatever was typed otherwise. */
  phone?: string;
  /** Problem with the field on screen. */
  fieldError?: string;
  /** Problem with the request as a whole (SMS failed, code expired…). */
  error?: string;
  notice?: string;
  /** When the last code was sent, to pace the "send a new code" button. */
  sentAt?: number;
};

export async function loginAction(previous: LoginState, formData: FormData): Promise<LoginState> {
  const intent = formData.get("intent");
  const next = safeNext(formData.get("next"));

  if (intent === "change") {
    return { step: "phone", phone: previous.phone };
  }

  if (intent === "send" || intent === "resend") {
    const typed = String(formData.get("phone") ?? "");
    const phone = phoneSchema.safeParse(typed);
    if (!phone.success) {
      return { step: "phone", phone: typed, fieldError: fieldErrors(phone.error)._form };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({ phone: phone.data });
    if (error) {
      return {
        step: intent === "resend" ? "code" : "phone",
        phone: phone.data,
        sentAt: previous.sentAt,
        error: friendlyAuthError(error),
      };
    }
    return {
      step: "code",
      phone: phone.data,
      sentAt: Date.now(),
      notice: intent === "resend" ? "We sent a new code." : undefined,
    };
  }

  if (intent === "verify") {
    const phone = phoneSchema.safeParse(String(formData.get("phone") ?? ""));
    if (!phone.success) return { step: "phone", error: "Enter your number again to get a new code." };

    const code = otpSchema.safeParse(String(formData.get("code") ?? ""));
    if (!code.success) {
      return { step: "code", phone: phone.data, sentAt: previous.sentAt, fieldError: fieldErrors(code.error)._form };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ phone: phone.data, token: code.data, type: "sms" });
    if (error || !data.user) {
      return { step: "code", phone: phone.data, sentAt: previous.sentAt, error: friendlyAuthError(error) };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, county_code")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile?.full_name || !profile.county_code) {
      redirect(`/account?welcome=1&next=${encodeURIComponent(next)}`);
    }
    redirect(await resolveNext(supabase, next));
  }

  return previous;
}
