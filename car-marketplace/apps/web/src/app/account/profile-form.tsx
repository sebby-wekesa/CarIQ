"use client";

import { startTransition, useActionState } from "react";
import { COUNTIES, LAUNCH_COUNTY_CODES } from "@cm/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import { updateProfile, type ProfileState } from "./actions";

const launchCounties = COUNTIES.filter((c) => LAUNCH_COUNTY_CODES.includes(c.code));
const otherCounties = COUNTIES.filter((c) => !LAUNCH_COUNTY_CODES.includes(c.code)).sort((a, b) =>
  a.name.localeCompare(b.name),
);

type Props = {
  phone: string | null;
  defaults: { fullName: string; countyCode: string };
  /** Set when finishing sign-up, so saving continues to where the user was going. */
  next: string | null;
};

export function ProfileForm({ phone, defaults, next }: Props) {
  const [state, action, pending] = useActionState<ProfileState, FormData | null>(
    (previous, formData) => (formData ? updateProfile(previous, formData) : {}),
    {},
  );
  useResetOnHide(() => startTransition(() => action(null)));

  // Echo what was typed only when it failed validation; otherwise show what is saved.
  const errors = state.errors ?? {};
  const values = state.errors && state.values ? state.values : defaults;
  const nameHint = "Shown on your listings and in messages.";

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {errors._form ? <Alert tone="error">{errors._form}</Alert> : null}
      {state.saved ? <Alert tone="success">Profile saved.</Alert> : null}

      <Field id="fullName" label="Your name" hint={nameHint} error={errors.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={values.fullName}
          key={`name-${values.fullName}`}
          invalid={Boolean(errors.fullName)}
          aria-describedby={describedBy("fullName", errors.fullName, nameHint)}
          required
        />
      </Field>

      <Field id="countyCode" label="County" error={errors.countyCode}>
        <Select
          id="countyCode"
          name="countyCode"
          defaultValue={values.countyCode}
          key={`county-${values.countyCode}`}
          invalid={Boolean(errors.countyCode)}
          aria-describedby={describedBy("countyCode", errors.countyCode)}
          required
        >
          <option value="" disabled>
            Choose your county
          </option>
          <optgroup label="Launching first">
            {launchCounties.map((county) => (
              <option key={county.code} value={county.code}>
                {county.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="All other counties">
            {otherCounties.map((county) => (
              <option key={county.code} value={county.code}>
                {county.name}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>

      <Field id="phone" label="Mobile number" hint="You sign in with this number. It cannot be changed here.">
        <Input id="phone" value={phone ?? ""} readOnly disabled aria-describedby="phone-hint" />
      </Field>

      <Button type="submit" size="lg" pending={pending} className="sm:self-start">
        {next ? "Save and continue" : "Save profile"}
      </Button>
    </form>
  );
}
