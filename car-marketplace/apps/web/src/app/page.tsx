import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeCheck, Car, MapPin, ShieldCheck } from "lucide-react";
import { searchHref } from "@cm/shared";
import { getCurrentUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/catalogue";
import { getLatestListings } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-card";
import { QuickSearch } from "@/components/search/quick-search";
import { ButtonLink } from "@/components/ui/button";

export default function HomePage() {
  return (
    <>
      <section className="home-hero relative overflow-hidden bg-ink text-white">
        <div aria-hidden className="home-hero-surface absolute inset-0" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-9 sm:px-6 sm:pb-16 sm:pt-12 lg:pb-20 lg:pt-16">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-12">
            <div className="max-w-xl">
              <p className="home-kicker">
                <span aria-hidden className="home-kicker-dot" />
                A better way to buy in Kenya
              </p>
              <h1 className="display mt-5 max-w-[11ch] text-[clamp(3.25rem,7.4vw,6.25rem)] leading-[0.88] tracking-[-0.045em] text-white">
                Find the car. Know the story.
              </h1>
              <p className="mt-6 max-w-[48ch] text-base leading-relaxed text-white/75 sm:text-lg">
                Explore cars from private sellers and verified dealers. See the asking price, mileage, location and
                seller before you start a conversation.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <ButtonLink href="/cars" size="lg" variant="plate" className="shadow-sm">
                  Explore cars <ArrowRight aria-hidden className="size-5" />
                </ButtonLink>
                <Link href="/sell" className="home-hero-secondary-link">
                  Sell your car
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/65">
                <span className="inline-flex items-center gap-2">
                  <MapPin aria-hidden className="size-4 text-plate" />
                  Mombasa and Nairobi
                </span>
                <span className="hidden h-4 w-px bg-white/20 sm:block" aria-hidden />
                <span>Private sellers and verified dealers</span>
              </div>
            </div>

            <div className="home-hero-visual relative isolate min-h-[18rem] overflow-hidden rounded-2xl sm:min-h-[25rem] lg:min-h-[31rem]">
              <Image
                src="/cariq-coastal-suv.webp"
                alt="Deep green SUV on a palm-lined coastal road near Mombasa"
                fill
                preload
                sizes="(max-width: 1023px) 100vw, 56vw"
                className="home-hero-image object-cover"
              />
              <div aria-hidden className="home-hero-image-shade absolute inset-0" />
              <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
                <span className="inline-flex min-h-9 items-center rounded-full bg-plate px-3.5 text-xs font-bold uppercase tracking-[0.12em] text-ink shadow-sm">
                  Made for Kenyan roads
                </span>
              </div>
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-4 sm:inset-x-6 sm:bottom-6">
                <div className="max-w-[25rem] rounded-xl border border-white/20 bg-ink/60 px-4 py-3 text-white shadow-lg backdrop-blur-md sm:px-5 sm:py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-plate">Local from the start</p>
                  <p className="mt-1 text-sm font-semibold leading-snug sm:text-base">
                    Your next car could be just around the corner.
                  </p>
                </div>
                <span aria-hidden className="home-hero-mark hidden sm:grid">CIQ</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-8 max-w-5xl lg:mt-10">
            <div className="home-search-card overflow-hidden rounded-2xl border border-white/70 bg-surface">
              <nav aria-label="Choose what to do" className="home-search-tabs flex items-center gap-1 border-b border-mist/80 px-3 pt-2 sm:px-5">
                <Link href="/cars" className="home-search-tab home-search-tab-active">
                  Find a car
                </Link>
                <Link href="/sell" className="home-search-tab">
                  Sell a car
                </Link>
              </nav>
              <div className="p-4 sm:p-5">
                <Suspense fallback={<div className="h-13 rounded-[var(--radius-control)] bg-mist/50" aria-hidden />}>
                  <HeroSearch />
                </Suspense>
              </div>
            </div>
            <Suspense fallback={<div className="mt-4 h-6" aria-hidden />}>
              <HeroAction />
            </Suspense>
          </div>
        </div>
      </section>

      <section aria-labelledby="listings-heading" className="bg-paper">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <Suspense fallback={<div aria-hidden className="h-64 rounded-2xl bg-mist/40" />}>
            <LatestListings />
          </Suspense>
        </div>
      </section>

      <CatalogueSection />
      <ConfidenceSection />
      <SellerCallout />
    </>
  );
}

async function HeroSearch() {
  const catalogue = await getCatalogue();
  const makes = (catalogue?.makes ?? []).map((m) => ({ slug: m.slug, name: m.name, isPopular: m.isPopular }));
  return <QuickSearch makes={makes} />;
}

async function HeroAction() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <p className="home-seller-note">
        Selling a car? <Link href="/login">Start with your phone</Link> and a 6-digit code.
      </p>
    );
  }

  if (user.needsProfile) {
    return (
      <p className="home-seller-note">
        Almost ready to sell? <Link href="/account">Finish your profile</Link> so buyers know who they are meeting.
      </p>
    );
  }

  return (
    <p className="home-seller-note">
      Ready to sell, {user.fullName}? <Link href="/sell/new">List your car</Link> in a few minutes.
    </p>
  );
}

