/**
 * The only shape the rest of the app knows about payments.
 *
 * The mock provider supports local walkthroughs. A Cashia adapter is enabled only
 * after merchant credentials and Cashia's checkout/webhook contract are available.
 * Safe Deal needs a separate hold / release / refund contract before it can move funds.
 */

export type PaymentStatus = "pending" | "succeeded" | "failed" | "cancelled" | "refunded";

export interface CheckoutRequest {
  /** Our own order id — the idempotency key for every provider call and callback. */
  orderId: string;
  /** Whole Kenyan shillings. */
  amountKes: number;
  description: string;
  customer: { phone: string; name?: string; email?: string };
  /** Where the hosted checkout sends the buyer afterwards. */
  returnUrl: string;
}

export interface CheckoutSession {
  providerRef: string;
  checkoutUrl: string;
}

export interface PaymentResult {
  providerRef: string;
  orderId: string;
  status: PaymentStatus;
  amountKes: number;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Always re-query before trusting a callback. */
  getPayment(providerRef: string): Promise<PaymentResult>;
  /** Validate a callback's signature and parse it. Throws if it cannot be trusted. */
  parseCallback(headers: Headers, rawBody: string): Promise<PaymentResult>;
}
