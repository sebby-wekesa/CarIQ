"use client";

import { SEARCH_SORTS, SORT_LABELS, searchHref, type SearchFilters, type SearchSort } from "@cm/shared";
import { Select } from "@/components/ui/field";
import { useSearchNav } from "./search-shell";

export function SortSelect({ filters, sort }: { filters: SearchFilters; sort: SearchSort }) {
  const { navigate } = useSearchNav();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="sr-only sm:not-sr-only sm:whitespace-nowrap sm:text-sm sm:font-semibold">
        Sort by
      </label>
      <Select
        id="sort"
        value={sort}
        onChange={(e) => navigate(searchHref(filters, { sort: e.target.value as SearchSort }))}
        className="min-h-11 w-auto py-0 text-sm"
      >
        {SEARCH_SORTS.map((s) => (
          <option key={s} value={s}>
            {SORT_LABELS[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}
