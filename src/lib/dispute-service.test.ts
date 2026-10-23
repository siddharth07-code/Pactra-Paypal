import { describe, it, expect, beforeEach } from "vitest";
import { DisputeService } from "./dispute-service";
import { sessionStore } from "./session-store";
import type { ProcurementSession, ProcurementMandate, VendorQuote } from "../types/pactum";

describe("DisputeService Unit Tests", () => {
  let service: DisputeService;
  let validSession: ProcurementSession;

  const mandate: ProcurementMandate = {
    id: "mandate-disp-1",
    rawPrompt: "Purchase 25 4K monitors under $8,500 budget",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    version: 1,
    createdAt: new Date().toISOString(),
  };

  const quote: VendorQuote = {
    vendorId: "vendor-display-disp",
    vendorName: "DisplayWorld Logistics",
    sku: "DW-4K-USB-C",
    productTitle: "DisplayWorld 4K 27-inch Monitor",
    initialUnitAsk: 360,
    currentUnitBid: 320,
    shippingCost: 150,
    deliveryDays: 3,
    returnDays: 45,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "CHANNEL3",
  };

  beforeEach(() => {
    sessionStore.clear();
    service = new DisputeService();

    validSession = sessionStore.createSession(mandate, [quote]);
    validSession.selectedQuote = quote;
    validSession.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 3,
      returnDays: 45,
      shippingCost: 150,
    };
    validSession.agreementRecord = {
      agreementId: "agree-disp-1",
      sessionId: validSession.id,
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      sku: quote.sku,
      agreedPrice: 320,
      agreedOffer: validSession.finalOffer,
      totalCost: 320 * 25 + 150, // 8150
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 4,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    validSession.status = "SETTLED";
    validSession.paypalOrderId = "ORDER-DISP-123";
    validSession.paypalCaptureId = "CAPTURE-DISP-456";
    validSession.captureAmount = 8150;
    validSession.merchantAttestation = {
      merchantUrl: "https://displayworld.example.com/item",
      domSnapshotHash: "a".repeat(64),
      returnPolicyText: "45-day return policy for wholesale enterprise customers.",
      timestamp: new Date().toISOString(),
    };

    sessionStore.saveSession(validSession);
  });

  it("opens a dispute on an existing session, commits DISPUTE_OPENED, and updates session status", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "PRICE_MISMATCH",
      description: "Vendor billed $350 per unit instead of agreed $320.",
      claimedValue: 350,
      refundRequested: true,
    });

    expect(dispute.disputeId).toMatch(/^disp_[0-9a-f]{16}$/);
    expect(dispute.sessionId).toBe(validSession.id);
    expect(dispute.status).toBe("OPENED");
    expect(dispute.category).toBe("PRICE_MISMATCH");
    expect(dispute.agreementId).toBe(validSession.agreementRecord!.agreementId);
    expect(dispute.evidenceRoot).toMatch(/^[0-9a-fA-F]{64}$/);

    const updatedSession = sessionStore.getSession(validSession.id)!;
    expect(updatedSession.status).toBe("DISPUTED");
    expect(updatedSession.disputes?.length).toBe(1);
  });

  it("fails to open a dispute on an unknown session", () => {
    expect(() => {
      service.openDispute({
        sessionId: "session-does-not-exist",
        category: "PRICE_MISMATCH",
        description: "Test error.",
      });
    }).toThrow(/not found in authoritative store/);
  });

  it("evaluates PRICE_MISMATCH: verifies breach when vendor billed above agreed total", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "PRICE_MISMATCH",
      description: "Overcharged on final invoice.",
    });

    // Agreed total: $8,150. Vendor billed $8,900 ($750 overcharge)
    const evaluated = service.evaluateDispute({
      disputeId: dispute.disputeId,
      externalEvidence: {
        actualLandedPrice: 8900,
      },
    });

    expect(evaluated.status).toBe("VERIFIED");
    expect(evaluated.resolutionRationale).toContain("Price breach verified");
    expect(evaluated.resolutionRationale).toContain("agreed landed cost is $8150.00, but vendor billed $8900.00");
    expect(evaluated.inclusionProofs.length).toBeGreaterThanOrEqual(1);
  });

  it("evaluates PRICE_MISMATCH: rejects dispute when billed price is compliant with agreement", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "PRICE_MISMATCH",
      description: "Alleged overcharge.",
    });

    const evaluated = service.evaluateDispute({
      disputeId: dispute.disputeId,
      externalEvidence: {
        actualLandedPrice: 8150, // Matches agreed price exactly
      },
    });

    expect(evaluated.status).toBe("FAILED_VERIFICATION");
    expect(evaluated.resolutionRationale).toContain("Price compliance confirmed");
  });

  it("evaluates DELIVERY_BREACH: verifies breach when carrier delivery exceeds agreed SLA", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "DELIVERY_BREACH",
      description: "Package arrived late.",
    });

    // Agreed SLA: 3 days. Actual delivery: 8 days
    const evaluated = service.evaluateDispute({
      disputeId: dispute.disputeId,
      externalEvidence: {
        actualDeliveryDays: 8,
      },
    });

    expect(evaluated.status).toBe("VERIFIED");
    expect(evaluated.resolutionRationale).toContain("Delivery SLA breach verified");
    expect(evaluated.resolutionRationale).toContain("agreed delivery window is 3 day(s), but delivery took 8 day(s)");
  });

  it("evaluates DELIVERY_BREACH: returns INSUFFICIENT_EVIDENCE when tracking evidence is missing", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "DELIVERY_BREACH",
      description: "Delivery was late but I have no tracking link.",
    });

    const evaluated = service.evaluateDispute({
      disputeId: dispute.disputeId,
    });

    expect(evaluated.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(evaluated.resolutionRationale).toContain("Carrier tracking or signed delivery timestamp is required");
  });

  it("evaluates RETURN_POLICY_BREACH: verifies breach when supplier refuses return within window", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "RETURN_POLICY_BREACH",
      description: "Vendor refused return on day 20 of 45-day window.",
    });

    const evaluated = service.evaluateDispute({
      disputeId: dispute.disputeId,
      externalEvidence: {
        returnRefusedWithinWindow: true,
      },
    });

    expect(evaluated.status).toBe("VERIFIED");
    expect(evaluated.resolutionRationale).toContain("Return policy breach verified");
    expect(evaluated.resolutionRationale).toContain("refused customer return within agreed 45-day return protection window");
  });

  it("evaluates WRONG_ITEM: verifies breach when delivered SKU does not match contract", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "WRONG_ITEM",
      description: "Received 1080p monitors instead of 4K monitors.",
    });

    const evaluated = service.evaluateDispute({
      disputeId: dispute.disputeId,
      externalEvidence: {
        deliveredSku: "DW-1080P-VGA", // Contracted: DW-4K-USB-C
      },
    });

    expect(evaluated.status).toBe("VERIFIED");
    expect(evaluated.resolutionRationale).toContain("Wrong item breach verified");
    expect(evaluated.resolutionRationale).toContain("agreed product SKU is 'DW-4K-USB-C', but supplier delivered SKU 'DW-1080P-VGA'");
  });

  it("evaluates EVIDENCE_INTEGRITY_FAILURE: detects when flight recorder was tampered with", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "EVIDENCE_INTEGRITY_FAILURE",
      description: "Tamper detection audit.",
    });

    // Tamper with the session flight record
    const updatedSession = sessionStore.getSession(validSession.id)!;
    updatedSession.flightRecord!.events[0].publicPayload = { tampered: true };
    sessionStore.saveSession(updatedSession);

    const evaluated = service.evaluateDispute({
      disputeId: dispute.disputeId,
    });

    expect(evaluated.status).toBe("VERIFIED");
    expect(evaluated.resolutionRationale).toContain("Evidence integrity compromised");
  });

  it("prepares a structured PayPal Dispute Evidence package with Merkle proofs", () => {
    const dispute = service.openDispute({
      sessionId: validSession.id,
      category: "PRICE_MISMATCH",
      description: "Overcharge dispute for PayPal submission.",
    });

    service.evaluateDispute({
      disputeId: dispute.disputeId,
      externalEvidence: {
        actualLandedPrice: 9000,
      },
    });

    const paypalPkg = service.preparePayPalDisputeEvidence(dispute.disputeId);
    expect(paypalPkg.disputeId).toBe(dispute.disputeId);
    expect(paypalPkg.sessionId).toBe(validSession.id);
    expect(paypalPkg.evidenceRoot).toMatch(/^[0-9a-fA-F]{64}$/);
    expect(paypalPkg.mandateSnapshot.quantity).toBe(25);
    expect(paypalPkg.agreementSnapshot?.agreedPrice).toBe(320);
    expect(paypalPkg.settlementReference?.paypalCaptureId).toBe("CAPTURE-DISP-456");
    expect(paypalPkg.inclusionProofs.length).toBeGreaterThanOrEqual(1);
    expect(paypalPkg.evaluationOutcome.status).toBe("VERIFIED");
  });

  describe("Phase 5.1 Dispute Semantics & Idempotency Tests", () => {
    it("evaluates dispute idempotently without appending duplicate flight events", () => {
      const dispute = service.openDispute({
        sessionId: validSession.id,
        category: "PRICE_MISMATCH",
        description: "Idempotent evaluation test",
      });

      const firstEval = service.evaluateDispute({
        disputeId: dispute.disputeId,
        externalEvidence: { actualLandedPrice: 9000 },
      });

      const sessionAfterFirst = sessionStore.getSession(validSession.id)!;
      const eventCountAfterFirst = sessionAfterFirst.flightRecord!.events.length;

      // Second evaluation of the same dispute
      const secondEval = service.evaluateDispute({
        disputeId: dispute.disputeId,
        externalEvidence: { actualLandedPrice: 9000 },
      });

      expect(secondEval.disputeId).toBe(firstEval.disputeId);
      expect(secondEval.status).toBe(firstEval.status);
      expect(secondEval.resolvedAt).toBe(firstEval.resolvedAt);

      const sessionAfterSecond = sessionStore.getSession(validSession.id)!;
      const eventCountAfterSecond = sessionAfterSecond.flightRecord!.events.length;

      // Event count must be identical (no duplicate flight record event emitted)
      expect(eventCountAfterSecond).toBe(eventCountAfterFirst);
    });

    it("distinguishes evidence integrity, claim evaluation, recommended action, and financial disposition", () => {
      const dispute = service.openDispute({
        sessionId: validSession.id,
        category: "PRICE_MISMATCH",
        description: "Semantic fields check",
      });

      const evaluated = service.evaluateDispute({
        disputeId: dispute.disputeId,
        externalEvidence: { actualLandedPrice: 9500 },
      });

      // Semantic separation:
      // 1. Evidence integrity is VALID
      expect(evaluated.evidenceIntegrity).toBe("VALID");
      // 2. Claim is verified as a breach
      expect(evaluated.claimEvaluation).toBe("BREACH_VERIFIED");
      // 3. Recommended action is a refund recommendation
      expect(evaluated.recommendedAction).toBe("RECOMMEND_FULL_REFUND");
      // 4. Financial disposition is UNEXECUTED (refund is recommended, not yet executed on PayPal!)
      expect(evaluated.financialDisposition).toBe("UNEXECUTED");
    });

    it("classifies insufficient delivery evidence as INSUFFICIENT and requires human review", () => {
      const dispute = service.openDispute({
        sessionId: validSession.id,
        category: "DELIVERY_BREACH",
        description: "Missing carrier documentation",
      });

      const evaluated = service.evaluateDispute({
        disputeId: dispute.disputeId,
        externalEvidence: {}, // Missing actualDeliveryDays and carrierTrackingUrl
      });

      expect(evaluated.evidenceIntegrity).toBe("INSUFFICIENT");
      expect(evaluated.claimEvaluation).toBe("INSUFFICIENT_EVIDENCE");
      expect(evaluated.recommendedAction).toBe("REQUIRE_HUMAN_REVIEW");
      expect(evaluated.financialDisposition).toBe("UNEXECUTED");
    });

    it("classifies tampered evidence as TAMPERED and routes to human review", () => {
      const dispute = service.openDispute({
        sessionId: validSession.id,
        category: "EVIDENCE_INTEGRITY_FAILURE",
        description: "Tamper check",
      });

      // Tamper with session flight record
      const session = sessionStore.getSession(validSession.id)!;
      session.flightRecord!.events[0].publicPayload = { tampered: true };
      sessionStore.saveSession(session);

      const evaluated = service.evaluateDispute({
        disputeId: dispute.disputeId,
      });

      expect(evaluated.evidenceIntegrity).toBe("TAMPERED");
      expect(evaluated.claimEvaluation).toBe("BREACH_VERIFIED");
      expect(evaluated.recommendedAction).toBe("REQUIRE_HUMAN_REVIEW");
      expect(evaluated.financialDisposition).toBe("UNEXECUTED");
    });
  });
});
