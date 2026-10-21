"use client";

import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea, describedBy } from "@/components/ui/field";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import { saveDealerProfile, type FormState } from "../../actions";

type Values = {
  phone: string;
  town: string;
  address: string;
  openingHours: string;
  description: string;
  acceptsCalls: boolean;
  acceptsWhatsapp: boolean;
};

export function ShowroomForm({ dealerId, defaults }: { dealerId: string; defaults: Values }) {
  const [state, action, pending] = useActionState<FormState, FormData | null>(
    (previous, formData) => (formData ? saveDealerProfile(dealerId, previous, formData) : {}),
    {},
  );
  useResetOnHide(() => startTransition(() => action(null)));
  const errors = state.errors ?? {};
  const v = (state.errors && state.values ? state.values : defaults) as Values;
  const k = JSON.stringify(v);

  const text = (name: keyof Values, label: string, hint?: string, extra: { inputMode?: "tel"; placeholder?: string } = {}) => (
    <Field id={name} label={label} hint={hint} error={errors[name]}>
      <Input
        id={name}
        name={name}
        defaultValue={String(v[name] ?? "")}
        key={`${name}-${k}`}
        invalid={Boolean(errors[name])}
        aria-describedby={describedBy(name, errors[name], hint)}
        {...extra}
      />
    </Field>
  );

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {errors._form ? <Alert tone="error">{errors._form}</Alert> : null}
      {state.saved ? <Alert tone="success">Showroom saved.</Alert> : null}
      {text("phone", "Showroom phone", "Buyers call or WhatsApp this number about every car.", { inputMode: "tel" })}
      <div className="grid gap-5 sm:grid-cols-2">
        {text("town", "Town or area")}
        {text("openingHours", "Opening hours", undefined, { placeholder: "Mon–Sat 8am–6pm" })}
      </div>
      {text("address", "Yard address")}
      <Field id="description" label="About the dealership" error={errors.description}>
        <Textarea id="description" name="description" rows={5} defaultValue={v.description} key={`d-${k}`} invalid={Boolean(errors.description)} />
      </Field>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">How buyers can reach you</legend>
        <Checkbox name="acceptsCalls" label="Phone calls" defaultChecked={v.acceptsCalls} key={`c-${k}`} />
        <Checkbox name="acceptsWhatsapp" label="WhatsApp" defaultChecked={v.acceptsWhatsapp} key={`w-${k}`} />
        <p className="text-sm text-muted">Buyers can always send a chat message, which your whole team sees.</p>
      </fieldset>
      <Button type="submit" size="lg" pending={pending} className="sm:self-start">
        Save showroom
      </Button>
    </form>
  );
}
