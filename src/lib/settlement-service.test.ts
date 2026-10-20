import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettlementService } from "./settlement-service";
import { sessionStore } from "./session-store";
import { PayPalClient } from "./paypal-client";
import type { ProcurementSession } from "../types/pactum";

describe("Settlement Service & Audited Capture Gate Tests", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  const validSession: ProcurementSession = {
    id: "session-settle-gate",
    mandate: {
      id: "m-gate",
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

  describe("Phase A: initiateCheckout", () => {
    it("successfully creates PayPal Sandbox order and returns validated approval redirect URL", async () => {
      sessionStore.saveSession(validSession);

      const service = new SettlementService();
      const res = await service.initiateCheckout({
        sessionId: validSession.id,
        origin: "http://localhost:3000",
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBeDefined();
      expect(res.approvalUrl).toBeDefined();
      expect(res.approvalUrl).toContain("https://www.sandbox.paypal.com/checkoutnow?token=");

      const updated = sessionStore.getSession(validSession.id)!;
      expect(updated.status).toBe("AWAITING_PAYPAL_APPROVAL");
      expect(updated.paypalOrderId).toBe(res.orderId);
      expect(updated.paypalApprovalUrl).toBe(res.approvalUrl);
    });

    it("pre-emptively blocks checkout initiation if mandate financial ceiling is violated", async () => {
      const overBudgetSession: ProcurementSession = {
        ...validSession,
        finalOffer: {
          ...validSession.finalOffer!,
          unitPrice: 500, // 25 * 500 + 150 = 12,650 > 8,500
        },
      };
      sessionStore.saveSession(overBudgetSession);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: overBudgetSession.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("exceeds maximum total budget");
    });

    it("pre-emptively blocks checkout initiation if delivery SLA is violated", async () => {
      const badDeliverySession: ProcurementSession = {
        ...validSession,
        finalOffer: {
          ...validSession.finalOffer!,
          deliveryDays: 10, // max is 5
        },
      };
      sessionStore.saveSession(badDeliverySession);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: badDeliverySession.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("Delivery timeframe");
    });

    it("pre-emptively blocks checkout initiation if return window SLA is violated", async () => {
      const badReturnSession: ProcurementSession = {
        ...validSession,
        finalOffer: {
          ...validSession.finalOffer!,
          returnDays: 14, // min is 30
        },
      };
      sessionStore.saveSession(badReturnSession);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: badReturnSession.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("Return policy window");
    });

    it("rejects checkout initiation when session is not found in authoritative store", async () => {
      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: "session_d1239bca416243ec" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Session session_d1239bca416243ec not found in authoritative store.");
    });

    it("pre-emptively blocks checkout initiation if condition invariant fails in ACWORLD audit", async () => {
      const badConditionSession: ProcurementSession = {
        ...validSession,
        mandate: {
          ...validSession.mandate,
          requiredCondition: "REFURBISHED",
        },
        selectedQuote: {
          ...validSession.selectedQuote!,
          condition: "NEW", // condition mismatch!
        },
      };
      sessionStore.saveSession(badConditionSession);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: badConditionSession.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("ACWORLD audit gate failed pre-checkout verification");
    });

    it("evaluates ACWORLD audit on valid session during initiateCheckout and attaches auditCertificate", async () => {
      const unAuditedSession: ProcurementSession = {
        ...validSession,
        auditCertificate: undefined,
        status: "AUDIT_PENDING",
      };
      sessionStore.saveSession(unAuditedSession);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: unAuditedSession.id });

      expect(res.success).toBe(true);
      const updated = sessionStore.getSession(unAuditedSession.id)!;
      expect(updated.auditCertificate).toBeDefined();
      expect(updated.auditCertificate?.passed).toBe(true);
      expect(updated.status).toBe("AWAITING_PAYPAL_APPROVAL");
    });
  });

  describe("Phase B: completeSettlement & Audited Capture Gate", () => {
    it("CRITICAL RULE: When ACWORLD audit fails, PayPal capturePayment is NEVER called", async () => {
      // Inject over-budget final offer so audit fails on Price Ceiling
      const failingSession: ProcurementSession = {
        ...validSession,
        finalOffer: {
          ...validSession.finalOffer!,
          unitPrice: 400, // 25 * 400 + 150 = 10,150 > 8,500
        },
      };
      sessionStore.saveSession(failingSession);

      const mockPayPalClient = new PayPalClient();
      const captureSpy = vi.spyOn(mockPayPalClient, "capturePayment");

      const service = new SettlementService({ paypalClient: mockPayPalClient });
      const response = await service.settle({ sessionId: failingSession.id });

      expect(response.success).toBe(false);
      expect(response.blockedAtGate).toBe(true);
      expect(response.auditCertificate.passed).toBe(false);

      // PROVE PayPal capture was NEVER invoked
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it("blocks capture if order is still in PAYER_ACTION_REQUIRED status (buyer not yet approved)", async () => {
      sessionStore.saveSession(validSession);

      const mockPayPalClient = new PayPalClient();
      vi.spyOn(mockPayPalClient, "getOrder").mockResolvedValue({
        id: "ORDER_UNAPPROVED",
        status: "PAYER_ACTION_REQUIRED",
        intent: "AUTHORIZE",
      });
      const captureSpy = vi.spyOn(mockPayPalClient, "capturePayment");

      const service = new SettlementService({ paypalClient: mockPayPalClient });
      const res = await service.completeSettlement({
        sessionId: validSession.id,
        orderId: "ORDER_UNAPPROVED",
      });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("not yet been approved");
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it("rejects client injection of arbitrary order ID not bound to authoritative session", async () => {
      const sessionWithOrder: ProcurementSession = {
        ...validSession,
        paypalOrderId: "GENUINE_ORDER_123",
      };
      sessionStore.saveSession(sessionWithOrder);

      const service = new SettlementService();
      const res = await service.completeSettlement({
        sessionId: sessionWithOrder.id,
        orderId: "ATTACKER_INJECTED_ORDER_456",
      });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("Client order injection rejected");
    });

    it("allows eligible capture path when ACWORLD audit passes", async () => {
      sessionStore.saveSession(validSession);

      const mockPayPalClient = new PayPalClient();
      const captureSpy = vi.spyOn(mockPayPalClient, "capturePayment");

      const service = new SettlementService({ paypalClient: mockPayPalClient });
      const response = await service.settle({ sessionId: validSession.id });

      expect(response.success).toBe(true);
      expect(response.blockedAtGate).toBe(false);
      expect(response.auditCertificate.passed).toBe(true);
      expect(response.captureId).toBeDefined();

      // Verify capturePayment was called once
      expect(captureSpy).toHaveBeenCalledTimes(1);

      const updatedSession = sessionStore.getSession(validSession.id)!;
      expect(updatedSession.status).toBe("SETTLED");
      expect(updatedSession.paypalCaptureId).toBe(response.captureId);
      expect(updatedSession.postAuditRoot).toBeDefined();
    });

    it("prevents duplicate capture execution on already captured session", async () => {
      const capturedSession: ProcurementSession = {
        ...validSession,
        status: "PAYPAL_CAPTURED",
      };
      sessionStore.saveSession(capturedSession);

      const mockPayPalClient = new PayPalClient();
      const captureSpy = vi.spyOn(mockPayPalClient, "capturePayment");

      const service = new SettlementService({ paypalClient: mockPayPalClient });
      const response = await service.settle({ sessionId: capturedSession.id });

      expect(response.success).toBe(false);
      expect(response.blockedAtGate).toBe(true);
      expect(response.error).toContain("already been settled");
      expect(captureSpy).not.toHaveBeenCalled();
    });
  });

  describe("Phase C: cancelCheckout", () => {
    it("safely reverts checkout state to CANCELLED without false payment status", () => {
      const pendingSession: ProcurementSession = {
        ...validSession,
        status: "AWAITING_PAYPAL_APPROVAL",
      };
      sessionStore.saveSession(pendingSession);

      const service = new SettlementService();
      const res = service.cancelCheckout(pendingSession.id);

      expect(res.success).toBe(true);
      expect(res.session?.status).toBe("CANCELLED");
      expect(res.session?.paypalCaptureId).toBeUndefined();
    });
  });
});
