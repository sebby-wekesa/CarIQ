import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DEALER_DOCUMENT_KINDS } from "@cm/shared";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { DEALER_DOCUMENT_BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { VerifiedDealerBadge } from "@/components/dealers/verified-badge";
import { DealerReview, TrustToggle } from "./dealer-review";

export const metadata: Metadata = { title: "Dealer applications", robots: { index: false } };

const DOC_LABEL: Record<string, string> = Object.fromEntries(DEALER_DOCUMENT_KINDS.map((d) => [d.kind, d.label]));

export default function AdminDealersPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="display text-4xl sm:text-5xl">Dealer applications</h1>
      <p className="mt-2 text-ink-soft">
        Check the KRA PIN certificate matches the business name and PIN, the registration certificate matches the name,
        and the ID matches the owner.{" "}
        <Link href="/admin/review" className="font-semibold text-forest underline-offset-4 hover:underline">
          Listings to review
        </Link>
      </p>
      <Suspense fallback={<div aria-hidden className="mt-8 h-60 rounded-[var(--radius-control)] bg-mist/50" />}>
        <Applications />
      </Suspense>
    </div>
  );
}

async function Applications() {
  await requireUser("/admin/dealers");
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("current_user_is_admin");
  if (!isAdmin) notFound();

  const [{ data: dealers }, { data: documents }] = await Promise.all([
    supabase.rpc("admin_dealer_applications"),
    supabase.from("dealer_documents").select("id, dealer_id, kind, storage_path, content_type, created_at").order("created_at", { ascending: false }),
  ]);
  const signed = await Promise.all(
    (documents ?? []).map(async (d) => {
      const { data } = await supabase.storage.from(DEALER_DOCUMENT_BUCKET).createSignedUrl(d.storage_path, 600);
      return { ...d, url: data?.signedUrl ?? null };
    }),
  );

  const pending = (dealers ?? []).filter((d) => d.status === "pending");
  const others = (dealers ?? []).filter((d) => d.status !== "pending");

  return (
    <>
      {pending.length === 0 ? <Alert tone="success" className="mt-8">No applications waiting.</Alert> : null}
      <ul className="mt-8 flex flex-col gap-6">
        {[...pending, ...others].map((d) => {
          const docs = signed.filter((x) => x.dealer_id === d.id);
          return (
            <li key={d.id}>
              <article className="rounded-[var(--radius-control)] border border-mist bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{d.name}</h2>
                  {d.status === "approved" ? (
                    <span className="flex items-center gap-2">
                      <VerifiedDealerBadge size="sm" />
                      {d.trusted ? <span className="rounded-full bg-plate-soft px-2 py-0.5 text-xs font-semibold">Publishes without review</span> : null}
                    </span>
                  ) : (
                    <span className="rounded-full bg-plate-soft px-2.5 py-1 text-sm font-semibold capitalize">{d.status}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  Applied {d.created_at ? formatDateTime(d.created_at) : ""} · {d.town ? `${d.town}, ` : ""}
                  {d.county_name}
                  {d.status === "approved" ? ` · ${d.live_listings ?? 0} live cars` : ""}
                </p>
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Item label="KRA PIN" value={d.kra_pin} strong />
                  <Item label="Registration number" value={d.business_reg_no ?? "Not given"} />
                  <Item label="Owner" value={`${d.owner_name ?? "No name"} · ${d.owner_phone ?? ""}`} />
                  <Item label="Showroom phone" value={d.phone ?? "Not given"} />
                </dl>
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">Documents</h3>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {docs.length === 0 ? <li className="text-muted">None uploaded</li> : null}
                    {docs.map((doc) => (
                      <li key={doc.id}>
                        {doc.url ? (
                          <a href={doc.url} target="_blank" rel="noreferrer" className="font-semibold text-forest underline-offset-4 hover:underline">
                            {DOC_LABEL[doc.kind] ?? doc.kind}
                          </a>
                        ) : (
                          DOC_LABEL[doc.kind]
                        )}
                        <span className="ml-2 text-muted">{doc.content_type === "application/pdf" ? "PDF" : "Photo"}</span>
                      </li>
                    ))}
                  </ul>
                  {(d.missing_documents ?? []).length ? (
                    <p className="mt-2 text-sm font-medium text-danger">
                      Missing: {(d.missing_documents ?? []).map((k) => DOC_LABEL[k] ?? k).join(", ")}
                    </p>
                  ) : null}
                </div>
                {d.status === "rejected" && d.rejection_reason ? (
                  <p className="mt-3 text-sm text-muted">Sent back: {d.rejection_reason}</p>
                ) : null}
                <div className="mt-5 border-t border-mist pt-4">
                  {d.status === "pending" ? (
                    <DealerReview dealerId={d.id!} name={d.name ?? "dealer"} />
                  ) : d.status === "approved" ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <TrustToggle dealerId={d.id!} trusted={Boolean(d.trusted)} />
                      <Link href={`/dealers/${d.slug}`} className="font-semibold text-forest underline-offset-4 hover:underline">
                        Showroom page
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Waiting for the dealer to fix and send back.</p>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Item({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold tracking-wide" : "font-semibold"}>{value}</dd>
    </div>
  );
}
