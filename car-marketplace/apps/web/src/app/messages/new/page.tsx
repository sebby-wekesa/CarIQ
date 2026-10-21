import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { formatKesShort, listingPath } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { getMyDealers } from "@/lib/dealers/queries";
import { getPublicListing } from "@/lib/listings/queries";
import { photoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { SafetyNote } from "@/components/chat/safety-note";
import { ButtonLink } from "@/components/ui/button";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Message the seller", robots: { index: false } };

export default function NewMessagePage({ searchParams }: PageProps<"/messages/new">) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<div aria-hidden className="h-96 rounded-[var(--radius-control)] bg-mist/40" />}>
        <NewMessage searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewMessage({ searchParams }: Pick<PageProps<"/messages/new">, "searchParams">) {
  const raw = (await searchParams).listing;
  const listingId = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const user = await requireUser(`/messages/new?listing=${encodeURIComponent(listingId)}`);
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) notFound();

  // Already talking about this car: carry on in that chat.
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (existing) redirect(`/messages/${existing.id}`);

  const data = await getPublicListing(listingId);
  if (!data) {
    return (
      <>
        <h1 className="display text-4xl">This car is no longer for sale.</h1>
        <ButtonLink href="/cars" className="mt-6">
          Browse other cars
        </ButtonLink>
      </>
    );
  }
  const { listing } = data;
  const ownDealer = listing.dealer_id ? (await getMyDealers()).some((d) => d.id === listing.dealer_id) : false;
  if (listing.seller_id === user.id || ownDealer) {
    return (
      <>
        <h1 className="display text-4xl">This is your listing.</h1>
        <p className="mt-3 text-ink-soft">Buyers&apos; messages about it arrive in Messages.</p>
        <ButtonLink href="/messages" className="mt-6">
          Open messages
        </ButtonLink>
      </>
    );
  }

  const thumb = photoUrl(listing.cover_thumb_path);
  const seller = listing.dealer_name ?? listing.seller_name?.split(/\s+/)[0] ?? "the seller";
  return (
    <>
      <h1 className="display text-4xl sm:text-5xl">Message {seller}</h1>
      <a href={listingPath(listingId, listing.title)} className="mt-5 flex items-center gap-3 rounded-[var(--radius-control)] border border-mist bg-surface p-3 hover:border-ink/30">
        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-mist/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- already a small thumbnail */}
          {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{listing.title}</p>
          <p className="text-sm text-muted">
            {listing.price_kes ? formatKesShort(listing.price_kes) : ""}
            {listing.county_name ? ` · ${listing.county_name}` : ""}
          </p>
        </div>
      </a>
      <StartForm listingId={listingId} sellerName={seller} />
      <SafetyNote className="mt-6" />
    </>
  );
}
