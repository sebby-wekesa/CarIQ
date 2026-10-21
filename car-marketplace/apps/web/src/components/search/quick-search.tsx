"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { COUNTIES, LAUNCH_COUNTY_CODES, PRICE_STEPS, formatKesShort, searchHref } from "@cm/shared";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import type { FilterMake } from "./filter-panel";

const launch = COUNTIES.filter((c) => (LAUNCH_COUNTY_CODES as readonly number[]).includes(c.code));
const others = COUNTIES.filter((c) => !(LAUNCH_COUNTY_CODES as readonly number[]).includes(c.code)).sort((a, b) =>
  a.name.localeCompare(b.name),
);

/** The home page's three questions: what, how much, where. A plain GET form underneath. */
export function QuickSearch({ makes }: { makes: FilterMake[] }) {
  const router = useRouter();
  const [make, setMake] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [county, setCounty] = useState("");
  const [pending, setPending] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    router.push(
      searchHref({ make: make || undefined, county: county || undefined, price_max: priceMax ? Number(priceMax) : undefined }),
    );
  }

  return (
    <form
      method="get"
      action="/cars"
      onSubmit={submit}
      role="search"
      aria-label="Find a car"
      className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
    >
      <Field id="quick-make" label="Make">
        <Select id="quick-make" name="make" value={make} onChange={(e) => setMake(e.target.value)}>
          <option value="">Any make</option>
          {makes.filter((m) => m.isPopular).map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
          <optgroup label="Other makes">
            {makes.filter((m) => !m.isPopular).map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <Field id="quick-price" label="Budget">
        <Select id="quick-price" name="price_max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)}>
          <option value="">Any price</option>
          {PRICE_STEPS.map((p) => (
            <option key={p} value={p}>
              Up to {formatKesShort(p)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="quick-county" label="Location">
        <Select id="quick-county" name="county" value={county} onChange={(e) => setCounty(e.target.value)}>
          <option value="">Anywhere in Kenya</option>
          {launch.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
          <optgroup label="All counties">
            {others.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <Button type="submit" size="lg" variant="plate" pending={pending} className="sm:min-h-12">
        {pending ? null : <Search aria-hidden className="size-5" />}
        Search cars
      </Button>
    </form>
  );
}
