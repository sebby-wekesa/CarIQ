"use client";

import { searchHref, type SearchFilters, type SearchSort } from "@cm/shared";
import { Button } from "@/components/ui/button";
import { FilterPanel, type FilterMake, type FilterModel } from "./filter-panel";
import { useSearchNav } from "./search-shell";

/** Wide screens: a sidebar where every change applies straight away. */
export function DesktopFilters(props: { makes: FilterMake[]; models: FilterModel[]; filters: SearchFilters; sort: SearchSort }) {
  const { navigate } = useSearchNav();
  const go = (filters: SearchFilters) => navigate(searchHref(filters, { sort: props.sort }));
  return (
    <FilterPanel
      {...props}
      onChange={go}
      onSubmit={go}
      footer={
        <Button type="submit" variant="secondary">
          Update results
        </Button>
      }
    />
  );
}
