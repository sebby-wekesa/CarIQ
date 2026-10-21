import type { CheckoutRequest, CheckoutSession, PaymentProvider, PaymentResult, PaymentStatus } from "./types";

/**
 * In-memory provider for development and tests. Behaves like a hosted checkout:
 * create a session, then call `settle()` to simulate the customer paying.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private payments = new Map<string, PaymentResult>();
  private counter = 0;

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(request.amountKes) || request.amountKes <= 0) {
      throw new Error("amountKes must be a positive whole number");
    }
    const existing = [...this.payments.values()].find((p) => p.orderId === request.orderId);
    if (existing) {
      return { providerRef: existing.providerRef, checkoutUrl: this.urlFor(existing.providerRef, request.returnUrl) };
    }
    const providerRef = `mock_${++this.counter}`;
    this.payments.set(providerRef, {
      providerRef,
      orderId: request.orderId,
      status: "pending",
      amountKes: request.amountKes,
    });
    return { providerRef, checkoutUrl: this.urlFor(providerRef, request.returnUrl) };
  }

  async getPayment(providerRef: string): Promise<PaymentResult> {
    const payment = this.payments.get(providerRef);
    if (!payment) throw new Error(`Unknown payment ${providerRef}`);
    return { ...payment };
  }

  async parseCallback(_headers: Headers, rawBody: string): Promise<PaymentResult> {
    const body = JSON.parse(rawBody) as { providerRef?: string };
    if (!body.providerRef) throw new Error("Callback missing providerRef");
    return this.getPayment(body.providerRef);
  }

  /** Test helper: simulate the customer finishing (or abandoning) checkout. */
  settle(providerRef: string, status: PaymentStatus = "succeeded"): void {
    const payment = this.payments.get(providerRef);
    if (!payment) throw new Error(`Unknown payment ${providerRef}`);
    payment.status = status;
  }

  private urlFor(ref: string, returnUrl: string): string {
    return `/payments/mock-checkout?ref=${encodeURIComponent(ref)}&return=${encodeURIComponent(returnUrl)}`;
  }
}
