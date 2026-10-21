import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatKes, MIN_PHOTOS_TO_SUBMIT, listingPath } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/catalogue";
import { getOwnedListing } from "@/lib/listings/owned";
import { photoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/listings/status-badge";
import { Alert } from "@/components/ui/alert";
import { DetailsForm } from "./details-form";
import { PassportUploads } from "./passport-uploads";
import { PhotoManager } from "./photo-manager";
import { StatusPanel, type ChecklistItem } from "./status-panel";
import { ActionButton } from "@/app/payments/action-button";
import { startListingBoost } from "@/app/payments/actions";
import { LISTING_BOOST_PRICE_KES } from "@/lib/payments/pricing";

export const metadata: Metadata = { title: "Edit listing", robots: { index: false } };

export default function EditListingPage({ params }: PageProps<"/sell/[id]">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<EditorPlaceholder />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: Pick<PageProps<"/sell/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser(`/sell/${id}`);
  const supabase = await createClient();
  const owned = await getOwnedListing(supabase, user.id, id);
  if (!owned) notFound();

  const [overview, identity, media, documents, catalogue] = await Promise.all([
    supabase.from("listing_overview").select("*").eq("id", id).single(),
    supabase.from("listing_identity").select("chassis_number, registration_number").eq("listing_id", id).maybeSingle(),
    supabase
      .from("listing_media")
      .select("id, storage_path, thumb_path, position")
      .eq("listing_id", id)
      .eq("kind", "photo")
      .order("position")
      .order("created_at"),
    supabase
      .from("vehicle_documents")
      .select("id, kind, content_type, verification_level, created_at")
      .eq("listing_id", id)
      .order("created_at", { ascending: false }),
    getCatalogue(),
  ]);

  const listing = overview.data;
  if (!listing || !catalogue) {
    return <Alert tone="error">This listing didn&apos;t load. Refresh the page to try again.</Alert>;
  }

  const photos = (media.data ?? []).map((m) => ({
    id: m.id,
    url: photoUrl(m.storage_path) ?? "",
    thumbUrl: photoUrl(m.thumb_path ?? m.storage_path) ?? "",
  }));
  const docs = documents.data ?? [];
  const status = listing.status ?? "draft";
  const locked = status === "sold";

  const detailsDone = Boolean(
    listing.price_kes && listing.mileage_km != null && listing.condition && listing.fuel_type &&
      listing.transmission && listing.county_code,
  );
  const checklist: ChecklistItem[] = [
    { label: `At least ${MIN_PHOTOS_TO_SUBMIT} photos (${photos.length} added)`, done: photos.length >= MIN_PHOTOS_TO_SUBMIT, href: "#photos" },
    { label: "Price, mileage, county and car details", done: detailsDone, href: "#details" },
    { label: "Dashboard photo showing the mileage", done: docs.some((d) => d.kind === "odometer_photo"), href: "#passport" },
  ];

  return (
    <>
      <p>
        <Link href="/sell" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          Your listings
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="display text-4xl sm:text-5xl">{listing.title}</h1>
        <StatusBadge status={status} />
      </div>
      <p className="mt-2 text-sm text-muted">
        Chassis {identity.data?.chassis_number ?? "not added"}
        {status === "live" ? (
          <Link href={listingPath(id, listing.title)} className="ml-4 font-semibold text-forest underline-offset-4 hover:underline">
            View public listing
          </Link>
        ) : null}
      </p>

      <StatusPanel
        listingId={id}
        status={status}
        checklist={checklist}
        rejectionReason={listing.rejection_reason}
      />

      {status === "live" ? (
        <section aria-labelledby="boost-heading" className="mt-8 flex flex-col gap-4 rounded-xl border border-forest/20 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 id="boost-heading" className="text-lg font-bold">Help more buyers find this car</h2>
            <p className="mt-1 max-w-[56ch] text-sm text-ink-soft">
              Put it ahead of regular listings in recommended search for seven days. Your listing details stay the same.
            </p>
          </div>
          <ActionButton
            action={startListingBoost.bind(null, id)}
            label={`Boost for ${formatKes(LISTING_BOOST_PRICE_KES)}`}
          />
        </section>
      ) : null}

      <section id="photos" aria-labelledby="photos-heading" className="mt-12 scroll-mt-6">
        <h2 id="photos-heading" className="display text-3xl">
          1. Photos
        </h2>
        <p className="mt-1 text-ink-soft">
          Front, back, both sides, interior and engine sell a car fastest. The first photo is the cover.
        </p>
        <div className="mt-5">
          <PhotoManager listingId={id} photos={photos} locked={locked} />
        </div>
      </section>

      <section id="details" aria-labelledby="details-heading" className="mt-14 scroll-mt-6">
        <h2 id="details-heading" className="display text-3xl">
          2. Price and details
        </h2>
        <div className="mt-5">
          <DetailsForm
            listingId={id}
            catalogue={catalogue}
            defaults={{
              makeId: listing.make_id,
              modelId: listing.model_id,
              year: listing.year,
              condition: listing.condition,
              bodyType: listing.body_type,
              fuelType: listing.fuel_type,
              transmission: listing.transmission,
              drivetrain: listing.drivetrain,
              engineCc: listing.engine_cc,
              colour: listing.colour,
              plate: identity.data?.registration_number ?? null,
              mileageKm: listing.mileage_km,
              priceKes: listing.price_kes,
              negotiable: listing.negotiable ?? true,
              countyCode: listing.county_code,
              town: listing.town,
              description: listing.description,
              features: listing.features ?? [],
            }}
          />
        </div>
      </section>

      <section id="passport" aria-labelledby="passport-heading" className="mt-14 scroll-mt-6">
        <h2 id="passport-heading" className="display text-3xl">
          3. Mileage proof and papers
        </h2>
        <p className="mt-1 max-w-[60ch] text-ink-soft">
          These build the car&apos;s Vehicle Passport. Files stay private: buyers only see which papers you
          provided, and we check them before they count as verified.
        </p>
        <div className="mt-5">
          <PassportUploads listingId={id} documents={docs} />
        </div>
      </section>
    </>
  );
}

function EditorPlaceholder() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="h-12 w-2/3 rounded bg-mist" />
      <div className="h-28 rounded-[var(--radius-control)] bg-mist/60" />
      <div className="h-48 rounded-[var(--radius-control)] bg-mist/40" />
    </div>
  );
}
