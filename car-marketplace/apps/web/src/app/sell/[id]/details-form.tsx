"use client";

import { startTransition, useActionState, useState } from "react";
import {
  BODY_TYPES,
  CONDITIONS,
  COUNTIES,
  DRIVETRAINS,
  FEATURES,
  FUEL_TYPES,
  LAUNCH_COUNTY_CODES,
  TRANSMISSIONS,
  labelFor,
} from "@cm/shared";
import type { Database } from "@cm/db";
import type { Catalogue } from "@/lib/catalogue";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import { MakeModelYearFields } from "@/components/listings/make-model-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, ChipCheckbox, Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { saveListingDetails, type FormState } from "../actions";

type Enums = Database["public"]["Enums"];
type Defaults = {
  makeId: number | null;
  modelId: number | null;
  year: number | null;
  condition: Enums["vehicle_condition"] | null;
  bodyType: Enums["body_type"] | null;
  fuelType: Enums["fuel_type"] | null;
  transmission: Enums["transmission"] | null;
  drivetrain: Enums["drivetrain"] | null;
  engineCc: number | null;
  colour: string | null;
  plate: string | null;
  mileageKm: number | null;
  priceKes: number | null;
  negotiable: boolean;
  countyCode: number | null;
  town: string | null;
  description: string | null;
  features: string[];
};

const launchCounties = COUNTIES.filter((c) => LAUNCH_COUNTY_CODES.includes(c.code));
const otherCounties = COUNTIES.filter((c) => !LAUNCH_COUNTY_CODES.includes(c.code)).sort((a, b) => a.name.localeCompare(b.name));
const grouped = new Intl.NumberFormat("en-KE");

