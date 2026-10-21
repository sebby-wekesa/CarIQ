"use client";

import { useId, useState, type FormEvent } from "react";
import {
  BODY_TYPES,
  CONDITIONS,
  COUNTIES,
  FUEL_TYPES,
  LAUNCH_COUNTY_CODES,
  MILEAGE_STEPS,
  MIN_YEAR,
  PRICE_STEPS,
  TRANSMISSIONS,
  formatKesShort,
  labelFor,
  maxYear,
  normalizeFilters,
  type MultiFilterKey,
  type SearchFilters,
  type SearchSort,
} from "@cm/shared";
import { filtersKey } from "@/lib/buyer/state";
import { ChipCheckbox, Field, Input, Select } from "@/components/ui/field";

export type FilterMake = { slug: string; name: string; isPopular: boolean };
export type FilterModel = { slug: string; name: string; makeSlug: string };

type Props = {
  makes: FilterMake[];
  models: FilterModel[];
  filters: SearchFilters;
  sort: SearchSort;
  /** Called with the new filters on every change. */
  onChange: (filters: SearchFilters) => void;
  /** Called when the form is submitted (Enter in the keyword box, or the submit button). */
  onSubmit: (filters: SearchFilters) => void;
  footer?: React.ReactNode;
  /** Lets a submit button outside the form (the phone sheet's action bar) submit it. */
  formId?: string;
};

const km = new Intl.NumberFormat("en-KE");
const years = Array.from({ length: maxYear() - MIN_YEAR + 1 }, (_, i) => maxYear() - i);
const launchCounties = COUNTIES.filter((c) => (LAUNCH_COUNTY_CODES as readonly number[]).includes(c.code));
const otherCounties = COUNTIES.filter((c) => !(LAUNCH_COUNTY_CODES as readonly number[]).includes(c.code)).sort(
  (a, b) => a.name.localeCompare(b.name),
);

const GROUPS: { key: MultiFilterKey; legend: string; values: readonly string[] }[] = [
  { key: "condition", legend: "Condition", values: CONDITIONS },
  { key: "body", legend: "Body type", values: BODY_TYPES },
  { key: "fuel", legend: "Fuel", values: FUEL_TYPES },
  { key: "transmission", legend: "Gearbox", values: TRANSMISSIONS },
];

/**
 * Every search filter, as a plain GET form (works without JavaScript; the server redirects the
 * query version to the clean URL). With JavaScript, the parent decides whether a change applies
 * at once (desktop sidebar) or waits for "Show cars" (phone sheet).
 */
export function FilterPanel({ makes, models, filters, sort, onChange, onSubmit, footer, formId }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const [keyword, setKeyword] = useState(filters.q ?? "");

  // A different search arrived from the server (back button, a chip removed): start from it.
  // Adjusting state during render keeps focus in place, unlike remounting with a key.
  const incoming = filtersKey(filters);
  const [shown, setShown] = useState(incoming);
  if (incoming !== shown) {
    setShown(incoming);
    setDraft(filters);
    setKeyword(filters.q ?? "");
  }

  function update(patch: Partial<SearchFilters>) {
    const next = normalizeFilters({ ...draft, ...patch });
    setDraft(next);
    onChange(next);
  }

  function num(value: string): number | undefined {
    return value ? Number(value) : undefined;
  }

  function toggle(key: MultiFilterKey, value: string, on: boolean) {
    const current = (draft[key] as string[] | undefined) ?? [];
    const next = on ? [...current, value] : current.filter((v) => v !== value);
    update({ [key]: next.length ? next : undefined } as Partial<SearchFilters>);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeFilters({ ...draft, q: keyword.trim() || undefined });
    setDraft(next);
    onSubmit(next);
  }

  const popular = makes.filter((m) => m.isPopular);
  const others = makes.filter((m) => !m.isPopular);
  const makeModels = draft.make ? models.filter((m) => m.makeSlug === draft.make) : [];

  return (
    <form id={formId} method="get" action="/cars" onSubmit={submit} className="flex flex-col gap-6" aria-label="Search filters">
      {sort !== "newest" ? <input type="hidden" name="sort" value={sort} /> : null}

      <div className="flex flex-col gap-4">
        <Field id={`${id}-make`} label="Make">
          <Select
            id={`${id}-make`}
            name="make"
            value={draft.make ?? ""}
            onChange={(e) => update({ make: e.target.value || undefined, model: undefined })}
          >
            <option value="">Any make</option>
            <optgroup label="Most listed">
              {popular.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other makes">
              {others.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>

        <Field id={`${id}-model`} label="Model">
          <Select
            id={`${id}-model`}
            name="model"
            value={draft.model ?? ""}
            disabled={!draft.make}
            onChange={(e) => update({ model: e.target.value || undefined })}
          >
            <option value="">{draft.make ? "Any model" : "Choose a make first"}</option>
            {makeModels.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field id={`${id}-county`} label="Location">
          <Select
            id={`${id}-county`}
            name="county"
            value={draft.county ?? ""}
            onChange={(e) => update({ county: e.target.value || undefined })}
          >
            <option value="">Anywhere in Kenya</option>
            <optgroup label="Launch counties">
              {launchCounties.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="All counties">
              {otherCounties.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-ink">Price</legend>
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Minimum price"
            name="price_min"
            value={draft.price_min ?? ""}
            onChange={(e) => update({ price_min: num(e.target.value) })}
          >
            <option value="">No min</option>
            {PRICE_STEPS.map((p) => (
              <option key={p} value={p}>
                {formatKesShort(p)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Maximum price"
            name="price_max"
            value={draft.price_max ?? ""}
            onChange={(e) => update({ price_max: num(e.target.value) })}
          >
            <option value="">No max</option>
            {PRICE_STEPS.map((p) => (
              <option key={p} value={p}>
                {formatKesShort(p)}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-ink">Year of manufacture</legend>
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Oldest year"
            name="year_min"
            value={draft.year_min ?? ""}
            onChange={(e) => update({ year_min: num(e.target.value) })}
          >
            <option value="">From any</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Newest year"
            name="year_max"
            value={draft.year_max ?? ""}
            onChange={(e) => update({ year_max: num(e.target.value) })}
          >
            <option value="">To any</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <Field id={`${id}-mileage`} label="Mileage">
        <Select
          id={`${id}-mileage`}
          name="mileage_max"
          value={draft.mileage_max ?? ""}
          onChange={(e) => update({ mileage_max: num(e.target.value) })}
        >
          <option value="">Any mileage</option>
          {MILEAGE_STEPS.map((m) => (
            <option key={m} value={m}>
              Up to {km.format(m)} km
            </option>
          ))}
        </Select>
      </Field>

      {GROUPS.map((group) => (
        <fieldset key={group.key}>
          <legend className="mb-2 text-sm font-semibold text-ink">{group.legend}</legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => (
              <ChipCheckbox
                key={value}
                name={group.key}
                value={value}
                label={labelFor(value)}
                checked={((draft[group.key] as string[] | undefined) ?? []).includes(value)}
                onChange={(e) => toggle(group.key, value, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <Field id={`${id}-q`} label="Keyword" hint="A colour, feature or town, e.g. “white sunroof”.">
        <Input
          id={`${id}-q`}
          name="q"
          type="search"
          maxLength={60}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onBlur={() => {
            if ((keyword.trim() || undefined) !== draft.q) update({ q: keyword.trim() || undefined });
          }}
          enterKeyHint="search"
        />
      </Field>

      {footer}
    </form>
  );
}
