import type { MetadataRoute } from "next";
import { listingPath, searchHref } from "@cm/shared";
import { env } from "@/lib/env";
import { getVerifiedDealers } from "@/lib/dealers/public";
import { getFacets, getSitemapListings } from "@/lib/search/queries";

/**
 * Every page worth finding on Google: the landing page for each make, model and county
 * combination that has cars on it, verified dealers' showrooms, and every live listing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [facets, listings, dealers] = await Promise.all([getFacets(), getSitemapListings(), getVerifiedDealers()]);
  const url = (path: string) => new URL(path, env.siteUrl).toString();

  const landing = facets
    .filter((f) => f.listings > 0)
    .map((f) => ({
      url: url(
        searchHref({ make: f.makeSlug ?? undefined, model: f.modelSlug ?? undefined, county: f.countySlug ?? undefined }),
      ),
      changeFrequency: "daily" as const,
      priority: f.modelSlug ? 0.6 : 0.7,
    }));

  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/cars"), changeFrequency: "hourly", priority: 0.9 },
    ...landing,
    { url: url("/dealers"), changeFrequency: "weekly" as const, priority: 0.6 },
    ...dealers.map((d) => ({ url: url(`/dealers/${d.slug}`), changeFrequency: "daily" as const, priority: 0.6 })),
    ...listings.map((l) => ({
      url: url(listingPath(l.id, l.title)),
      lastModified: l.updatedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
