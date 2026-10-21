import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatKes } from "@cm/shared";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Orders and receipts", robots: { index: false } };

export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<div aria-hidden className="h-64 rounded-[var(--radius-control)] bg-mist/50" />}>
        <Orders />
      </Suspense>
    </div>
  );
}

async function Orders() {
  const user = await requireUser("/account/orders");
  const supabase = await createClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, product, amount_kes, status, created_at, paid_at, plan_id")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const planIds = [...new Set((orders ?? []).map((order) => order.plan_id).filter((id): id is string => Boolean(id)))];
  const { data: plans } = planIds.length
    ? await supabase.from("plans").select("id, name").in("id", planIds)
    : { data: [] };
  const planNames = new Map((plans ?? []).map((plan) => [plan.id, plan.name]));

  return (
    <>
      <p><Link href="/account" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">Your account</Link></p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Orders and receipts</h1>
      <p className="mt-2 text-ink-soft">Payments for listing boosts and dealer plans appear here.</p>

      {error ? (
        <p role="alert" className="mt-8 rounded-lg border border-danger/30 bg-danger-soft p-4 text-danger">Orders could not be loaded. Refresh to try again.</p>
      ) : orders?.length ? (
        <ul className="mt-8 divide-y divide-mist rounded-xl border border-mist bg-surface">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/account/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-paper sm:p-5">
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {order.product === "listing_boost" ? "7-day listing boost" : order.product === "dealer_plan" ? `${planNames.get(order.plan_id ?? "") ?? "Dealer"} plan` : "Marketplace purchase"}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{formatDate(order.paid_at ?? order.created_at)} · Ref {order.id.slice(0, 8).toUpperCase()}</span>
                </span>
                <span className="text-right">
                  <span className="block font-bold">{formatKes(order.amount_kes)}</span>
                  <span className="block text-sm capitalize text-muted">{order.status.replaceAll("_", " ")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 rounded-xl border-2 border-dashed border-mist p-8">
          <h2 className="text-xl font-semibold">No orders yet</h2>
          <p className="mt-1 text-ink-soft">When you buy a listing boost or a dealer plan, its payment receipt will show here.</p>
        </div>
      )}
    </>
  );
}
