"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { saveSettings, type SettingsState } from "./actions";

type Defaults = {
  smsMessages: boolean;
  smsSearchAlerts: string;
  emailMessages: boolean;
  emailSearchAlerts: string;
  acceptsCalls: boolean;
  acceptsWhatsapp: boolean;
};

const FREQUENCY_OPTIONS = [
  ["instant", "As soon as a car is listed"],
  ["daily", "Once a day, at 8am"],
  ["off", "Off"],
] as const;

export function SettingsForm({ phone, hasEmail, defaults }: { phone: string | null; hasEmail: boolean; defaults: Defaults }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});

  return (
    <form action={action} className="mt-8 flex flex-col gap-8">
      <fieldset className="flex flex-col gap-4">
        <legend className="display mb-2 text-2xl">Text messages</legend>
        <p className="-mt-2 text-sm text-muted">To {phone ?? "your phone"}. Standard SMS, no data needed.</p>
        <Checkbox
          name="sms_messages"
          defaultChecked={defaults.smsMessages}
          label="New chat messages"
          hint="Only if you haven't seen them in the app within a minute, and at most one text per chat every half hour."
        />
        <Field id="sms_search_alerts" label="Saved-search alerts">
          <Select id="sms_search_alerts" name="sms_search_alerts" defaultValue={defaults.smsSearchAlerts}>
            {FREQUENCY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={!hasEmail}>
        <legend className="display mb-2 text-2xl">Email</legend>
        {!hasEmail ? <p className="-mt-2 text-sm text-muted">Add an email address below to turn these on.</p> : null}
        <Checkbox name="email_messages" defaultChecked={defaults.emailMessages} label="New chat messages" />
        <Field id="email_search_alerts" label="Saved-search alerts">
          <Select id="email_search_alerts" name="email_search_alerts" defaultValue={defaults.emailSearchAlerts}>
            {FREQUENCY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {/* Disabled fields aren't submitted; keep the saved values when there's no email yet. */}
      </fieldset>
      {!hasEmail ? (
        <>
          <input type="hidden" name="email_messages" value={defaults.emailMessages ? "on" : ""} />
          <input type="hidden" name="email_search_alerts" value={defaults.emailSearchAlerts} />
        </>
      ) : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="display mb-2 text-2xl">When you sell</legend>
        <p className="-mt-2 text-sm text-muted">Buyers can always message you here. Your number is shown only to signed-in buyers who tap these buttons.</p>
        <Checkbox name="accepts_calls" defaultChecked={defaults.acceptsCalls} label="Let buyers call me" />
        <Checkbox name="accepts_whatsapp" defaultChecked={defaults.acceptsWhatsapp} label="Let buyers WhatsApp me" />
      </fieldset>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Saved.</Alert> : null}
      <Button type="submit" size="lg" pending={pending} className="self-start">
        Save settings
      </Button>
    </form>
  );
}
