import Link from "next/link";
import { BadgeCheck, Car } from "lucide-react";
import { formatKesShort, labelFor, listingPath } from "@cm/shared";
import { photoUrl } from "@/lib/storage";
import type { ListingCardData } from "@/lib/listings/queries";
import { FavouriteButton } from "@/components/buyer/favourite-button";

const km = new Intl.NumberFormat("en-KE");

type CardProps = {
  listing: ListingCardData;
  /** Listed since the buyer last looked at this saved search. */
  isNew?: boolean;
  /** Shown instead of the link when the car is no longer on sale (saved cars). */
  unavailable?: string | null;
  refreshOnChange?: boolean;
};

export function ListingCard({ listing, isNew, unavailable, refreshOnChange }: CardProps) {
  if (!listing.id) return null;
  const id = listing.id;
  const thumb = photoUrl(listing.cover_thumb_path);
  const title = listing.title ?? "Car";
  const featured = Boolean(listing.featured_until && Date.parse(listing.featured_until) > Date.now());
  const boosted = Boolean(listing.boosted_until && Date.parse(listing.boosted_until) > Date.now());
  const body = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-[#e9eee9]">
        {thumb ? (
          // Already resized and compressed on upload; a plain img avoids optimising twice.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className={unavailable ? "size-full object-cover opacity-50 grayscale" : "size-full object-cover"} />
        ) : (
          <div aria-hidden className="grid size-full place-items-center bg-[radial-gradient(ellipse_at_50%_0%,#f7f9f6_0%,#e7ece7_72%)] text-forest/40">
            <Car className="size-12" strokeWidth={1.2} />
          </div>
        )}
        {listing.photo_count ? (
          <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-semibold text-white">
            {listing.photo_count === 1 ? "1 photo" : `${listing.photo_count} photos`}
          </span>
        ) : null}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {unavailable ? (
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{unavailable}</span>
          ) : (
            <>
              {featured ? <span className="rounded-full bg-plate px-2.5 py-0.5 text-xs font-bold text-ink">Featured</span> : null}
              {boosted ? <span className="rounded-full bg-forest px-2.5 py-0.5 text-xs font-bold text-white">Boosted</span> : null}
              {isNew ? <span className="rounded-full bg-plate px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-ink">New</span> : null}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 min-h-[2.8rem] font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-4">{title}</h3>
        <p className="display text-2xl">{listing.price_kes ? formatKesShort(listing.price_kes) : "Price on request"}</p>
        <p className="mt-auto text-sm text-muted">
          {listing.mileage_km != null ? `${km.format(listing.mileage_km)} km` : null}
          {listing.transmission ? <span className="ml-3">{labelFor(listing.transmission)}</span> : null}
        </p>
        <p className="text-sm text-muted">{[listing.town, listing.county_name].filter(Boolean).join(", ")}</p>
        {listing.dealer_name ? (
          <p className="flex items-center gap-1 truncate text-sm font-semibold text-forest">
            {listing.dealer_verified ? <BadgeCheck aria-label="Verified dealer" className="size-4 shrink-0" /> : null}
            <span className="truncate">{listing.dealer_name}</span>
          </p>
        ) : null}
      </div>
    </>
  );

  const frame = "group flex w-full flex-col overflow-hidden rounded-2xl border border-mist/90 bg-surface transition-all duration-200";
  return (
    <div className="relative flex w-full">
      {unavailable ? (
        <div className={frame}>{body}</div>
      ) : (
        <Link href={listingPath(id, listing.title)} className={`${frame} hover:-translate-y-0.5 hover:border-forest/35 hover:shadow-[0_16px_36px_-22px_rgba(16,35,28,0.45)]`}>
          {body}
        </Link>
      )}
      <div className="absolute right-2 top-2">
        <FavouriteButton listingId={id} title={title} refreshOnChange={refreshOnChange} />
      </div>
    </div>
  );
}

type GridProps = {
  listings: ListingCardData[];
  /** Cars published after this moment get a "New" badge. */
  newSince?: string | null;
  /** Next to a filter sidebar: one column fewer on wide screens. */
  narrow?: boolean;
};

export function ListingGrid({ listings, newSince, narrow }: GridProps) {
  const since = newSince ? Date.parse(newSince) : NaN;
  return (
    <ul
      className={
        narrow
          ? "grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3"
          : "grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      }
    >
      {listings.map((listing) => (
        <li key={listing.id} className="flex">
          <ListingCard
            listing={listing}
            isNew={Number.isFinite(since) && listing.published_at != null && Date.parse(listing.published_at) > since}
          />
        </li>
      ))}
    </ul>
  );
}
