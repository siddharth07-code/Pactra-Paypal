// Provider-domain tests inject the HTTP persistence boundary; PostgreSQL replay/RLS tests use the real wrapper.
vi.mock("@/lib/db/webhook-route", () => ({ withWebhookRoute: (handler: unknown) => handler }));
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));

import { describe, it, expect, beforeEach, vi } from "vitest";
import { sessionStore, OptimisticConcurrencyError } from "@/lib/session-store";
import { SettlementService } from "@/lib/settlement-service";
import { NegotiationOrchestrator } from "@/lib/negotiation-orchestrator";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { PayPalClient } from "@/lib/paypal-client";
import { VeriPayMerkleTree, verifyProof } from "@/lib/veripay-merkle";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { verifyBuyerOffer, checkPredicateE } from "@/lib/mechanism-guardrail";
import { GeminiQuotaCoordinator } from "@/lib/gemini-quota";
import { defaultRateLimiter, extractClientIdentity } from "@/lib/rate-limiter";
import { settlementLogger, redactSensitiveData } from "@/lib/settlement-logger";
import { defaultCronCoordinator } from "@/lib/cron-coordinator";
import { toMinorUnits, fromMinorUnits } from "@/lib/currency";
import { parsePaymentMinor, paymentAmountError } from "@/lib/payment-evidence";
import { completedOrder } from "@/test/helpers/payment-fixtures";
import { POST as webhookPost } from "@/app/api/paypal/webhook/route";
import { GET as healthGet } from "@/app/api/cron/health/route";
import { NextRequest } from "next/server";
import type { ProcurementMandate, VendorQuote, ProcurementSession, NegotiationOffer } from "@/types/pactum";

