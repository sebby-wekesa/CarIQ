import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  MAX_PAGE,
  PAGE_SIZE,
  filterChips,
  formatKesShort,
  isEmptySearch,
  searchHref,
  type SearchFilters,
} from "@cm/shared";
import Link from "next/link";
import { env } from "@/lib/env";
import { resolveSearchPage, type SearchPage } from "@/lib/search/page-context";
import { facetFor, getFacets, searchListings, type Facet } from "@/lib/search/queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd, breadcrumbList } from "@/components/json-ld";
import { ListingGrid } from "@/components/listings/listing-card";
import { DesktopFilters } from "@/components/search/desktop-filters";
import { FilterSheet } from "@/components/search/filter-sheet";
import { Pagination } from "@/components/search/pagination";
import { relatedSections } from "@/lib/search/related";
import { RelatedLinks } from "@/components/search/related-links";
import { SaveSearchButton } from "@/components/search/save-search-button";
import { ResultsRegion, SearchShell } from "@/components/search/search-shell";
import { SortSelect } from "@/components/search/sort-select";

type Props = PageProps<"/cars/[[...filters]]">;

const nf = new Intl.NumberFormat("en-KE");

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const page = await resolveSearchPage((await params).filters, await searchParams);
  if (!page) return { title: "Page not found", robots: { index: false } };
  const { filters, page: pageNumber } = page.parsed;
  const facet = facetFor(await getFacets(), filters);
  const cars = facet?.listings ?? 0;
  const title = pageNumber > 1 ? `${page.heading} (page ${pageNumber})` : page.heading;
  const range =
    facet?.minPrice && facet.maxPrice && facet.minPrice !== facet.maxPrice
      ? ` from ${formatKesShort(facet.minPrice)} to ${formatKesShort(facet.maxPrice)}`
      : "";
  const description =
    cars > 0
      ? `${page.heading}: ${nf.format(cars)} ${cars === 1 ? "car" : "cars"}${range}. ` +
        "Every listing shows the asking price, mileage history and seller up front."
      : `${page.heading}. Save the search and we'll tell you when a car is listed.`;

  return {
    title,
    description,
    alternates: { canonical: page.canonical },
    // Only clean landing pages with cars on them belong in search results.
    robots: { index: page.isLanding && cars > 0, follow: true },
    openGraph: { title, description, url: page.canonical },
  };
}

