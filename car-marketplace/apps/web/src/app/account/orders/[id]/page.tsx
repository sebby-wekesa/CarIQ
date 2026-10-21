import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatKes } from "@cm/shared";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Payment receipt", robots: { index: false } };

export default function ReceiptPage({ params }: PageProps<"/account/orders/[id]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<div aria-hidden className="h-80 rounded-[var(--radius-control)] bg-mist/50" />}>
        <Receipt params={params} />
      </Suspense>
    </div>
  );
}

async function Receipt({ params }: Pick<PageProps<"/account/orders/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser(`/account/orders/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, buyer_id, product, amount_kes, status, created_at, paid_at, plan_id, listing_id, etims_invoice_no")
    .eq("id", id)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (!order) notFound();

  const [{ data: plan }, { data: listing }] = await Promise.all([
    order.plan_id ? supabase.from("plans").select("name").eq("id", order.plan_id).maybeSingle() : Promise.resolve({ data: null }),
    order.listing_id ? supabase.from("listing_overview").select("title").eq("id", order.listing_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const item = order.product === "listing_boost"
    ? `7-day boost · ${listing?.title ?? "Car listing"}`
    : order.product === "dealer_plan"
      ? `${plan?.name ?? "Dealer"} plan`
      : "Marketplace purchase";
  const paid = order.status === "paid";

  return (
    <article className="rounded-xl border border-mist bg-surface p-6 sm:p-9">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">Payment receipt</p>
      <h1 className="display mt-2 text-4xl">{paid ? "Payment received" : "Order details"}</h1>
      <p className="mt-2 text-ink-soft">
        {paid ? "This receipt records the payment on your Magari account." : `This order is ${order.status.replaceAll("_", " ")}.`}
      </p>

      <dl className="mt-8 divide-y divide-mist border-y border-mist">
        <ReceiptRow label="Receipt reference" value={`MGR-${order.id.slice(0, 8).toUpperCase()}`} />
        <ReceiptRow label="Item" value={item} />
        <ReceiptRow label="Amount" value={formatKes(order.amount_kes)} />
        <ReceiptRow label="Status" value={order.status.replaceAll("_", " ")} />
        <ReceiptRow label={paid ? "Paid on" : "Order created"} value={formatDateTime(order.paid_at ?? order.created_at)} />
        {order.etims_invoice_no ? <ReceiptRow label="eTIMS invoice number" value={order.etims_invoice_no} /> : null}
      </dl>

      {!order.etims_invoice_no ? (
        <p className="mt-5 text-sm text-muted">This is a payment receipt. An eTIMS tax invoice number will appear here once the eTIMS connection is configured.</p>
      ) : null}
      <div className="mt-7">
        <ButtonLink href="/account/orders" variant="secondary">Back to orders</ButtonLink>
      </div>
    </article>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold capitalize">{value}</dd>
    </div>
  );
}
