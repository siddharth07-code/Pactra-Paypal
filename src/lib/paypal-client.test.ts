import { describe, it, expect } from "vitest";
import { PayPalClient } from "./paypal-client";

describe("PayPal Client Unit Tests", () => {
  const client = new PayPalClient({
    clientId: "",
    clientSecret: "",
    baseUrl: "https://api-m.sandbox.paypal.com",
  });

  it("creates structured authorized order with custom_id containing Merkle root and session reference", async () => {
    const merkleRoot = "a".repeat(64);
    const sessionId = "session-test-123";

    const res = await client.createAuthorizedOrder({
      sessionId,
      merkleRoot,
      currency: "USD",
      unitPrice: 320,
      quantity: 25,
      shippingCost: 150,
      totalAmount: 8150,
      productTitle: "4K Business Monitor",
    });

    expect(res.id).toBeDefined();
    expect(res.status).toBe("CREATED");
    expect(res.customId).toBe(`VERIPAY_ROOT:${merkleRoot};SESSION:${sessionId}`);
  });

  it("captures payment returning completion status and structured IDs", async () => {
    const res = await client.capturePayment("ORDER_123", { currency: "USD", value: 8150 });
    expect(res.id).toBeDefined();
    expect(res.status).toBe("COMPLETED");
    expect(res.amount.value).toBe("8150.00");
  });

  it("creates itemized B2B negotiated invoice", async () => {
    const res = await client.createNegotiatedInvoice({
      sessionId: "session-inv",
      merkleRoot: "b".repeat(64),
      currency: "USD",
      unitPrice: 320,
      quantity: 25,
      shippingCost: 150,
      productTitle: "4K Business Monitor",
    });

    expect(res.id).toBeDefined();
    expect(res.status).toBe("DRAFT");
    expect(res.totalAmount).toBe(8150);
  });
});
