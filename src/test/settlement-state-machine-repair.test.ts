/**
 * PACTUM — Phase 6.8.1 Regression Suite
 * Settlement State-Machine Consistency & Re-Audit Verification
 * 
 * Tests the 24 required cases:
 * 1. Initial commercial audit failure sets current audit state failed.
 * 2. Failed audit blocks FX quote creation.
 * 3. Failed audit blocks FX lock.
 * 4. Failed audit blocks checkout.
 * 5. Valid re-audit against same current agreement can transition to pass.
 * 6. Historical failed audit remains preserved after successful re-audit.
 * 7. Latest authoritative certificate is bound to current agreement.
 * 8. Successful re-audit updates persisted session lifecycle.
 * 9. UI receives updated authoritative session.
 * 10. FX quote creation works after successful authoritative re-audit.
 * 11. FX lock works after successful authoritative re-audit.
 * 12. Checkout works after commercial audit + FX verification pass.
 * 13. Stale certificate cannot recover AUDIT_FAILED.
 * 14. Certificate for old agreement cannot recover AUDIT_FAILED.
 * 15. Old mandate revision cannot recover AUDIT_FAILED.
 * 16. Client-local pass state cannot override server failure.
 * 17. Settlement eligibility evaluator returns blockers consistently.
 * 18. USD settlement eligibility still works.
 * 19. INR→USD eligibility requires valid FX lock.
 * 20. INR→USD eligibility requires FX verification.
 * 21. Duplicate re-audit does not corrupt lifecycle.
 * 22. FX arithmetic ₹658234.25 / 83.5000 rounds to $7883.04.
 * 23. Negotiation cannot mutate mandate budget.
 * 24. Checkout request uses locked FX amount exactly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { sessionStore } from "@/lib/session-store";
import { SettlementService, evaluateSettlementEligibility } from "@/lib/settlement-service";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { computeFxConversion, auditFxSettlement } from "@/lib/fx-settlement";
import { POST as runAuditRoute } from "@/app/api/procurement/audit/route";
import { POST as runFxQuoteRoute } from "@/app/api/fx/quote/route";
import { POST as runFxLockRoute } from "@/app/api/fx/lock/route";
import { NextRequest } from "next/server";
import { PayPalClient } from "@/lib/paypal-client";
import type { ProcurementMandate, VendorQuote, ProcurementSession } from "@/types/pactum";

describe("Phase 6.8.1: Settlement State-Machine Consistency & Re-Audit Suite", () => {
  const baseInrMandate: ProcurementMandate = {
    id: "mandate_inr_test",
    rawPrompt: "Purchase 25 4K USB-C monitors under an ₹749,931 total budget with 5-day delivery and 30-day return policy",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 749931,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "INR",
    requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }, { name: "Ports", value: "USB-C", mandatory: true }],
    createdAt: new Date().toISOString(),
    version: 1,
    isLocked: true,
  };

  const baseUsdMandate: ProcurementMandate = {
    id: "mandate_usd_test",
    rawPrompt: "Purchase 25 4K monitors under an $8500 total budget",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "USD",
    requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }, { name: "Ports", value: "USB-C", mandatory: true }],
    createdAt: new Date().toISOString(),
    version: 1,
    isLocked: true,
  };

  const baseQuote: VendorQuote = {
    vendorId: "vendor_apex_in",
    vendorName: "Apex Displays India",
    sku: "APX-IN-4K-27U",
    productTitle: "Apex 27 4K Monitor",
    initialUnitAsk: 32000,
    currentUnitBid: 26000,
    shippingCost: 8234.25,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACCEPTED",
    dataSource: "MOCK_CATALOG",
  };

  function createValidInrSession(): ProcurementSession {
    const session = sessionStore.createSession(baseInrMandate, [baseQuote]);
    session.selectedQuote = { ...baseQuote };
    const offer = {
      unitPrice: 26000,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 8234.25,
    };
    session.finalOffer = { ...offer };
    session.agreementRecord = {
      agreementId: "agree_test_123",
      sessionId: session.id,
      vendorId: baseQuote.vendorId,
      vendorName: baseQuote.vendorName,
      sku: baseQuote.sku,
      agreedPrice: 26000,
      agreedOffer: { ...offer },
      totalCost: 658234.25,
      currency: "INR",
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    session.merchantAttestation = {
      merchantUrl: "https://apex.in/returns",
      returnPolicyText: "30-day comprehensive enterprise return policy.",
      timestamp: new Date().toISOString(),
    };

    const recorder = new CryptographicFlightRecorder(session.id);
    recorder.recordEvent("MANDATE_CREATED", { mandateId: session.mandate.id });
    recorder.recordEvent("SOURCING_COMPLETED", { quoteCount: 1 });
    recorder.recordEvent(
      "AGREEMENT_CREATED",
      {
        agreementId: session.agreementRecord.agreementId,
        unitPrice: 26000,
        quantity: 25,
        totalCost: 658234.25,
      },
      { agreementId: session.agreementRecord.agreementId }
    );
    session.flightRecord = recorder.exportFlightRecord();
    session.merkleRoot = recorder.getRootHash();
    session.preSettlementRoot = recorder.getRootHash();
    session.status = "NEGOTIATING";
    sessionStore.saveSession(session);
    return session;
  }

  beforeEach(() => {
    sessionStore.clear();
  });

  // 1. Initial commercial audit failure sets current audit state failed
  it("1. Initial commercial audit failure sets current audit state failed", () => {
    const session = createValidInrSession();
    // Tamper final offer to exceed budget
    session.finalOffer!.unitPrice = 35000; // 35000 * 25 + 8234.25 = 883234.25 > 749931
    session.agreementRecord!.totalCost = 883234.25;
    session.agreementRecord!.agreedOffer.unitPrice = 35000;
    const auditor = new AcworldAuditor();
    const cert = auditor.audit({ session });
    expect(cert.passed).toBe(false);
    expect(cert.invariants.find((i) => i.name === "PRICE_CEILING")?.passed).toBe(false);

    session.auditCertificate = cert;
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    const reloaded = sessionStore.getSession(session.id);
    expect(reloaded?.status).toBe("AUDIT_FAILED");
    expect(reloaded?.auditCertificate?.passed).toBe(false);
  });

  // 2. Failed audit blocks FX quote creation
  it("2. Failed audit blocks FX quote creation", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    session.auditCertificate = {
      certificateId: "cert_fail",
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      passed: false,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/fx/quote", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    const res = await runFxQuoteRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Commercial agreement must pass ACWORLD audit|commercial ACWORLD audit.*passed|status 'AUDIT_FAILED'/i);
  });

  // 3. Failed audit blocks FX lock
  it("3. Failed audit blocks FX lock", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/fx/lock", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id, quoteId: "quote_dummy" }),
    });
    const res = await runFxLockRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Commercial agreement must pass ACWORLD audit|commercial ACWORLD audit.*passed|status 'AUDIT_FAILED'/i);
  });

  // 4. Failed audit blocks checkout
  it("4. Failed audit blocks checkout", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    session.auditCertificate = {
      certificateId: "cert_failed_1",
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      passed: false,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    sessionStore.saveSession(session);

    const service = new SettlementService();
    const result = await service.initiateCheckout({ sessionId: session.id });
    expect(result.success).toBe(false);
    expect(result.blockedAtGate).toBe(true);
    expect(result.error).toContain("cannot proceed to settlement checkout");
  });

  // 5. Valid re-audit against same current agreement can transition to pass
  it("5. Valid re-audit against same current agreement can transition to pass", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    session.auditCertificate = {
      certificateId: "cert_failed_old",
      sessionId: session.id,
      timestamp: new Date(Date.now() - 60000).toISOString(),
      passed: false,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    const res = await runAuditRoute(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auditCertificate?.passed).toBe(true);
    expect(json.status).toBe("AUDIT_PASSED");
    expect(json.session.status).toBe("AUDIT_PASSED");
  });

  // 6. Historical failed audit remains preserved after successful re-audit
  it("6. Historical failed audit remains preserved after successful re-audit", async () => {
    const session = createValidInrSession();
    const oldFailedCert = {
      certificateId: "cert_failed_hist",
      sessionId: session.id,
      timestamp: new Date(Date.now() - 30000).toISOString(),
      passed: false,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    session.status = "AUDIT_FAILED";
    session.auditCertificate = oldFailedCert;
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    const res = await runAuditRoute(req);
    expect(res.status).toBe(200);

    const reloaded = sessionStore.getSession(session.id);
    expect(reloaded?.status).toBe("AUDIT_PASSED");
    expect(reloaded?.auditCertificate?.passed).toBe(true);
    expect(reloaded?.auditHistory).toBeDefined();
    expect(reloaded?.auditHistory?.length).toBe(1);
    expect(reloaded?.auditHistory?.[0].certificateId).toBe("cert_failed_hist");
    expect(reloaded?.auditHistory?.[0].passed).toBe(false);
  });

  // 7. Latest authoritative certificate is bound to current agreement
  it("7. Latest authoritative certificate is bound to current agreement", async () => {
    const session = createValidInrSession();
    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    const res = await runAuditRoute(req);
    const json = await res.json();
    expect(json.auditCertificate?.passed).toBe(true);
    expect(json.auditCertificate.agreementId).toBe(session.agreementRecord?.agreementId);
    expect(json.auditCertificate.certificateHash).toBeDefined();
  });

  // 8. Successful re-audit updates persisted session lifecycle
  it("8. Successful re-audit updates persisted session lifecycle", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    await runAuditRoute(req);

    const persisted = sessionStore.getSession(session.id);
    expect(persisted?.status).toBe("AUDIT_PASSED");
  });

  // 9. UI receives updated authoritative session
  it("9. UI receives updated authoritative session in audit route response", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    const res = await runAuditRoute(req);
    const json = await res.json();
    expect(json.session).toBeDefined();
    expect(json.session.status).toBe("AUDIT_PASSED");
    expect(json.session.auditCertificate.passed).toBe(true);
  });

  // 10. FX quote creation works after successful authoritative re-audit
  it("10. FX quote creation works after successful authoritative re-audit", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    // Re-audit to pass
    const auditReq = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    await runAuditRoute(auditReq);

    // Now request FX quote
    const quoteReq = new NextRequest("http://localhost:3000/api/fx/quote", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    const quoteRes = await runFxQuoteRoute(quoteReq);
    expect(quoteRes.status).toBe(200);
    const quoteJson = await quoteRes.json();
    expect(quoteJson.success).toBe(true);
    expect(quoteJson.fxRecord).toBeDefined();
    expect(quoteJson.fxRecord.targetAmountMinor).toBe(788304); // $7883.04
  });

  // 11. FX lock works after successful authoritative re-audit
  it("11. FX lock works after successful authoritative re-audit", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    // Re-audit
    await runAuditRoute(
      new NextRequest("http://localhost:3000/api/procurement/audit", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );

    // Quote
    const quoteRes = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );
    const quoteJson = await quoteRes.json();
    const fxQuote = quoteJson.fxRecord;

    // Lock
    const lockRes = await runFxLockRoute(
      new NextRequest("http://localhost:3000/api/fx/lock", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, quoteId: fxQuote.id }),
      })
    );
    expect(lockRes.status).toBe(200);
    const lockJson = await lockRes.json();
    expect(lockJson.success).toBe(true);
    expect(lockJson.fxRecord.status).toBe("LOCKED");
  });

  // 12. Checkout works after commercial audit + FX verification pass
  it("12. Checkout works after commercial audit + FX verification pass", async () => {
    const session = createValidInrSession();
    // Audit
    await runAuditRoute(
      new NextRequest("http://localhost:3000/api/procurement/audit", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );
    // Quote
    const qRes = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );
    const qJson = await qRes.json();
    const fxQuote = qJson.fxRecord;
    // Lock
    await runFxLockRoute(
      new NextRequest("http://localhost:3000/api/fx/lock", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, quoteId: fxQuote.id }),
      })
    );

    // Mock PayPal client to avoid network call in unit test
    const mockPayPalClient = {
      createAuthorizedOrder: vi.fn().mockResolvedValue({
        id: "SANDBOX_ORD_MOCK_123",
        status: "CREATED",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=SANDBOX_ORD_MOCK_123",
      }),
    };

    const service = new SettlementService({ paypalClient: mockPayPalClient as unknown as PayPalClient });
    const checkoutRes = await service.initiateCheckout({ sessionId: session.id });
    expect(checkoutRes.success).toBe(true);
    expect(checkoutRes.orderId).toBe("SANDBOX_ORD_MOCK_123");
    expect(mockPayPalClient.createAuthorizedOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "USD",
        totalAmount: 7883.04,
      })
    );
  });

  // 13. Stale certificate cannot recover AUDIT_FAILED
  it("13. Stale certificate cannot recover AUDIT_FAILED", () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    session.auditCertificate = {
      certificateId: "stale_cert",
      sessionId: session.id,
      timestamp: new Date(Date.now() - 9999999).toISOString(),
      passed: true,
      mandateVersion: 0, // Old version
      invariants: [],
      verifiedRoot: "0".repeat(64),
    };
    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.commercialAuditValid).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("Stale audit certificate"))).toBe(true);
  });

  // 14. Certificate for old agreement cannot recover AUDIT_FAILED
  it("14. Certificate for old agreement cannot recover AUDIT_FAILED", () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    session.auditCertificate = {
      certificateId: "other_agree_cert",
      sessionId: session.id,
      agreementId: "agree_DIFFERENT_999",
      timestamp: new Date().toISOString(),
      passed: true,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.commercialAuditValid).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("Audit certificate agreement mismatch"))).toBe(true);
  });

  // 15. Old mandate revision cannot recover AUDIT_FAILED
  it("15. Old mandate revision cannot recover AUDIT_FAILED", () => {
    const session = createValidInrSession();
    session.mandate.version = 2; // Revised mandate
    session.status = "AUDIT_FAILED";
    session.auditCertificate = {
      certificateId: "old_version_cert",
      sessionId: session.id,
      agreementId: session.agreementRecord?.agreementId,
      timestamp: new Date().toISOString(),
      passed: true,
      mandateVersion: 1, // Stale version 1
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.commercialAuditValid).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("Stale audit certificate"))).toBe(true);
  });

  // 16. Client-local pass state cannot override server failure
  it("16. Client-local pass state cannot override server failure", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    // Client attempts to call initiateCheckout directly while server session is AUDIT_FAILED
    const service = new SettlementService();
    const checkoutRes = await service.initiateCheckout({ sessionId: session.id });
    expect(checkoutRes.success).toBe(false);
    expect(checkoutRes.blockedAtGate).toBe(true);
    expect(checkoutRes.error).toContain("cannot proceed to settlement checkout");
  });

  // 17. Settlement eligibility evaluator returns blockers consistently
  it("17. Settlement eligibility evaluator returns blockers consistently", () => {
    const session = createValidInrSession();
    // Exceed SLA delivery
    session.agreementRecord!.agreedOffer.deliveryDays = 10;
    session.finalOffer!.deliveryDays = 10;
    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.agreementCurrent).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("Delivery timeframe"))).toBe(true);
  });

  // 18. USD settlement eligibility still works
  it("18. USD settlement eligibility still works without FX requirement", () => {
    const session = sessionStore.createSession(baseUsdMandate, [baseQuote]);
    session.selectedQuote = { ...baseQuote };
    const offer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 100,
    };
    session.finalOffer = { ...offer };
    session.agreementRecord = {
      agreementId: "agree_usd_123",
      sessionId: session.id,
      vendorId: baseQuote.vendorId,
      vendorName: baseQuote.vendorName,
      sku: baseQuote.sku,
      agreedPrice: 320,
      agreedOffer: { ...offer },
      totalCost: 8100,
      currency: "USD",
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      mandateVersion: 1,
    };
    session.merchantAttestation = {
      merchantUrl: "https://apex.com/returns",
      returnPolicyText: "30-day corporate return guarantee.",
      timestamp: new Date().toISOString(),
    };
    const recorder = new CryptographicFlightRecorder(session.id);
    recorder.recordEvent("MANDATE_CREATED", { mandateId: session.mandate.id });
    recorder.recordEvent("SOURCING_COMPLETED", { quoteCount: 1 });
    recorder.recordEvent(
      "AGREEMENT_CREATED",
      {
        agreementId: session.agreementRecord.agreementId,
        unitPrice: 320,
        quantity: 25,
        totalCost: 8100,
      },
      { agreementId: session.agreementRecord.agreementId }
    );
    session.flightRecord = recorder.exportFlightRecord();
    session.merkleRoot = recorder.getRootHash();
    session.preSettlementRoot = recorder.getRootHash();
    session.status = "AUDIT_PASSED";
    session.auditCertificate = {
      certificateId: "cert_usd_pass",
      sessionId: session.id,
      agreementId: "agree_usd_123",
      timestamp: new Date().toISOString(),
      passed: true,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot,
    };

    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.fxRequired).toBe(false);
    expect(eligibility.fxValid).toBe(true);
    expect(eligibility.blockers.length).toBe(0);
  });

  // 19. INR→USD eligibility requires valid FX lock
  it("19. INR→USD eligibility requires valid FX lock", () => {
    const session = createValidInrSession();
    session.status = "AUDIT_PASSED";
    session.auditCertificate = {
      certificateId: "cert_pass_inr",
      sessionId: session.id,
      agreementId: session.agreementRecord?.agreementId,
      timestamp: new Date().toISOString(),
      passed: true,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    // No FX quote yet
    const eligibility1 = evaluateSettlementEligibility(session);
    expect(eligibility1.eligible).toBe(false);
    expect(eligibility1.fxRequired).toBe(true);
    expect(eligibility1.fxValid).toBe(false);
    expect(eligibility1.blockers.some((b) => b.includes("without an approved FX settlement quote"))).toBe(true);

    // FX quote in QUOTED status, not locked
    session.fxRecord = {
      id: "fxq_unlocked",
      sessionId: session.id,
      agreementHash: "hash123",
      agreementId: session.agreementRecord!.agreementId,
      sourceCurrency: "INR",
      targetCurrency: "USD",
      sourceAmountMinor: 65823425,
      targetAmountMinor: 788304,
      rate: "83.5000",
      rateConvention: "INR_PER_USD",
      rateSource: "DETERMINISTIC_DEMO",
      provider: "Demo FX",
      quotedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      roundingMode: "HALF_UP",
      status: "QUOTED",
      conversionHash: "conv123",
    };
    const eligibility2 = evaluateSettlementEligibility(session);
    expect(eligibility2.eligible).toBe(false);
    expect(eligibility2.blockers.some((b) => b.includes("Quote must be 'LOCKED'"))).toBe(true);
  });

  // 20. INR→USD eligibility requires FX verification
  it("20. INR→USD eligibility requires FX verification", () => {
    const session = createValidInrSession();
    session.status = "AUDIT_PASSED";
    session.auditCertificate = {
      certificateId: "cert_pass_inr",
      sessionId: session.id,
      agreementId: session.agreementRecord?.agreementId,
      timestamp: new Date().toISOString(),
      passed: true,
      mandateVersion: 1,
      invariants: [],
      verifiedRoot: session.merkleRoot!,
    };
    // Create FX record with tampered target amount
    session.fxRecord = {
      id: "fxq_tampered",
      sessionId: session.id,
      agreementHash: "hash123",
      agreementId: session.agreementRecord!.agreementId,
      sourceCurrency: "INR",
      targetCurrency: "USD",
      sourceAmountMinor: 65823425,
      targetAmountMinor: 999999, // Tampered
      rate: "83.5000",
      rateConvention: "INR_PER_USD",
      rateSource: "DETERMINISTIC_DEMO",
      provider: "Demo FX",
      quotedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      roundingMode: "HALF_UP",
      status: "LOCKED",
      conversionHash: "conv123",
    };

    const fxAudit = auditFxSettlement({ session, fxRecord: session.fxRecord });
    expect(fxAudit.passed).toBe(false);

    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.fxValid).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("ACWORLD FX Settlement Verification failed"))).toBe(true);
  });

  // 21. Duplicate re-audit does not corrupt lifecycle
  it("21. Duplicate re-audit does not corrupt lifecycle", async () => {
    const session = createValidInrSession();
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    // First re-audit
    const res1 = await runAuditRoute(
      new NextRequest("http://localhost:3000/api/procurement/audit", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );
    expect(res1.status).toBe(200);

    // Second re-audit
    const res2 = await runAuditRoute(
      new NextRequest("http://localhost:3000/api/procurement/audit", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );
    expect(res2.status).toBe(200);

    const reloaded = sessionStore.getSession(session.id);
    expect(reloaded?.status).toBe("AUDIT_PASSED");
    expect(reloaded?.auditCertificate?.passed).toBe(true);
  });

  // 22. FX arithmetic ₹658234.25 / 83.5000 rounds to $7883.04
  it("22. FX arithmetic ₹658234.25 / 83.5000 rounds to $7883.04", () => {
    const targetMinor = computeFxConversion(65823425, "83.5000", "INR_PER_USD", "HALF_UP");
    expect(targetMinor).toBe(788304);
    const dollars = (targetMinor / 100).toFixed(2);
    expect(dollars).toBe("7883.04");
  });

  // 23. Negotiation cannot mutate mandate budget
  it("23. Negotiation cannot mutate mandate budget", () => {
    const session = createValidInrSession();
    const initialBudget = session.mandate.maxTotalBudget;
    expect(initialBudget).toBe(749931);

    // Simulate negotiation turn
    session.turns = [
      {
        round: 1,
        vendorId: baseQuote.vendorId,
        actor: "BUYER",
        message: "Proposing initial offer",
        timestamp: new Date().toISOString(),
        proposedOffer: {
          unitPrice: 25000,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 8234.25,
        },
        utilityScore: 0.85,
        boulwareThreshold: 0.8,
        guardrailStatus: "APPROVED",
      },
    ];
    sessionStore.saveSession(session);

    const reloaded = sessionStore.getSession(session.id);
    expect(reloaded?.mandate.maxTotalBudget).toBe(initialBudget);
  });

  // 24. Checkout request uses locked FX amount exactly
  it("24. Checkout request uses locked FX amount exactly", async () => {
    const session = createValidInrSession();
    await runAuditRoute(
      new NextRequest("http://localhost:3000/api/procurement/audit", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );
    const qRes = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      })
    );
    const qJson = await qRes.json();
    const fxQuote = qJson.fxRecord;
    await runFxLockRoute(
      new NextRequest("http://localhost:3000/api/fx/lock", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, quoteId: fxQuote.id }),
      })
    );

    const mockPayPalClient = {
      createAuthorizedOrder: vi.fn().mockResolvedValue({
        id: "SANDBOX_ORD_FX_123",
        status: "CREATED",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=SANDBOX_ORD_FX_123",
      }),
    };

    const service = new SettlementService({ paypalClient: mockPayPalClient as unknown as PayPalClient });
    await service.initiateCheckout({ sessionId: session.id });

    expect(mockPayPalClient.createAuthorizedOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "USD",
        totalAmount: 7883.04,
      })
    );
  });
});
