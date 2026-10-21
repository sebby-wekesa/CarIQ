import "server-only";
import { MockPaymentProvider } from "@cm/payments";
import { serverEnv } from "@/lib/server-env";

type PaymentGlobal = typeof globalThis & { __magariMockPayments?: MockPaymentProvider };

/** The mock adapter is for local walkthroughs only; production must use Cashia. */
export function getMockPaymentProvider(): MockPaymentProvider {
  const provider = serverEnv().paymentProvider;
  if (provider !== "mock") {
    throw new Error(
      provider === "cashia"
        ? "Cashia checkout is not configured. The merchant API contract and credentials are required."
        : "Set PAYMENT_PROVIDER=mock for local checkout walkthroughs.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("The mock payment provider is disabled in production.");
  }

  const state = globalThis as PaymentGlobal;
  state.__magariMockPayments ??= new MockPaymentProvider();
  return state.__magariMockPayments;
}