async function LatestListings() {
  const latest = await getLatestListings(12);
  const total = latest?.total ?? 0;
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-kicker">Fresh from local sellers</p>
          <h2 id="listings-heading" className="display mt-2 text-3xl tracking-[-0.035em] sm:text-4xl">
            Latest cars
          </h2>
          {total > 0 ? <p className="mt-2 text-muted">{total.toLocaleString("en-KE")} cars to explore</p> : null}
        </div>
        <Link href="/cars" className="section-arrow-link">
          Browse all cars <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {latest === null ? (
        <ListingsUnavailable />
      ) : latest.cards.length > 0 ? (
        <div className="mt-7">
          <ListingGrid listings={latest.cards} />
        </div>
      ) : (
        <EmptyListings />
      )}
    </>
  );
}

function ListingsUnavailable() {
  return (
    <div role="status" className="mt-7 flex flex-col gap-3 rounded-2xl border border-mist bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <h3 className="font-semibold text-ink">Cars aren’t loading right now.</h3>
        <p className="mt-1 text-sm text-muted">Try the inventory again in a minute.</p>
      </div>
      <Link href="/cars" className="section-arrow-link self-start sm:self-auto">
        Open car search <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

function EmptyListings() {
  return (
    <div className="home-empty-listings mt-7 grid gap-5 rounded-2xl border border-mist bg-surface p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-7 sm:p-7">
      <div aria-hidden className="grid size-16 place-items-center rounded-2xl bg-plate-soft text-forest">
        <Car className="size-8" strokeWidth={1.8} />
      </div>
      <div>
        <h3 className="display text-2xl tracking-[-0.025em]">The first cars are on their way.</h3>
        <p className="mt-1 max-w-[58ch] text-sm leading-relaxed text-muted sm:text-base">
          We’re opening in Mombasa and Nairobi. If you’re ready to sell, your listing can help someone find their next
          car.
        </p>
      </div>
      <ButtonLink href="/sell" variant="secondary" className="sm:justify-self-end">
        List a car <ArrowRight aria-hidden className="size-4" />
      </ButtonLink>
    </div>
  );
}

async function CatalogueSection() {
  const catalogue = await getCatalogue();
  if (!catalogue || catalogue.makes.length === 0) return null;

  const popular = catalogue.makes.filter((make) => make.isPopular);
  const others = catalogue.makes.length - popular.length;

  return (
    <section aria-labelledby="catalogue-heading" className="border-y border-mist bg-surface">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="section-kicker">Browse the catalogue</p>
          <h2 id="catalogue-heading" className="display mt-2 text-3xl tracking-[-0.035em] sm:text-4xl">
            Start with a make you know.
          </h2>
          <p className="mt-3 text-muted">
            {catalogue.makes.length} makes and {catalogue.models.length} models, from the Toyota Vitz to the Scania
            R-Series. Pick yours from a list instead of typing it out.
          </p>
        </div>
        <ul className="mt-7 flex flex-wrap gap-2.5" aria-label="Popular makes">
          {popular.map((make) => (
            <li key={make.slug}>
              <Link href={searchHref({ make: make.slug })} className="make-chip">
                {make.name} <ArrowRight aria-hidden className="size-3.5 opacity-45" />
              </Link>
            </li>
          ))}
          {others > 0 ? <li className="self-center px-2 text-sm text-muted">and {others} more</li> : null}
        </ul>
      </div>
    </section>
  );
}

function ConfidenceSection() {
  return (
    <section aria-labelledby="confidence-heading" className="bg-paper">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="section-kicker">A clearer way to buy</p>
          <h2 id="confidence-heading" className="display mt-2 text-3xl tracking-[-0.035em] sm:text-4xl">
            The useful details come first.
          </h2>
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          <article className="confidence-card">
            <div className="confidence-icon"><Car aria-hidden className="size-5" /></div>
            <h3>See the car clearly</h3>
            <p>Price, mileage, location and key specifications are easy to compare.</p>
          </article>
          <article className="confidence-card">
            <div className="confidence-icon"><BadgeCheck aria-hidden className="size-5" /></div>
            <h3>Know who is selling</h3>
            <p>Browse private listings and verified dealers, with seller details shown up front.</p>
          </article>
          <article className="confidence-card">
            <div className="confidence-icon"><ShieldCheck aria-hidden className="size-5" /></div>
            <h3>Make the first meeting count</h3>
            <p>See the car and its logbook before you pay. Take the time to check both.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

function SellerCallout() {
  return (
    <section aria-labelledby="seller-callout-heading" className="home-seller-callout bg-forest-deep text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-12 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="home-kicker"><span aria-hidden className="home-kicker-dot" /> For sellers</p>
          <h2 id="seller-callout-heading" className="display mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
            Ready for your car’s next owner?
          </h2>
          <p className="mt-2 max-w-[56ch] text-white/70">Create a clear listing and start talking with local buyers.</p>
        </div>
        <ButtonLink href="/sell" variant="plate" size="lg" className="shrink-0">
          Sell your car <ArrowRight aria-hidden className="size-5" />
        </ButtonLink>
      </div>
    </section>
  );
}
