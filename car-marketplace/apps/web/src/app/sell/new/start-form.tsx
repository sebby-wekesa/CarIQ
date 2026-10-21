"use client";

import { useActionState, useState } from "react";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import { parseChassis } from "@cm/shared";
import type { CatalogueMake, CatalogueModel } from "@/lib/catalogue";
import { MakeModelYearFields } from "@/components/listings/make-model-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { startListing, type FormState } from "../actions";

type Props = {
  makes: CatalogueMake[];
  models: CatalogueModel[];
  /** Dealerships the seller is staff of; empty for private sellers. */
  dealers: { id: string; name: string }[];
  defaultDealerId: string;
};

/** Remounts the form whenever the page is left, so returning to it starts a fresh car. */
export function StartForm(props: Props) {
  const [round, setRound] = useState(0);
  useResetOnHide(() => setRound((n) => n + 1));
  return <StartFormFields key={round} {...props} />;
}

function StartFormFields({ makes, models, dealers, defaultDealerId }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(startListing, {});
  const errors = state.errors ?? {};
  const values = (state.values ?? {}) as Record<string, string>;
  const [chassis, setChassis] = useState(values.chassis ?? "");
  const parsed = chassis.trim().length >= 6 ? parseChassis(chassis) : null;
  const chassisHint =
    "On the logbook, the import papers, or stamped on the car. Japanese cars look like NZE141-1234567.";

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {errors._form ? <Alert tone="error">{errors._form}</Alert> : null}

      {dealers.length ? (
        <Field id="dealerId" label="Listing for" hint="Dealer cars show the dealership's name and Verified badge.">
          <Select id="dealerId" name="dealerId" defaultValue={values.dealerId ?? defaultDealerId} aria-describedby="dealerId-hint">
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="">Myself, as a private seller</option>
          </Select>
        </Field>
      ) : null}

      <MakeModelYearFields
        makes={makes}
        models={models}
        defaultMakeId={values.makeId ? Number(values.makeId) : null}
        defaultModelId={values.modelId ? Number(values.modelId) : null}
        defaultYear={values.year ? Number(values.year) : null}
        errors={errors}
      />

      <Field id="chassis" label="Chassis number" hint={chassisHint} error={errors.chassis}>
        <Input
          id="chassis"
          name="chassis"
          value={chassis}
          onChange={(event) => setChassis(event.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="NZE141-1234567"
          invalid={Boolean(errors.chassis)}
          aria-describedby={describedBy("chassis", errors.chassis, chassisHint)}
          className="font-semibold tracking-wide"
          required
        />
      </Field>
      {parsed ? (
        <p className="-mt-3 text-sm text-success" role="status">
          {parsed.isVin17
            ? "Recognised as a 17-character VIN."
            : parsed.modelCode
              ? `Recognised as a Japanese frame number, model code ${parsed.modelCode}.`
              : "Recognised as a chassis number."}{" "}
          It starts this car&apos;s Vehicle Passport.
        </p>
      ) : null}

      <div className="rounded-[var(--radius-control)] bg-plate-soft px-4 py-3 text-sm text-ink">
        The chassis number is kept private. Buyers see only part of it, and it stays with the car if it is
        sold and listed again.
      </div>

      <Button type="submit" size="lg" pending={pending} className="sm:self-start">
        Start listing
      </Button>
    </form>
  );
}
