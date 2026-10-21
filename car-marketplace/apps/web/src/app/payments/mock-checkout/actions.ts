"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { getMockPaymentProvider } from "@/lib/payments/provider";
import { recordOrderPayment } from "@/lib/payments/server";
import { createClient } from "@/lib/supabase/server";

export type MockCheckoutState = { error?: string };

export async function finishMockCheckout(
  providerRef: string,
  returnTo: string,
  _previous: MockCheckoutState,
  formData: FormData,
): Promise<MockCheckoutState> {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(providerRef)) return { error: "This test checkout is no longer available." };
  const outcome = String(formData.get("outcome") ?? "");
  if (outcome !== "succeeded" && outcome !== "cancelled") return { error: "Choose whether to finish or cancel checkout." };

  const safeReturn = safeNext(returnTo, "/account/orders");
  const user = await requireUser(safeReturn);
  try {
    const provider = getMockPaymentProvider();
    const before = await provider.getPayment(providerRef);
    const supabase = await createClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, buyer_id, amount_kes")
      .eq("id", before.orderId)
      .eq("buyer_id", user.id)
      .maybeSingle();
    if (!order || order.amount_kes !== before.amountKes) {
      return { error: "This checkout does not belong to your account." };
    }

    provider.settle(providerRef, outcome);
    const payment = await provider.getPayment(providerRef);
    await recordOrderPayment(provider.name, payment);
    updateTag("listings");
    refresh();
  } catch (error) {
    console.error("[payments] mock checkout could not be recorded", error);
    return { error: "The payment result could not be saved. Keep this page open and try again." };
  }

  redirect(safeReturn);
}
