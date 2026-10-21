"use client";

import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CountyOptions } from "@/components/ui/county-options";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import { applyDealer, type FormState } from "./actions";

export function ApplyForm({ defaultCounty }: { defaultCounty: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData | null>(
    (previous, formData) => (formData ? applyDealer(previous, formData) : {}),
    {},
  );
  useResetOnHide(() => startTransition(() => action(null)));
  const errors = state.errors ?? {};
  const v = (state.values ?? {}) as Record<string, string>;

  const text = (name: string, label: string, props: { hint?: string; autoComplete?: string; placeholder?: string; required?: boolean; inputMode?: "tel" | "text" } = {}) => (
    <Field id={name} label={label} hint={props.hint} error={errors[name]}>
      <Input
        id={name}
        name={name}
        defaultValue={v[name] ?? ""}
        key={`${name}-${v[name] ?? ""}`}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        required={props.required}
        invalid={Boolean(errors[name])}
        aria-describedby={describedBy(name, errors[name], props.hint)}
      />
    </Field>
  );

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {errors._form ? <Alert tone="error">{errors._form}</Alert> : null}
      {text("name", "Business name", { hint: "As registered. It appears on your showroom page and every car.", autoComplete: "organization", required: true })}
      {text("phone", "Showroom phone", { hint: "Buyers call or WhatsApp this number about your cars.", autoComplete: "tel", inputMode: "tel", placeholder: "0712 345 678", required: true })}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="countyCode" label="County" error={errors.countyCode}>
          <Select
            id="countyCode"
            name="countyCode"
            defaultValue={v.countyCode ?? (defaultCounty ? String(defaultCounty) : "")}
            key={`county-${v.countyCode ?? ""}`}
            invalid={Boolean(errors.countyCode)}
            aria-describedby={describedBy("countyCode", errors.countyCode)}
            required
          >
            <CountyOptions />
          </Select>
        </Field>
        {text("town", "Town or area", { placeholder: "Nyali", required: true })}
      </div>
      {text("address", "Yard address", { hint: "Optional. Helps buyers find you, e.g. Links Road, opposite the petrol station." })}
      <div className="grid gap-5 sm:grid-cols-2">
        {text("kraPin", "KRA PIN", { hint: "Of the business, or the owner for a sole proprietor.", placeholder: "P051234567X", required: true })}
        {text("businessRegNo", "Registration number", { hint: "Optional, e.g. PVT-AB1234 or BN-XY5678." })}
      </div>
      <Field id="description" label="About the dealership" hint="Optional. What you specialise in, how long you've been trading." error={errors.description}>
        <Textarea id="description" name="description" rows={4} defaultValue={v.description ?? ""} key={`d-${v.description ?? ""}`} invalid={Boolean(errors.description)} />
      </Field>
      <p className="text-sm text-muted">
        Next you&apos;ll upload the KRA PIN certificate, business registration and the owner&apos;s ID. Only our review team
        sees them.
      </p>
      <Button type="submit" size="lg" pending={pending} className="sm:self-start">
        Continue
      </Button>
    </form>
  );
}
