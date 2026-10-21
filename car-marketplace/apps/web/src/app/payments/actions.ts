"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManage, requireDealer } from "@/lib/dealers/queries";
import { getOwnedListing } from "@/lib/listings/owned";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { getMockPaymentProvider } from "@/lib/payments/provider";
import { recordOrderPayment } from "@/lib/payments/server";
import { LISTING_BOOST_PRICE_KES } from "@/lib/payments/pricing";

export type CheckoutState = { error?: string; message?: string };

const PENDING_ORDER_WINDOW_MS = 20 * 60 * 1000;

type OrderRequest = {
  buyerId: string;
  product: "listing_boost" | "dealer_plan";
  amountKes: number;
  listingId?: string;
  dealerId?: string;
  planId?: string;
  description: string;
  returnTo: string;
};

async function startCheckout(user: { id: string; phone: string | null; fullName: string | null }, request: OrderRequest) {
  if (!user.phone) throw new Error("Your phone number is missing from your sign-in session. Sign in again to continue.");
  if (!Number.isSafeInteger(request.amountKes) || request.amountKes <= 0) throw new Error("This price is not valid.");
  const provider = getMockPaymentProvider();

  const secret = serverEnv().supabaseSecretKey;
  if (!secret) throw new Error("Add SUPABASE_SECRET_KEY to the server environment before starting checkout.");
  const admin = createAdminClient(secret);
  const after = new Date(Date.now() - PENDING_ORDER_WINDOW_MS).toISOString();

  let lookup = admin
    .from("orders")
    .select("id, created_at")
    .eq("buyer_id", request.buyerId)
    .eq("product", request.product)
    .eq("amount_kes", request.amountKes)
    .eq("status", "pending")
    .gte("created_at", after);
  if (request.listingId) lookup = lookup.eq("listing_id", request.listingId);
  if (request.dealerId) lookup = lookup.eq("dealer_id", request.dealerId);
  if (request.planId) lookup = lookup.eq("plan_id", request.planId);
  const { data: prior, error: lookupError } = await lookup.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lookupError) throw new Error("The previous checkout could not be checked. Try again.");

  let orderId = prior?.id;
  if (!orderId) {
    const { data: order, error } = await admin
      .from("orders")
      .insert({
        buyer_id: request.buyerId,
        product: request.product,
        amount_kes: request.amountKes,
        listing_id: request.listingId,
        dealer_id: request.dealerId,
        plan_id: request.planId,
      })
      .select("id")
      .single();
    if (error || !order) throw new Error("The order could not be saved. Try again.");
    orderId = order.id;
  }

  const returnUrl = new URL(request.returnTo.replace("{orderId}", orderId), env.siteUrl).toString();
  const checkout = await provider.createCheckout({
    orderId,
    amountKes: request.amountKes,
    description: request.description,
    customer: { phone: user.phone, name: user.fullName ?? undefined },
    returnUrl,
  });
  const payment = await provider.getPayment(checkout.providerRef);
  await recordOrderPayment(provider.name, payment);
  return checkout.checkoutUrl;
}

function checkoutError(error: unknown): CheckoutState {
  console.error("[payments] checkout could not start", error);
  return {
    error: error instanceof Error ? error.message : "Checkout could not start. Try again.",
  };
}

export async function startListingBoost(
  listingId: string,
  _previous: CheckoutState,
  _formData: FormData,
): Promise<CheckoutState> {
  const user = await requireUser(`/sell/${listingId}`);
  const supabase = await createClient();
  const listing = await getOwnedListing(supabase, user.id, listingId);
  if (!listing || listing.status !== "live") return { error: "Only a live listing you manage can be boosted." };

  let url: string;
  try {
    url = await startCheckout(user, {
      buyerId: user.id,
      product: "listing_boost",
      amountKes: LISTING_BOOST_PRICE_KES,
      listingId,
      description: "7-day listing boost",
      returnTo: "/account/orders/{orderId}",
    });
  } catch (error) {
    return checkoutError(error);
  }
  redirect(url);
}

export async function startDealerPlanCheckout(
  dealerId: string,
  planId: string,
  _previous: CheckoutState,
  _formData: FormData,
): Promise<CheckoutState> {
  const { user, dealer } = await requireDealer(dealerId, `/dealer/${dealerId}/billing`);
  if (!canManage(dealer.role)) return { error: "Only an owner or manager can change the dealership plan." };
  if (dealer.status !== "approved") return { error: "The dealership must be approved before a paid plan can start." };
  if (!/^[a-z0-9_-]{2,80}$/.test(planId)) return { error: "Choose one of the available plans." };

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .select("id, name, price_kes, period")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !plan) return { error: "That plan is no longer available. Refresh the page and choose again." };

  let url: string;
  try {
    url = await startCheckout(user, {
      buyerId: user.id,
      product: "dealer_plan",
      amountKes: Number(plan.price_kes),
      dealerId,
      planId: plan.id,
      description: `${dealer.name} — ${plan.name} dealer plan`,
      returnTo: "/account/orders/{orderId}",
    });
  } catch (error) {
    return checkoutError(error);
  }
  redirect(url);
}

export async function assignDealerFeaturedSlot(
  dealerId: string,
  listingId: string,
  _previous: CheckoutState,
  _formData: FormData,
): Promise<CheckoutState> {
  const { dealer } = await requireDealer(dealerId, `/dealer/${dealerId}/billing`);
  if (!canManage(dealer.role)) return { error: "Only an owner or manager can use a featured slot." };
  if (dealer.status !== "approved") return { error: "The dealership must be approved first." };
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return { error: "Choose a live car from this dealership." };

  const secret = serverEnv().supabaseSecretKey;
  if (!secret) return { error: "Add SUPABASE_SECRET_KEY to the server environment before managing featured cars." };
  const admin = createAdminClient(secret) as unknown as {
    rpc(name: "assign_dealer_featured_slot", args: { p_dealer_id: string; p_listing_id: string }): Promise<{ error: { message: string } | null }>;
  };
  const { error } = await admin.rpc("assign_dealer_featured_slot", {
    p_dealer_id: dealerId,
    p_listing_id: listingId,
  });
  if (error) {
    const message = error.message.includes("All featured slots are in use")
      ? "All featured slots are in use. Wait for one to expire before adding another car."
      : error.message.includes("active plan")
        ? "An active plan with featured slots is required."
        : error.message.includes("live car")
          ? "Choose a live car from this dealership."
          : "The car could not be featured. Refresh and try again.";
    return { error: message };
  }

  updateTag("listings");
  refresh();
  return { message: "Featured for seven days." };
}

