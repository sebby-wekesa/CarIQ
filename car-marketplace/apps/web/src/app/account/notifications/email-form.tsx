"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { confirmEmailCode, removeEmail, requestEmailCode, type EmailState } from "./actions";

/** Add an email address: we send a 6-digit code to prove it's yours. */
export function EmailForm({ email, pendingEmail }: { email: string | null; pendingEmail: string | null }) {
  const initial: EmailState = pendingEmail ? { step: "code", email: pendingEmail } : { step: "enter" };
  const [requested, request, requesting] = useActionState<EmailState, FormData>(requestEmailCode, initial);
  const [confirmed, confirm, confirming] = useActionState<EmailState, FormData>(confirmEmailCode, requested);
  const step = confirmed.step === "done" ? "done" : requested.step;
  const address = requested.email ?? pendingEmail;

  if (email) {
    return (
      <section aria-labelledby="email-heading" className="mt-10 border-t border-mist pt-8">
        <h2 id="email-heading" className="display text-2xl">
          Email address
        </h2>
        <p className="mt-2">
          <span className="font-semibold">{email}</span> <span className="text-sm text-success">Verified</span>
        </p>
        <form action={removeEmail} className="mt-3">
          <Button type="submit" variant="secondary">
            Remove email
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section aria-labelledby="email-heading" className="mt-10 border-t border-mist pt-8">
      <h2 id="email-heading" className="display text-2xl">
        Add an email address
      </h2>
      <p className="mt-2 text-sm text-muted">Optional. Useful if you&apos;d rather not get texts, or want a record of messages.</p>

      {step === "done" ? (
        <Alert tone="success" className="mt-4">
          {confirmed.email} is verified. Turn on email above, then save.
        </Alert>
      ) : step === "code" ? (
        <form action={confirm} className="mt-4 flex flex-col gap-4">
          <p className="text-sm">
            We sent a 6-digit code to <span className="font-semibold">{address}</span>. It works for 30 minutes.
          </p>
          <Field id="email-code" label="Code from the email" error={confirmed.step === "code" ? confirmed.error : undefined}>
            <Input id="email-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="max-w-40 tracking-[0.3em]" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" pending={confirming}>
              Verify email
            </Button>
          </div>
        </form>
      ) : (
        <form action={request} className="mt-4 flex flex-col gap-4">
          <Field id="email" label="Email address" error={requested.error}>
            <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={requested.email ?? ""} />
          </Field>
          <Button type="submit" variant="secondary" pending={requesting} className="self-start">
            Send code
          </Button>
        </form>
      )}
    </section>
  );
}
