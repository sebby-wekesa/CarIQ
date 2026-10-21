import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { clsx } from "clsx";
import { formatKes, listingPath } from "@cm/shared";
import { getDealerStock, requireDealer, type StockRow } from "@/lib/dealers/queries";
import { photoUrl } from "@/lib/storage";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/listings/status-badge";
import { DealerFrame, DealerHeader, DealerSkeleton } from "../../dealer-header";
import { SubmitAll } from "./submit-all";

export const metadata: Metadata = { title: "Stock", robots: { index: false } };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "pending_review", label: "In review" },
  { key: "other", label: "Paused, sold, rejected" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

export default function StockPage({ params, searchParams }: PageProps<"/dealer/[id]/stock">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Stock params={params} searchParams={searchParams} />
      </Suspense>
    </DealerFrame>
  );
}

const km = new Intl.NumberFormat("en-KE");

async function Stock({ params, searchParams }: Pick<PageProps<"/dealer/[id]/stock">, "params" | "searchParams">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}/stock`);
  const wanted = (await searchParams).status;
  const filter: Filter = FILTERS.some((f) => f.key === wanted) ? (wanted as Filter) : "all";
  const stock = dealer.status === "approved" ? await getDealerStock(id) : [];

  const matches = (s: StockRow, f: Filter) =>
    f === "all" ? true : f === "other" ? !["live", "draft", "pending_review"].includes(s.status ?? "") : s.status === f;
  const shown = stock.filter((s) => matches(s, filter));
  const readyDrafts = stock.filter((s) => s.status === "draft" && (s.missing ?? []).length === 0).length;
  const drafts = stock.filter((s) => s.status === "draft").length;

  return (
    <>
      <DealerHeader dealer={dealer} tab="stock" />
      <div className="mt-6 flex flex-col gap-5">
        {dealer.status !== "approved" ? (
          <Alert tone="info">Your stock appears here once the dealership is approved.</Alert>
        ) : null}
        {drafts ? <SubmitAll dealerId={id} ready={readyDrafts} drafts={drafts} trusted={dealer.trusted} /> : null}

        <nav aria-label="Filter stock" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2">
            {FILTERS.map((f) => {
              const count = stock.filter((s) => matches(s, f.key)).length;
              return (
                <li key={f.key}>
                  <Link
                    href={f.key === "all" ? `/dealer/${id}/stock` : `/dealer/${id}/stock?status=${f.key}`}
                    aria-current={filter === f.key ? "page" : undefined}
                    className={clsx(
                      "inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold",
                      filter === f.key ? "border-forest bg-forest text-white" : "border-mist bg-surface hover:border-ink/30",
                    )}
                  >
                    {f.label} <span className={clsx("ml-1.5", filter === f.key ? "text-white/80" : "text-muted")}>{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {shown.length === 0 ? (
          <p className="text-muted">No cars here.</p>
        ) : (
          <ul className="divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface" aria-label="Cars">
            {shown.map((s) => (
              <StockItem key={s.listing_id} row={s} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function StockItem({ row }: { row: StockRow }) {
  const thumb = photoUrl(row.cover_thumb_path);
  const chats = Number(row.chats ?? 0);
  const calls = Number(row.calls ?? 0);
  const whatsapps = Number(row.whatsapps ?? 0);
  const leads = chats + calls + whatsapps;
  const unread = Number(row.unread_messages ?? 0);
  const missing = row.missing ?? [];
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-listing={row.listing_id}>
      <Link href={`/sell/${row.listing_id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md bg-mist/60">
          {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail */}
          {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.title}</p>
          <p className="truncate text-sm text-muted">
            {row.chassis_number ?? "No chassis"} · {row.price_kes ? formatKes(row.price_kes) : "No price"}
            {row.mileage_km != null ? ` · ${km.format(row.mileage_km)} km` : ""}
          </p>
          <p className="truncate text-sm text-muted">Listed by {row.listed_by ?? "a colleague"}</p>
          {row.status === "draft" && missing.length ? (
            <p className="text-sm font-medium text-danger">Needs {missing.join(", ")}</p>
          ) : null}
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:justify-end">
        <Stat label="Views" value={Number(row.views_total ?? 0)} note={`${Number(row.views_7d ?? 0)} this week`} />
        <Stat
          label="Leads"
          value={leads}
          note={[
            chats ? `${chats} ${chats === 1 ? "chat" : "chats"}` : null,
            calls ? `${calls} ${calls === 1 ? "call" : "calls"}` : null,
            whatsapps ? `${whatsapps} WhatsApp` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "none yet"}
        />
        <div className="flex flex-col items-end gap-1">
          {row.status ? <StatusBadge status={row.status} /> : null}
          {unread ? <span className="rounded-full bg-forest px-2 py-0.5 text-xs font-bold text-white">{unread} unread</span> : null}
          {row.status === "live" && row.listing_id ? (
            <Link href={listingPath(row.listing_id, row.title)} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
              View ad
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="min-w-20">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-xl font-bold" data-stat={label.toLowerCase()}>
        {value.toLocaleString("en-KE")}
      </p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}
