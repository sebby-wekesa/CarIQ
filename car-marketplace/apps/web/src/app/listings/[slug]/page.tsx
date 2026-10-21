import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FEATURES, formatKes, labelFor, listingIdFromSlug, listingPath, searchHref } from "@cm/shared";
import { env } from "@/lib/env";
import { formatMonthYear } from "@/lib/format";
import { getPublicListing, type ListingOverview } from "@/lib/listings/queries";
import { photoUrl } from "@/lib/storage";
import { getSimilarListings } from "@/lib/search/queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SafetyNote } from "@/components/chat/safety-note";
import { FavouriteButton } from "@/components/buyer/favourite-button";
import { JsonLd, breadcrumbList } from "@/components/json-ld";
import { Gallery } from "@/components/listings/gallery";
import { ContactCard } from "@/components/listings/contact-card";
import { ListingGrid } from "@/components/listings/listing-card";
import { PassportPanel } from "@/components/listings/passport-panel";
import { ViewBeacon } from "@/components/listings/view-beacon";
import { VerifiedDealerBadge } from "@/components/dealers/verified-badge";

export async function generateMetadata({ params }: PageProps<"/listings/[slug]">): Promise<Metadata> {
  const id = listingIdFromSlug((await params).slug);
  const data = id ? await getPublicListing(id) : null;
  if (!id || !data) return { title: "Car not found", robots: { index: false } };
  const { listing, photos } = data;
  const price = listing.price_kes ? formatKes(listing.price_kes) : "";
  const cover = photoUrl(photos[0]?.storage_path);
  return {
    title: `${listing.title} for sale${listing.county_name ? ` in ${listing.county_name}` : ""}`,
    description: [price, listing.mileage_km != null ? `${listing.mileage_km.toLocaleString("en-KE")} km` : null, listing.description?.slice(0, 120)]
      .filter(Boolean)
      .join(". "),
    alternates: { canonical: listingPath(id, listing.title) },
    openGraph: cover ? { images: [{ url: cover }] } : undefined,
  };
}

export default function ListingPage({ params }: PageProps<"/listings/[slug]">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<ListingPlaceholder />}>
        <ListingContent params={params} />
      </Suspense>
    </div>
  );
}

const km = new Intl.NumberFormat("en-KE");

