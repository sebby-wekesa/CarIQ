import { describe, expect, it } from "vitest";
import { filtersKey } from "../buyer/state";
import { pageNumbers } from "./paging";
import { relatedSections } from "./related";
import type { Facet } from "./queries";

describe("pageNumbers", () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 2, 3]],
    [1, 10, [1, 2, null, 10]],
    [5, 10, [1, null, 4, 5, 6, null, 10]],
    [3, 10, [1, 2, 3, 4, null, 10]],
    [10, 10, [1, null, 9, 10]],
  ])("page %i of %i", (page, pages, expected) => {
    expect(pageNumbers(page, pages)).toEqual(expected);
  });
});

describe("filtersKey", () => {
  it("ignores key order so a saved search is recognised however it was built", () => {
    expect(filtersKey({ make: "toyota", county: "mombasa", price_max: 1500000 })).toBe(
      filtersKey({ price_max: 1500000, county: "mombasa", make: "toyota" }),
    );
  });

  it("ignores undefined values", () => {
    expect(filtersKey({ make: "toyota", model: undefined })).toBe(filtersKey({ make: "toyota" }));
  });
});

const facet = (make: string | null, model: string | null, county: string | null, listings: number): Facet => ({
  makeSlug: make,
  makeName: make ? make[0]!.toUpperCase() + make.slice(1) : null,
  modelSlug: model,
  modelName: model ? model.toUpperCase() : null,
  countySlug: county,
  countyName: county ? county[0]!.toUpperCase() + county.slice(1) : null,
  listings,
  minPrice: 500000,
  maxPrice: 900000,
});

const facets = [
  facet("toyota", null, null, 5),
  facet("mazda", null, null, 2),
  facet("toyota", "vitz", null, 3),
  facet("toyota", "axio", null, 2),
  facet(null, null, "mombasa", 6),
  facet(null, null, "nairobi", 1),
  facet("toyota", null, "mombasa", 4),
  facet("toyota", null, "nairobi", 1),
  facet("mazda", null, "mombasa", 2),
  facet("toyota", "vitz", "mombasa", 3),
  facet("toyota", "axio", "mombasa", 1),
  facet("toyota", "axio", "nairobi", 1),
];

describe("relatedSections", () => {
  it("links the all-cars page to makes and counties", () => {
    const sections = relatedSections(facets, {}, {});
    expect(sections.map((s) => s.heading)).toEqual(["Popular makes", "Cars by county"]);
    expect(sections[0]!.links.map((l) => [l.href, l.count])).toEqual([
      ["/cars/toyota", 5],
      ["/cars/mazda", 2],
    ]);
  });

  it("links a make page to its models and counties", () => {
    const sections = relatedSections(facets, { make: "toyota" }, { make: "Toyota" });
    expect(sections.map((s) => s.heading)).toEqual(["Popular Toyota models", "Toyota cars by county"]);
    expect(sections[1]!.links.map((l) => l.href)).toEqual(["/cars/toyota/in/mombasa", "/cars/toyota/in/nairobi"]);
  });

  it("links a make-in-county page to its models there and other makes there", () => {
    const sections = relatedSections(facets, { make: "toyota", county: "mombasa" }, { make: "Toyota", county: "Mombasa" });
    expect(sections.map((s) => s.heading)).toEqual(["Popular Toyota models in Mombasa", "Other makes in Mombasa"]);
    expect(sections[0]!.links.map((l) => l.href)).toEqual(["/cars/toyota/vitz/in/mombasa", "/cars/toyota/axio/in/mombasa"]);
    expect(sections[1]!.links.map((l) => l.href)).toEqual(["/cars/mazda/in/mombasa"]);
  });

  it("does not link a model page to itself", () => {
    const sections = relatedSections(facets, { make: "toyota", model: "axio" }, { make: "Toyota" });
    expect(sections[0]!.heading).toBe("Other Toyota models");
    expect(sections[0]!.links.map((l) => l.href)).toEqual(["/cars/toyota/vitz"]);
    expect(sections[1]!.links.map((l) => l.href)).toEqual(["/cars/toyota/axio/in/mombasa", "/cars/toyota/axio/in/nairobi"]);
  });
});
