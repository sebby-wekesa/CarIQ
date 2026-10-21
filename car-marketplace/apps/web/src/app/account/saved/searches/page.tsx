import type { Metadata } from "next";
import { Suspense } from "react";
import { searchFiltersSchema } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/button";
import { SavedTabs } from "../saved-tabs";
import { SearchRowActions } from "./search-row-actions";

export const metadata: Metadata = { title: "Saved searches", robots: { index: false } };

const nf = new Intl.NumberFormat("en-KE");

export default function SavedSearchesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Saved</h1>
      <SavedTabs active="searches" />
      <Suspense fallback={<div aria-hidden className="mt-8 h-64 rounded-[var(--radius-control)] bg-mist/40" />}>
        <SavedSearches />
      </Suspense>
    </div>
  );
}

async function SavedSearches() {
  await requireUser("/account/saved/searches");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_saved_searches");
  if (error) {
    console.error("[saved] my_saved_searches failed", error);
    return (
      <p role="alert" className="mt-8 rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-danger">
        We can&apos;t load your saved searches right now. Try again in a minute.
      </p>
    );
  }
  const searches = data ?? [];

  if (searches.length === 0) {
    return (
      <div className="mt-8 rounded-[var(--radius-control)] border-2 border-dashed border-mist p-6 sm:p-8">
        <p className="text-xl font-semibold">No saved searches yet.</p>
        <p className="mt-1 max-w-[52ch] text-muted">
          Search for the car you want, then tap “Save search”. We&apos;ll count new matches here and alert you when they
          arrive.
        </p>
        <ButtonLink href="/cars" className="mt-5">
          Search cars
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <p className="mt-6 max-w-[60ch] text-muted">
        New matches are counted from the last time you opened each search. Alerts arrive here now, and by SMS once text
        alerts launch.
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {searches.map((s) => {
          const filters = searchFiltersSchema.safeParse(s.filters);
          const fresh = s.new_count ?? 0;
          return (
            <li key={s.id} className="rounded-[var(--radius-control)] border border-mist bg-surface p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {/* A plain link: opening marks the search as seen, so it must not be prefetched. */}
                  <a
                    href={`/account/saved/searches/${s.id}/open`}
                    className="text-lg font-semibold text-ink underline-offset-4 hover:underline"
                  >
                    {s.name}
                  </a>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span>
                      {nf.format(s.total_count ?? 0)} {s.total_count === 1 ? "car" : "cars"} on sale
                    </span>
                    {fresh > 0 ? (
                      <span className="rounded-full bg-plate px-2 py-0.5 text-xs font-bold text-ink">{fresh} new</span>
                    ) : null}
                    <span>Saved {s.created_at ? formatDate(s.created_at) : ""}</span>
                  </p>
                  {!filters.success ? (
                    <p className="mt-1 text-sm text-danger">This search uses an old format. Delete it and save it again.</p>
                  ) : null}
                </div>
                <SearchRowActions id={s.id ?? ""} alertsEnabled={Boolean(s.alerts_enabled)} name={s.name ?? "search"} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
