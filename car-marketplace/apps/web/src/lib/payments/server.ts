import "server-only";
import type { PaymentResult } from "@cm/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";

type RecordOrderPayment = {
  rpc(
    name: "record_order_payment",
    args: {
      p_order_id: string;
      p_provider: string;
      p_provider_ref: string;
      p_amount_kes: number;
      p_status: PaymentResult["status"];
    },
  ): Promise<{ error: { message: string } | null }>;
};

/**
 * Post a provider result through the service-only database function. The database
 * locks the order, checks the amount, posts a balanced journal and grants the benefit.
 */
export async function recordOrderPayment(provider: string, payment: PaymentResult): Promise<void> {
  const secret = serverEnv().supabaseSecretKey;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is required to record a payment.");

  const client = createAdminClient(secret) as unknown as RecordOrderPayment;
  const { error } = await client.rpc("record_order_payment", {
    p_order_id: payment.orderId,
    p_provider: provider,
    p_provider_ref: payment.providerRef,
    p_amount_kes: payment.amountKes,
    p_status: payment.status,
  });
  if (error) throw new Error(error.message);
}
