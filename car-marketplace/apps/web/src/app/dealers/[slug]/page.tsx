import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { formatKenyanPhone, searchHref } from "@cm/shared";
import { env } from "@/lib/env";
import { formatMonthYear } from "@/lib/format";
import { getPublicDealer, type PublicDealer } from "@/lib/dealers/public";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd, breadcrumbList } from "@/components/json-ld";
import { ListingGrid } from "@/components/listings/listing-card";
import { VerifiedDealerBadge } from "@/components/dealers/verified-badge";
import { buttonClass } from "@/components/ui/button";

export async function generateMetadata({ params }: PageProps<"/dealers/[slug]">): Promise<Metadata> {
  const dealer = await getPublicDealer((await params).slug);
  if (!dealer) return { title: "Dealer not found", robots: { index: false } };
  const where = [dealer.town, dealer.countyName].filter(Boolean).join(", ");
  return {
    title: `${dealer.name}: ${dealer.cards.length} cars for sale${where ? ` in ${where}` : ""}`,
    description:
      dealer.description?.slice(0, 160) ??
      `Verified car dealer${where ? ` in ${where}` : ""}. See every car in stock with its Vehicle Passport.`,
    alternates: { canonical: `/dealers/${dealer.slug}` },
  };
}

export default function DealerShowroomPage({ params }: PageProps<"/dealers/[slug]">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<div aria-hidden className="h-60 rounded-[var(--radius-control)] bg-mist/50" />}>
        <Showroom params={params} />
      </Suspense>
    </div>
  );
}

async function Showroom({ params }: Pick<PageProps<"/dealers/[slug]">, "params">) {
  const dealer = await getPublicDealer((await params).slug);
  if (!dealer) notFound();
  const crumbs = [
    { name: "Verified dealers", href: "/dealers" },
    { name: dealer.name, href: `/dealers/${dealer.slug}` },
  ];
  const where = [dealer.address, dealer.town, dealer.countyName].filter(Boolean).join(", ");
  const phone = dealer.phone ? formatKenyanPhone(dealer.phone) : null;
  const whatsapp = dealer.phone
    ? `https://wa.me/${dealer.phone.replace(/^\+/, "")}?text=${encodeURIComponent(`Hello ${dealer.name}, I saw your cars on ${env.appName}.`)}`
    : null;

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <header className="mt-4 flex flex-col gap-6 rounded-[var(--radius-control)] border border-mist bg-surface p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="display text-4xl sm:text-5xl">{dealer.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <VerifiedDealerBadge />
            {dealer.verifiedAt ? <span className="text-sm text-muted">Verified since {formatMonthYear(dealer.verifiedAt)}</span> : null}
          </div>
          <ul className="mt-4 flex flex-col gap-1.5 text-ink-soft">
            {where ? (
              <li className="flex gap-2">
                <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
                {where}
              </li>
            ) : null}
            {dealer.openingHours ? (
              <li className="flex gap-2">
                <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
                {dealer.openingHours}
              </li>
            ) : null}
          </ul>
          {dealer.description ? <p className="mt-4 max-w-[65ch] whitespace-pre-line text-ink-soft">{dealer.description}</p> : null}
        </div>
        {phone && (dealer.acceptsCalls || dealer.acceptsWhatsapp) ? (
          <div className="flex shrink-0 flex-col gap-2 lg:w-64">
            {dealer.acceptsCalls ? (
              <a href={`tel:${dealer.phone}`} className={buttonClass("primary", "lg")}>
                <Phone aria-hidden className="size-5" />
                Call {phone}
              </a>
            ) : null}
            {dealer.acceptsWhatsapp && whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonClass("secondary", "lg")}>
                <MessageCircle aria-hidden className="size-5" />
                WhatsApp
              </a>
            ) : null}
            <p className="text-sm text-muted">Or message about a specific car from its page.</p>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="stock-heading" className="mt-10">
        <h2 id="stock-heading" className="display text-3xl">
          {dealer.cards.length === 1 ? "1 car for sale" : `${dealer.cards.length} cars for sale`}
        </h2>
        <div className="mt-5">
          {dealer.cards.length ? <ListingGrid listings={dealer.cards} /> : <p className="text-muted">No cars on sale right now. Check back soon.</p>}
        </div>
        {dealer.countySlug ? (
          <p className="mt-8 text-sm text-muted">
            Looking for more?{" "}
            <a href={searchHref({ county: dealer.countySlug })} className="font-semibold text-forest underline-offset-4 hover:underline">
              All cars in {dealer.countyName}
            </a>
          </p>
        ) : null}
      </section>
      <JsonLd data={breadcrumbList(env.siteUrl, crumbs)} />
      <JsonLd data={dealerSchema(dealer)} />
    </>
  );
}

function dealerSchema(dealer: PublicDealer) {
  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: dealer.name,
    url: new URL(`/dealers/${dealer.slug}`, env.siteUrl).toString(),
    ...(dealer.phone ? { telephone: dealer.phone } : {}),
    ...(dealer.description ? { description: dealer.description } : {}),
    address: {
      "@type": "PostalAddress",
      ...(dealer.address ? { streetAddress: dealer.address } : {}),
      ...(dealer.town ? { addressLocality: dealer.town } : {}),
      ...(dealer.countyName ? { addressRegion: dealer.countyName } : {}),
      addressCountry: "KE",
    },
  };
}
