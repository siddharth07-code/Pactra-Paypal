import { describe, it, expect } from "vitest";
import { PayPalClient } from "@/lib/paypal-client";
import { SettlementService } from "@/lib/settlement-service";
import { sessionStore } from "@/lib/session-store";
import type { ProcurementSession } from "@/types/pactum";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // Ignore if not present
  }
}

describe("Live PayPal Sandbox Integration Tests", () => {
  const hasCredentials = Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
  );

  it.runIf(hasCredentials)(
    "creates a real PayPal Sandbox order and receives authoritative checkoutnow approval URL",
    async () => {
      const client = new PayPalClient();

      // Verify OAuth token acquisition from sandbox
      const token = await client.getAccessToken();
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(20);

      // Create live order in Sandbox with experience context
      const order = await client.createAuthorizedOrder({
        sessionId: "session-live-int-test",
        merkleRoot: "e".repeat(64),
        currency: "USD",
        unitPrice: 320,
        quantity: 25,
        shippingCost: 150,
        totalAmount: 8150,
        productTitle: "27 4K USB-C Professional Monitor",
        returnUrl: "http://localhost:3000/settlement/return?sessionId=session-live-int-test",
        cancelUrl: "http://localhost:3000/settlement/cancel?sessionId=session-live-int-test",
        userAction: "CONTINUE",
      });

      expect(order.id).toBeDefined();
      expect(order.id).not.toContain("MOCK");
      expect(["CREATED", "PAYER_ACTION_REQUIRED"]).toContain(order.status);
      expect(order.approvalUrl).toBeDefined();

      // Verify approval URL is authoritative PayPal Sandbox host
      const parsedUrl = new URL(order.approvalUrl!);
      expect(["www.sandbox.paypal.com", "sandbox.paypal.com"]).toContain(parsedUrl.hostname);
      expect(parsedUrl.pathname).toBe("/checkoutnow");
      expect(parsedUrl.searchParams.get("token")).toBe(order.id);

      // Verify order lookup with live Sandbox API
      const fetchedOrder = await client.getOrder(order.id);
      expect(fetchedOrder.id).toBe(order.id);
      expect(fetchedOrder.intent).toBe("AUTHORIZE");
    },
    15000
  );

  it.runIf(hasCredentials)(
    "SettlementService.initiateCheckout successfully registers live PayPal order in session",
    async () => {
      sessionStore.clear();

      const session: ProcurementSession = {
        id: "session-live-service-test",
        mandate: {
          id: "m-live",
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
          vendorId: "vendor-live",
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
        preSettlementRoot: "d".repeat(64),
        merchantAttestation: {
          merchantUrl: "https://apex.com",
          returnPolicyText: "30-day return policy",
          timestamp: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBeDefined();
      expect(res.approvalUrl).toBeDefined();
      expect(res.approvalUrl).toContain("https://www.sandbox.paypal.com/checkoutnow?token=");

      const updated = sessionStore.getSession(session.id)!;
      expect(updated.status).toBe("AWAITING_PAYPAL_APPROVAL");
      expect(updated.paypalOrderId).toBe(res.orderId);
    },
    15000
  );
});
