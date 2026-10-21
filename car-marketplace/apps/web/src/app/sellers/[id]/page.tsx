import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatMonthYear } from "@/lib/format";
import { getPublicSeller } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-card";

export async function generateMetadata({ params }: PageProps<"/sellers/[id]">): Promise<Metadata> {
  const { id } = await params;
  const seller = await getPublicSeller(id);
  return { title: seller?.fullName ? `Cars from ${seller.fullName}` : "Seller" };
}

export default function SellerPage({ params }: PageProps<"/sellers/[id]">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<div aria-hidden className="h-40 rounded-[var(--radius-control)] bg-mist/50" />}>
        <SellerContent params={params} />
      </Suspense>
    </div>
  );
}


async function SellerContent({ params }: Pick<PageProps<"/sellers/[id]">, "params">) {
  const { id } = await params;
  const seller = await getPublicSeller(id);
  if (!seller) notFound();

  return (
    <>
      <h1 className="display text-4xl sm:text-5xl">{seller.fullName ?? "Private seller"}</h1>
      <p className="mt-2 text-ink-soft">
        {[seller.countyName, `Selling since ${formatMonthYear(seller.memberSince)}`].filter(Boolean).join(". ")}
      </p>
      <h2 className="display mt-10 text-2xl">
        {seller.cards.length === 1 ? "1 car for sale" : `${seller.cards.length} cars for sale`}
      </h2>
      <div className="mt-5">
        {seller.cards.length > 0 ? (
          <ListingGrid listings={seller.cards} />
        ) : (
          <p className="text-muted">No cars on sale right now.</p>
        )}
      </div>
    </>
  );
}