export default function CarsPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<SearchPlaceholder />}>
        <SearchContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchContent({ params, searchParams }: Props) {
  const page = await resolveSearchPage((await params).filters, await searchParams);
  if (!page) notFound();
  const { filters, sort, page: pageNumber } = page.parsed;
  const [result, facets] = await Promise.all([searchListings(filters, sort, pageNumber), getFacets()]);
  if (result && pageNumber > 1 && result.cards.length === 0) notFound();

  const pages = result ? Math.min(Math.ceil(result.total / PAGE_SIZE), MAX_PAGE) : 0;
  const chips = filterChips(filters, page.names, sort);
  const crumbs = breadcrumbs(page);
  const canSave = !isEmptySearch(filters);
  const makes = (page.catalogue?.makes ?? []).map((m) => ({ slug: m.slug, name: m.name, isPopular: m.isPopular }));
  const makeSlugs = new Map((page.catalogue?.makes ?? []).map((m) => [m.id, m.slug]));
  const models = (page.catalogue?.models ?? []).map((m) => ({ slug: m.slug, name: m.name, makeSlug: makeSlugs.get(m.makeId) ?? "" }));
  const facet = facetFor(facets, filters);
  const first = (pageNumber - 1) * PAGE_SIZE + 1;

  return (
    <SearchShell>
      <Breadcrumbs items={crumbs} />
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-4xl sm:text-5xl">{page.heading}</h1>
          {page.isLanding && facet ? <Intro facet={facet} /> : null}
        </div>
        {canSave ? (
          <div className="shrink-0">
            <SaveSearchButton filters={filters} href={searchHref(filters, { sort })} autoSave={page.autoSave} />
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Filters">
          <DesktopFilters makes={makes} models={models} filters={filters} sort={sort} />
        </aside>

        <ResultsRegion labelledBy="results-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="font-semibold" aria-live="polite">
              {result === null
                ? "Results"
                : result.total === 0
                  ? "No cars match"
                  : `${nf.format(result.total)} ${result.total === 1 ? "car" : "cars"}` +
                    (pages > 1 ? `, showing ${nf.format(first)}–${nf.format(first + result.cards.length - 1)}` : "")}
            </h2>
            <div className="flex items-center gap-2">
              <FilterSheet makes={makes} models={models} filters={filters} sort={sort} total={result?.total ?? null} />
              <SortSelect filters={filters} sort={sort} />
            </div>
          </div>

          {chips.length ? (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link
                    href={chip.removeHref}
                    scroll={false}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-sm font-medium text-white hover:bg-ink-soft"
                    aria-label={`Remove filter: ${chip.label}`}
                  >
                    {chip.label}
                    <span aria-hidden>×</span>
                  </Link>
                </li>
              ))}
              {chips.length > 1 ? (
                <li>
                  <Link href={searchHref({}, { sort })} scroll={false} className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-forest underline-offset-4 hover:underline">
                    Clear all
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="mt-5">
            {result === null ? (
              <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-danger">
                We can&apos;t load cars right now. Try again in a minute.
              </p>
            ) : result.total === 0 ? (
              <NoMatches filters={filters} canSave={canSave} chips={chips} sortHref={searchHref(filters, { sort })} />
            ) : (
              <ListingGrid listings={result.cards} newSince={page.since} narrow />
            )}
          </div>

          {result ? <Pagination filters={filters} sort={sort} page={pageNumber} pages={pages} /> : null}
        </ResultsRegion>
      </div>

      <RelatedLinks sections={relatedSections(facets, filters, page.names)} />
      <JsonLd data={breadcrumbList(env.siteUrl, crumbs)} />
    </SearchShell>
  );
}

function Intro({ facet }: { facet: Facet }) {
  const range =
    facet.minPrice && facet.maxPrice
      ? facet.minPrice === facet.maxPrice
        ? `, at ${formatKesShort(facet.minPrice)}`
        : `, from ${formatKesShort(facet.minPrice)} to ${formatKesShort(facet.maxPrice)}`
      : "";
  return (
    <p className="mt-2 max-w-[60ch] text-ink-soft">
      {nf.format(facet.listings)} {facet.listings === 1 ? "car" : "cars"} on sale{range}. Every listing shows the asking
      price, mileage history and seller up front.
    </p>
  );
}

function NoMatches({
  filters,
  canSave,
  chips,
  sortHref,
}: {
  filters: SearchFilters;
  canSave: boolean;
  chips: { key: string; label: string; removeHref: string }[];
  sortHref: string;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border-2 border-dashed border-mist p-6 sm:p-8">
      <p className="text-xl font-semibold">No cars match this search yet.</p>
      <p className="mt-1 max-w-[56ch] text-muted">
        {canSave
          ? "New cars are listed every day. Save this search and we'll tell you as soon as one matches."
          : "No cars are listed yet. Check back soon."}
      </p>
      {canSave ? (
        <div className="mt-4">
          <SaveSearchButton filters={filters} href={sortHref} />
        </div>
      ) : null}
      {chips.length > 1 ? (
        <div className="mt-6">
          <p className="text-sm font-semibold">Or widen the search:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link href={chip.removeHref} className="inline-flex min-h-9 items-center rounded-full border border-mist bg-surface px-3 text-sm hover:border-ink/30">
                  Without “{chip.label}”
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function breadcrumbs(page: SearchPage) {
  const { make, model, county } = page.parsed.filters;
  const items = [
    { name: "Home", href: "/" },
    { name: "Cars for sale", href: "/cars" },
  ];
  if (make) items.push({ name: page.names.make ?? make, href: searchHref({ make }) });
  if (make && model) items.push({ name: page.names.model ?? model, href: searchHref({ make, model }) });
  if (county) items.push({ name: `In ${page.names.county ?? county}`, href: searchHref({ make, model, county }) });
  return items;
}

function SearchPlaceholder() {
  return (
    <div aria-hidden>
      <div className="h-4 w-48 rounded bg-mist/70" />
      <div className="mt-5 h-12 w-2/3 rounded bg-mist" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="hidden h-96 rounded-[var(--radius-control)] bg-mist/40 lg:block" />
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-[4/5] rounded-[var(--radius-control)] bg-mist/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
