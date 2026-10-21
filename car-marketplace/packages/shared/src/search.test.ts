import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  describeSearch,
  filterChips,
  hasRefinements,
  listingIdFromSlug,
  listingPath,
  normalizeFilters,
  parseSearch,
  searchHeading,
  searchHref,
} from "./search";

const ID = "1779e8b7-6f1c-4c55-9a3e-2b1d0c9e8f7a";
const names = { make: "Toyota", model: "Corolla Axio", county: "Mombasa" };

describe("parseSearch", () => {
  it("reads make, model and county from the path", () => {
    const s = parseSearch(["toyota", "corolla-axio", "in", "mombasa"], {});
    expect(s).toMatchObject({ valid: true, filters: { make: "toyota", model: "corolla-axio", county: "mombasa" } });
  });

  it.each([
    [[], {}],
    [["toyota"], { make: "toyota" }],
    [["toyota", "vitz"], { make: "toyota", model: "vitz" }],
    [["in", "nairobi"], { county: "nairobi" }],
    [["toyota", "in", "nairobi"], { make: "toyota", county: "nairobi" }],
  ])("accepts %j", (segments, filters) => {
    expect(parseSearch(segments, {})).toMatchObject({ valid: true, filters });
  });

  it.each([
    [["toyota", "vitz", "extra"]],
    [["in"]],
    [["in", "nairobi", "more"]],
    [["toyota", "in"]],
    [["Toyota Vitz"]],
    [["toyota", "vitz", "in", "mombasa", "x"]],
    [["%E0%A4%A"]],
  ])("rejects %j", (segments) => {
    expect(parseSearch(segments, {}).valid).toBe(false);
  });

  it("reads the done-when search from a URL", () => {
    const s = parseSearch(["toyota", "in", "mombasa"], new URLSearchParams("price_max=1500000"));
    expect(s.filters).toEqual({ make: "toyota", county: "mombasa", price_max: 1_500_000 });
    expect(describeSearch(s.filters, names)).toBe("Toyota, under KSh 1.5M, in Mombasa");
  });

  it("accepts the plain-form query version of the path filters", () => {
    const s = parseSearch([], { make: "toyota", county: "mombasa", model: "" });
    expect(s.filters).toEqual({ make: "toyota", county: "mombasa" });
  });

  it("keeps good values and drops bad ones", () => {
    const s = parseSearch([], {
      price_max: "1,500,000",
      year_min: "old",
      body: "suv,tank,saloon",
      fuel: "diesel",
      sort: "cheapest",
      page: "-3",
      utm_source: "facebook",
    });
    expect(s.filters).toEqual({ price_max: 1_500_000, body: ["saloon", "suv"], fuel: ["diesel"] });
    expect(s.sort).toBe("newest");
    expect(s.page).toBe(1);
    expect(s.dropped.sort()).toEqual(["body", "page", "sort", "utm_source", "year_min"]);
  });

  it("reads repeated checkbox values from a plain form", () => {
    const params = new URLSearchParams("body=suv&body=pickup&fuel=diesel,petrol&price_min=&year_max=");
    expect(parseSearch([], params).filters).toEqual({ body: ["suv", "pickup"], fuel: ["petrol", "diesel"] });
  });

  it("drops a model without a make", () => {
    expect(parseSearch([], { model: "vitz" }).filters).toEqual({});
  });

  it("caps deep pages", () => {
    expect(parseSearch([], { page: "9999" }).page).toBe(50);
  });

  it("uses the first value of a repeated parameter", () => {
    expect(parseSearch([], { sort: ["price_asc", "price_desc"] }).sort).toBe("price_asc");
  });
});

describe("normalizeFilters", () => {
  it("swaps reversed ranges, sorts lists and squeezes text", () => {
    expect(
      normalizeFilters({ price_min: 2_000_000, price_max: 500_000, body: ["suv", "saloon", "suv"], q: "  Pearl   WHITE " }),
    ).toEqual({ price_min: 500_000, price_max: 2_000_000, body: ["saloon", "suv"], q: "pearl white" });
  });

  it("treats a zero minimum price as no minimum", () => {
    expect(normalizeFilters({ price_min: 0 })).toEqual({});
  });

  it("gives the same search the same JSON whatever order it was built in", () => {
    const a = normalizeFilters({ county: "mombasa", make: "toyota", fuel: ["hybrid", "petrol"] });
    const b = normalizeFilters({ fuel: ["petrol", "hybrid"], make: "toyota", county: "mombasa" });
    expect(JSON.stringify(Object.entries(a).sort())).toBe(JSON.stringify(Object.entries(b).sort()));
  });
});