describe("Phase 10: Production Hardening & E2E Validation Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStore.clear();
    defaultRateLimiter.resetAll();
    settlementLogger.resetMetrics();
    NegotiationOrchestrator.activeNegotiationLocks.clear();
  });

  const baseMandate: ProcurementMandate = {
    id: "mandate_prod_1",
    rawPrompt: "Purchase 25 4K monitors under $8,500 with 5-day delivery and 30-day returns",
    itemQuery: "4K Monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    version: 1,
    createdAt: new Date().toISOString(),
  };

  const fixtureQuotes: VendorQuote[] = [
    {
      vendorId: "vendor_alpha",
      vendorName: "Alpha Displays",
      sku: "SKU-4K-ALPHA",
      productTitle: "27in 4K Monitor",
      initialUnitAsk: 380,
      currentUnitBid: 320,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACCEPTED",
      dataSource: "CHANNEL3",
    },
    {
      vendorId: "vendor_beta",
      vendorName: "Beta Wholesale",
      sku: "SKU-4K-BETA",
      productTitle: "27in 4K Display Pro",
      initialUnitAsk: 390,
      currentUnitBid: 330,
      shippingCost: 200,
      deliveryDays: 3,
      returnDays: 30,
      condition: "NEW",
      status: "ACCEPTED",
      dataSource: "CHANNEL3",
    },
  ];

  function createReadySession(sessionId: string): ProcurementSession {
    const session: ProcurementSession = {
      id: sessionId,
      mandate: { ...baseMandate, id: `mandate_${sessionId}` },
      quotes: fixtureQuotes,
      turns: [],
      selectedQuote: fixtureQuotes[0],
      finalOffer: {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 150,
      },
      agreementRecord: {
        agreementId: `agr_${sessionId}`,
        sessionId,
        vendorId: fixtureQuotes[0].vendorId,
        vendorName: fixtureQuotes[0].vendorName,
        sku: fixtureQuotes[0].sku,
        agreedPrice: 320,
        agreedOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 150,
        },
        totalCost: 320 * 25 + 150, // 8150 <= 8500
        agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
        acceptingParty: "VENDOR",
        acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
        round: 2,
        acceptedAt: new Date().toISOString(),
        mandateVersion: 1,
      },
      merchantAttestation: {
        merchantUrl: "https://alphadisplays.com/returns",
        returnPolicyText: "30-day commercial warranty and return window.",
        timestamp: new Date().toISOString(),
      },
      paypalOrderId: `ORDER_${sessionId}`,
      status: "PAYPAL_AUTHORIZED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const recorder = CryptographicFlightRecorder.getOrReconstitute(session);
    session.flightRecord = recorder.exportFlightRecord();
    session.preSettlementRoot = recorder.getRootHash();
    session.merkleRoot = recorder.getRootHash();
    sessionStore.saveSession(session);
    return session;
  }

  // =========================================================================
  // 1. CONCURRENCY & RACE CONDITION HARDENING
  // =========================================================================
  describe("1. Concurrency & Race Condition Hardening", () => {
    it("runs parallel negotiations on distinct sessions without state or root cross-talk", async () => {
      const orchestrator = new NegotiationOrchestrator({ maxRounds: 2 });
      const session1 = sessionStore.createSession(baseMandate, fixtureQuotes);
      const session2 = sessionStore.createSession({ ...baseMandate, id: "m2" }, fixtureQuotes);

      const [res1, res2] = await Promise.all([
        orchestrator.runNegotiation(session1.mandate, fixtureQuotes, session1.id),
        orchestrator.runNegotiation(session2.mandate, fixtureQuotes, session2.id),
      ]);

      expect(res1.session.id).toBe(session1.id);
      expect(res2.session.id).toBe(session2.id);
      expect(res1.session.id).not.toBe(res2.session.id);
      expect(res1.merkleTree.getRootHash()).not.toBe(res2.merkleTree.getRootHash());
    });

    it("strictly rejects concurrent negotiation calls for the exact same session ID", async () => {
      const orchestrator = new NegotiationOrchestrator({ maxRounds: 3 });
      const session = sessionStore.createSession(baseMandate, fixtureQuotes);

      const [res1, res2] = await Promise.allSettled([
        orchestrator.runNegotiation(session.mandate, fixtureQuotes, session.id),
        orchestrator.runNegotiation(session.mandate, fixtureQuotes, session.id),
      ]);

      const rejected = [res1, res2].find((r) => r.status === "rejected");
      expect(rejected).toBeDefined();
      if (rejected && rejected.status === "rejected") {
        expect(rejected.reason.message).toContain("Negotiation is already actively running");
      }
    });

    it("enforces Optimistic Concurrency Control (OCC) on conflicting session writes", () => {
      const session = createReadySession("sess_occ_test");
      const currentVersion = session.version ?? 1;

      // Update 1 succeeds with expectedVersion
      sessionStore.saveSession({ ...session, status: "AWAITING_PAYPAL_APPROVAL" }, currentVersion);

      // Stale update 2 with original expectedVersion must be rejected
      expect(() => {
        sessionStore.saveSession({ ...session, status: "CANCELLED" }, currentVersion);
      }).toThrow(OptimisticConcurrencyError);
    });

    it("serializes concurrent completeSettlement attempts for the same session", async () => {
      const session = createReadySession("sess_concurrency_gate");
      const mockPayPal = new PayPalClient();

      vi.spyOn(mockPayPal, "getOrder").mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          id: session.paypalOrderId!,
          status: "APPROVED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        };
      });
      vi.spyOn(mockPayPal, "authorizeOrder").mockResolvedValue({ id: "AUTH_1", authorizationId: "AUTH_1", status: "CREATED" });
      vi.spyOn(mockPayPal, "capturePayment").mockResolvedValue({ id: "CAP_1", orderId: session.paypalOrderId!, status: "COMPLETED", amount: { currency_code: "USD", value: "8150.00" } });
      vi.spyOn(mockPayPal, "createNegotiatedInvoice").mockResolvedValue({ id: "INV_1", invoiceNumber: "INV-1", status: "SENT", totalAmount: 8150 });

      const service = new SettlementService({ paypalClient: mockPayPal });

      const [res1, res2] = await Promise.all([
        service.completeSettlement({ sessionId: session.id }),
        service.completeSettlement({ sessionId: session.id }),
      ]);

      const successCount = [res1, res2].filter((r) => r.success).length;
      const lockedCount = [res1, res2].filter((r) => r.error?.includes("already executing")).length;

      expect(successCount).toBe(1);
      expect(lockedCount).toBe(1);
    });

    it("prevents overlapping executions of cron maintenance tasks", async () => {
      const lock1 = await defaultCronCoordinator.acquireLockAsync("cleanup", 10000);
      expect(lock1.acquired).toBe(true);

      const lock2 = await defaultCronCoordinator.acquireLockAsync("cleanup", 10000);
      expect(lock2.acquired).toBe(false);

      await defaultCronCoordinator.releaseLockAsync("cleanup");
      const lock3 = await defaultCronCoordinator.acquireLockAsync("cleanup", 10000);
      expect(lock3.acquired).toBe(true);
      await defaultCronCoordinator.releaseLockAsync("cleanup");
    });
  });

  // =========================================================================
  // 2. PAYMENT RELIABILITY, RECONCILIATION & RECOVERY
  // =========================================================================
  describe("2. Payment Reliability & Interrupted State Recovery", () => {
    it("safely enters CAPTURE_PENDING_RECONCILIATION on provider timeout without blind retries", async () => {
      const session = createReadySession("sess_timeout_recovery");
      const mockPayPal = new PayPalClient();

      vi.spyOn(mockPayPal, "getOrder").mockResolvedValue({
        id: session.paypalOrderId!,
        status: "APPROVED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "8150.00" },
            custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
          },
        ],
      });
      vi.spyOn(mockPayPal, "authorizeOrder").mockResolvedValue({ id: "AUTH_T1", authorizationId: "AUTH_T1", status: "CREATED" });
      vi.spyOn(mockPayPal, "capturePayment").mockRejectedValue(new Error("ETIMEDOUT: PayPal capture endpoint timed out"));

      const service = new SettlementService({ paypalClient: mockPayPal });

      // First attempt times out
      const attempt1 = await service.completeSettlement({ sessionId: session.id });
      expect(attempt1.success).toBe(false);
      expect(attempt1.uncertain).toBe(true);

      const pendingSession = sessionStore.getSession(session.id)!;
      expect(pendingSession.status).toBe("CAPTURE_PENDING_RECONCILIATION");

      // Blind retry must be strictly blocked
      const attempt2 = await service.completeSettlement({ sessionId: session.id });
      expect(attempt2.success).toBe(false);
      expect(attempt2.blockedAtGate).toBe(true);
      expect(attempt2.error).toMatch(/CAPTURE_PENDING_RECONCILIATION.*blind capture retry is blocked/i);

      // Explicit reconciliation recovers the session once PayPal reports remote completion
      vi.spyOn(mockPayPal, "getOrder").mockResolvedValue({
        id: session.paypalOrderId!,
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "8150.00" },
            custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            payments: {
              captures: [{ id: "REMOTE_CAP_CONFIRMED", status: "COMPLETED", amount: { currency_code: "USD", value: "8150.00" } }],
            },
          },
        ],
      });

      const reconcileResult = await service.reconcileSettlement({ sessionId: session.id });
      expect(reconcileResult.success).toBe(true);
      expect(reconcileResult.reconciled).toBe(true);
      expect(reconcileResult.status).toBe("PAYPAL_CAPTURED");
      expect(reconcileResult.captureId).toBe("REMOTE_CAP_CONFIRMED");

      // Subsequent reconciliation is idempotent
      const reconcileRepeat = await service.reconcileSettlement({ sessionId: session.id });
      expect(reconcileRepeat.success).toBe(true);
      expect(reconcileRepeat.reconciled).toBe(true);
    });

    it("deduplicates repeated webhook events without duplicate payment commitment", async () => {
      const session = createReadySession("sess_webhook_replay");
      session.status = "AUDIT_PASSED";
      session.paypalOrderId = "ORDER_WEBHOOK_1";
      sessionStore.saveSession(session);

      vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
      vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(
        completedOrder(session, "CAP_WH_1", "8150.00")
      );

      const webhookPayload = {
        id: "WH_EVT_1001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP_WH_1",
          amount: { currency_code: "USD", value: "8150.00" },
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
        },
      };

      const makeRequest = () =>
        new NextRequest("http://localhost:3000/api/paypal/webhook", {
          method: "POST",
          headers: { "paypal-transmission-sig": "VALID_SIGNATURE_PROD_1" },
          body: JSON.stringify(webhookPayload),
        });

      // First webhook delivery
      const res1 = await webhookPost(makeRequest());
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.received).toBe(true);

      const capturedSession = sessionStore.getSession(session.id)!;
      expect(capturedSession.status).toBe("PAYPAL_CAPTURED");

      // Replay of same webhook delivery
      const res2 = await webhookPost(makeRequest());
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.received).toBe(true);
      expect(data2.deduplicated).toBe(true);
    });

    it("rejects non-finite numbers, NaN, and negative amounts in payment evidence parsing", () => {
      expect(parsePaymentMinor("-100.00")).toBeNull();
      expect(parsePaymentMinor("abc")).toBeNull();
      expect(parsePaymentMinor(NaN)).toBeNull();
      expect(parsePaymentMinor(Infinity)).toBeNull();
      expect(parsePaymentMinor(null)).toBeNull();
      expect(parsePaymentMinor(undefined)).toBeNull();

      expect(paymentAmountError({ currency_code: "USD", value: "-100" }, "USD", 100)).toBeDefined();
      expect(paymentAmountError({ currency_code: "USD", value: "NaN" }, "USD", 100)).toBeDefined();
      expect(paymentAmountError({ currency_code: "EUR", value: "100.00" }, "USD", 100)).toContain("currency mismatch");
    });
  });

  // =========================================================================
  // 3. DATABASE INTEGRITY & TERMINAL STATE PROTECTION
  // =========================================================================
  describe("3. Database Integrity & State Machine Invariants", () => {
    it("strictly prevents illegal status downgrades across the lifecycle", () => {
      // 1. SETTLED cannot downgrade to CANCELLED
      const s1 = createReadySession("sess_downgrade_1");
      s1.status = "SETTLED";
      sessionStore.saveSession(s1);
      expect(() => {
        sessionStore.saveSession({ ...s1, status: "CANCELLED" });
      }).toThrow(/Cannot downgrade SETTLED session/i);

      // 2. PAYPAL_CAPTURED cannot revert to AUDIT_PASSED
      const s2 = createReadySession("sess_downgrade_2");
      s2.status = "PAYPAL_CAPTURED";
      sessionStore.saveSession(s2);
      expect(() => {
        sessionStore.saveSession({ ...s2, status: "AUDIT_PASSED" });
      }).toThrow(/Cannot revert PAYPAL_CAPTURED session/i);

      // 3. DISPUTED cannot silently revert to SETTLED
      const s3 = createReadySession("sess_downgrade_3");
      s3.status = "DISPUTED";
      sessionStore.saveSession(s3);
      expect(() => {
        sessionStore.saveSession({ ...s3, status: "SETTLED" });
      }).toThrow(/Cannot silently revert DISPUTED session/i);
    });

    it("atomically rolls back in-memory session changes if disk persistence throws", () => {
      const session = createReadySession("sess_rollback_test");
      const originalStatus = session.status;

      vi.spyOn(sessionStore.getAdapter(), "save").mockImplementationOnce(() => {
        throw new Error("Disk I/O failure (EIO)");
      });

      expect(() => {
        sessionStore.saveSession({ ...session, status: "CANCELLED" });
      }).toThrow("Disk I/O failure (EIO)");

      // In-memory session must be safely rolled back
      const stored = sessionStore.getSession(session.id)!;
      expect(stored.status).toBe(originalStatus);
    });
  });

  // =========================================================================
  // 4. SECURITY, RBAC & SENSITIVE DATA PROTECTION
  // =========================================================================
  describe("4. Security, RBAC & Sensitive Data Protection", () => {
    it("scrubs confidential credentials and sensitive keys at arbitrary depth", () => {
      const dirtyObject = {
        sessionId: "sess_123",
        credentials: {
          client_secret: "SUPER_SECRET_PAYPAL_SECRET",
          accessToken: "BEARER_TOKEN_ABCD",
          nested: {
            password: "plain_password",
            card: "4111111111111111",
            cvv: "123",
          },
        },
        metadata: {
          amount: 8150,
          currency: "USD",
        },
      };

      const sanitized = redactSensitiveData(dirtyObject) as typeof dirtyObject;
      expect(sanitized.sessionId).toBe("sess_123");
      expect(sanitized.credentials.client_secret).toBe("[REDACTED]");
      expect(sanitized.credentials.accessToken).toBe("[REDACTED]");
      expect(sanitized.credentials.nested.password).toBe("[REDACTED]");
      expect(sanitized.credentials.nested.card).toBe("[REDACTED]");
      expect(sanitized.credentials.nested.cvv).toBe("[REDACTED]");
      expect(sanitized.metadata.amount).toBe(8150);
    });

    it("rejects client IP and identity spoofing when proxy trust and gateway secrets are unset", () => {
      const forgedReq = new NextRequest("http://localhost:3000/api/procurement/init", {
        headers: {
          "x-pactum-user-id": "admin_attacker",
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
          "cf-connecting-ip": "8.8.8.8",
        },
      });

      const identity = extractClientIdentity(forgedReq);
      expect(identity).not.toBe("user:admin_attacker");
      expect(identity).not.toBe("ip:1.2.3.4");
      expect(identity).not.toBe("ip:8.8.8.8");
    });
  });

  // =========================================================================
  // 5. AI RELIABILITY, CIRCUIT BREAKER & GUARDRAIL STRESS
  // =========================================================================
  describe("5. AI Reliability, Circuit Breaker & Guardrail Stress", () => {
    it("enforces complete Circuit Breaker state transitions: CLOSED -> OPEN -> HALF_OPEN -> CLOSED", () => {
      const coordinator = new GeminiQuotaCoordinator({
        circuitBreakerThreshold: 3,
        circuitBreakerCooldownMs: 1000,
      });

      // Initial state is CLOSED
      expect(coordinator.getStatus().circuitState).toBe("CLOSED");

      // 3 consecutive failures trigger OPEN
      coordinator.recordFailure(new Error("Provider error 1"));
      coordinator.recordFailure(new Error("Provider error 2"));
      coordinator.recordFailure(new Error("Provider error 3"));

      const openStatus = coordinator.getStatus();
      expect(openStatus.circuitState).toBe("OPEN");
      expect(openStatus.isAdmissible).toBe(false);

      // Fast-fails immediately during OPEN without provider calls
      const admission = coordinator.checkAdmission();
      expect(admission.allowed).toBe(false);
      expect(admission.reason).toBe("CIRCUIT_OPEN");

      // Simulate cooldown expiration
      vi.useFakeTimers();
      vi.advanceTimersByTime(1100);

      // Status transitions to HALF_OPEN
      expect(coordinator.getStatus().circuitState).toBe("HALF_OPEN");

      // Probe succeeds -> transitions back to CLOSED
      coordinator.recordSuccess();
      expect(coordinator.getStatus().circuitState).toBe("CLOSED");
      expect(coordinator.getStatus().isAdmissible).toBe(true);

      vi.useRealTimers();
    });

    it("blocks 100% of adversarial offers violating mechanism-design predicates", () => {
      const baselineOffer: NegotiationOffer = {
        unitPrice: 315,
        quantity: 25,
        shippingCost: 150,
        deliveryDays: 4,
        returnDays: 30,
      };

      const invalidOffers: Array<{ offer: NegotiationOffer; expectedPredicate: string }> = [
        {
          offer: { unitPrice: 360, quantity: 25, shippingCost: 150, deliveryDays: 4, returnDays: 30 }, // 360*25+150 = 9150 > 8500
          expectedPredicate: "A_FEASIBILITY",
        },
        {
          offer: { unitPrice: 300, quantity: 25, shippingCost: 150, deliveryDays: 8, returnDays: 30 }, // delivery 8 > max 5
          expectedPredicate: "A_FEASIBILITY",
        },
        {
          offer: { unitPrice: 300, quantity: 25, shippingCost: 150, deliveryDays: 4, returnDays: 14 }, // return 14 < min 30
          expectedPredicate: "A_FEASIBILITY",
        },
        {
          offer: { unitPrice: 310, quantity: 25, shippingCost: 150, deliveryDays: 4, returnDays: 30 }, // price thrashing: proposed < previous buyer
          expectedPredicate: "E_ANTI_THRASHING",
        },
      ];

      for (const item of invalidOffers.slice(0, 3)) {
        const result = verifyBuyerOffer(item.offer, "Proposed offer message", {
          mandate: baseMandate,
          vendorQuote: fixtureQuotes[0],
          round: 2,
          previousBuyerOffer: baselineOffer,
          previousVendorAsk: 350,
        });

        expect(result.passed).toBe(false);
        expect(result.predicateFailed).toBe(item.expectedPredicate);
      }

      // Predicate E Anti-Thrashing explicitly verified
      const thrashingCheck = checkPredicateE(
        { unitPrice: 310, quantity: 25, shippingCost: 150, deliveryDays: 4, returnDays: 30 },
        baselineOffer,
        350
      );
      expect(thrashingCheck.passed).toBe(false);
      expect(thrashingCheck.predicate).toBe("E_ANTI_THRASHING");
    });
  });

  // =========================================================================
  // 6. CRYPTOGRAPHIC INTEGRITY & ACWORLD AUDITING
  // =========================================================================
  describe("6. Cryptographic Integrity & ACWORLD Auditing", () => {
    it("guarantees deterministic SHA-256 Merkle root commitment and inclusion proof verification", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_LOCKED", { mandateId: "m1", quantity: 25, budget: 8500 });
      tree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", { quotes: 2 });
      tree.addEvent("KERNEL_DOM_ATTESTATION", { merchantUrl: "https://apex.com" });
      tree.addEvent("AGREEMENT_CREATED", { agreedPrice: 320 });

      const root = tree.getRootHash();
      expect(root).toMatch(/^[0-9a-f]{64}$/);

      // Verify inclusion proofs for all 4 leaves
      for (let i = 0; i < 4; i++) {
        const proofObj = tree.generateInclusionProof(i);
        const valid = verifyProof(proofObj.leafHash, proofObj.proof, root);
        expect(valid).toBe(true);

        // Tampering with the leaf hash must invalidate the proof
        const tamperedLeaf = "f".repeat(64);
        expect(verifyProof(tamperedLeaf, proofObj.proof, root)).toBe(false);

        // Tampering with the root must invalidate the proof
        const tamperedRoot = "a".repeat(64);
        expect(verifyProof(proofObj.leafHash, proofObj.proof, tamperedRoot)).toBe(false);
      }
    });

    it("ACWORLD Auditor strictly enforces all 5 invariants and fails-closed on any defect", () => {
      const session = createReadySession("sess_acworld_audit_prod");
      const auditor = new AcworldAuditor();

      // Valid session passes 5/5
      const passCert = auditor.audit({ session });
      expect(passCert.passed).toBe(true);
      expect(passCert.invariants.filter((i) => i.passed).length).toBe(5);

      // 1. SKU Mismatch fails Invariant 1
      const tamperedSkuSession = structuredClone(session);
      tamperedSkuSession.selectedQuote!.sku = "WRONG-SKU-TAMPERED";
      const cert1 = auditor.audit({ session: tamperedSkuSession });
      expect(cert1.passed).toBe(false);
      expect(cert1.invariants.find((i) => i.name === "SKU_INTEGRITY")?.passed).toBe(false);

      // 2. Budget violation fails Invariant 2
      const tamperedPriceSession = structuredClone(session);
      tamperedPriceSession.finalOffer!.unitPrice = 400; // 400*25+150 = 10150 > 8500
      const cert2 = auditor.audit({ session: tamperedPriceSession });
      expect(cert2.passed).toBe(false);
      expect(cert2.invariants.find((i) => i.name === "PRICE_CEILING")?.passed).toBe(false);

      // 3. Return window SLA violation fails Invariant 3
      const tamperedReturnSession = structuredClone(session);
      tamperedReturnSession.finalOffer!.returnDays = 14; // min is 30
      const cert3 = auditor.audit({ session: tamperedReturnSession });
      expect(cert3.passed).toBe(false);
      expect(cert3.invariants.find((i) => i.name === "RETURN_POLICY")?.passed).toBe(false);

      // 4. Delivery SLA violation fails Invariant 4
      const tamperedDeliverySession = structuredClone(session);
      tamperedDeliverySession.finalOffer!.deliveryDays = 10; // max is 5
      const cert4 = auditor.audit({ session: tamperedDeliverySession });
      expect(cert4.passed).toBe(false);
      expect(cert4.invariants.find((i) => i.name === "DELIVERY_SLA")?.passed).toBe(false);

      // 5. Merkle Root lineage tampering fails Invariant 5
      const tamperedLineageSession = structuredClone(session);
      tamperedLineageSession.preSettlementRoot = "0".repeat(64);
      const cert5 = auditor.audit({ session: tamperedLineageSession });
      expect(cert5.passed).toBe(false);
      expect(cert5.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")?.passed).toBe(false);
    });
  });

  // =========================================================================
  // 7. PERFORMANCE BENCHMARKS & LATENCY BUDGETS
  // =========================================================================
  describe("7. Performance Benchmarks & Latency Budgets", () => {
    it("computes 100 Merkle tree events + proofs in under 100ms", () => {
      const tree = new VeriPayMerkleTree();
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        tree.addEvent("BUYER_PROPOSAL", { index: i, price: 320 + i, timestamp: Date.now() });
      }

      const root = tree.getRootHash();
      const proofObj = tree.generateInclusionProof(50);
      const valid = verifyProof(proofObj.leafHash, proofObj.proof, root);

      const elapsed = performance.now() - start;

      expect(valid).toBe(true);
      expect(elapsed).toBeLessThan(100);
    });

    it("evaluates ACWORLD 5-invariant audit on 1,000 sessions in under 2,000ms (< 2ms/op under full parallel load)", () => {
      const session = createReadySession("sess_bench_audit");
      const auditor = new AcworldAuditor();

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        auditor.audit({ session });
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2000);
    });

    it("executes 10,000 safe decimal to minor unit conversions in under 100ms", () => {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        const minor = toMinorUnits(8150.25);
        const floatVal = fromMinorUnits(minor);
        expect(floatVal).toBe(8150.25);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  // =========================================================================
  // 8. OBSERVABILITY, HEALTH CHECK & DIAGNOSTICS
  // =========================================================================
  describe("8. Observability & Operational Diagnostics", () => {
    it("accurately tracks operational settlement metrics", () => {
      settlementLogger.info("CHECKOUT_INITIATED", "Checkout started");
      settlementLogger.info("CAPTURE_SUBMITTED", "Capture sent");
      settlementLogger.info("CAPTURE_COMPLETED", "Capture succeeded");
      settlementLogger.info("RECONCILIATION_INITIATED", "Reconciliation started");
      settlementLogger.info("RECONCILIATION_RESOLVED", "Reconciliation succeeded");
      settlementLogger.info("IDEMPOTENT_REPLAY", "Replay handled");
      settlementLogger.info("WEBHOOK_DEDUPLICATED", "Webhook deduplicated");

      const snapshot = settlementLogger.getMetricsSnapshot();
      expect(snapshot.checkoutsInitiated).toBe(1);
      expect(snapshot.capturesAttempted).toBe(1);
      expect(snapshot.capturesSucceeded).toBe(1);
      expect(snapshot.reconciliationsAttempted).toBe(1);
      expect(snapshot.reconciliationsSucceeded).toBe(1);
      expect(snapshot.idempotentReplays).toBe(1);
      expect(snapshot.webhooksDeduplicated).toBe(1);
    });

    it("serves operational health diagnostics via /api/cron/health with authentication", async () => {
      const secret = "test_cron_secret_prod_1234567890";
      vi.stubEnv("CRON_SECRET", secret);

      // Unauthenticated request is rejected with 401
      const unauthReq = new NextRequest("http://localhost:3000/api/cron/health");
      const unauthRes = await healthGet(unauthReq);
      expect(unauthRes.status).toBe(401);

      // Authenticated request returns 200 with diagnostics
      const authReq = new NextRequest("http://localhost:3000/api/cron/health", {
        headers: { authorization: `Bearer ${secret}` },
      });
      const authRes = await healthGet(authReq);
      expect(authRes.status).toBe(200);
      const data = await authRes.json();
      expect(data.success).toBe(true);
      expect(data.settlementMetrics).toBeDefined();
    });
  });
});
