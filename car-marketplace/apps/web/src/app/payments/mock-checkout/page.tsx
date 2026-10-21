import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { PaymentResult } from "@cm/payments";
import { formatKes } from "@cm/shared";
import { Alert } from "@/components/ui/alert";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { getMockPaymentProvider } from "@/lib/payments/provider";
import { createClient } from "@/lib/supabase/server";
import { MockCheckoutControls } from "./controls";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false, follow: false } };

export default function MockCheckoutPage({ searchParams }: PageProps<"/payments/mock-checkout">) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
      <Suspense fallback={<div aria-hidden className="h-72 rounded-[var(--radius-control)] bg-mist/50" />}>
        <Checkout searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Checkout({ searchParams }: Pick<PageProps<"/payments/mock-checkout">, "searchParams">) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref : "";
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(ref)) notFound();

  const provider = (() => {
    try {
      return getMockPaymentProvider();
    } catch {
      return null;
    }
  })();
  if (!provider) {
    return <Alert tone="error">Test checkout is disabled. Configure a local payment provider to continue.</Alert>;
  }

  const user = await requireUser("/account/orders");
  let payment: PaymentResult;
  try {
    payment = await provider.getPayment(ref);
  } catch {
    notFound();
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, buyer_id, amount_kes, product, status")
    .eq("id", payment.orderId)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (!order || order.amount_kes !== payment.amountKes) notFound();

  const returnTo = safeNext(params.return, `/account/orders/${order.id}`);
  const productName = order.product === "dealer_plan" ? "Dealer plan" : order.product === "listing_boost" ? "7-day listing boost" : "Marketplace purchase";
  const finished = payment.status !== "pending" || order.status !== "pending";

  return (
    <section className="rounded-xl border border-mist bg-surface p-6 shadow-sm sm:p-8">
      <p className="plate-type inline-flex rounded-[var(--radius-plate)] bg-plate px-3 py-1 text-xs">Magari test checkout</p>
      <h1 className="display mt-5 text-4xl">{finished ? "Checkout finished" : "Review your order"}</h1>
      <p className="mt-2 text-ink-soft">This local walkthrough simulates a provider response. It does not move money.</p>

      <dl className="mt-7 divide-y divide-mist border-y border-mist">
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-muted">Item</dt>
          <dd className="text-right font-semibold">{productName}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-muted">Amount</dt>
          <dd className="text-right text-xl font-bold">{formatKes(payment.amountKes)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-muted">Order</dt>
          <dd className="font-mono text-sm">{order.id.slice(0, 8).toUpperCase()}</dd>
        </div>
      </dl>

      {finished ? (
        <Alert tone={payment.status === "succeeded" ? "success" : "info"} className="mt-6">
          {payment.status === "succeeded" ? "Payment recorded. Your receipt is ready." : "Checkout was cancelled."}
        </Alert>
      ) : (
        <MockCheckoutControls providerRef={ref} returnTo={returnTo} />
      )}
    </section>
  );
}
