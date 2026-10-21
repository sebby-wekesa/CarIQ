import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DOCUMENT_KINDS, formatKes, labelFor } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_BUCKET, photoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Review listings", robots: { index: false } };

export default function ReviewPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Listings to review</h1>
      <p className="mt-2 text-ink-soft">
        Check the photos match the car, the dashboard photo shows the stated mileage, and the chassis number looks
        right. Oldest first.{" "}
        <Link href="/admin/dealers" className="font-semibold text-forest underline-offset-4 hover:underline">
          Dealer applications
        </Link>
        {" · "}
        <Link href="/admin/outbox" className="font-semibold text-forest underline-offset-4 hover:underline">
          SMS and email outbox
        </Link>
      </p>
      <Suspense fallback={<div aria-hidden className="mt-8 h-60 rounded-[var(--radius-control)] bg-mist/50" />}>
        <ReviewQueue />
      </Suspense>
    </div>
  );
}

const km = new Intl.NumberFormat("en-KE");
const KIND_LABEL = Object.fromEntries(DOCUMENT_KINDS.map((d) => [d.kind, d.label]));

async function ReviewQueue() {
  await requireUser("/admin/review");
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("current_user_is_admin");
  if (!isAdmin) notFound();

  const { data: pending } = await supabase
    .from("listing_overview")
    .select("id, title, price_kes, mileage_km, seller_name, dealer_name, county_name, updated_at, vehicle_id, condition")
    .eq("status", "pending_review")
    .order("updated_at", { ascending: true });

  if (!pending || pending.length === 0) {
    return <Alert tone="success" className="mt-8">Nothing waiting. Every submitted listing has been reviewed.</Alert>;
  }

  return (
    <ul className="mt-8 flex flex-col gap-6">
      {pending.map((listing) => (
        <li key={listing.id}>
          <ReviewCard listing={listing} />
        </li>
      ))}
    </ul>
  );
}

async function ReviewCard({
  listing,
}: {
  listing: {
    id: string | null;
    title: string | null;
    price_kes: number | null;
    mileage_km: number | null;
    seller_name: string | null;
    dealer_name: string | null;
    county_name: string | null;
    updated_at: string | null;
    vehicle_id: string | null;
    condition: string | null;
  };
}) {
  const id = listing.id!;
  const supabase = await createClient();
  const [identity, photos, documents, readings, flags] = await Promise.all([
    supabase.from("listing_identity").select("chassis_number, registration_number").eq("listing_id", id).maybeSingle(),
    supabase.from("listing_media").select("id, thumb_path, storage_path").eq("listing_id", id).order("position"),
    supabase.from("vehicle_documents").select("id, kind, storage_path, content_type, created_at").eq("listing_id", id),
    listing.vehicle_id
      ? supabase
          .from("odometer_readings")
          .select("reading_km, read_on, source, listing_id")
          .eq("vehicle_id", listing.vehicle_id)
          .order("read_on")
      : Promise.resolve({ data: [] }),
    listing.vehicle_id
      ? supabase.from("vehicle_flags").select("id, kind, detail, status").eq("vehicle_id", listing.vehicle_id).eq("status", "open")
      : Promise.resolve({ data: [] }),
  ]);

  const docs = await Promise.all(
    (documents.data ?? []).map(async (doc) => {
      const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.storage_path, 600);
      return { ...doc, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <article className="rounded-[var(--radius-control)] border border-mist bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">{listing.title}</h2>
        <p className="text-sm text-muted">Submitted {listing.updated_at ? formatDateTime(listing.updated_at) : ""}</p>
      </div>
      <p className="mt-1 text-ink-soft">
        {listing.price_kes ? formatKes(listing.price_kes) : "No price"}
        <span className="ml-4">{listing.mileage_km != null ? `${km.format(listing.mileage_km)} km` : "No mileage"}</span>
        <span className="ml-4">{listing.condition ? labelFor(listing.condition) : ""}</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {listing.dealer_name ? `${listing.dealer_name} (listed by ${listing.seller_name ?? "staff"})` : (listing.seller_name ?? "Unnamed seller")},{" "}
        {listing.county_name ?? "no county"}
      </p>

      {(flags.data ?? []).length > 0 ? (
        <Alert tone="error" className="mt-4">
          {(flags.data ?? []).map((flag) => {
            const d = flag.detail as { previous_km?: number; new_km?: number; previous_on?: string } | null;
            return (
              <p key={flag.id}>
                {flag.kind === "mileage_decrease"
                  ? `Mileage went down: ${km.format(d?.previous_km ?? 0)} km on ${d?.previous_on ? formatDate(d.previous_on) : "an earlier date"}, now ${km.format(d?.new_km ?? 0)} km.`
                  : labelFor(flag.kind)}
              </p>
            );
          })}
        </Alert>
      ) : null}

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Chassis number</dt>
          <dd className="font-semibold tracking-wide">{identity.data?.chassis_number ?? "Missing"}</dd>
        </div>
        <div>
          <dt className="text-muted">Number plate</dt>
          <dd className="font-semibold">{identity.data?.registration_number ?? "Not given"}</dd>
        </div>
      </dl>

      <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(photos.data ?? []).map((photo) => (
          <li key={photo.id} className="shrink-0">
            <a href={photoUrl(photo.storage_path) ?? "#"} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(photo.thumb_path ?? photo.storage_path) ?? ""} alt="" className="aspect-[4/3] w-28 rounded-md object-cover" />
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Papers</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {docs.length === 0 ? <li className="text-muted">None uploaded</li> : null}
            {docs.map((doc) => (
              <li key={doc.id}>
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="font-semibold text-forest underline-offset-4 hover:underline">
                    {KIND_LABEL[doc.kind] ?? doc.kind}
                  </a>
                ) : (
                  KIND_LABEL[doc.kind]
                )}
                <span className="ml-2 text-muted">{doc.content_type === "application/pdf" ? "PDF" : "Photo"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">This car&apos;s mileage readings</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {(readings.data ?? []).length === 0 ? <li className="text-muted">None yet</li> : null}
            {(readings.data ?? []).map((r, i) => (
              <li key={i}>
                {km.format(r.reading_km)} km on {formatDate(r.read_on)}
                <span className="ml-2 text-muted">{r.listing_id === id ? "this listing" : "earlier listing"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 border-t border-mist pt-4">
        <ReviewActions listingId={id} />
      </div>
      <p className="mt-3 text-sm text-muted">Listing {id.slice(0, 8)}</p>
    </article>
  );
}