async function ListingContent({ params }: Pick<PageProps<"/listings/[slug]">, "params">) {
  const id = listingIdFromSlug((await params).slug);
  const data = id ? await getPublicListing(id) : null;
  if (!id || !data) notFound();
  const { listing, photos, passport } = data;
  const contact = {
    listingId: id,
    sellerId: listing.seller_id,
    // Buyers deal with the dealership, not the salesperson who listed the car.
    sellerFirstName: listing.dealer_name ?? listing.seller_name?.split(/\s+/)[0] ?? "there",
    title: listing.title ?? "car",
    acceptsCalls: Boolean(listing.seller_accepts_calls),
    acceptsWhatsapp: Boolean(listing.seller_accepts_whatsapp),
    appName: env.appName,
    listingUrl: new URL(listingPath(id, listing.title), env.siteUrl).toString(),
  };
  const crumbs = [
    { name: "Cars for sale", href: "/cars" },
    ...(listing.make_slug ? [{ name: listing.make_name ?? "", href: searchHref({ make: listing.make_slug }) }] : []),
    ...(listing.make_slug && listing.model_slug
      ? [{ name: listing.model_name ?? "", href: searchHref({ make: listing.make_slug, model: listing.model_slug }) }]
      : []),
    { name: listing.title ?? "Car", href: listingPath(id, listing.title) },
  ];

  const gallery = photos.map((p) => ({
    id: p.id,
    url: photoUrl(p.storage_path) ?? "",
    thumbUrl: photoUrl(p.thumb_path ?? p.storage_path) ?? "",
    width: p.width,
    height: p.height,
  }));
  const featureLabels = FEATURES.filter((f) => listing.features?.includes(f.key)).map((f) => f.label);
  const specs: [string, string | null][] = [
    ["Condition", listing.condition ? labelFor(listing.condition) : null],
    ["Year", listing.year ? String(listing.year) : null],
    ["Mileage", listing.mileage_km != null ? `${km.format(listing.mileage_km)} km` : null],
    ["Gearbox", listing.transmission ? labelFor(listing.transmission) : null],
    ["Fuel", listing.fuel_type ? labelFor(listing.fuel_type) : null],
    ["Body", listing.body_type ? labelFor(listing.body_type) : null],
    ["Engine", listing.engine_cc ? `${km.format(listing.engine_cc)} cc` : null],
    ["Drive", listing.drivetrain ? labelFor(listing.drivetrain) : null],
    ["Colour", listing.colour],
    ["Location", [listing.town, listing.county_name].filter(Boolean).join(", ") || null],
  ];

  return (
    <>
    <Breadcrumbs items={crumbs} />
    <article className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-8">
        <Gallery photos={gallery} title={listing.title ?? "car"} />

        <header className="flex flex-col gap-4 lg:hidden">
          <div>
            <TitleBlock title={listing.title} price={listing.price_kes} negotiable={listing.negotiable} />
          </div>
          <ContactCard {...contact} />
          <FavouriteButton listingId={id} title={listing.title ?? "this car"} variant="full" />
        </header>

        <section aria-labelledby="specs-heading">
          <h2 id="specs-heading" className="display text-2xl">
            Details
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {specs
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
          </dl>
        </section>

        <PassportPanel passport={passport} />

        {listing.description ? (
          <section aria-labelledby="description-heading">
            <h2 id="description-heading" className="display text-2xl">
              From the seller
            </h2>
            <p className="mt-3 max-w-[65ch] whitespace-pre-line text-ink-soft">{listing.description}</p>
          </section>
        ) : null}

        {featureLabels.length > 0 ? (
          <section aria-labelledby="features-heading">
            <h2 id="features-heading" className="display text-2xl">
              Features
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {featureLabels.map((label) => (
                <li key={label} className="rounded-full border border-mist bg-surface px-3.5 py-1.5 text-sm font-medium">
                  {label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <div className="hidden lg:block">
          <TitleBlock title={listing.title} price={listing.price_kes} negotiable={listing.negotiable} />
        </div>
        <div className="hidden lg:block">
          <FavouriteButton listingId={id} title={listing.title ?? "this car"} variant="full" />
        </div>
        <div className="rounded-[var(--radius-control)] border border-mist bg-surface p-5">
          <p className="text-sm text-muted">Sold by</p>
          {listing.dealer_name ? (
            <>
              <p className="mt-0.5 text-lg font-semibold">{listing.dealer_name}</p>
              {listing.dealer_verified ? <VerifiedDealerBadge size="sm" className="mt-1" /> : null}
              {listing.dealer_verified ? (
                <p className="mt-2 text-sm text-muted">We&apos;ve checked this dealer&apos;s KRA PIN and business registration.</p>
              ) : null}
              {listing.dealer_slug && listing.dealer_verified ? (
                <Link
                  href={`/dealers/${listing.dealer_slug}`}
                  className="mt-3 inline-block text-sm font-semibold text-forest underline-offset-4 hover:underline"
                >
                  Visit the showroom
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-0.5 text-lg font-semibold">{listing.seller_name ?? "Private seller"}</p>
              {listing.seller_since ? (
                <p className="text-sm text-muted">On {env.appName} since {formatMonthYear(listing.seller_since)}</p>
              ) : null}
              {listing.seller_id ? (
                <Link
                  href={`/sellers/${listing.seller_id}`}
                  className="mt-3 inline-block text-sm font-semibold text-forest underline-offset-4 hover:underline"
                >
                  More cars from this seller
                </Link>
              ) : null}
            </>
          )}
          <div className="mt-4 hidden lg:block">
            <ContactCard {...contact} />
          </div>
        </div>
        <SafetyNote compact />
      </aside>
    </article>

    <Suspense fallback={null}>
      <SimilarCars listing={listing} id={id} />
    </Suspense>
    <ViewBeacon listingId={id} />
    <JsonLd data={breadcrumbList(env.siteUrl, crumbs)} />
    <JsonLd data={carSchema(listing, id, photos[0]?.storage_path)} />
    </>
  );
}

async function SimilarCars({ listing, id }: { listing: ListingOverview; id: string }) {
  const similar = await getSimilarListings({ id, make_slug: listing.make_slug, model_slug: listing.model_slug, body_type: listing.body_type });
  if (similar.length === 0) return null;
  const moreHref = listing.make_slug ? searchHref({ make: listing.make_slug }) : "/cars";
  return (
    <section aria-labelledby="similar-heading" className="mt-14 border-t border-mist pt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="similar-heading" className="display text-3xl">
          Similar cars
        </h2>
        <Link href={moreHref} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          More {listing.make_name ?? ""} cars
        </Link>
      </div>
      <div className="mt-6">
        <ListingGrid listings={similar} />
      </div>
    </section>
  );
}

/** schema.org Car with its offer: lets search engines show price and mileage in results. */
function carSchema(listing: ListingOverview, id: string, coverPath: string | undefined) {
  const url = new URL(listingPath(id, listing.title), env.siteUrl).toString();
  const image = photoUrl(coverPath);
  return {
    "@context": "https://schema.org",
    "@type": "Car",
    name: listing.title,
    url,
    ...(image ? { image } : {}),
    brand: { "@type": "Brand", name: listing.make_name },
    model: listing.model_name,
    vehicleModelDate: listing.year ? String(listing.year) : undefined,
    mileageFromOdometer:
      listing.mileage_km != null ? { "@type": "QuantitativeValue", value: listing.mileage_km, unitCode: "KMT" } : undefined,
    fuelType: listing.fuel_type ? labelFor(listing.fuel_type) : undefined,
    vehicleTransmission: listing.transmission ? labelFor(listing.transmission) : undefined,
    bodyType: listing.body_type ? labelFor(listing.body_type) : undefined,
    color: listing.colour ?? undefined,
    itemCondition:
      listing.condition === "new" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      price: listing.price_kes,
      priceCurrency: "KES",
      availability: "https://schema.org/InStock",
      url,
      areaServed: listing.county_name ?? undefined,
      ...(listing.dealer_name && listing.dealer_slug
        ? { seller: { "@type": "AutoDealer", name: listing.dealer_name, url: new URL(`/dealers/${listing.dealer_slug}`, env.siteUrl).toString() } }
        : {}),
    },
  };
}

function TitleBlock({ title, price, negotiable }: { title: string | null; price: number | null; negotiable: boolean | null }) {
  return (
    <>
      <h1 className="display text-4xl sm:text-5xl">{title}</h1>
      <p className="display mt-3 text-4xl text-forest">{price ? formatKes(price) : "Price on request"}</p>
      {negotiable ? <p className="mt-1 text-sm text-muted">Negotiable</p> : null}
    </>
  );
}

function ListingPlaceholder() {
  return (
    <div aria-hidden className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="aspect-[4/3] rounded-[var(--radius-control)] bg-mist/60" />
      <div className="flex flex-col gap-3">
        <div className="h-12 rounded bg-mist" />
        <div className="h-10 w-1/2 rounded bg-mist/70" />
      </div>
    </div>
  );
}