export function DetailsForm({ listingId, catalogue, defaults }: { listingId: string; catalogue: Catalogue; defaults: Defaults }) {
  const [state, action, pending] = useActionState<FormState, FormData | null>(
    (previous, formData) => (formData ? saveListingDetails(listingId, previous, formData) : {}),
    {},
  );
  useResetOnHide(() => startTransition(() => action(null)));
  const errors = state.errors ?? {};
  const [bodyType, setBodyType] = useState<string>(defaults.bodyType ?? "");

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {errors._form ? <Alert tone="error">{errors._form}</Alert> : null}
      {Object.keys(errors).length > 0 && !errors._form ? (
        <Alert tone="error">Some details need fixing. They are marked below.</Alert>
      ) : null}

      <MakeModelYearFields
        makes={catalogue.makes}
        models={catalogue.models}
        defaultMakeId={defaults.makeId}
        defaultModelId={defaults.modelId}
        defaultYear={defaults.year}
        errors={errors}
        onModelChange={(model) => model?.bodyType && setBodyType(model.bodyType)}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="priceKes" label="Price (KSh)" error={errors.priceKes}>
          <Input
            id="priceKes"
            name="priceKes"
            inputMode="numeric"
            placeholder="1,350,000"
            defaultValue={defaults.priceKes ? grouped.format(defaults.priceKes) : ""}
            invalid={Boolean(errors.priceKes)}
            aria-describedby={describedBy("priceKes", errors.priceKes)}
            className="text-lg font-semibold"
            required
          />
        </Field>
        <Field id="mileageKm" label="Mileage (km)" hint="As shown on the dashboard today." error={errors.mileageKm}>
          <Input
            id="mileageKm"
            name="mileageKm"
            inputMode="numeric"
            placeholder="84,000"
            defaultValue={defaults.mileageKm != null ? grouped.format(defaults.mileageKm) : ""}
            invalid={Boolean(errors.mileageKm)}
            aria-describedby={describedBy("mileageKm", errors.mileageKm, "As shown on the dashboard today.")}
            className="text-lg font-semibold"
            required
          />
        </Field>
      </div>
      <Checkbox
        name="negotiable"
        label="Price is negotiable"
        hint="Buyers can make you an offer."
        defaultChecked={defaults.negotiable}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField id="condition" label="Condition" options={CONDITIONS} defaultValue={defaults.condition} error={errors.condition} />
        <Field id="bodyType" label="Body type" error={errors.bodyType}>
          <Select
            id="bodyType"
            name="bodyType"
            value={bodyType}
            onChange={(event) => setBodyType(event.target.value)}
            invalid={Boolean(errors.bodyType)}
            required
          >
            <option value="" disabled>
              Choose body type
            </option>
            {BODY_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelFor(value)}
              </option>
            ))}
          </Select>
        </Field>
        <SelectField id="fuelType" label="Fuel" options={FUEL_TYPES} defaultValue={defaults.fuelType} error={errors.fuelType} />
        <SelectField
          id="transmission"
          label="Gearbox"
          options={TRANSMISSIONS}
          defaultValue={defaults.transmission}
          error={errors.transmission}
        />
        <SelectField
          id="drivetrain"
          label="Drive (optional)"
          options={DRIVETRAINS}
          defaultValue={defaults.drivetrain}
          error={errors.drivetrain}
          optional
        />
        <Field id="engineCc" label="Engine size in cc (optional)" error={errors.engineCc}>
          <Input
            id="engineCc"
            name="engineCc"
            inputMode="numeric"
            placeholder="1500"
            defaultValue={defaults.engineCc ?? ""}
            invalid={Boolean(errors.engineCc)}
          />
        </Field>
        <Field id="colour" label="Colour (optional)" error={errors.colour}>
          <Input id="colour" name="colour" placeholder="Pearl white" defaultValue={defaults.colour ?? ""} />
        </Field>
        <Field
          id="plate"
          label="Number plate (optional)"
          hint="Kept private. Used to check the car's papers."
          error={errors.plate}
        >
          <Input
            id="plate"
            name="plate"
            autoCapitalize="characters"
            placeholder="KDA 123A"
            defaultValue={defaults.plate ?? ""}
            invalid={Boolean(errors.plate)}
            aria-describedby={describedBy("plate", errors.plate, "Kept private. Used to check the car's papers.")}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="countyCode" label="County" error={errors.countyCode}>
          <Select
            id="countyCode"
            name="countyCode"
            defaultValue={defaults.countyCode ? String(defaults.countyCode) : ""}
            invalid={Boolean(errors.countyCode)}
            required
          >
            <option value="" disabled>
              Where is the car?
            </option>
            <optgroup label="Launching first">
              {launchCounties.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="All other counties">
              {otherCounties.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field id="town" label="Town or area (optional)" error={errors.town}>
          <Input id="town" name="town" placeholder="Nyali" defaultValue={defaults.town ?? ""} />
        </Field>
      </div>

      <Field
        id="description"
        label="Description (optional)"
        hint="Service history, recent repairs, why you're selling. Leave out your phone number."
        error={errors.description}
      >
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={defaults.description ?? ""}
          aria-describedby="description-hint"
          maxLength={5000}
        />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">Features</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FEATURES.map((feature) => (
            <ChipCheckbox
              key={feature.key}
              name="features"
              value={feature.key}
              label={feature.label}
              defaultChecked={defaults.features.includes(feature.key)}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" pending={pending}>
          Save details
        </Button>
        {state.saved ? (
          <p role="status" className="font-semibold text-success">
            Details saved.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SelectField({
  id,
  label,
  options,
  defaultValue,
  error,
  optional,
}: {
  id: string;
  label: string;
  options: readonly string[];
  defaultValue: string | null;
  error?: string;
  optional?: boolean;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <Select id={id} name={id} defaultValue={defaultValue ?? ""} invalid={Boolean(error)} required={!optional}>
        <option value="" disabled={!optional}>
          {optional ? "Not sure" : `Choose ${label.toLowerCase()}`}
        </option>
        {options.map((value) => (
          <option key={value} value={value}>
            {labelFor(value)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
