import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { countyByCode, formatKenyanPhone } from "@cm/shared";
import { canManage, getDealerRow, requireDealer } from "@/lib/dealers/queries";
import { DealerFrame, DealerHeader, DealerSkeleton } from "../../dealer-header";
import { ShowroomForm } from "./showroom-form";

export const metadata: Metadata = { title: "Showroom", robots: { index: false } };

export default function ShowroomPage({ params }: PageProps<"/dealer/[id]/showroom">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Showroom params={params} />
      </Suspense>
    </DealerFrame>
  );
}

async function Showroom({ params }: Pick<PageProps<"/dealer/[id]/showroom">, "params">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}/showroom`);
  const row = await getDealerRow(id);
  if (!row) notFound();

  return (
    <>
      <DealerHeader dealer={dealer} tab="showroom" />
      <div className="mt-8 max-w-2xl">
        <p className="text-ink-soft">
          {dealer.status === "approved" ? (
            <>
              Your public page is{" "}
              <Link href={`/dealers/${row.slug}`} className="font-semibold text-forest underline-offset-4 hover:underline">
                /dealers/{row.slug}
              </Link>
              . Share it on WhatsApp and social media: it always shows your live stock.
            </>
          ) : (
            "Your public page goes live with the Verified dealer badge once we approve the dealership."
          )}
        </p>
        <dl className="mt-6 grid gap-x-6 gap-y-3 rounded-[var(--radius-control)] border border-mist bg-surface p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Business name</dt>
            <dd className="font-semibold">{row.name}</dd>
          </div>
          <div>
            <dt className="text-muted">County</dt>
            <dd className="font-semibold">{countyByCode(row.county_code)?.name ?? "—"}</dd>
          </div>
          <p className="text-muted sm:col-span-2">To change the business name or county, contact support: they&apos;re part of your verification.</p>
        </dl>
        <div className="mt-6">
          {canManage(dealer.role) ? (
            <ShowroomForm
              dealerId={id}
              defaults={{
                phone: row.phone ? formatKenyanPhone(row.phone) : "",
                town: row.town ?? "",
                address: row.address ?? "",
                openingHours: row.opening_hours ?? "",
                description: row.description ?? "",
                acceptsCalls: row.accepts_calls,
                acceptsWhatsapp: row.accepts_whatsapp,
              }}
            />
          ) : (
            <p className="text-muted">Only owners and managers can change these details.</p>
          )}
        </div>
      </div>
    </>
  );
}
