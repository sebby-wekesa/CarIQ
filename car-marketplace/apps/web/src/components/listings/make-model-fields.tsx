"use client";

import { useMemo, useState } from "react";
import { MIN_YEAR, maxYear } from "@cm/shared";
import type { CatalogueMake, CatalogueModel } from "@/lib/catalogue";
import { Field, Select, describedBy } from "@/components/ui/field";

type Props = {
  makes: CatalogueMake[];
  models: CatalogueModel[];
  defaultMakeId?: number | null;
  defaultModelId?: number | null;
  defaultYear?: number | null;
  errors: Record<string, string>;
  onModelChange?: (model: CatalogueModel | undefined) => void;
};

const years = Array.from({ length: maxYear() - MIN_YEAR + 1 }, (_, i) => maxYear() - i);

/** Make → model → year pickers. Models filter by make; popular makes come first. */
export function MakeModelYearFields({ makes, models, defaultMakeId, defaultModelId, defaultYear, errors, onModelChange }: Props) {
  const [makeId, setMakeId] = useState<string>(defaultMakeId ? String(defaultMakeId) : "");
  const [modelId, setModelId] = useState<string>(defaultModelId ? String(defaultModelId) : "");
  const popular = makes.filter((m) => m.isPopular);
  const others = makes.filter((m) => !m.isPopular);
  const makeModels = useMemo(() => models.filter((m) => String(m.makeId) === makeId), [models, makeId]);

  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <Field id="makeId" label="Make" error={errors.makeId}>
        <Select
          id="makeId"
          name="makeId"
          value={makeId}
          onChange={(event) => {
            setMakeId(event.target.value);
            setModelId("");
            onModelChange?.(undefined);
          }}
          invalid={Boolean(errors.makeId)}
          required
        >
          <option value="" disabled>
            Choose make
          </option>
          <optgroup label="Most listed">
            {popular.map((make) => (
              <option key={make.id} value={make.id}>
                {make.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Other makes">
            {others.map((make) => (
              <option key={make.id} value={make.id}>
                {make.name}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>

      <Field id="modelId" label="Model" error={errors.modelId}>
        <Select
          id="modelId"
          name="modelId"
          value={modelId}
          onChange={(event) => {
            setModelId(event.target.value);
            onModelChange?.(models.find((m) => String(m.id) === event.target.value));
          }}
          disabled={!makeId}
          invalid={Boolean(errors.modelId)}
          aria-describedby={describedBy("modelId", errors.modelId)}
          required
        >
          <option value="" disabled>
            {makeId ? "Choose model" : "Choose a make first"}
          </option>
          {makeModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="year" label="Year of manufacture" error={errors.year}>
        <Select
          id="year"
          name="year"
          defaultValue={defaultYear ? String(defaultYear) : ""}
          invalid={Boolean(errors.year)}
          aria-describedby={describedBy("year", errors.year)}
          required
        >
          <option value="" disabled>
            Choose year
          </option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
