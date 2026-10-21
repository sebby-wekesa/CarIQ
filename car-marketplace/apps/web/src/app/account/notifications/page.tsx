import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmailForm } from "./email-form";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Notifications</h1>
      <p className="mt-3 text-ink-soft">Choose how we tell you about messages and new cars, and how buyers can reach you.</p>
      <Suspense fallback={<div aria-hidden className="mt-8 h-96 rounded-[var(--radius-control)] bg-mist/40" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const user = await requireUser("/account/notifications");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_settings");
  const s = data?.[0];
  return (
    <>
      <SettingsForm
        // Remount when an email is verified so its options switch on straight away.
        key={`${user.id}:${s?.email ?? ""}`}
        phone={user.phone}
        hasEmail={Boolean(s?.email)}
        defaults={{
          smsMessages: s?.sms_messages ?? true,
          smsSearchAlerts: s?.sms_search_alerts ?? "daily",
          emailMessages: s?.email_messages ?? true,
          emailSearchAlerts: s?.email_search_alerts ?? "daily",
          acceptsCalls: s?.accepts_calls ?? true,
          acceptsWhatsapp: s?.accepts_whatsapp ?? true,
        }}
      />
      <EmailForm key={s?.email ?? "none"} email={s?.email ?? null} pendingEmail={s?.pending_email ?? null} />
    </>
  );
}
