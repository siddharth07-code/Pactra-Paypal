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
