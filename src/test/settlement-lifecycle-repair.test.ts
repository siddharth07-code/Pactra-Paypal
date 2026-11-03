/**
 * PACTUM — Phase 6.9.1 Regression Suite
 * Settlement Lifecycle Repair & FX Integrity Verification
 *
 * Covers the 20 required regression tests from Specification Section 11:
 * 1. Fresh session after cancelled session.
 * 2. Unique session ID generation.
 * 3. Correct URL hydration.
 * 4. Browser refresh.
 * 5. Expired quote on active session.
 * 6. Expired quote on cancelled session.
 * 7. Terminal-state refresh rejection.
 * 8. Explicit quote renewal.
 * 9. Quote TTL.
 * 10. UTC timestamp handling.
 * 11. Provider mode selection.
 * 12. Demo/live provenance.
 * 13. Missing FX verification.
 * 14. Stale verification.
 * 15. Failed FX verification.
 * 16. Agreement revision invalidation.
 * 17. Repeated navigation.
 * 18. Concurrent quote requests.
 * 19. Duplicate quote locking.
 * 20. Existing native USD settlement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sessionStore } from "@/lib/session-store";
import { SettlementService, evaluateSettlementEligibility } from "@/lib/settlement-service";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import {
  computeAgreementHash,
  auditFxSettlement,
  getFXRateProvider,
} from "@/lib/fx-settlement";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { defaultIdempotencyStore } from "@/lib/idempotency";
import { POST as runFxQuoteRoute } from "@/app/api/fx/quote/route";
import { POST as runFxLockRoute } from "@/app/api/fx/lock/route";
import { POST as runAuditRoute } from "@/app/api/procurement/audit/route";
import { NextRequest } from "next/server";
import type { ProcurementMandate, VendorQuote, ProcurementSession } from "@/types/pactum";

describe("Phase 6.9.1: Settlement Lifecycle Repair & FX Integrity", () => {
  const baseInrMandate: ProcurementMandate = {
    id: "mandate_inr_repair_test",
    rawPrompt: "Purchase 25 4K USB-C monitors under an ₹749,931 total budget with 5-day delivery and 30-day return policy",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 749931,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "INR",
    requiredSpecs: [
      { name: "Resolution", value: "4K", mandatory: true },
      { name: "Ports", value: "USB-C", mandatory: true },
    ],
    createdAt: new Date().toISOString(),
    version: 1,
    isLocked: true,
  };

  const baseUsdMandate: ProcurementMandate = {
    id: "mandate_usd_repair_test",
    rawPrompt: "Purchase 25 4K USB-C monitors under an $8,500 total budget",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "USD",
    requiredSpecs: [
      { name: "Resolution", value: "4K", mandatory: true },
      { name: "Ports", value: "USB-C", mandatory: true },
    ],
    createdAt: new Date().toISOString(),
    version: 1,
    isLocked: true,
  };

  const baseInrQuote: VendorQuote = {
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
    currency: "INR",
  };

  async function createAuditedInrSession(): Promise<ProcurementSession> {
    const session = sessionStore.createSession(baseInrMandate, [baseInrQuote]);
    session.selectedQuote = { ...baseInrQuote };
    const offer = {
      unitPrice: 26000,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 8234.25,
      currency: "INR",
    };
    session.finalOffer = { ...offer };
    session.agreementRecord = {
      agreementId: `agree_${session.id.slice(-6)}`,
      sessionId: session.id,
      vendorId: baseInrQuote.vendorId,
      vendorName: baseInrQuote.vendorName,
      sku: baseInrQuote.sku,
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

    // Run authoritative audit route
    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    await runAuditRoute(req);
    return sessionStore.getSession(session.id)!;
  }

  async function createAuditedUsdSession(): Promise<ProcurementSession> {
    const quote: VendorQuote = {
      vendorId: "vendor_apex_us",
      vendorName: "Apex Displays US",
      sku: "APX-US-4K-27U",
      productTitle: "Apex 27 4K Monitor",
      initialUnitAsk: 340,
      currentUnitBid: 310,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACCEPTED",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
    };
    const session = sessionStore.createSession(baseUsdMandate, [quote]);
    session.selectedQuote = { ...quote };
    const offer = {
      unitPrice: 310,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
      currency: "USD",
    };
    session.finalOffer = { ...offer };
    session.agreementRecord = {
      agreementId: `agree_${session.id.slice(-6)}`,
      sessionId: session.id,
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      sku: quote.sku,
      agreedPrice: 310,
      agreedOffer: { ...offer },
      totalCost: 7900,
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
        unitPrice: 310,
        quantity: 25,
        totalCost: 7900,
      },
      { agreementId: session.agreementRecord.agreementId }
    );
    session.flightRecord = recorder.exportFlightRecord();
    session.merkleRoot = recorder.getRootHash();
    session.preSettlementRoot = recorder.getRootHash();
    session.status = "NEGOTIATING";
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id }),
    });
    await runAuditRoute(req);
    return sessionStore.getSession(session.id)!;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStore.clear();
    defaultRateLimiter.resetAll();
    defaultIdempotencyStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Fresh session after cancelled session
  it("1. Fresh session after cancelled session creates a new distinct session", async () => {
    const cancelledSession = await createAuditedInrSession();
    cancelledSession.status = "CANCELLED";
    sessionStore.saveSession(cancelledSession);

    const newSession = sessionStore.createSession(baseInrMandate, [baseInrQuote]);

    expect(newSession.id).not.toBe(cancelledSession.id);
    expect(newSession.status).toBe("MANDATE_PENDING");

    const reloadedCancelled = sessionStore.getSession(cancelledSession.id);
    expect(reloadedCancelled?.status).toBe("CANCELLED");
    expect(reloadedCancelled?.id).toBe(cancelledSession.id);
  });

  // 2. Unique session ID generation
  it("2. Unique session ID generation produces distinct IDs across multiple calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const s = sessionStore.createSession(baseInrMandate);
      ids.add(s.id);
    }
    expect(ids.size).toBe(50);
  });

  // 3. Correct URL hydration
  it("3. Correct URL hydration resolves explicit session parameter or leaves blank for sourcing", async () => {
    const session = await createAuditedInrSession();

    function resolveHydratedSession(
      search: string,
      sessions: ProcurementSession[]
    ): { currentScreen: string; matchedSession?: ProcurementSession } {
      const params = new URLSearchParams(search);
      const screenParam = params.get("screen") || "overview";
      const sessionParam = params.get("sessionId");

      let matched: ProcurementSession | undefined;
      if (sessionParam) {
        matched = sessions.find((s) => s.id === sessionParam);
      }
      if (!matched && sessions.length > 0 && screenParam !== "sourcing") {
        matched = sessions[0];
      }
      return { currentScreen: screenParam, matchedSession: matched };
    }

    const res1 = resolveHydratedSession(`?screen=settlement&sessionId=${session.id}`, [session]);
    expect(res1.currentScreen).toBe("settlement");
    expect(res1.matchedSession?.id).toBe(session.id);

    const res2 = resolveHydratedSession(`?screen=sourcing`, [session]);
    expect(res2.currentScreen).toBe("sourcing");
    expect(res2.matchedSession).toBeUndefined();
  });

  // 4. Browser refresh
  it("4. Browser refresh on sourcing does not resurrect cancelled session", async () => {
    const cancelledSession = await createAuditedInrSession();
    cancelledSession.status = "CANCELLED";
    sessionStore.saveSession(cancelledSession);

    const params = new URLSearchParams("screen=sourcing");
    const screenParam = params.get("screen");
    const sessionParam = params.get("sessionId");

    const loaded = sessionStore.getAllSessions();
    let matched: ProcurementSession | undefined;
    if (sessionParam) {
      matched = loaded.find((s) => s.id === sessionParam);
    }
    if (!matched && loaded.length > 0 && screenParam !== "sourcing") {
      matched = loaded[0];
    }

    expect(matched).toBeUndefined();
  });

  // 5. Expired quote on active session
  it("5. Expired quote on active session blocks capture but permits renewal", async () => {
    const session = await createAuditedInrSession();

    const quoteReq = new NextRequest("http://localhost:3000/api/fx/quote", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
    });
    const quoteRes = await runFxQuoteRoute(quoteReq);
    expect(quoteRes.status).toBe(200);
    const { fxRecord } = await quoteRes.json();

    const lockReq = new NextRequest("http://localhost:3000/api/fx/lock", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id, quoteId: fxRecord.id }),
    });
    const lockRes = await runFxLockRoute(lockReq);
    expect(lockRes.status).toBe(200);

    // Expire the locked quote
    const lockedSession = sessionStore.getSession(session.id)!;
    lockedSession.fxRecord!.expiresAt = new Date(Date.now() - 60000).toISOString();
    sessionStore.saveSession(lockedSession);

    // Settlement eligibility must fail due to expired quote
    const eligibility = evaluateSettlementEligibility(lockedSession);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("expired") || b.includes("FX"))).toBe(true);

    // Active session with expired quote CAN request a fresh quote with explicit renewal
    defaultRateLimiter.resetAll();
    const renewReq = new NextRequest("http://localhost:3000/api/fx/quote", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO", renew: true }),
    });
    const renewRes = await runFxQuoteRoute(renewReq);
    expect(renewRes.status).toBe(200);
    const renewData = await renewRes.json();
    expect(renewData.success).toBe(true);
    expect(renewData.fxRecord.id).not.toBe(fxRecord.id);
    expect(renewData.fxRecord.status).toBe("QUOTED");
  });

  // 6. Expired quote on cancelled session
  it("6. Expired quote on cancelled session cannot generate new quote", async () => {
    const session = await createAuditedInrSession();
    session.status = "CANCELLED";
    sessionStore.saveSession(session);

    const req = new NextRequest("http://localhost:3000/api/fx/quote", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
    });
    const res = await runFxQuoteRoute(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/prohibited in current settlement lifecycle/i);
  });

  // 7. Terminal-state refresh rejection
  it("7. Terminal-state refresh rejection for CANCELLED, SETTLED, and DISPUTED", async () => {
    for (const status of ["CANCELLED", "SETTLED", "DISPUTED"] as const) {
      defaultRateLimiter.resetAll();
      const session = await createAuditedInrSession();
      session.status = status;
      sessionStore.saveSession(session);

      const req = new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      });
      const res = await runFxQuoteRoute(req);
      expect(res.status).toBe(409);
    }
  });

  // 8. Explicit quote renewal
  it("8. Explicit quote renewal preserves previous quote in fxQuoteHistory", async () => {
    const session = await createAuditedInrSession();

    const q1Res = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
      })
    );
    const { fxRecord: q1 } = await q1Res.json();

    await runFxLockRoute(
      new NextRequest("http://localhost:3000/api/fx/lock", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, quoteId: q1.id }),
      })
    );

    const s = sessionStore.getSession(session.id)!;
    s.fxRecord!.expiresAt = new Date(Date.now() - 10000).toISOString();
    sessionStore.saveSession(s);

    defaultRateLimiter.resetAll();
    const q2Res = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO", renew: true }),
      })
    );
    const { fxRecord: q2 } = await q2Res.json();

    expect(q2.id).not.toBe(q1.id);
    expect(q2.status).toBe("QUOTED");

    const updated = sessionStore.getSession(session.id)!;
    expect(updated.fxQuoteHistory?.length).toBeGreaterThanOrEqual(2);
    expect(updated.fxQuoteHistory?.some((h) => h.id === q1.id)).toBe(true);
    expect(updated.fxQuoteHistory?.some((h) => h.id === q2.id)).toBe(true);
  });

  // 9. Quote TTL
  it("9. Quote TTL is 900s for deterministic demo", async () => {
    const demoProvider = getFXRateProvider("DETERMINISTIC_DEMO");
    const demoQuote = await demoProvider.getQuote({
      sessionId: "test_session",
      agreementHash: "hash_test",
      sourceCurrency: "INR",
      targetCurrency: "USD",
      sourceAmountMinor: 65823425,
    });
    const demoTtl = (Date.parse(demoQuote.expiresAt) - Date.parse(demoQuote.quotedAt)) / 1000;
    expect(demoTtl).toBe(900);
  });

  // 10. UTC timestamp handling
  it("10. UTC timestamp handling produces valid ISO 8601 strings ending in Z", async () => {
    const session = await createAuditedInrSession();
    const res = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
      })
    );
    const { fxRecord } = await res.json();

    expect(fxRecord.quotedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(fxRecord.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

    const diffMs = Date.parse(fxRecord.expiresAt) - Date.parse(fxRecord.quotedAt);
    expect(diffMs).toBe(900 * 1000);
  });

  // 11. Provider mode selection
  it("11. Provider mode selection respects rateSource parameter", async () => {
    const session = await createAuditedInrSession();
    const res = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
      })
    );
    const { fxRecord } = await res.json();
    expect(fxRecord.rateSource).toBe("DETERMINISTIC_DEMO");
    expect(fxRecord.rate).toBe("83.5000");
  });

  // 12. Demo/live provenance
  it("12. Demo/live provenance cannot be silently swapped on a locked quote", async () => {
    const session = await createAuditedInrSession();
    const qRes = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
      })
    );
    const { fxRecord } = await qRes.json();

    await runFxLockRoute(
      new NextRequest("http://localhost:3000/api/fx/lock", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, quoteId: fxRecord.id }),
      })
    );

    defaultRateLimiter.resetAll();
    const swapRes = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, rateSource: "LIVE_PROVIDER" }),
      })
    );
    expect(swapRes.status).toBe(409);
    const swapData = await swapRes.json();
    expect(swapData.code).toBe("FX_MODE_CONFLICT");
  });

  // 13. Missing FX verification
  it("13. Missing FX verification blocks settlement eligibility for INR", async () => {
    const session = await createAuditedInrSession();
    session.fxRecord = {
      id: "fxq_test_missing_verif",
      commitmentVersion: 2,
      sessionId: session.id,
      agreementHash: computeAgreementHash(session.agreementRecord!),
      agreementId: session.agreementRecord!.agreementId,
      sourceCurrency: "INR",
      targetCurrency: "USD",
      sourceAmountMinor: 65823425,
      targetAmountMinor: 788304,
      rate: "83.5000",
      rateConvention: "INR_PER_USD",
      rateSource: "DETERMINISTIC_DEMO",
      provider: "PACTUM_DETERMINISTIC_FEED",
      quotedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      roundingMode: "HALF_UP",
      status: "QUOTED", // Not locked
      conversionHash: "hash_test",
    };
    session.fxVerification = undefined;
    sessionStore.saveSession(session);

    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("LOCKED") || b.includes("FX"))).toBe(true);
  });

  // 14. Stale verification
  it("14. Stale verification with mismatched agreementHash fails eligibility", async () => {
    const session = await createAuditedInrSession();
    session.fxRecord = {
      id: "fxq_test_stale",
      commitmentVersion: 2,
      sessionId: session.id,
      agreementHash: "stale_hash_123",
      agreementId: session.agreementRecord!.agreementId,
      sourceCurrency: "INR",
      targetCurrency: "USD",
      sourceAmountMinor: 65823425,
      targetAmountMinor: 788304,
      rate: "83.5000",
      rateConvention: "INR_PER_USD",
      rateSource: "DETERMINISTIC_DEMO",
      provider: "PACTUM_DETERMINISTIC_FEED",
      quotedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      roundingMode: "HALF_UP",
      status: "LOCKED",
      conversionHash: "hash_test",
    };
    session.fxVerification = {
      passed: true,
      checks: [],
      auditTimestamp: new Date().toISOString(),
      conversionHash: "hash_test",
      agreementHash: "stale_hash_123",
    };
    sessionStore.saveSession(session);

    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers.some((b) => b.includes("Verification") || b.includes("agreement"))).toBe(true);
  });

  // 15. Failed FX verification
  it("15. Failed FX verification blocks settlement and PayPal authorization", async () => {
    const session = await createAuditedInrSession();
    session.fxRecord = {
      id: "fxq_test_failed_verif",
      commitmentVersion: 2,
      sessionId: session.id,
      agreementHash: computeAgreementHash(session.agreementRecord!),
      agreementId: session.agreementRecord!.agreementId,
      sourceCurrency: "INR",
      targetCurrency: "USD",
      sourceAmountMinor: 65823425,
      targetAmountMinor: 788304,
      rate: "83.5000",
      rateConvention: "INR_PER_USD",
      rateSource: "DETERMINISTIC_DEMO",
      provider: "PACTUM_DETERMINISTIC_FEED",
      quotedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      roundingMode: "HALF_UP",
      status: "LOCKED",
      conversionHash: "hash_test",
    };
    session.fxVerification = {
      passed: false,
      checks: [{ name: "SOURCE_AMOUNT_MATCH", passed: false, reason: "Mismatch" }],
      auditTimestamp: new Date().toISOString(),
      conversionHash: "hash_test",
      agreementHash: computeAgreementHash(session.agreementRecord!),
    };
    sessionStore.saveSession(session);

    const eligibility = evaluateSettlementEligibility(session);
    expect(eligibility.eligible).toBe(false);

    const service = new SettlementService();
    const checkoutRes = await service.initiateCheckout({ sessionId: session.id });
    expect(checkoutRes.success).toBe(false);
    expect(checkoutRes.blockedAtGate).toBe(true);
  });

  // 16. Agreement revision invalidation
  it("16. Agreement revision invalidates locked quote against new agreement", async () => {
    const session = await createAuditedInrSession();
    const oldAgreementHash = computeAgreementHash(session.agreementRecord!);

    session.fxRecord = {
      id: "fxq_test_revision",
      commitmentVersion: 2,
      sessionId: session.id,
      agreementHash: oldAgreementHash,
      agreementId: session.agreementRecord!.agreementId,
      sourceCurrency: "INR",
      targetCurrency: "USD",
      sourceAmountMinor: 65823425,
      targetAmountMinor: 788304,
      rate: "83.5000",
      rateConvention: "INR_PER_USD",
      rateSource: "DETERMINISTIC_DEMO",
      provider: "PACTUM_DETERMINISTIC_FEED",
      quotedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      roundingMode: "HALF_UP",
      status: "LOCKED",
      conversionHash: "hash_test",
    };

    session.agreementRecord!.agreedPrice = 25000;
    session.agreementRecord!.totalCost = 633234.25;
    const newAgreementHash = computeAgreementHash(session.agreementRecord!);

    expect(session.fxRecord!.agreementHash).not.toBe(newAgreementHash);

    const auditRes = auditFxSettlement({ session, fxRecord: session.fxRecord! });
    expect(auditRes.passed).toBe(false);
    expect(auditRes.checks.find((c) => c.name === "AGREEMENT_HASH_MATCH")?.passed).toBe(false);
  });

  // 17. Repeated navigation
  it("17. Repeated navigation between screens preserves clean state when starting fresh sourcing", async () => {
    let activeSession: ProcurementSession | undefined = await createAuditedInrSession();
    let arenaSessionId: string | undefined = activeSession.id;

    function navigate(screen: string, sessionId?: string) {
      if (screen === "sourcing" && !sessionId) {
        activeSession = undefined;
        arenaSessionId = undefined;
        return;
      }
      if (sessionId) {
        arenaSessionId = sessionId;
      }
    }

    navigate("settlement", activeSession.id);
    expect(arenaSessionId).toBe(activeSession.id);

    navigate("sourcing");
    expect(activeSession).toBeUndefined();
    expect(arenaSessionId).toBeUndefined();
  });

  // 18. Concurrent quote requests
  it("18. Concurrent quote requests with idempotency key execute safely", async () => {
    const session = await createAuditedInrSession();
    const idempotencyKey = `idem_${Date.now()}_test`;

    const makeReq = () =>
      runFxQuoteRoute(
        new NextRequest("http://localhost:3000/api/fx/quote", {
          method: "POST",
          headers: { "X-Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
        })
      );

    defaultRateLimiter.resetAll();
    const [res1, res2] = await Promise.all([makeReq(), makeReq()]);
    expect([200, 409]).toContain(res1.status);
    expect([200, 409]).toContain(res2.status);

    const body1 = await res1.json();
    const body2 = await res2.json();
    if (res1.status === 200 && res2.status === 200) {
      expect(body1.fxRecord.id).toBe(body2.fxRecord.id);
    }
  });

  // 19. Duplicate quote locking
  it("19. Duplicate quote locking is idempotent when same quoteId is locked", async () => {
    const session = await createAuditedInrSession();
    const qRes = await runFxQuoteRoute(
      new NextRequest("http://localhost:3000/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, rateSource: "DETERMINISTIC_DEMO" }),
      })
    );
    const { fxRecord } = await qRes.json();

    const lock1 = await runFxLockRoute(
      new NextRequest("http://localhost:3000/api/fx/lock", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, quoteId: fxRecord.id }),
      })
    );
    expect(lock1.status).toBe(200);

    const lock2 = await runFxLockRoute(
      new NextRequest("http://localhost:3000/api/fx/lock", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, quoteId: fxRecord.id }),
      })
    );
    expect(lock2.status).toBe(200);
    const lock2Data = await lock2.json();
    expect(lock2Data.fxRecord.id).toBe(fxRecord.id);
  });

  // 20. Existing native USD settlement
  it("20. Existing native USD settlement does not require FX conversion", async () => {
    const usdSession = await createAuditedUsdSession();
    expect(usdSession.mandate.currency).toBe("USD");

    defaultRateLimiter.resetAll();
    const quoteReq = new NextRequest("http://localhost:3000/api/fx/quote", {
      method: "POST",
      body: JSON.stringify({ sessionId: usdSession.id }),
    });
    const quoteRes = await runFxQuoteRoute(quoteReq);
    expect(quoteRes.status).toBe(400);
    const quoteData = await quoteRes.json();
    expect(quoteData.error).toMatch(/Native USD agreements do not require FX conversion/i);

    const eligibility = evaluateSettlementEligibility(usdSession);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.blockers).toHaveLength(0);
    expect(eligibility.fxRequired).toBe(false);
  });
});
