import { recordCommercialFixture } from "@/test/helpers/commercial-evidence";
import { describe, it, expect, beforeEach } from "vitest";
import { SettlementService, evaluateSettlementEligibility } from "@/lib/settlement-service";
import { sessionStore } from "@/lib/session-store";
import type { ProcurementSession } from "@/types/pactum";

describe("Settlement Checkout Prerequisites & Regression Tests", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  function createAuthoritativeSession(overrides: Partial<ProcurementSession> = {}): ProcurementSession {
    const session: ProcurementSession = {
      id: "session_reg_checkout_100",
      mandate: {
        id: "mandate_reg_100",
        rawPrompt: "Purchase 25 4K USB-C monitors under an $8,500 total budget",
        itemQuery: "4K USB-C Monitors",
        quantity: 25,
        maxTotalBudget: 8500,
        maxDeliveryDays: 5,
        minReturnDays: 30,
        requiredSpecs: [],
        currency: "USD",
        createdAt: new Date().toISOString(),
        version: 1,
        isLocked: true,
      },
      quotes: [],
      turns: [],
      selectedQuote: {
        vendorId: "vendor_apex",
        vendorName: "Apex Displays Wholesale",
        sku: "APX-4K-27-USBC",
        productTitle: "27 4K IPS USB-C Monitor",
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
      agreementRecord: {
        agreementId: "agree_reg_100",
        sessionId: "session_reg_checkout_100",
        vendorId: "vendor_apex",
        vendorName: "Apex Displays Wholesale",
        sku: "APX-4K-27-USBC",
        agreedPrice: 320,
        agreedOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 150,
        },
        totalCost: 320 * 25 + 150, // 8150
        agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
        acceptingParty: "VENDOR",
        acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
        round: 3,
        acceptedAt: new Date().toISOString(),
        mandateVersion: 1,
        currency: "USD",
      },
      status: "AUDIT_PENDING",
      merchantAttestation: {
        merchantUrl: "https://apexwholesale.com/returns",
        returnPolicyText: "30-day comprehensive enterprise return policy.",
        timestamp: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };

    const recorder = recordCommercialFixture(session);
    session.flightRecord = recorder.exportFlightRecord();
    session.merkleRoot = recorder.getRootHash();
    session.preSettlementRoot = recorder.getRootHash();

    return session;
  }

  describe("1. Valid Prerequisites", () => {
    it("successfully initiates checkout when current agreement, verified evidence, and audit pass", async () => {
      const session = createAuthoritativeSession();
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
      expect(updated.paypalApprovalUrl).toBe(res.approvalUrl);
      expect(updated.flightRecord).toBeDefined();
      expect(updated.auditCertificate?.passed).toBe(true);
    });

    it("rejects missing flightRecord without reconstructing historical evidence", async () => {
      const session = createAuthoritativeSession();
      session.flightRecord = undefined; // flightRecord not yet serialized
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("reconciliation");
      const updated = sessionStore.getSession(session.id)!;
      expect(updated.flightRecord).toBeUndefined();

    });
  });

  describe("2. Missing Prerequisites", () => {
    it("strictly blocks checkout when agreementRecord is completely missing", async () => {
      const session = createAuthoritativeSession({
        agreementRecord: undefined,
      });
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: session.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toBe("Current agreement, verified evidence, and audit are required.");
    });

    it("reports missing agreement record in evaluateSettlementEligibility", () => {
      const session = createAuthoritativeSession({
        agreementRecord: undefined,
      });

      const eligibility = evaluateSettlementEligibility(session);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.agreementCurrent).toBe(false);
      expect(eligibility.blockers.some((b) => b.includes("no authoritative agreement record"))).toBe(true);
    });

    it("strictly blocks checkout when finalOffer or selectedQuote is missing", async () => {
      const noOfferSession = createAuthoritativeSession({ finalOffer: undefined });
      sessionStore.saveSession(noOfferSession);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: noOfferSession.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("no final agreed offer");
    });

    it("strictly blocks checkout when flightRecord fails cryptographic integrity verification", async () => {
      const session = createAuthoritativeSession();
      // Tamper with flight record payload
      session.flightRecord!.events[0].publicPayload = { tampered: true };
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: session.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toMatch(/Flight record(er)? (cryptographic )?integrity (failed|verification failed)/);
    });
  });

  describe("3. Stale Prerequisites", () => {
    it("strictly blocks checkout when agreementRecord is from an older mandate revision", async () => {
      const session = createAuthoritativeSession();
      // Current mandate has been revised to version 2
      session.mandate.version = 2;
      // Agreement is from stale version 1
      session.agreementRecord!.mandateVersion = 1;
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: session.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("Stale agreement rejected: agreement is from mandate version 1, current mandate is version 2.");
    });

    it("strictly blocks checkout when agreementRecord vendor does not match selected vendor quote", async () => {
      const session = createAuthoritativeSession();
      session.agreementRecord!.vendorId = "vendor_other_competitor";
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: session.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("Agreement vendor mismatch");
    });

    it("strictly blocks checkout when agreementRecord vendorName does not match selected vendor name", async () => {
      const session = createAuthoritativeSession();
      session.agreementRecord!.vendorName = "Mismatched Supplier Co";
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: session.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("Agreement vendor name mismatch");
    });

    it("strictly blocks checkout when agreementRecord is bound to a different session ID", async () => {
      const session = createAuthoritativeSession();
      session.agreementRecord!.sessionId = "session_completely_different_xyz";
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const res = await service.initiateCheckout({ sessionId: session.id });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.error).toContain("Agreement session mismatch");
    });

    it("fails settlement eligibility when audit certificate is from an older mandate revision", () => {
      const session = createAuthoritativeSession();
      session.mandate.version = 2;
      session.auditCertificate = {
        certificateId: "cert_stale_123",
        sessionId: session.id,
        passed: true,
        status: "VALID",
        verifiedRoot: session.preSettlementRoot!,
        timestamp: new Date().toISOString(),
        mandateVersion: 1, // Stale version 1
        invariants: [],
      };

      const eligibility = evaluateSettlementEligibility(session);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.commercialAuditValid).toBe(false);
      expect(eligibility.blockers.some((b) => b.includes("Stale audit certificate"))).toBe(true);
    });
  });
});
