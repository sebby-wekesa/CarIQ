import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "./mock";

const request = {
  orderId: "ord_1",
  amountKes: 500,
  description: "7-day boost",
  customer: { phone: "+254712345678" },
  returnUrl: "/orders/ord_1",
};

describe("MockPaymentProvider", () => {
  it("creates a pending checkout and settles it", async () => {
    const provider = new MockPaymentProvider();
    const session = await provider.createCheckout(request);
    expect(session.checkoutUrl).toContain(session.providerRef);
    expect((await provider.getPayment(session.providerRef)).status).toBe("pending");

    provider.settle(session.providerRef);
    const callback = await provider.parseCallback(new Headers(), JSON.stringify({ providerRef: session.providerRef }));
    expect(callback).toMatchObject({ orderId: "ord_1", status: "succeeded", amountKes: 500 });
  });

  it("is idempotent per order id", async () => {
    const provider = new MockPaymentProvider();
    const a = await provider.createCheckout(request);
    const b = await provider.createCheckout(request);
    expect(b.providerRef).toBe(a.providerRef);
  });

  it("rejects non-integer amounts", async () => {
    const provider = new MockPaymentProvider();
    await expect(provider.createCheckout({ ...request, amountKes: 10.5 })).rejects.toThrow();
  });
});
