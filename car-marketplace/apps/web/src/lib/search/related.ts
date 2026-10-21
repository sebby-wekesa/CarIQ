import { searchHref, type SearchFilters } from "@cm/shared";
import type { Facet } from "./queries";

export type Section = { heading: string; links: { label: string; href: string; count: number }[] };

/**
 * "Popular Toyota models", "Cars by county" and similar: internal links between landing pages
 * that have cars on them, which is how buyers browse sideways and how Google finds every page.
 */
export function relatedSections(facets: Facet[], filters: SearchFilters, names: { make?: string; county?: string }): Section[] {
  const { make, model, county } = filters;
  const top = (rows: Facet[], n = 12) => [...rows].sort((a, b) => b.listings - a.listings).slice(0, n);
  const sections: Section[] = [];

  const makesWhere = (countySlug: string | null) =>
    facets.filter((f) => f.makeSlug && !f.modelSlug && f.countySlug === countySlug);
  const modelsOf = (makeSlug: string, countySlug: string | null) =>
    facets.filter((f) => f.makeSlug === makeSlug && f.modelSlug && f.countySlug === countySlug);
  const countiesFor = (makeSlug: string | null, modelSlug: string | null) =>
    facets.filter((f) => f.countySlug && f.makeSlug === makeSlug && f.modelSlug === modelSlug);

  if (make) {
    const models = top(modelsOf(make, county ?? null).filter((f) => f.modelSlug !== model));
    if (models.length) {
      sections.push({
        heading: `${model ? "Other " : "Popular "}${names.make ?? make} models${county ? ` in ${names.county ?? county}` : ""}`,
        links: models.map((f) => ({
          label: `${f.makeName} ${f.modelName}`,
          href: searchHref({ make, model: f.modelSlug ?? undefined, county }),
          count: f.listings,
        })),
      });
    }
    if (!county) {
      const counties = top(countiesFor(make, model ?? null));
      if (counties.length) {
        sections.push({
          heading: `${names.make ?? make}${model ? "" : " cars"} by county`,
          links: counties.map((f) => ({
            label: f.countyName ?? "",
            href: searchHref({ make, model, county: f.countySlug ?? undefined }),
            count: f.listings,
          })),
        });
      }
    }
  }

  if (!make || county) {
    const makes = top(makesWhere(county ?? null).filter((f) => f.makeSlug !== make));
    if (makes.length) {
      sections.push({
        heading: `${make ? "Other makes" : "Popular makes"}${county ? ` in ${names.county ?? county}` : ""}`,
        links: makes.map((f) => ({ label: f.makeName ?? "", href: searchHref({ make: f.makeSlug ?? undefined, county }), count: f.listings })),
      });
    }
  }

  if (!make && !county) {
    const counties = top(countiesFor(null, null), 47);
    if (counties.length) {
      sections.push({
        heading: "Cars by county",
        links: counties.map((f) => ({ label: f.countyName ?? "", href: searchHref({ county: f.countySlug ?? undefined }), count: f.listings })),
      });
    }
  }
  return sections;
}

