import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import { formatKes } from "@cm/shared";
import { canManage, requireDealer } from "@/lib/dealers/queries";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/button";
import { DealerFrame, DealerSkeleton, DealerHeader } from "../../dealer-header";
import { ActionButton } from "@/app/payments/action-button";
import { assignDealerFeaturedSlot, startDealerPlanCheckout } from "@/app/payments/actions";

export const metadata: Metadata = { title: "Plan and billing", robots: { index: false } };

export default function DealerBillingPage({ params }: PageProps<"/dealer/[id]/billing">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Billing params={params} />
      </Suspense>
    </DealerFrame>
  );
}

async function Billing({ params }: Pick<PageProps<"/dealer/[id]/billing">, "params">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}/billing`);
  const supabase = await createClient();
  const [{ data: plans }, { data: subscription }, { data: liveListings }] = await Promise.all([
    supabase.from("plans").select("id, name, price_kes, period, listing_limit, featured_slots").eq("is_active", true).order("sort_order"),
    supabase
      .from("subscriptions")
      .select("plan_id, status, current_period_end")
      .eq("dealer_id", id)
      .in("status", ["active", "past_due"])
      .maybeSingle(),
    supabase
      .from("listing_overview")
      .select("id, title, featured_until")
      .eq("dealer_id", id)
      .eq("status", "live")
      .order("published_at", { ascending: false })
      .limit(200),
  ]);
  const currentPlan = plans?.find((plan) => plan.id === subscription?.plan_id);
  const mayManage = canManage(dealer.role);
  const activeSlots = (liveListings ?? []).filter((listing) => listing.featured_until && Date.parse(listing.featured_until) > Date.now()).length;
  const canUseSlots = Boolean(
    mayManage && dealer.status === "approved" && subscription?.status === "active" &&
      Date.parse(subscription.current_period_end) > Date.now() && currentPlan?.featured_slots,
  );

  return (
    <>
      <DealerHeader dealer={dealer} tab="billing" />
      <div className="mt-8 max-w-4xl">
        <section className="rounded-xl border border-mist bg-surface p-5 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Current plan</p>
          {currentPlan && subscription ? (
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="display text-3xl">{currentPlan.name}</h2>
                <p className="mt-1 text-ink-soft">
                  {formatKes(currentPlan.price_kes)} per {currentPlan.period === "annual" ? "year" : "month"}
                  {subscription.status === "past_due" ? " · Payment needs attention" : ""}
                </p>
              </div>
              <p className="text-sm text-muted">Current period ends {formatDate(subscription.current_period_end)}</p>
            </div>
          ) : (
            <div className="mt-2">
              <h2 className="display text-3xl">No active plan</h2>
              <p className="mt-1 text-ink-soft">Choose a plan for your dealership’s stock and featured slots.</p>
            </div>
          )}
        </section>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-3xl">Choose a plan</h2>
            <p className="mt-1 text-ink-soft">Pay for the period shown. A new plan starts when confirmed; a renewal extends its current period.</p>
          </div>
          <ButtonLink href="/account/orders" variant="quiet">View receipts</ButtonLink>
        </div>

        {plans?.length ? (
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.id} className={`flex flex-col rounded-xl border bg-surface p-5 ${plan.id === subscription?.plan_id ? "border-forest ring-2 ring-forest/15" : "border-mist"}`}>
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="display mt-3 text-3xl">{formatKes(plan.price_kes)}</p>
                <p className="text-sm text-muted">per {plan.period === "annual" ? "year" : "month"}</p>
                <ul className="my-5 flex-1 space-y-2 border-t border-mist pt-4 text-sm text-ink-soft">
                  <li>{plan.listing_limit == null ? "Unlimited cars" : `Up to ${plan.listing_limit} cars`}</li>
                  <li>{plan.featured_slots} featured {plan.featured_slots === 1 ? "slot" : "slots"}</li>
                </ul>
                {mayManage ? (
                  <ActionButton
                    action={startDealerPlanCheckout.bind(null, id, plan.id)}
                    label={plan.id === subscription?.plan_id ? `Renew ${plan.name}` : `Choose ${plan.name}`}
                  />
                ) : (
                  <p className="text-sm text-muted">Ask an owner or manager to change the plan.</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl border border-mist bg-surface p-5 text-ink-soft">Plans could not be loaded. Refresh to try again.</p>
        )}

        <section aria-labelledby="featured-heading" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="featured-heading" className="display text-3xl">Featured cars</h2>
              <p className="mt-1 text-ink-soft">
                {currentPlan?.featured_slots
                  ? `${activeSlots} of ${currentPlan.featured_slots} slots in use. Each placement lasts seven days.`
                  : "Featured slots are included with selected dealer plans."}
              </p>
            </div>
          </div>
          {liveListings?.length ? (
            <ul className="mt-4 divide-y divide-mist rounded-xl border border-mist bg-surface">
              {liveListings.map((listing) => {
                const featured = Boolean(listing.featured_until && Date.parse(listing.featured_until) > Date.now());
                return (
                  <li key={listing.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                    <span className="font-semibold">{listing.title ?? "Live car"}</span>
                    {canUseSlots ? (
                      <ActionButton
                        action={assignDealerFeaturedSlot.bind(null, id, listing.id!)}
                        label={featured ? "Extend 7 days" : "Feature for 7 days"}
                      />
                    ) : featured ? (
                      <span className="text-sm font-semibold text-forest">Featured until {formatDate(listing.featured_until!)}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border-2 border-dashed border-mist p-5 text-ink-soft">Publish a car before featuring it.</p>
          )}
        </section>
      </div>
    </>
  );
}
