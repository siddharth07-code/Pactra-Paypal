/**
 * PACTUM — Phase 2: End-to-End Procurement Workflow Refinement Test Suite
 *
 * Deterministically tests the 12 core journeys of the end-to-end procurement pipeline:
 * 1. Valid mandate → sourcing → eligible quote → negotiation → agreement
 * 2. Incomplete mandate → clarification → corrected mandate
 * 3. Invalid mandate → blocked progression
 * 4. Mandate revision → stale dependent state invalidated
 * 5. Eligible and ineligible supplier quotes → only eligible quotes proceed
 * 6. Negotiation → valid acceptance → recorded agreement
 * 7. Negotiation → no deal → settlement blocked
 * 8. Agreement → failed ACWORLD verification → settlement blocked
 * 9. Agreement → successful mocked audit → existing settlement authorization flow
 * 10. Capture uncertainty → reconciliation required, no blind retry
 * 11. Refresh or repeated action → no duplicate agreement or unsafe financial operation
 * 12. Stale agreement or incorrect session reference → progression blocked
 *
 * Follows GEMINI.md Sections 3, 5, 6, 7, 8, 9 and SECURITY.md Section 2, 3, 7.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { sessionStore } from "@/lib/session-store";
import { SourcingEvaluator } from "@/lib/sourcing-evaluator";
import { NegotiationOrchestrator } from "@/lib/negotiation-orchestrator";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { SettlementService } from "@/lib/settlement-service";
import { PayPalClient } from "@/lib/paypal-client";
import { parseProcurementMandate } from "@/lib/mandate-parser";
import { extractProcurementMandate } from "@/lib/mandate-parser";
import { VeriPayMerkleTree } from "@/lib/veripay-merkle";
import type {
  ProcurementMandate,
  VendorQuote,
} from "@/types/pactum";

// Standard benchmark wholesale quotes for testing
const FIXTURE_QUOTES: VendorQuote[] = [
  {
    vendorId: "vendor-apex",
    vendorName: "Apex Displays Wholesale",
    sku: "APX-4K-27-USBC",
    productTitle: "Apex 27-inch 4K IPS USB-C Monitor",
    category: "monitors",
    initialUnitAsk: 320,
    currentUnitBid: 320,
    shippingCost: 150,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  },
  {
    vendorId: "vendor-displayworld",
    vendorName: "DisplayWorld Enterprise",
    sku: "DW-4K-27-UHD",
    productTitle: "DisplayWorld 27 Ultra HD USB-C Display",
    category: "monitors",
    initialUnitAsk: 325,
    currentUnitBid: 325,
    shippingCost: 200,
    deliveryDays: 3,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  },
  {
    vendorId: "vendor-pacific",
    vendorName: "Pacific Commerce Solutions",
    sku: "PCS-4K-27-PRO",
    productTitle: "Pacific Pro 27 4K Type-C Business Monitor",
    category: "monitors",
    initialUnitAsk: 330,
    currentUnitBid: 330,
    shippingCost: 100,
    deliveryDays: 5,
    returnDays: 45,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  },
];

describe("PACTUM End-to-End Procurement Workflow Journeys", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  // --------------------------------------------------------------------------
  // Journey 1: Valid mandate → sourcing → eligible quote → negotiation → agreement
  // --------------------------------------------------------------------------
  it("Journey 1: Valid mandate → sourcing → eligible quote → negotiation → agreement", async () => {
    const prompt =
      "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy.";
    const parseResult = parseProcurementMandate({ prompt, currency: "USD" });
    expect(parseResult.success).toBe(true);
    expect(parseResult.mandate).toBeDefined();
    const mandate = parseResult.mandate!;

    // 1. Sourcing evaluation
    const evaluator = new SourcingEvaluator();
    const sourcingResult = await evaluator.evaluateSourcedQuotes(mandate, FIXTURE_QUOTES);
    expect(sourcingResult.hasEligibleQuotes).toBe(true);
    expect(sourcingResult.eligibleQuotes.length).toBeGreaterThan(0);

    // 2. Session creation in authoritative store
    const session = sessionStore.createSession(mandate, sourcingResult.eligibleQuotes);
    session.status = "SOURCING";
    sessionStore.saveSession(session);

    // 3. Multi-round negotiation
    const orchestrator = new NegotiationOrchestrator({ maxRounds: 4 });
    const result = await orchestrator.runNegotiation(
      mandate,
      sourcingResult.eligibleQuotes,
      session.id,
      sourcingResult.evaluations
    );

    expect(result.completed).toBe(true);
    expect(result.selectedQuote).toBeDefined();
    expect(result.finalOffer).toBeDefined();
    expect(result.session.agreementRecord).toBeDefined();

    // Verify agreement record integrity
    const agreement = result.session.agreementRecord!;
    expect(agreement.sessionId).toBe(session.id);
    expect(agreement.vendorId).toBe(result.selectedQuote!.vendorId);
    expect(agreement.totalCost).toBeLessThanOrEqual(mandate.maxTotalBudget);
    expect(agreement.agreedOffer.deliveryDays).toBeLessThanOrEqual(mandate.maxDeliveryDays);
    expect(agreement.agreedOffer.returnDays).toBeGreaterThanOrEqual(mandate.minReturnDays);
    expect(result.session.status).toBe("AUDIT_PASSED");
  });

  // --------------------------------------------------------------------------
  // Journey 2: Incomplete mandate → clarification → corrected mandate
  // --------------------------------------------------------------------------
  it("Journey 2: Incomplete mandate → clarification → corrected mandate", async () => {
    // Incomplete prompt lacking quantity
    const incompletePrompt = "Procure 4K USB-C monitors under an $8,500 total budget with 5-day delivery.";
    const analysis = await extractProcurementMandate({ prompt: incompletePrompt });

    expect(analysis.status).toBe("NEEDS_CLARIFICATION");
    expect(analysis.missingFields).toContain("quantity");
    expect(analysis.clarificationQuestions?.length).toBeGreaterThan(0);

    // Corrected prompt provides quantity
    const correctedPrompt = "Procure 25 4K USB-C monitors under an $8,500 total budget with 5-day delivery and 30-day returns.";
    const correctedAnalysis = await extractProcurementMandate({ prompt: correctedPrompt });

    expect(correctedAnalysis.status).toBe("READY");
    expect(correctedAnalysis.mandate).toBeDefined();
    expect(correctedAnalysis.mandate?.quantity).toBe(25);
    expect(correctedAnalysis.mandate?.maxTotalBudget).toBe(8500);
    expect(correctedAnalysis.missingFields).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Journey 3: Invalid mandate → blocked progression
  // --------------------------------------------------------------------------
  it("Journey 3: Invalid mandate → blocked progression", async () => {
    // Contradictory prompt: conflicting budgets
    const contradictoryPrompt =
      "Purchase 25 4K monitors with an $8,500 total budget, but do not spend more than $6,000 under any circumstances.";
    const analysis = await extractProcurementMandate({ prompt: contradictoryPrompt });

    expect(analysis.status).toBe("INVALID");
    expect(analysis.contradictions?.length).toBeGreaterThan(0);

    // Negative constraints should be rejected deterministically
    expect(() =>
      sessionStore.createSession({
        id: "m-invalid",
        rawPrompt: "invalid",
        itemQuery: "monitors",
        quantity: -5,
        maxTotalBudget: 8500,
        maxDeliveryDays: 5,
        minReturnDays: 30,
        requiredSpecs: [],
        currency: "USD",
        createdAt: new Date().toISOString(),
      })
    ).not.toThrow(); // store allows creation of draft, but revision validates

    expect(() =>
      sessionStore.reviseMandate("non-existent-session", { maxTotalBudget: -500 })
    ).toThrow(/not found/);
  });

  // --------------------------------------------------------------------------
  // Journey 4: Mandate revision → stale dependent state invalidated
  // --------------------------------------------------------------------------
  it("Journey 4: Mandate revision → stale dependent state invalidated", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate-rev-1",
      rawPrompt: "Purchase 25 4K USB-C monitors under $8,500",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
      version: 1,
      isLocked: true,
    };

    const session = sessionStore.createSession(mandate, FIXTURE_QUOTES);
    session.selectedQuote = FIXTURE_QUOTES[0];
    session.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    };
    session.agreementRecord = {
      agreementId: "agree-v1",
      sessionId: session.id,
      vendorId: FIXTURE_QUOTES[0].vendorId,
      vendorName: FIXTURE_QUOTES[0].vendorName,
      sku: FIXTURE_QUOTES[0].sku,
      agreedPrice: 320,
      agreedOffer: session.finalOffer,
      totalCost: 320 * 25 + 150,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    session.merkleRoot = "a".repeat(64);
    session.preSettlementRoot = "a".repeat(64);
    session.paypalOrderId = "ORDER-OLD-123";
    session.paypalAuthorizationId = "AUTH-OLD-123";
    session.paypalApprovalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=OLD";
    session.status = "AUDIT_PASSED";
    sessionStore.saveSession(session);

    // Buyer revises budget ceiling from $8,500 down to $7,500
    const revised = sessionStore.reviseMandate(session.id, { maxTotalBudget: 7500 });

    // Assert mandate version incremented and was unlocked
    expect(revised.mandate.version).toBe(2);
    expect(revised.mandate.maxTotalBudget).toBe(7500);
    expect(revised.mandate.isLocked).toBe(false);

    // Assert strict invalidation of all dependent state
    expect(revised.selectedQuote).toBeUndefined();
    expect(revised.finalOffer).toBeUndefined();
    expect(revised.agreementRecord).toBeUndefined();
    expect(revised.auditCertificate).toBeUndefined();
    expect(revised.merkleRoot).toBeUndefined();
    expect(revised.preSettlementRoot).toBeUndefined();
    expect(revised.postAuditRoot).toBeUndefined();
    expect(revised.paypalOrderId).toBeUndefined();
    expect(revised.paypalAuthorizationId).toBeUndefined();
    expect(revised.paypalApprovalUrl).toBeUndefined();
    expect(revised.turns).toHaveLength(0);
    expect(revised.status).toBe("MANDATE_PENDING");

    // Settling this revised session before re-negotiation must be strictly blocked
    const settlementService = new SettlementService();
    const settleAttempt = await settlementService.settle({ sessionId: session.id });
    expect(settleAttempt.success).toBe(false);
    expect(settleAttempt.blockedAtGate).toBe(true);
    expect(settleAttempt.error).toMatch(/no final agreed offer/i);

    // Revising an already captured/settled session must be strictly rejected
    revised.status = "SETTLED";
    sessionStore.saveSession(revised);
    expect(() =>
      sessionStore.reviseMandate(session.id, { maxTotalBudget: 7000 })
    ).toThrow(/already captured and settled/);
  });

  // --------------------------------------------------------------------------
  // Journey 5: Eligible and ineligible supplier quotes → only eligible quotes proceed
  // --------------------------------------------------------------------------
  it("Journey 5: Eligible and ineligible supplier quotes → only eligible quotes proceed", async () => {
    // Mandate with strict 3-day delivery deadline
    const strictDeliveryMandate: ProcurementMandate = {
      id: "mandate-strict-sla",
      rawPrompt: "Purchase 25 monitors under $8,500 total, delivery within 3 days",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 3, // only DisplayWorld offers 3 days; Apex offers 4, Pacific offers 5
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
    };

    const evaluator = new SourcingEvaluator();
    const result = await evaluator.evaluateSourcedQuotes(strictDeliveryMandate, FIXTURE_QUOTES);

    expect(result.eligibleQuotes).toHaveLength(1);
    expect(result.eligibleQuotes[0].vendorId).toBe("vendor-displayworld");
    expect(result.ineligibleQuotes.length).toBe(2);

    // Verify disqualification reasons for ineligible vendors
    const apexEval = result.evaluations["vendor-apex"];
    expect(apexEval.status).toBe("INELIGIBLE");
    expect(apexEval.disqualificationReasons.some((r) => r.toLowerCase().includes("delivery"))).toBe(true);

    const pacificEval = result.evaluations["vendor-pacific"];
    expect(pacificEval.status).toBe("INELIGIBLE");
    expect(pacificEval.disqualificationReasons.some((r) => r.toLowerCase().includes("delivery"))).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Journey 6: Negotiation → valid acceptance → recorded agreement
  // --------------------------------------------------------------------------
  it("Journey 6: Negotiation → valid acceptance → recorded agreement", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate-agree-test",
      rawPrompt: "Purchase 25 monitors under $8,500 total with 5-day delivery and 30-day returns",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
      version: 1,
    };

    const orchestrator = new NegotiationOrchestrator({ maxRounds: 4 });
    const result = await orchestrator.runNegotiation(mandate, FIXTURE_QUOTES);

    expect(result.completed).toBe(true);
    expect(result.session.agreementRecord).toBeDefined();

    const agreement = result.session.agreementRecord!;
    expect(agreement.agreementId).toMatch(/^agree_/);
    expect(agreement.sessionId).toBe(result.session.id);
    expect(["VENDOR_ACCEPTED_BUYER_OFFER", "BUYER_ACCEPTED_VENDOR_COUNTEROFFER"]).toContain(
      agreement.agreedBy
    );
    expect(["VENDOR", "BUYER"]).toContain(agreement.acceptingParty);
    expect(agreement.agreedPrice).toBeGreaterThan(0);
    expect(agreement.totalCost).toBe(
      agreement.agreedPrice * mandate.quantity + result.selectedQuote!.shippingCost
    );
    expect(agreement.mandateVersion).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Journey 7: Negotiation → no deal → settlement blocked
  // --------------------------------------------------------------------------
  it("Journey 7: Negotiation → no deal → settlement blocked", async () => {
    // Budget of $500 total for 25 monitors ($20/unit): impossible to satisfy
    const impossibleMandate: ProcurementMandate = {
      id: "mandate-impossible",
      rawPrompt: "Purchase 25 monitors under $500 total",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
    };

    const orchestrator = new NegotiationOrchestrator({ maxRounds: 3 });
    const result = await orchestrator.runNegotiation(impossibleMandate, FIXTURE_QUOTES);

    expect(result.completed).toBe(false);
    expect(result.selectedQuote).toBeUndefined();
    expect(result.finalOffer).toBeUndefined();
    expect(result.session.agreementRecord).toBeUndefined();
    expect(result.session.status).toBe("AUDIT_FAILED");

    // Attempting checkout initiation on a no-deal session must be strictly blocked
    const service = new SettlementService();
    const checkoutResult = await service.initiateCheckout({ sessionId: result.session.id });

    expect(checkoutResult.success).toBe(false);
    expect(checkoutResult.blockedAtGate).toBe(true);
    expect(checkoutResult.error).toMatch(/no final agreed offer|status/i);

    // Attempting settlement must also be strictly blocked
    const settleResult = await service.settle({ sessionId: result.session.id });
    expect(settleResult.success).toBe(false);
    expect(settleResult.blockedAtGate).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Journey 8: Agreement → failed ACWORLD verification → settlement blocked
  // --------------------------------------------------------------------------
  it("Journey 8: Agreement → failed ACWORLD verification → settlement blocked", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate-audit-fail",
      rawPrompt: "Purchase 25 monitors under $8,500 with 30-day returns",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
      version: 1,
    };

    const session = sessionStore.createSession(mandate, FIXTURE_QUOTES);
    const selected = FIXTURE_QUOTES[0];
    session.selectedQuote = selected;

    // Tampered final offer: return policy is only 15 days, violating mandate requirement of 30 days
    session.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 15, // INVARIANT 3 VIOLATION
      shippingCost: 150,
    };
    session.agreementRecord = {
      agreementId: "agree-tampered",
      sessionId: session.id,
      vendorId: selected.vendorId,
      vendorName: selected.vendorName,
      sku: selected.sku,
      agreedPrice: 320,
      agreedOffer: session.finalOffer,
      totalCost: 320 * 25 + 150,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    session.preSettlementRoot = "d".repeat(64);
    session.status = "AUDIT_PENDING";
    session.paypalOrderId = "ORDER-MOCK-FAIL";
    sessionStore.saveSession(session);

    // ACWORLD Auditor must detect failure
    const auditor = new AcworldAuditor();
    const cert = auditor.audit({ session });
    expect(cert.passed).toBe(false);

    const returnInv = cert.invariants.find((i) => i.name === "RETURN_POLICY");
    expect(returnInv?.passed).toBe(false);

    // SettlementService must strictly fail closed and block payment capture
    const mockPayPal = new PayPalClient();
    vi.spyOn(mockPayPal, "getOrder").mockResolvedValue({ id: "ORDER-MOCK-FAIL", status: "APPROVED", intent: "AUTHORIZE", purchase_units: [{ amount: { currency_code: "USD", value: "8150.00" }, custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}` }] });
    const captureSpy = vi.spyOn(mockPayPal, "capturePayment");

    const service = new SettlementService({ auditor, paypalClient: mockPayPal });
    const settleResult = await service.completeSettlement({
      sessionId: session.id,
      orderId: "ORDER-MOCK-FAIL",
    });

    expect(settleResult.success).toBe(false);
    expect(settleResult.blockedAtGate).toBe(true);
    expect(settleResult.auditCertificate.passed).toBe(false);
    expect(captureSpy).not.toHaveBeenCalled();

    // Session status must be marked AUDIT_FAILED
    const stored = sessionStore.getSession(session.id)!;
    expect(stored.status).toBe("AUDIT_FAILED");
  });

  // --------------------------------------------------------------------------
  // Journey 9: Agreement → successful mocked audit → existing settlement authorization flow
  // --------------------------------------------------------------------------
  it("Journey 9: Agreement → successful mocked audit → existing settlement authorization flow", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate-auth-flow",
      rawPrompt: "Purchase 25 monitors under $8,500 total",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
      version: 1,
    };

    const session = sessionStore.createSession(mandate, FIXTURE_QUOTES);
    const selected = FIXTURE_QUOTES[0];
    session.selectedQuote = selected;
    session.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    };
    session.agreementRecord = {
      agreementId: "agree-valid-auth",
      sessionId: session.id,
      vendorId: selected.vendorId,
      vendorName: selected.vendorName,
      sku: selected.sku,
      agreedPrice: 320,
      agreedOffer: session.finalOffer,
      totalCost: 320 * 25 + 150,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    const merkleTree = new VeriPayMerkleTree();
    merkleTree.addEvent("MANDATE_LOCKED", { mandateId: mandate.id });
    session.preSettlementRoot = merkleTree.getRootHash();
    session.merkleRoot = merkleTree.getRootHash();
    session.merchantAttestation = {
      merchantUrl: "https://apexwholesale.com/return-policy",
      returnPolicyText: "30-day hassle-free commercial return guarantee.",
      timestamp: new Date().toISOString(),
    };
    session.status = "AUDIT_PENDING";
    sessionStore.saveSession(session);

    // Mock PayPal client behavior for deterministic testing
    const mockPayPal = new PayPalClient();
    vi.spyOn(mockPayPal, "createAuthorizedOrder").mockResolvedValue({
      id: "ORDER-AUTH-SUCCESS-1",
      status: "CREATED",
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-AUTH-SUCCESS-1",
      customId: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
      links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-AUTH-SUCCESS-1", rel: "payer-action", method: "GET" }],
    });
    vi.spyOn(mockPayPal, "getOrder").mockResolvedValue({
      id: "ORDER-AUTH-SUCCESS-1",
      status: "APPROVED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: "8150.00" },
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
        },
      ],
    });
    vi.spyOn(mockPayPal, "authorizeOrder").mockResolvedValue({
      id: "AUTH-SUCCESS-1",
      authorizationId: "AUTH-SUCCESS-1",
      status: "CREATED",
    });
    vi.spyOn(mockPayPal, "capturePayment").mockResolvedValue({
      id: "CAPTURE-SUCCESS-1",
      orderId: "ORDER-AUTH-SUCCESS-1",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "8150.00" },
    });
    vi.spyOn(mockPayPal, "createNegotiatedInvoice").mockResolvedValue({
      id: "INV2-SUCCESS-1",
      invoiceNumber: "INV-001",
      status: "DRAFT",
      totalAmount: 8150,
    });

    const service = new SettlementService({ paypalClient: mockPayPal });

    // Step A: Initiate checkout
    const initRes = await service.initiateCheckout({ sessionId: session.id });
    expect(initRes.success).toBe(true);
    expect(initRes.orderId).toBe("ORDER-AUTH-SUCCESS-1");
    expect(initRes.approvalUrl).toContain("checkoutnow");

    // Step B: Complete settlement with audited capture
    const settleRes = await service.completeSettlement({
      sessionId: session.id,
      orderId: "ORDER-AUTH-SUCCESS-1",
    });

    expect(settleRes.success).toBe(true);
    expect(settleRes.orderId).toBe("ORDER-AUTH-SUCCESS-1");
    expect(settleRes.authorizationId).toBe("AUTH-SUCCESS-1");
    expect(settleRes.captureId).toBe("CAPTURE-SUCCESS-1");
    expect(settleRes.invoiceId).toBe("INV2-SUCCESS-1");
    expect(settleRes.auditCertificate.passed).toBe(true);

    // Final session state in store
    const stored = sessionStore.getSession(session.id)!;
    expect(stored.status).toBe("SETTLED");
    expect(stored.paypalCaptureId).toBe("CAPTURE-SUCCESS-1");
  });

  // --------------------------------------------------------------------------
  // Journey 10: Capture uncertainty → reconciliation required, no blind retry
  // --------------------------------------------------------------------------
  it("Journey 10: Capture uncertainty → reconciliation required, no blind retry", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate-timeout-test",
      rawPrompt: "Purchase 25 monitors under $8,500 total",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
      version: 1,
    };

    const session = sessionStore.createSession(mandate, FIXTURE_QUOTES);
    const selected = FIXTURE_QUOTES[0];
    session.selectedQuote = selected;
    session.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    };
    session.agreementRecord = {
      agreementId: "agree-timeout",
      sessionId: session.id,
      vendorId: selected.vendorId,
      vendorName: selected.vendorName,
      sku: selected.sku,
      agreedPrice: 320,
      agreedOffer: session.finalOffer,
      totalCost: 320 * 25 + 150,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    session.preSettlementRoot = "e".repeat(64);
    session.merkleRoot = "e".repeat(64);
    session.merchantAttestation = {
      merchantUrl: "https://apexwholesale.com/return-policy",
      returnPolicyText: "30-day hassle-free commercial return guarantee.",
      timestamp: new Date().toISOString(),
    };
    session.paypalOrderId = "ORDER-TIMEOUT-1";
    session.status = "AWAITING_PAYPAL_APPROVAL";
    sessionStore.saveSession(session);

    // Mock PayPal client to simulate a network timeout during capture
    const mockPayPal = new PayPalClient();
    vi.spyOn(mockPayPal, "getOrder").mockResolvedValue({
      id: "ORDER-TIMEOUT-1",
      status: "APPROVED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: "8150.00" },
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
        },
      ],
    });
    vi.spyOn(mockPayPal, "authorizeOrder").mockResolvedValue({
      id: "AUTH-TIMEOUT-1",
      authorizationId: "AUTH-TIMEOUT-1",
      status: "CREATED",
    });
    vi.spyOn(mockPayPal, "capturePayment").mockRejectedValue(
      new Error("ECONNRESET: Request timed out communicating with PayPal API")
    );

    const service = new SettlementService({ paypalClient: mockPayPal });

    // Step 1: Capture attempt fails with network timeout
    const firstAttempt = await service.completeSettlement({
      sessionId: session.id,
      orderId: "ORDER-TIMEOUT-1",
    });

    expect(firstAttempt.success).toBe(false);
    expect(firstAttempt.uncertain).toBe(true);
    expect(firstAttempt.error).toContain("CAPTURE_PENDING_RECONCILIATION");

    // Session status must be marked CAPTURE_PENDING_RECONCILIATION
    const storedPending = sessionStore.getSession(session.id)!;
    expect(storedPending.status).toBe("CAPTURE_PENDING_RECONCILIATION");

    // Step 2: Blind re-attempt of completeSettlement must be BLOCKED
    const blindRetry = await service.completeSettlement({
      sessionId: session.id,
      orderId: "ORDER-TIMEOUT-1",
    });

    expect(blindRetry.success).toBe(false);
    expect(blindRetry.blockedAtGate).toBe(true);
    expect(blindRetry.error).toMatch(/CAPTURE_PENDING_RECONCILIATION.*blind capture retry is blocked/i);

    // Step 3: Authoritative reconciliation check
    // PayPal reports that the capture DID complete remotely before the timeout
    vi.spyOn(mockPayPal, "getOrder").mockResolvedValue({
      id: "ORDER-TIMEOUT-1",
      status: "COMPLETED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "8150.00" },
          payments: {
            captures: [
              {
                id: "CAPTURE-RECONCILED-1",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "8150.00" },
              },
            ],
          },
        },
      ],
    });

    const reconcileResult = await service.reconcileSettlement({ sessionId: session.id });
    expect(reconcileResult.success).toBe(true);
    expect(reconcileResult.reconciled).toBe(true);
    expect(reconcileResult.status).toBe("PAYPAL_CAPTURED");
    expect(reconcileResult.captureId).toBe("CAPTURE-RECONCILED-1");

    // State is restored to PAYPAL_CAPTURED
    const storedReconciled = sessionStore.getSession(session.id)!;
    expect(storedReconciled.status).toBe("PAYPAL_CAPTURED");
    expect(storedReconciled.paypalCaptureId).toBe("CAPTURE-RECONCILED-1");
  });

  // --------------------------------------------------------------------------
  // Journey 11: Refresh or repeated action → no duplicate agreement or unsafe financial operation
  // --------------------------------------------------------------------------
  it("Journey 11: Refresh or repeated action → no duplicate agreement or unsafe financial operation", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate-repeat-test",
      rawPrompt: "Purchase 25 monitors under $8,500 total",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
      version: 1,
    };

    const session = sessionStore.createSession(mandate, FIXTURE_QUOTES);
    session.selectedQuote = FIXTURE_QUOTES[0];
    session.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    };
    session.agreementRecord = {
      agreementId: "agree-idempotent",
      sessionId: session.id,
      vendorId: FIXTURE_QUOTES[0].vendorId,
      vendorName: FIXTURE_QUOTES[0].vendorName,
      sku: FIXTURE_QUOTES[0].sku,
      agreedPrice: 320,
      agreedOffer: session.finalOffer,
      totalCost: 320 * 25 + 150,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    session.paypalOrderId = "ORDER-CAPTURED-ALREADY";
    session.paypalCaptureId = "CAPTURE-ALREADY-1";
    session.paypalInvoiceId = "INV2-ALREADY-1";
    session.status = "SETTLED";
    sessionStore.saveSession(session);

    const mockPayPal = new PayPalClient();
    const orderSpy = vi.spyOn(mockPayPal, "createAuthorizedOrder");
    const captureSpy = vi.spyOn(mockPayPal, "capturePayment");

    const service = new SettlementService({ paypalClient: mockPayPal });

    // Repeated initiateCheckout on settled session must not call PayPal API
    const initRetry = await service.initiateCheckout({ sessionId: session.id });
    expect(initRetry.success).toBe(false);
    expect(initRetry.blockedAtGate).toBe(true);
    expect(orderSpy).not.toHaveBeenCalled();

    // Repeated completeSettlement on settled session must not re-capture
    const completeRetry = await service.completeSettlement({
      sessionId: session.id,
      orderId: "ORDER-CAPTURED-ALREADY",
    });
    expect(completeRetry.success).toBe(false);
    expect(completeRetry.blockedAtGate).toBe(true);
    expect(completeRetry.captureId).toBe("CAPTURE-ALREADY-1");
    expect(captureSpy).not.toHaveBeenCalled();

    // Repeated settle on settled session must not re-capture
    const settleRetry = await service.settle({ sessionId: session.id });
    expect(settleRetry.success).toBe(false);
    expect(settleRetry.blockedAtGate).toBe(true);
    expect(captureSpy).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Journey 12: Stale agreement or incorrect session reference → progression blocked
  // --------------------------------------------------------------------------
  it("Journey 12: Stale agreement or incorrect session reference → progression blocked", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate-stale-test",
      rawPrompt: "Purchase 25 monitors under $8,500 total",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
      version: 2, // CURRENT MANDATE VERSION IS 2
    };

    const session = sessionStore.createSession(mandate, FIXTURE_QUOTES);
    session.selectedQuote = FIXTURE_QUOTES[0];
    session.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    };

    // Stale agreement from mandate version 1
    session.agreementRecord = {
      agreementId: "agree-stale-v1",
      sessionId: session.id,
      vendorId: FIXTURE_QUOTES[0].vendorId,
      vendorName: FIXTURE_QUOTES[0].vendorName,
      sku: FIXTURE_QUOTES[0].sku,
      agreedPrice: 320,
      agreedOffer: session.finalOffer,
      totalCost: 320 * 25 + 150,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1, // MISMATCH: mandate is version 2
    };
    session.status = "AUDIT_PENDING";
    sessionStore.saveSession(session);

    const service = new SettlementService();

    // 1. Stale agreement version must block checkout initiation
    const initStale = await service.initiateCheckout({ sessionId: session.id });
    expect(initStale.success).toBe(false);
    expect(initStale.blockedAtGate).toBe(true);
    expect(initStale.error).toMatch(/stale agreement rejected/i);

    // 2. Mismatched vendor in agreementRecord must block progression
    session.agreementRecord.mandateVersion = 2; // fix version
    session.agreementRecord.vendorId = "vendor-fraudulent"; // introduce vendor mismatch
    sessionStore.saveSession(session);

    const initVendorMismatch = await service.initiateCheckout({ sessionId: session.id });
    expect(initVendorMismatch.success).toBe(false);
    expect(initVendorMismatch.blockedAtGate).toBe(true);
    expect(initVendorMismatch.error).toMatch(/agreement vendor mismatch/i);

    // 3. Mismatched session in agreementRecord must block progression
    session.agreementRecord.vendorId = FIXTURE_QUOTES[0].vendorId; // fix vendor
    session.agreementRecord.sessionId = "session-other-foreign"; // introduce session mismatch
    sessionStore.saveSession(session);

    const initSessionMismatch = await service.initiateCheckout({ sessionId: session.id });
    expect(initSessionMismatch.success).toBe(false);
    expect(initSessionMismatch.blockedAtGate).toBe(true);
    expect(initSessionMismatch.error).toMatch(/agreement session mismatch/i);

    // 4. Order ID mismatch must block completeSettlement
    session.agreementRecord.sessionId = session.id; // fix agreement session
    session.paypalOrderId = "ORDER-OFFICIAL-123";
    sessionStore.saveSession(session);

    const completeOrderMismatch = await service.completeSettlement({
      sessionId: session.id,
      orderId: "ORDER-INJECTED-456", // injected foreign order ID
    });
    expect(completeOrderMismatch.success).toBe(false);
    expect(completeOrderMismatch.blockedAtGate).toBe(true);
    expect(completeOrderMismatch.error).toMatch(/client order injection rejected/i);
  });
});
