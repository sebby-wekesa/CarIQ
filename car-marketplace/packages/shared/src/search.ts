/**
 * Search filters: one shape for the search page URL, saved searches (stored as JSON) and the
 * database's search_listings(). Keys match the URL parameters and the JSON keys exactly.
 *
 * Canonical URLs put make, model and county in the path, which gives Google one page per
 * combination ("/cars/toyota/corolla-axio/in/mombasa"), and everything else in the query:
 *   /cars/toyota/in/mombasa?price_max=1500000&body=hatchback,saloon&sort=price_asc&page=2
 */
import { z } from "zod";
import { countyBySlug } from "./counties";
import { formatKesShort } from "./money";
import { BODY_TYPES, CONDITIONS, FUEL_TYPES, labelFor, MIN_YEAR, TRANSMISSIONS } from "./vehicle";

export const SEARCH_SORTS = ["recommended", "newest", "price_asc", "price_desc", "mileage_asc", "year_desc"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SORT_LABELS: Record<SearchSort, string> = {
  recommended: "Recommended",
  newest: "Newest listings",
  price_asc: "Lowest price",
  price_desc: "Highest price",
  mileage_asc: "Lowest mileage",
  year_desc: "Newest model year",
};

export const PAGE_SIZE = 24;
/** Deep pages are slow and nobody reads them; filters are the better tool past this point. */
export const MAX_PAGE = 50;

/** Price steps for the min/max pickers, in shillings. */
export const PRICE_STEPS = [
  250_000, 500_000, 750_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000,
  5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000,
] as const;
export const MILEAGE_STEPS = [20_000, 50_000, 80_000, 100_000, 150_000, 200_000, 300_000] as const;

const slug = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const whole = (max: number, min = 0) => z.number().int().min(min).max(max);
const anyOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).min(1).max(values.length);

