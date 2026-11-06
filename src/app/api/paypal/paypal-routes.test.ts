import { PayPalClient } from "@/lib/paypal-client";
import { completedOrder } from "@/test/helpers/payment-fixtures";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST as settleHandler } from "./settle/route";
import { POST as webhookHandler } from "./webhook/route";
import { POST as checkoutHandler } from "./checkout/route";
import { POST as captureHandler } from "./capture/route";
import { POST as cancelHandler } from "./cancel/route";
import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import type { ProcurementSession } from "@/types/pactum";

describe("PayPal API Routes Integration Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStore.clear();
    defaultRateLimiter.resetAll();
  });

  const validSession: ProcurementSession = {
    id: "session-route-test",
    mandate: {
      id: "mandate-rt",
      rawPrompt: "Purchase 25 4K monitors",
      itemQuery: "4K Monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
    },
    quotes: [],
    turns: [],
    selectedQuote: {
      vendorId: "vendor-apex",
      vendorName: "Apex Displays",
      sku: "APX-4K-27",
      productTitle: "27 4K Monitor",
      initialUnitAsk: 375,
      currentUnitBid: 320,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACCEPTED",
      dataSource: "CHANNEL3",
    },
    finalOffer: {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    },
    status: "AUDIT_PENDING",
    preSettlementRoot: "c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee1234",
    merchantAttestation: {
      merchantUrl: "https://apex.com",
      returnPolicyText: "30-day return policy",
      timestamp: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe("POST /api/paypal/checkout", () => {
    it("rejects request without sessionId with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/paypal/checkout", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await checkoutHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("sessionId");
    });

    it("rejects request when mandate budget constraint is violated with 403", async () => {
      const overBudgetSession: ProcurementSession = {
        ...validSession,
        finalOffer: {
          ...validSession.finalOffer!,
          unitPrice: 400, // 25 * 400 + 150 = 10,150 > 8,500
        },
      };
      sessionStore.saveSession(overBudgetSession);

      const req = new NextRequest("http://localhost:3000/api/paypal/checkout", {
        method: "POST",
        body: JSON.stringify({ sessionId: overBudgetSession.id }),
      });

      const res = await checkoutHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.blockedAtGate).toBe(true);
      expect(data.error).toContain("exceeds maximum total budget");
    });

    it("returns error when session is not found in authoritative store", async () => {
      const req = new NextRequest("http://localhost:3000/api/paypal/checkout", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session_d1239bca416243ec" }),
      });

      const res = await checkoutHandler(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Session session_d1239bca416243ec not found in authoritative store.");
    });

    it("successfully creates order and returns PayPal Sandbox approval URL", async () => {
      sessionStore.saveSession(validSession);

      const req = new NextRequest("http://localhost:3000/api/paypal/checkout", {
        method: "POST",
        headers: { host: "localhost:3000" },
        body: JSON.stringify({ sessionId: validSession.id }),
      });

      const res = await checkoutHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.orderId).toBeDefined();
      expect(data.approvalUrl).toBeDefined();
      expect(data.approvalUrl).toContain("https://www.sandbox.paypal.com/checkoutnow?token=");
    });
  });

  describe("POST /api/paypal/capture", () => {
    it("rejects request without orderId with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/paypal/capture", {
        method: "POST",
        body: JSON.stringify({ sessionId: validSession.id }),
      });

      const res = await captureHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("orderId");
    });

    it("executes audited capture when invariants pass", async () => {
      const sessionWithOrder: ProcurementSession = {
        ...validSession,
        paypalOrderId: "ORDER_ROUTE_PASS",
      };
      sessionStore.saveSession(sessionWithOrder);

      vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue({ id: "ORDER_ROUTE_PASS", status: "APPROVED", intent: "AUTHORIZE", purchase_units: [{ amount: { currency_code: "USD", value: "8150.00" }, custom_id: `VERIPAY_ROOT:${sessionWithOrder.preSettlementRoot ?? sessionWithOrder.merkleRoot};SESSION:${sessionWithOrder.id}` }] });
      const req = new NextRequest("http://localhost:3000/api/paypal/capture", {
        method: "POST",
        body: JSON.stringify({
          sessionId: sessionWithOrder.id,
          orderId: "ORDER_ROUTE_PASS",
        }),
      });

      const res = await captureHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.captureId).toBeDefined();
      expect(data.auditCertificate.passed).toBe(true);
    });
  });

  describe("POST /api/paypal/cancel", () => {
    it("safely reverts checkout state without false payment", async () => {
      sessionStore.saveSession(validSession);

      const req = new NextRequest("http://localhost:3000/api/paypal/cancel", {
        method: "POST",
        body: JSON.stringify({ sessionId: validSession.id }),
      });

      const res = await cancelHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe("CANCELLED");
    });
  });

  describe("POST /api/paypal/settle", () => {
    it("rejects request without sessionId with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/paypal/settle", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await settleHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("sessionId");
    });

    it("returns 403 when ACWORLD audit gate blocks settlement", async () => {
      // Create session where delivery days violate SLA
      const failingSession: ProcurementSession = {
        ...validSession,
        finalOffer: {
          ...validSession.finalOffer!,
          deliveryDays: 8, // max is 5
        },
      };
      sessionStore.saveSession(failingSession);

      const req = new NextRequest("http://localhost:3000/api/paypal/settle", {
        method: "POST",
        body: JSON.stringify({ sessionId: failingSession.id }),
      });

      const res = await settleHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.blockedAtGate).toBe(true);
      expect(data.auditCertificate.passed).toBe(false);
    });

    it("returns 200 on successful audit and capture", async () => {
      sessionStore.saveSession(validSession);

      const req = new NextRequest("http://localhost:3000/api/paypal/settle", {
        method: "POST",
        body: JSON.stringify({ sessionId: validSession.id }),
      });

      const res = await settleHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.captureId).toBeDefined();
      expect(data.auditCertificate.passed).toBe(true);
    });
  });

  describe("POST /api/paypal/webhook", () => {
    it("rejects malformed webhook payload with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await webhookHandler(req);
      expect(res.status).toBe(400);
    });

    it("accepts valid webhook event and updates session state", async () => {
      vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
      sessionStore.saveSession({
        ...validSession,
        status: "AUDIT_PASSED",
      });

      validSession.status = "AUDIT_PASSED";
      validSession.paypalOrderId = "ORDER-WEBHOOK-CONFIRMED";
      sessionStore.saveSession(validSession);
      vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(validSession, "CAPTURE_123", "8150.00"));
      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "paypal-transmission-sig": "VALID_SIGNATURE_FOR_TESTING_12345",
        },
        body: JSON.stringify({
          id: "WH-EVENT-1",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource: {
            id: "CAPTURE_123",
            amount: { currency_code: "USD", value: "8150.00" },
            custom_id: `VERIPAY_ROOT:c0ffee;SESSION:${validSession.id}`,
          },
        }),
      });

      const res = await webhookHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);

      const updated = sessionStore.getSession(validSession.id)!;
      expect(updated.status).toBe("PAYPAL_CAPTURED");
      expect(updated.paypalCaptureId).toBe("CAPTURE_123");
    });
  });
});
