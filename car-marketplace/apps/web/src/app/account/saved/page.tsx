import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ListingCard } from "@/components/listings/listing-card";
import { ButtonLink } from "@/components/ui/button";
import { SavedTabs } from "./saved-tabs";

export const metadata: Metadata = { title: "Saved cars", robots: { index: false } };

export default function SavedCarsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Saved</h1>
      <SavedTabs active="cars" />
      <Suspense fallback={<div aria-hidden className="mt-8 h-64 rounded-[var(--radius-control)] bg-mist/40" />}>
        <SavedCars />
      </Suspense>
    </div>
  );
}

async function SavedCars() {
  await requireUser("/account/saved");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_favourites");
  if (error) {
    console.error("[saved] my_favourites failed", error);
    return (
      <p role="alert" className="mt-8 rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-danger">
        We can&apos;t load your saved cars right now. Try again in a minute.
      </p>
    );
  }
  const cars = data ?? [];

  if (cars.length === 0) {
    return (
      <div className="mt-8 rounded-[var(--radius-control)] border-2 border-dashed border-mist p-6 sm:p-8">
        <p className="text-xl font-semibold">No saved cars yet.</p>
        <p className="mt-1 max-w-[52ch] text-muted">
          Tap the heart on any car to keep it here. You&apos;ll see straight away if it sells.
        </p>
        <ButtonLink href="/cars" className="mt-5">
          Browse cars
        </ButtonLink>
      </div>
    );
  }

  const onSale = cars.filter((c) => c.is_public).length;
  return (
    <>
      <p className="mt-6 text-muted">
        {cars.length === 1 ? "1 car" : `${cars.length} cars`}
        {onSale < cars.length ? `, ${onSale} still on sale` : ""}
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cars.map((car) => (
          <li key={car.listing_id} className="flex">
            <ListingCard
              listing={{ ...car, id: car.listing_id, published_at: null }}
              unavailable={car.is_public ? null : car.status === "sold" ? "Sold" : `No longer listed${car.status === "paused" ? " (paused)" : ""}`}
              refreshOnChange
            />
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">Sold and withdrawn cars stay here so you know what happened.</p>
    </>
  );
}
