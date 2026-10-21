import "server-only";
import {
  hasRefinements,
  parseSearch,
  searchHeading,
  searchHref,
  type ParsedSearch,
  type SearchNames,
} from "@cm/shared";
import { getCatalogue, resolveSearchNames, type Catalogue } from "@/lib/catalogue";

type Params = Record<string, string | string[] | undefined>;

export type SearchPage = {
  parsed: ParsedSearch;
  names: SearchNames;
  heading: string;
  /** This exact search (filters, sort, page). */
  href: string;
  /** What search engines should index for it: no sort order, same page. */
  canonical: string;
  /** Plain make / model / county landing page with the default order. */
  isLanding: boolean;
  /** Cars published after this get a "New" badge (opened from a saved search). */
  since: string | null;
  /** Came back from signing in via "Save search". */
  autoSave: boolean;
  catalogue: Catalogue | null;
};

/**
 * Reads and checks a /cars URL. Returns null for paths that should 404: bad grammar, or a make,
 * model or county we don't know. Unknown or malformed query parameters are ignored instead.
 */
export async function resolveSearchPage(segments: string[] | undefined, params: Params): Promise<SearchPage | null> {
  const parsed = parseSearch(segments ?? [], params);
  if (!parsed.valid) return null;

  const catalogue = await getCatalogue();
  const found = resolveSearchNames(catalogue, parsed.filters);
  if (catalogue) {
    if (parsed.filters.make && !found.make) return null;
    if (parsed.filters.model && !found.model) return null;
  }
  if (parsed.filters.county && !found.countyName) return null;

  const names: SearchNames = { make: found.make?.name, model: found.model?.name, county: found.countyName };
  const ignored = parsed.dropped.filter((key) => key !== "since" && key !== "save");
  const sinceRaw = first(params.since);
  const sinceTime = sinceRaw ? Date.parse(sinceRaw) : NaN;

  return {
    parsed,
    names,
    heading: searchHeading(parsed.filters, names),
    href: searchHref(parsed.filters, { sort: parsed.sort, page: parsed.page }),
    canonical: searchHref(parsed.filters, { page: parsed.page }),
    isLanding: !hasRefinements(parsed.filters) && parsed.sort === "newest" && ignored.length === 0 && !sinceRaw,
    since: Number.isFinite(sinceTime) && sinceTime <= Date.now() ? new Date(sinceTime).toISOString() : null,
    autoSave: first(params.save) === "1",
    catalogue,
  };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
