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
    expect(res.approvalUrl).toBeDefined();
    expect(res.approvalUrl).toContain("sandbox.paypal.com/checkoutnow?token=");
  });

  it("extracts approval redirect URL when return_url and cancel_url are provided", async () => {
    const res = await client.createAuthorizedOrder({
      sessionId: "session-checkout-456",
      merkleRoot: "c".repeat(64),
      currency: "USD",
      unitPrice: 320,
      quantity: 25,
      shippingCost: 150,
      totalAmount: 8150,
      productTitle: "4K Business Monitor",
      returnUrl: "http://localhost:3000/settlement/return?sessionId=session-checkout-456",
      cancelUrl: "http://localhost:3000/settlement/cancel?sessionId=session-checkout-456",
      userAction: "CONTINUE",
    });

    expect(res.approvalUrl).toBeDefined();
    expect(res.approvalUrl).toContain("token=");
    const payerActionLink = res.links.find(
      (l) => l.rel === "payer-action" || l.rel === "approve"
    );
    expect(payerActionLink).toBeDefined();
    expect(payerActionLink?.href).toBe(res.approvalUrl);
  });

  it("retrieves order details verifying status and intent", async () => {
    const order = await client.getOrder("ORDER_TEST_789");
    expect(order.id).toBe("ORDER_TEST_789");
    expect(order.status).toBe("APPROVED");
    expect(order.intent).toBe("AUTHORIZE");
  });

  it("authorizes an approved order returning authorization ID", async () => {
    const auth = await client.authorizeOrder("ORDER_TEST_789");
    expect(auth.id).toBe("ORDER_TEST_789");
    expect(auth.authorizationId).toBeDefined();
    expect(auth.authorizationId).toContain("ORDER_TEST_789");
  });

  it("captures payment returning completion status and structured IDs", async () => {
    const res = await client.capturePayment("AUTH_123", { currency: "USD", value: 8150 });
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