describe("searchHref", () => {
  it("puts make, model and county in the path and the rest in the query", () => {
    expect(
      searchHref(
        { make: "toyota", model: "vitz", county: "mombasa", price_max: 1_500_000, body: ["suv", "hatchback"] },
        { sort: "price_asc", page: 2 },
      ),
    ).toBe("/cars/toyota/vitz/in/mombasa?price_max=1500000&body=hatchback,suv&sort=price_asc&page=2");
  });

  it("leaves out defaults", () => {
    expect(searchHref({}, { sort: "newest", page: 1 })).toBe("/cars");
    expect(searchHref({ county: "nairobi" })).toBe("/cars/in/nairobi");
  });

  it("round-trips through parseSearch", () => {
    const filters = normalizeFilters({
      make: "nissan",
      county: "kiambu",
      price_min: 500_000,
      year_min: 2014,
      mileage_max: 100_000,
      transmission: ["automatic", "cvt"],
      condition: ["foreign_used"],
      q: "sunroof",
    });
    const href = searchHref(filters, { sort: "mileage_asc", page: 3 });
    const url = new URL(href, "https://example.com");
    const segments = url.pathname.split("/").slice(2);
    expect(parseSearch(segments, url.searchParams)).toMatchObject({ filters, sort: "mileage_asc", page: 3, valid: true });
  });

  it("encodes free text safely", () => {
    expect(searchHref({ q: "a&b=c" })).toBe("/cars?q=a%26b%3Dc");
  });
});

describe("describing searches", () => {
  it("writes page headings", () => {
    expect(searchHeading({}, {})).toBe("Cars for sale in Kenya");
    expect(searchHeading({ county: "mombasa" }, names)).toBe("Cars for sale in Mombasa");
    expect(searchHeading({ make: "toyota" }, names)).toBe("Toyota cars for sale in Kenya");
    expect(searchHeading({ make: "toyota", model: "corolla-axio", county: "mombasa" }, names)).toBe(
      "Toyota Corolla Axio for sale in Mombasa",
    );
  });

  it("names saved searches in plain words", () => {
    expect(
      describeSearch(
        { make: "toyota", model: "corolla-axio", price_min: 800_000, price_max: 1_250_000, year_min: 2015, mileage_max: 100_000, fuel: ["hybrid", "petrol"] },
        names,
      ),
    ).toBe("Toyota Corolla Axio, KSh 800K–1.25M, 2015 or newer, under 100,000 km, +1 more");
    expect(describeSearch({ make: "toyota", fuel: ["hybrid", "petrol"], county: "mombasa" }, names)).toBe(
      "Toyota, Petrol or Hybrid, in Mombasa",
    );
    expect(describeSearch({}, {})).toBe("All cars");
  });

  it("makes removable chips", () => {
    const chips = filterChips({ make: "toyota", model: "vitz", county: "mombasa", price_max: 1_000_000 }, names);
    expect(chips.map((c) => [c.label, c.removeHref])).toEqual([
      ["Toyota", "/cars/in/mombasa?price_max=1000000"],
      ["Corolla Axio", "/cars/toyota/in/mombasa?price_max=1000000"],
      ["in Mombasa", "/cars/toyota/vitz?price_max=1000000"],
      ["under KSh 1M", "/cars/toyota/vitz/in/mombasa"],
    ]);
  });

  it("counts filters and spots refinements", () => {
    expect(countActiveFilters({ make: "toyota", price_min: 1, price_max: 2, body: ["suv"] })).toBe(3);
    expect(hasRefinements({ make: "toyota", county: "mombasa" })).toBe(false);
    expect(hasRefinements({ make: "toyota", sort: undefined, price_max: 1_000_000 } as never)).toBe(true);
  });
});

describe("listing URLs", () => {
  it("adds the title for people and search engines", () => {
    expect(listingPath(ID, "2016 Toyota Corolla Axio")).toBe(`/listings/2016-toyota-corolla-axio-${ID}`);
    expect(listingPath(ID, "2019 Mercedes-Benz C200 (W205)")).toBe(`/listings/2019-mercedes-benz-c200-w205-${ID}`);
    expect(listingPath(ID, null)).toBe(`/listings/${ID}`);
  });

  it("finds the id with or without the title", () => {
    expect(listingIdFromSlug(`2016-toyota-corolla-axio-${ID}`)).toBe(ID);
    expect(listingIdFromSlug(ID.toUpperCase())).toBe(ID);
    expect(listingIdFromSlug("2016-toyota-corolla-axio")).toBeNull();
  });
});