export const searchFiltersSchema = z
  .object({
    make: slug.optional(),
    model: slug.optional(),
    county: slug.optional(),
    price_min: whole(1_000_000_000).optional(),
    price_max: whole(1_000_000_000).optional(),
    year_min: whole(2100, MIN_YEAR).optional(),
    year_max: whole(2100, MIN_YEAR).optional(),
    mileage_max: whole(2_000_000).optional(),
    body: anyOf(BODY_TYPES).optional(),
    fuel: anyOf(FUEL_TYPES).optional(),
    transmission: anyOf(TRANSMISSIONS).optional(),
    condition: anyOf(CONDITIONS).optional(),
    q: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type MultiFilterKey = "body" | "fuel" | "transmission" | "condition";
export const MULTI_FILTERS: readonly MultiFilterKey[] = ["body", "fuel", "transmission", "condition"];
const NUMBER_FILTERS = ["price_min", "price_max", "year_min", "year_max", "mileage_max"] as const;
const MULTI_VALUES: Record<MultiFilterKey, readonly string[]> = {
  body: BODY_TYPES,
  fuel: FUEL_TYPES,
  transmission: TRANSMISSIONS,
  condition: CONDITIONS,
};

/**
 * One canonical form per search: empty values dropped, lists sorted and de-duplicated, ranges
 * the right way round, a model only with its make, text lower-cased and squeezed. Two buyers
 * describing the same search get byte-identical JSON, which is what makes "already saved" work.
 */
export function normalizeFilters(input: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  if (input.make) out.make = input.make;
  if (input.make && input.model) out.model = input.model;
  if (input.county) out.county = input.county;

  const [pMin, pMax] = ordered(input.price_min, input.price_max);
  const [yMin, yMax] = ordered(input.year_min, input.year_max);
  if (pMin != null && pMin > 0) out.price_min = pMin;
  if (pMax != null) out.price_max = pMax;
  if (yMin != null) out.year_min = yMin;
  if (yMax != null) out.year_max = yMax;
  if (input.mileage_max != null) out.mileage_max = input.mileage_max;

  for (const key of MULTI_FILTERS) {
    const values = input[key] as string[] | undefined;
    if (!values?.length) continue;
    const order = MULTI_VALUES[key];
    const unique = [...new Set(values)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    (out as Record<string, unknown>)[key] = unique;
  }

  const q = input.q?.toLowerCase().replace(/\s+/g, " ").trim();
  if (q) out.q = q;
  return out;
}

function ordered(a: number | undefined, b: number | undefined): [number | undefined, number | undefined] {
  return a != null && b != null && a > b ? [b, a] : [a, b];
}

export type SearchState = { filters: SearchFilters; sort: SearchSort; page: number };
export type ParsedSearch = SearchState & {
  /** False when the path isn't a search path at all: the page should 404. */
  valid: boolean;
  /** Query parameters that were ignored because they were malformed or unknown. */
  dropped: string[];
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(params: ParamSource, key: string): string | undefined {
  const value = params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

/** Every value of a parameter: plain HTML forms repeat a key for each ticked checkbox. */
function readAll(params: ParamSource, key: string): string[] {
  const values = params instanceof URLSearchParams ? params.getAll(key) : [params[key]].flat();
  return values.filter((v): v is string => typeof v === "string");
}

function paramKeys(params: ParamSource): string[] {
  return params instanceof URLSearchParams ? [...new Set(params.keys())] : Object.keys(params);
}

const KNOWN_PARAMS = new Set<string>([
  "make", "model", "county", ...NUMBER_FILTERS, ...MULTI_FILTERS, "q", "sort", "page",
]);

/**
 * Reads a search from its path segments (after /cars) and query string. Path segments win over
 * query parameters for make, model and county; the query form exists for plain HTML forms.
 * Bad values are dropped rather than failing the page, so an old or hand-edited link still works.
 */
export function parseSearch(segments: readonly string[], params: ParamSource): ParsedSearch {
  const dropped: string[] = [];
  const path = parsePath(segments);
  const raw: Record<string, unknown> = {
    make: path.make ?? readParam(params, "make"),
    model: path.model ?? readParam(params, "model"),
    county: path.county ?? readParam(params, "county"),
  };
  for (const key of NUMBER_FILTERS) {
    const value = readParam(params, key);
    if (value === undefined) continue;
    const n = Number(value.replace(/[,_\s]/g, ""));
    if (Number.isFinite(n)) raw[key] = Math.round(n);
    else dropped.push(key);
  }
  for (const key of MULTI_FILTERS) {
    const parts = readAll(params, key).flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const allowed = MULTI_VALUES[key];
    const good = parts.filter((p) => allowed.includes(p));
    if (good.length !== parts.length) dropped.push(key);
    if (good.length) raw[key] = good;
  }
  const q = readParam(params, "q");
  if (q) raw.q = q.slice(0, 60);

  // Validate field by field so one bad value doesn't throw away the rest.
  const filters: Record<string, unknown> = {};
  const shape = searchFiltersSchema.shape;
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const result = shape[key as keyof typeof shape].safeParse(value);
    if (result.success && result.data !== undefined) filters[key] = result.data;
    else dropped.push(key);
  }

  const sortParam = readParam(params, "sort");
  const sort = (SEARCH_SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as SearchSort) : "newest";
  if (sortParam && sort !== sortParam) dropped.push("sort");

  const pageParam = readParam(params, "page");
  const pageNumber = pageParam ? Number(pageParam) : 1;
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? Math.min(pageNumber, MAX_PAGE) : 1;
  if (pageParam && String(page) !== pageParam) dropped.push("page");

  for (const key of paramKeys(params)) if (!KNOWN_PARAMS.has(key)) dropped.push(key);

  return { filters: normalizeFilters(filters as SearchFilters), sort, page, valid: path.valid, dropped };
}

/** Path grammar after /cars: [make [model]] ["in" county]. */
function parsePath(segments: readonly string[]): { make?: string; model?: string; county?: string; valid: boolean } {
  let parts: string[];
  try {
    parts = segments.map((s) => decodeURIComponent(s).toLowerCase());
  } catch {
    return { valid: false }; // malformed %-encoding
  }
  const inAt = parts.indexOf("in");
  const head = inAt === -1 ? parts : parts.slice(0, inAt);
  const tail = inAt === -1 ? [] : parts.slice(inAt + 1);
  if (head.length > 2 || (inAt !== -1 && tail.length !== 1)) return { valid: false };
  if ([...head, ...tail].some((p) => !slug.safeParse(p).success)) return { valid: false };
  return { make: head[0], model: head[1], county: tail[0], valid: true };
}

/** The canonical URL for a search. */
export function searchHref(filters: SearchFilters, options: { sort?: SearchSort; page?: number } = {}): string {
  const f = normalizeFilters(filters);
  let path = "/cars";
  if (f.make) path += `/${f.make}`;
  if (f.make && f.model) path += `/${f.model}`;
  if (f.county) path += `/in/${f.county}`;

  const query = new URLSearchParams();
  for (const key of NUMBER_FILTERS) if (f[key] != null) query.set(key, String(f[key]));
  for (const key of MULTI_FILTERS) {
    const values = f[key] as string[] | undefined;
    if (values?.length) query.set(key, values.join(","));
  }
  if (f.q) query.set("q", f.q);
  if (options.sort && options.sort !== "newest") query.set("sort", options.sort);
  if (options.page && options.page > 1) query.set("page", String(options.page));

  const qs = query.toString().replace(/%2C/g, ",");
  return qs ? `${path}?${qs}` : path;
}

/** True when anything beyond make, model and county is set: those pages aren't for Google. */
export function hasRefinements(filters: SearchFilters): boolean {
  return Object.keys(normalizeFilters(filters)).some((k) => !["make", "model", "county"].includes(k));
}

export function countActiveFilters(filters: SearchFilters): number {
  const f = normalizeFilters(filters);
  let n = 0;
  if (f.make) n++;
  if (f.model) n++;
  if (f.county) n++;
  if (f.price_min != null || f.price_max != null) n++;
  if (f.year_min != null || f.year_max != null) n++;
  if (f.mileage_max != null) n++;
  for (const key of MULTI_FILTERS) if (f[key]?.length) n++;
  if (f.q) n++;
  return n;
}

export function isEmptySearch(filters: SearchFilters): boolean {
  return Object.keys(normalizeFilters(filters)).length === 0;
}

/** Display names for the slugs in a search, looked up by the caller from the catalogue. */
export type SearchNames = { make?: string; model?: string; county?: string };

export function countyNameFor(slugValue: string | undefined): string | undefined {
  return slugValue ? countyBySlug(slugValue)?.name : undefined;
}

const km = new Intl.NumberFormat("en-KE");

export function describePrice(min?: number, max?: number): string | undefined {
  if (min != null && max != null) return `${formatKesShort(min)}–${formatKesShort(max).replace("KSh ", "")}`;
  if (max != null) return `under ${formatKesShort(max)}`;
  if (min != null) return `over ${formatKesShort(min)}`;
  return undefined;
}

export function describeYears(min?: number, max?: number): string | undefined {
  if (min != null && max != null) return min === max ? `${min}` : `${min}–${max}`;
  if (min != null) return `${min} or newer`;
  if (max != null) return `${max} or older`;
  return undefined;
}

function orList(values: readonly string[]): string {
  const labels = values.map(labelFor);
  return labels.length <= 2 ? labels.join(" or ") : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}

/** One chip per active filter, each with the href that removes it. */
export function filterChips(
  filters: SearchFilters,
  names: SearchNames,
  sort: SearchSort = "newest",
): { key: string; label: string; removeHref: string }[] {
  const f = normalizeFilters(filters);
  const without = (patch: Partial<Record<keyof SearchFilters, undefined>>) => searchHref({ ...f, ...patch }, { sort });
  const chips: { key: string; label: string; removeHref: string }[] = [];
  if (f.make) chips.push({ key: "make", label: names.make ?? f.make, removeHref: without({ make: undefined, model: undefined }) });
  if (f.model) chips.push({ key: "model", label: names.model ?? f.model, removeHref: without({ model: undefined }) });
  if (f.county) chips.push({ key: "county", label: `in ${names.county ?? f.county}`, removeHref: without({ county: undefined }) });
  const price = describePrice(f.price_min, f.price_max);
  if (price) chips.push({ key: "price", label: price, removeHref: without({ price_min: undefined, price_max: undefined }) });
  const years = describeYears(f.year_min, f.year_max);
  if (years) chips.push({ key: "year", label: years, removeHref: without({ year_min: undefined, year_max: undefined }) });
  if (f.mileage_max != null) {
    chips.push({ key: "mileage", label: `under ${km.format(f.mileage_max)} km`, removeHref: without({ mileage_max: undefined }) });
  }
  for (const key of MULTI_FILTERS) {
    const values = f[key];
    if (values?.length) chips.push({ key, label: orList(values), removeHref: without({ [key]: undefined }) });
  }
  if (f.q) chips.push({ key: "q", label: `“${f.q}”`, removeHref: without({ q: undefined }) });
  return chips;
}

/** Short name for a saved search: "Toyota, under KSh 1.5M, in Mombasa". Place reads best last. */
export function describeSearch(filters: SearchFilters, names: SearchNames): string {
  const f = normalizeFilters(filters);
  const chips = filterChips(f, names);
  const labels = chips.filter((c) => !["make", "model", "county"].includes(c.key)).map((c) => c.label);
  const vehicle = [f.make && (names.make ?? f.make), f.model && (names.model ?? f.model)].filter(Boolean).join(" ");
  if (vehicle) labels.unshift(vehicle);
  if (f.county) labels.push(`in ${names.county ?? f.county}`);
  if (labels.length === 0) return "All cars";
  // Saved-search names are at most 80 characters: drop whole phrases from the end, never cut one.
  const kept = [...labels];
  const withMore = () => kept.join(", ") + (kept.length < labels.length ? `, +${labels.length - kept.length} more` : "");
  while (withMore().length > 80 && kept.length > 1) kept.pop();
  return withMore().slice(0, 80);
}

/** Page heading for a search: "Toyota Corolla Axio for sale in Mombasa". */
export function searchHeading(filters: SearchFilters, names: SearchNames): string {
  const f = normalizeFilters(filters);
  const where = f.county ? ` in ${names.county ?? f.county}` : " in Kenya";
  if (f.make && f.model) return `${names.make ?? f.make} ${names.model ?? f.model} for sale${where}`;
  if (f.make) return `${names.make ?? f.make} cars for sale${where}`;
  return `Cars for sale${where}`;
}

/** Slug for a listing URL: "/listings/2016-toyota-corolla-axio-<id>". */
export function listingPath(id: string, title?: string | null): string {
  const words = (title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return `/listings/${words ? `${words}-` : ""}${id}`;
}

const UUID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The listing id from a listing URL segment, with or without the descriptive slug. */
export function listingIdFromSlug(segment: string): string | null {
  let text = segment;
  try {
    text = decodeURIComponent(segment);
  } catch {
    // malformed %-encoding: match on the raw text
  }
  return text.match(UUID_AT_END)?.[1]?.toLowerCase() ?? null;
}
