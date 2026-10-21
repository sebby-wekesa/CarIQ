"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { formatKenyanPhone } from "@cm/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, describedBy } from "@/components/ui/field";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import { loginAction, type LoginState } from "./actions";

const RESEND_AFTER_SECONDS = 60;

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData | null>(
    (previous, formData) => (formData ? loginAction(previous, formData) : { step: "phone" }),
    { step: "phone" },
  );
  // Start from the phone step whenever someone comes back to this page.
  useResetOnHide(() => startTransition(() => action(null)));

  return state.step === "phone" ? (
    <PhoneStep state={state} action={action} pending={pending} next={next} />
  ) : (
    <CodeStep state={state} action={action} pending={pending} next={next} />
  );
}

type StepProps = {
  state: LoginState;
  action: (formData: FormData) => void;
  pending: boolean;
  next: string;
};

function PhoneStep({ state, action, pending, next }: StepProps) {
  const hint = "Safaricom, Airtel or Telkom. We text a 6-digit code to this number.";
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field id="phone" label="Mobile number" hint={hint} error={state.fieldError}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          defaultValue={state.phone ? displayPhone(state.phone) : ""}
          invalid={Boolean(state.fieldError)}
          aria-describedby={describedBy("phone", state.fieldError, hint)}
          autoFocus
          required
        />
      </Field>
      <Button type="submit" name="intent" value="send" size="lg" pending={pending}>
        Send code
      </Button>
    </form>
  );
}

function CodeStep({ state, action, pending, next }: StepProps) {
  const secondsLeft = useCountdown(state.sentAt);
  const phone = state.phone ? displayPhone(state.phone) : "your phone";

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="phone" value={state.phone ?? ""} />
      <p className="text-ink-soft">
        Enter the 6-digit code we sent to <span className="font-semibold whitespace-nowrap text-ink">{phone}</span>.
      </p>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.notice && !state.error ? <Alert tone="success">{state.notice}</Alert> : null}
      <Field id="code" label="Code" error={state.fieldError}>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          invalid={Boolean(state.fieldError)}
          aria-describedby={describedBy("code", state.fieldError)}
          className="max-w-56 text-2xl font-semibold tracking-[0.4em]"
          autoFocus
          required
        />
      </Field>
      <Button type="submit" name="intent" value="verify" size="lg" pending={pending}>
        Verify and sign in
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="submit"
          name="intent"
          value="change"
          formNoValidate
          disabled={pending}
          className="min-h-11 font-semibold text-forest underline-offset-4 hover:underline"
        >
          Change number
        </button>
        <button
          type="submit"
          name="intent"
          value="resend"
          formNoValidate
          disabled={pending || secondsLeft > 0}
          className="min-h-11 font-semibold text-forest underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
        >
          {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : "Send a new code"}
        </button>
      </div>
    </form>
  );
}

function displayPhone(phone: string) {
  return phone.startsWith("+254") ? formatKenyanPhone(phone) : phone;
}

function useCountdown(sentAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sentAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt]);

  if (!sentAt) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_AFTER_SECONDS * 1000 - now) / 1000));
}
