import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatKes } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { getMyDealers } from "@/lib/dealers/queries";
import { photoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/listings/status-badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your listings", robots: { index: false } };

export default function SellPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<div aria-hidden className="h-40 rounded-[var(--radius-control)] bg-mist/50" />}>
        <SellDashboard />
      </Suspense>
    </div>
  );
}

async function SellDashboard() {
  const user = await requireUser("/sell");
  const supabase = await createClient();
  const [{ data: listings }, { data: leadRows }, dealers] = await Promise.all([
    supabase
      .from("listing_overview")
      .select("id, title, status, price_kes, cover_thumb_path, photo_count, updated_at, rejection_reason, dealer_name")
      .eq("seller_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.rpc("my_lead_counts"),
    getMyDealers(),
  ]);
  const leads = new Map((leadRows ?? []).map((r) => [r.listing_id, r]));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl sm:text-5xl">Your listings</h1>
          <p className="mt-2 text-ink-soft">Drafts save as you go. We check every car before it goes live.</p>
        </div>
        <ButtonLink href="/sell/new" size="lg">
          List a car
        </ButtonLink>
      </div>

      {user.needsProfile ? (
        <Alert tone="info" className="mt-6">
          Add your name and county first so buyers know who is selling.{" "}
          <Link href="/account?welcome=1&next=%2Fsell" className="font-semibold underline underline-offset-4">
            Finish your profile
          </Link>
        </Alert>
      ) : null}

      {dealers.length ? (
        <Alert tone="info" className="mt-6">
          Selling for {dealers.length === 1 ? dealers[0]!.name : "a dealership"}? Its whole stock, leads and team are on the{" "}
          <Link href="/dealer" className="font-semibold underline underline-offset-4">
            dealer dashboard
          </Link>
          .
        </Alert>
      ) : null}

      {listings && listings.length > 0 ? (
        <ul className="mt-8 divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface">
          {listings.map((listing) => {
            const thumb = photoUrl(listing.cover_thumb_path);
            return (
              <li key={listing.id}>
                <Link href={`/sell/${listing.id}`} className="flex items-center gap-4 p-4 hover:bg-paper">
                  <div className="aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md bg-mist/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{listing.title}</p>
                    {listing.dealer_name ? <p className="truncate text-sm text-muted">For {listing.dealer_name}</p> : null}
                    <p className="text-sm text-muted">
                      {listing.price_kes ? formatKes(listing.price_kes) : "No price yet"}
                      <span className="ml-3">{listing.photo_count === 1 ? "1 photo" : `${listing.photo_count ?? 0} photos`}</span>
                    </p>
                    <LeadLine counts={leads.get(listing.id)} />
                    {listing.status === "rejected" && listing.rejection_reason ? (
                      <p className="mt-1 text-sm text-danger">{listing.rejection_reason}</p>
                    ) : null}
                  </div>
                  {listing.status ? <StatusBadge status={listing.status} /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-8 rounded-[var(--radius-control)] border-2 border-dashed border-mist p-8">
          <p className="text-xl font-semibold">You haven&apos;t listed a car yet.</p>
          <p className="mt-1 max-w-[52ch] text-muted">
            Have the chassis number ready (it&apos;s on the logbook) and take a few photos. Most sellers finish in
            under five minutes.
          </p>
        </div>
      )}
    </>
  );
}

type LeadCounts = { chats: number | null; calls: number | null; whatsapps: number | null; unread_messages: number | null };

/** "2 chats · 1 call · 3 WhatsApp", with unread messages called out. */
function LeadLine({ counts }: { counts: LeadCounts | undefined }) {
  if (!counts) return null;
  const n = (v: number | null) => Number(v ?? 0);
  const parts = [
    n(counts.chats) ? `${n(counts.chats)} ${n(counts.chats) === 1 ? "chat" : "chats"}` : null,
    n(counts.calls) ? `${n(counts.calls)} ${n(counts.calls) === 1 ? "call" : "calls"}` : null,
    n(counts.whatsapps) ? `${n(counts.whatsapps)} WhatsApp` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="mt-0.5 text-sm text-ink-soft">
      <span className="sr-only">Buyer interest: </span>
      {parts.join(" · ")}
      {n(counts.unread_messages) ? (
        <span className="ml-2 rounded-full bg-forest px-2 py-0.5 text-xs font-bold text-white">{n(counts.unread_messages)} unread</span>
      ) : null}
    </p>
  );
}
