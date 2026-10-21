"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { countActiveFilters, normalizeFilters, searchHref, type SearchFilters, type SearchSort } from "@cm/shared";
import { Button } from "@/components/ui/button";
import { FilterPanel, type FilterMake, type FilterModel } from "./filter-panel";
import { useSearchNav } from "./search-shell";

type Props = { makes: FilterMake[]; models: FilterModel[]; filters: SearchFilters; sort: SearchSort; total: number | null };

const nf = new Intl.NumberFormat("en-KE");

/**
 * Phones: filters open in a full-screen sheet and apply together, with a live count on the
 * button so nobody taps "Show cars" into an empty page.
 */
export function FilterSheet({ makes, models, filters, sort, total }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { navigate } = useSearchNav();
  const [draft, setDraft] = useState<SearchFilters>(filters);
  // Live count for the staged filters, keyed by the search it belongs to so a slow answer for
  // an older selection is never shown against a newer one.
  const [fetched, setFetched] = useState<{ href: string; count: number | null } | null>(null);
  const active = countActiveFilters(filters);
  const draftHref = searchHref(draft);
  const unchanged = draftHref === searchHref(filters);
  const count = unchanged ? total : fetched?.href === draftHref ? fetched.count : null;
  const counting = !unchanged && fetched?.href !== draftHref;

  useEffect(() => {
    if (unchanged) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let result: number | null = null;
      try {
        const query = new URLSearchParams(draftHref.includes("?") ? draftHref.slice(draftHref.indexOf("?")) : "");
        for (const key of ["make", "model", "county"] as const) if (draft[key]) query.set(key, draft[key]);
        const response = await fetch(`/api/search/count?${query}`, { signal: controller.signal });
        const body = (await response.json()) as { count?: number };
        result = typeof body.count === "number" ? body.count : null;
      } catch {
        if (controller.signal.aborted) return;
      }
      setFetched({ href: draftHref, count: result });
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [draft, draftHref, unchanged]);

  function open() {
    setDraft(filters);
    dialog.current?.showModal();
  }

  function apply(next: SearchFilters) {
    dialog.current?.close();
    navigate(searchHref(normalizeFilters(next), { sort }));
  }

  const showLabel =
    count === null ? "Show cars" : count === 0 ? "No cars match" : count === 1 ? "Show 1 car" : `Show ${nf.format(count)} cars`;

  return (
    <>
      <Button type="button" variant="secondary" onClick={open} className="lg:hidden" aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden className="size-4" />
        Filters{active ? ` (${active})` : ""}
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby="filter-sheet-title"
        className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-paper p-0 backdrop:bg-ink/40 sm:mx-auto sm:my-6 sm:h-[calc(100dvh-3rem)] sm:max-w-lg sm:rounded-[var(--radius-control)]"
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-mist bg-surface px-4 py-2">
            <h2 id="filter-sheet-title" className="display text-2xl">
              Filters
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="grid size-11 place-items-center rounded-full hover:bg-paper"
              aria-label="Close filters"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
            <FilterPanel
              formId="filter-sheet-form"
              makes={makes}
              models={models}
              filters={draft}
              sort={sort}
              onChange={setDraft}
              onSubmit={apply}
            />
          </div>
          <div className="flex shrink-0 gap-3 border-t border-mist bg-surface px-4 py-3">
            <Button type="button" variant="secondary" onClick={() => setDraft({})}>
              Clear all
            </Button>
            <Button type="submit" form="filter-sheet-form" className="flex-1" pending={counting} disabled={count === 0}>
              {showLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
