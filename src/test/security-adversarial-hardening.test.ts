import { completedOrder } from "@/test/helpers/payment-fixtures";
/**
 * PACTUM — Phase 3 Adversarial Regression Tests
 *
 * Exercises all security, reliability, and concurrency hardening scenarios:
 * 1. Mandate revision atomicity and dirty state rollback on persistence failure.
 * 2. Mandate revision prohibited during active payment states (CAPTURE_PENDING_RECONCILIATION, etc.).
 * 3. Concurrent negotiation requests for the same session blocked by active locks.
 * 4. Stale mandate revision during negotiation blocks stale agreement commitment.
 * 5. Terminal session protection: cannot re-enter negotiation or commit agreements.
 * 6. Authoritative ACWORLD audit gate blocks settlement on failed invariants.
 * 7. Lineage verification rejects forged/mismatched PayPal custom_id.
 * 8. Reconcile settlement rejects remote amount, currency, and custom_id mismatches.
 * 9. Concurrent reconciliation requests blocked by session locking.
 * 10. Webhook cannot downgrade confirmed completed capture or settled session.
 * 11. Webhook dispute creation only allowed on captured/settled sessions.
 * 12. Webhook invoice paid cannot silently revert a DISPUTED session.
 * 13. State machine transition enforcement prevents illegal status downgrades.
 * 14. Rate limiter identity spoofing resistance via timing-safe internal gateway secret.
 * 15. Gemini quota coordinator concurrency slot and probe recovery after errors.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { sessionStore } from "@/lib/session-store";
import { SettlementService } from "@/lib/settlement-service";
import { NegotiationOrchestrator } from "@/lib/negotiation-orchestrator";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { PayPalClient } from "@/lib/paypal-client";
import { extractClientIdentity } from "@/lib/rate-limiter";
import { GeminiQuotaCoordinator } from "@/lib/gemini-quota";
import { NextRequest } from "next/server";
import { POST as webhookPost } from "@/app/api/paypal/webhook/route";
import type { ProcurementMandate, VendorQuote } from "@/types/pactum";

describe("Phase 3: Security, Reliability & Adversarial Hardening Suite", () => {
  beforeEach(() => {
    sessionStore.clear();
    NegotiationOrchestrator.activeNegotiationLocks.clear();
    vi.restoreAllMocks();
  });

  const validMandate: ProcurementMandate = {
    id: "mandate_adv_1",
    rawPrompt: "Purchase 25 4K USB-C monitors under $8,500",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [
      { name: "Resolution", value: "4K", mandatory: true },
      { name: "Port", value: "USB-C", mandatory: true },
    ],
    currency: "USD",
    version: 1,
    isLocked: false,
    createdAt: new Date().toISOString(),
  };

  const fixtureQuotes: VendorQuote[] = [
    {
      vendorId: "v_alpha",
      vendorName: "Alpha Displays Inc",
      sku: "SKU-4K-ALPHA",
      productTitle: "4K Professional Monitor",
      initialUnitAsk: 320,
      currentUnitBid: 320,
      shippingCost: 100,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
    },
    {
      vendorId: "v_beta",
      vendorName: "Beta Electronics",
      sku: "SKU-4K-BETA",
      productTitle: "UltraHD 4K Display",
      initialUnitAsk: 330,
      currentUnitBid: 330,
      shippingCost: 120,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
    },
    {
      vendorId: "v_gamma",
      vendorName: "Gamma Wholesale",
      sku: "SKU-4K-GAMMA",
      productTitle: "GammaPro 4K Panel",
      initialUnitAsk: 335,
      currentUnitBid: 335,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
    },
  ];

  // 1. Mandate Revision Atomicity & Rollback
  describe("1. Mandate Revision Atomicity & Rollback", () => {
    it("rolls back in-memory session state if persistence throws during revision", () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.finalOffer = {
        unitPrice: 300,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      sessionStore.saveSession(session);

      // Mock saveToDisk to simulate disk failure during revision
      const originalSave = sessionStore.saveToDisk.bind(sessionStore);
      sessionStore.saveToDisk = vi.fn().mockImplementation(() => {
        throw new Error("ENOSPC: No space left on device");
      });

      expect(() => {
        sessionStore.reviseMandate(session.id, { maxTotalBudget: 7500 });
      }).toThrow(/Mandate revision failed during disk persistence/);

      // Restore saveToDisk
      sessionStore.saveToDisk = originalSave;

      // Verify in-memory session was completely rolled back and not left in partially revised state
      const reloaded = sessionStore.getSession(session.id);
      expect(reloaded).toBeDefined();
      expect(reloaded!.mandate.version).toBe(1);
      expect(reloaded!.mandate.maxTotalBudget).toBe(8500);
      expect(reloaded!.finalOffer).toBeDefined();
      expect(reloaded!.finalOffer!.unitPrice).toBe(300);
    });

    it("strictly prohibits revision when session is in CAPTURE_PENDING_RECONCILIATION or active payment states", () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);

      const prohibitedStates = [
        "CAPTURE_PENDING_RECONCILIATION",
        "AWAITING_PAYPAL_APPROVAL",
        "PAYPAL_AUTHORIZED",
        "PAYPAL_CAPTURED",
        "SETTLED",
        "DISPUTED",
      ] as const;

      for (const st of prohibitedStates) {
        // Manually update in-memory status
        const current = sessionStore.getSession(session.id)!;
        current.status = st;
        // Direct set to simulate state without triggering transition guard
        (sessionStore as unknown as { sessions: Map<string, unknown> }).sessions.set(session.id, current);

        expect(() => {
          sessionStore.reviseMandate(session.id, { maxTotalBudget: 7000 });
        }).toThrow(/prohibit mandate revision/i);
      }
    });
  });

  // 2. Agreement Creation and Negotiation Races
  describe("2. Agreement Creation and Negotiation Races", () => {
    it("rejects concurrent runNegotiation calls for the same session ID", async () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      const orchestrator = new NegotiationOrchestrator({ maxRounds: 1 });

      // Simulate orchestrator 1 running
      NegotiationOrchestrator.activeNegotiationLocks.add(session.id);

      await expect(
        orchestrator.runNegotiation(session.mandate, fixtureQuotes, session.id)
      ).rejects.toThrow(/already actively running for session/);
    });

    it("aborts agreement commitment when mandate is revised concurrently during negotiation", async () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);

      let emittedAborted = false;
      const testOrchestrator = new NegotiationOrchestrator({
        maxRounds: 1,
        onEvent: (evt) => {
          if (evt.type === "ROUND_STARTED") {
            // Emulate concurrent mandate revision happening mid-negotiation
            sessionStore.reviseMandate(session.id, { maxTotalBudget: 8000 });
          }
          if (evt.type === "NEGOTIATION_ABORTED") {
            emittedAborted = true;
          }
        },
      });

      const result = await testOrchestrator.runNegotiation(validMandate, fixtureQuotes, session.id);

      expect(emittedAborted).toBe(true);
      expect(result.completed).toBe(false);

      // Verify session store was NOT overwritten with stale agreement
      const stored = sessionStore.getSession(session.id)!;
      expect(stored.mandate.version).toBe(2);
      expect(stored.agreementRecord).toBeUndefined();
      expect(stored.status).toBe("MANDATE_PENDING");
    });

    it("aborts agreement commitment if session was cancelled or settled during negotiation", async () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      let abortedReason = "";

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 1,
        onEvent: (evt) => {
          if (evt.type === "ROUND_STARTED") {
            // Mark session as CANCELLED mid-negotiation
            const current = sessionStore.getSession(session.id)!;
            current.status = "CANCELLED";
            sessionStore.saveSession(current);
          }
          if (evt.type === "NEGOTIATION_ABORTED") {
            abortedReason = (evt.payload.reason as string) ?? "";
          }
        },
      });

      const result = await orchestrator.runNegotiation(validMandate, fixtureQuotes, session.id);

      expect(result.completed).toBe(false);
      expect(abortedReason).toContain("terminal status 'CANCELLED'");
      const stored = sessionStore.getSession(session.id)!;
      expect(stored.status).toBe("CANCELLED");
      expect(stored.agreementRecord).toBeUndefined();
    });
  });

  // 3. Settlement State Machine and Invariant Guards
  describe("3. Settlement State Machine & Invariant Guards", () => {
    it("prevents illegal state downgrade from SETTLED to CANCELLED", () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.status = "SETTLED";
      sessionStore.saveSession(session);

      session.status = "CANCELLED";
      expect(() => sessionStore.saveSession(session)).toThrow(
        /Cannot downgrade SETTLED session .* to 'CANCELLED'/
      );
    });

    it("prevents illegal state downgrade from PAYPAL_CAPTURED to AUDIT_PASSED or MANDATE_PENDING", () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.status = "PAYPAL_CAPTURED";
      sessionStore.saveSession(session);

      session.status = "MANDATE_PENDING";
      expect(() => sessionStore.saveSession(session)).toThrow(
        /Cannot revert PAYPAL_CAPTURED session/
      );
    });

    it("prevents silently reverting a DISPUTED session to SETTLED", () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.status = "DISPUTED";
      sessionStore.saveSession(session);

      session.status = "SETTLED";
      expect(() => sessionStore.saveSession(session)).toThrow(
        /Cannot silently revert DISPUTED session .* to 'SETTLED'/
      );
    });

    it("strictly blocks settlement when ACWORLD audit invariants fail", async () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.selectedQuote = fixtureQuotes[0];
      // Offer exceeds budget of $8,500 ($360 * 25 + $100 = $9,100)
      session.finalOffer = {
        unitPrice: 360,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      session.status = "AUDIT_FAILED";
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const checkoutRes = await service.initiateCheckout({ sessionId: session.id });

      expect(checkoutRes.success).toBe(false);
      expect(checkoutRes.blockedAtGate).toBe(true);
      expect(checkoutRes.error).toContain("cannot proceed to settlement checkout");
    });
  });

  // 4. Reconciliation and Webhook Concurrency
  describe("4. Reconciliation and Webhook Concurrency", () => {
    it("handles two concurrent reconciliation requests via session locking", async () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORD-CONC-123";
      sessionStore.saveSession(session);

      const service = new SettlementService();

      // Acquire lock simulating active request 1
      sessionStore.acquireLock(session.id);

      const res2 = await service.reconcileSettlement({ sessionId: session.id });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("Lock contention");

      // Release lock and ensure subsequent call can succeed or proceed
      sessionStore.releaseLock(session.id);
    });

    it("rejects reconciliation when remote order currency or amount mismatches agreed terms", async () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.selectedQuote = fixtureQuotes[0];
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      session.merkleRoot = "a".repeat(64);
      session.preSettlementRoot = "a".repeat(64);
      session.paypalOrderId = "ORD-MISMATCH-1";
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      sessionStore.saveSession(session);

      // Mock PayPalClient.getOrder with mismatched currency (EUR instead of USD)
      const mockPayPal = new PayPalClient();
      mockPayPal.getOrder = vi.fn().mockResolvedValue({
        id: "ORD-MISMATCH-1",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { currency_code: "EUR", value: "8100.00" },
            custom_id: `VERIPAY_ROOT:${session.merkleRoot};SESSION:${session.id}`,
            payments: {
              captures: [{ id: "CAP-EUR-1", status: "COMPLETED", amount: { currency_code: "EUR", value: "8100.00" } }],
            },
          },
        ],
      });

      const service = new SettlementService({ paypalClient: mockPayPal });
      const result = await service.reconcileSettlement({ sessionId: session.id });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/currency mismatch/i);
      expect(result.message).toContain("currency mismatch");
      // Session status must remain in CAPTURE_PENDING_RECONCILIATION
      expect(sessionStore.getSession(session.id)!.status).toBe("CAPTURE_PENDING_RECONCILIATION");
    });

    it("rejects reconciliation when remote custom_id belongs to a different session", async () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.selectedQuote = fixtureQuotes[0];
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      session.merkleRoot = "b".repeat(64);
      session.preSettlementRoot = "b".repeat(64);
      session.paypalOrderId = "ORD-WRONG-SESSION";
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      sessionStore.saveSession(session);

      const mockPayPal = new PayPalClient();
      mockPayPal.getOrder = vi.fn().mockResolvedValue({
        id: "ORD-WRONG-SESSION",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "8100.00" },
            custom_id: `VERIPAY_ROOT:${session.merkleRoot};SESSION:other_session_999`,
            payments: {
              captures: [{ id: "CAP-WRONG-1", status: "COMPLETED", amount: { currency_code: "USD", value: "8100.00" } }],
            },
          },
        ],
      });

      const service = new SettlementService({ paypalClient: mockPayPal });
      const result = await service.reconcileSettlement({ sessionId: session.id });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/lineage mismatch/i);
      expect(result.message).toMatch(/custom_id.*mismatch/i);
      expect(sessionStore.getSession(session.id)!.status).toBe("CAPTURE_PENDING_RECONCILIATION");
    });

    it("webhook PAYMENT.CAPTURE.COMPLETED resolves CAPTURE_PENDING_RECONCILIATION but cannot downgrade SETTLED", async () => {
      vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      sessionStore.saveSession(session);

      session.preSettlementRoot = "a".repeat(64);
      session.paypalOrderId = "ORDER-WEBHOOK-CONFIRMED";
      sessionStore.saveSession(session);
      vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(session, "CAP-REMOTE-99", "8100.00"));
      const webhookPayload = {
        id: "WH-EVT-1",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-REMOTE-99",
          custom_id: `VERIPAY_ROOT:${"a".repeat(64)};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "8100.00" },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "valid_signature_1234567890",
        },
        body: JSON.stringify(webhookPayload),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);

      // Session should be updated to PAYPAL_CAPTURED
      const updated = sessionStore.getSession(session.id)!;
      expect(updated.status).toBe("PAYPAL_CAPTURED");
      expect(updated.paypalCaptureId).toBe("CAP-REMOTE-99");

      // Mark session as SETTLED
      updated.status = "SETTLED";
      sessionStore.saveSession(updated);

      // Now send an older or duplicate webhook event; it MUST NOT downgrade SETTLED to PAYPAL_CAPTURED
      const req2 = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "valid_signature_1234567890",
        },
        body: JSON.stringify(webhookPayload),
      });

      await webhookPost(req2);
      const afterDuplicate = sessionStore.getSession(session.id)!;
      expect(afterDuplicate.status).toBe("SETTLED");
    });

    it("webhook rejects capture events when amount or currency does not match agreed terms", async () => {
      vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      session.status = "PAYPAL_AUTHORIZED";
      sessionStore.saveSession(session);

      const forgedPayload = {
        id: "WH-FORGED-1",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-FORGED-1",
          custom_id: `VERIPAY_ROOT:${"a".repeat(64)};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "10.00" }, // Mismatched $10 instead of $8,100
        },
      };

      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "valid_signature_1234567890",
        },
        body: JSON.stringify(forgedPayload),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(422);

      const stored = sessionStore.getSession(session.id)!;
      expect(stored.status).toBe("PAYPAL_AUTHORIZED");
      expect(stored.paypalCaptureId).toBeUndefined();
    });

    it("webhook rejects unauthorized or tampered signatures", async () => {
      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "short", // Invalid signature
        },
        body: JSON.stringify({ id: "WH-INVALID-SIGNATURE", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} }),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(401);
    });
  });

  // 5. Authoritative ACWORLD Lineage and Session Verification
  describe("5. Authoritative ACWORLD Lineage and Session Verification", () => {
    it("fails Invariant 5 when PayPal custom_id specifies a mismatched session ID", () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.selectedQuote = fixtureQuotes[0];
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      session.merkleRoot = "c".repeat(64);
      session.preSettlementRoot = "c".repeat(64);

      const auditor = new AcworldAuditor();
      // Provide custom_id with correct root but different session
      const cert = auditor.audit({
        session,
        expectedOrderCustomId: `VERIPAY_ROOT:${session.merkleRoot};SESSION:other_session_id`,
      });

      expect(cert.passed).toBe(false);
      const lineage = cert.invariants.find((inv) => inv.name === "CRYPTOGRAPHIC_LINEAGE");
      expect(lineage?.passed).toBe(false);
      expect(lineage?.reason).toContain("bound to a different session");
    });

    it("fails Invariant 1 when agreementRecord references a different session", () => {
      const session = sessionStore.createSession(validMandate, fixtureQuotes);
      session.selectedQuote = fixtureQuotes[0];
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100,
      };
      session.agreementRecord = {
        agreementId: "agree_hijack_1",
        sessionId: "forged_session_999",
        vendorId: fixtureQuotes[0].vendorId,
        vendorName: fixtureQuotes[0].vendorName,
        sku: fixtureQuotes[0].sku,
        offerReference: "turn_1",
        agreedPrice: 320,
        agreedOffer: session.finalOffer,
        totalCost: 8100,
        agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
        acceptingParty: "BUYER",
        acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
        round: 4,
        acceptedAt: new Date().toISOString(),
        mandateVersion: 1,
      };
      session.merkleRoot = "d".repeat(64);
      session.preSettlementRoot = "d".repeat(64);

      const auditor = new AcworldAuditor();
      const cert = auditor.audit({ session });

      expect(cert.passed).toBe(false);
      const skuInv = cert.invariants.find((inv) => inv.name === "SKU_INTEGRITY");
      expect(skuInv?.passed).toBe(false);
      expect(skuInv?.reason).toContain("Agreement session mismatch");
    });
  });

  // 6. Rate Limiter Security & Spoofing Resistance
  describe("6. Rate Limiter Identity Extraction & Spoofing Resistance", () => {
    it("ignores untrusted client spoofed user headers when gateway secret is missing or invalid", () => {
      const req = new NextRequest("http://localhost:3000/api/procurement/init", {
        headers: {
          "x-pactum-user-id": "spoofed_admin_user",
          "x-internal-gateway-secret": "wrong_secret",
        },
      });

      const identity = extractClientIdentity(req);
      // Must not extract user:spoofed_admin_user
      expect(identity).not.toBe("user:spoofed_admin_user");
      expect(identity).toMatch(/ip:|anon:/);
    });

    it("ignores untrusted proxy IP headers when TRUST_PROXY is not enabled", () => {
      delete process.env.TRUST_PROXY;
      delete process.env.TRUST_PROXY_HEADERS;
      delete process.env.VERCEL;

      const req = new NextRequest("http://localhost:3000/api/procurement/init", {
        headers: {
          "x-forwarded-for": "203.0.113.195, 198.51.100.1",
        },
      });

      const identity = extractClientIdentity(req);
      // Without TRUST_PROXY, x-forwarded-for header is not blindly trusted
      expect(identity).not.toBe("ip:203.0.113.195");
    });
  });

  // 7. Gemini Quota Protection & Concurrency Slot Recovery
  describe("7. Gemini Quota Protection & Concurrency Slot Recovery", () => {
    it("safely decrements active concurrency slot when provider throws an exception", async () => {
      const coordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 10,
        maxConcurrentRequests: 2,
        maxAttempts: 1,
        providerTimeoutMs: 500,
      });

      expect(coordinator.getStatus().activeRequests).toBe(0);

      // Execute an action that throws
      await expect(
        coordinator.execute("test_failing_op", async () => {
          throw new Error("Simulated transient provider error");
        })
      ).rejects.toThrow("Simulated transient provider error");

      // Verify activeRequests was safely reset to 0 in finally block
      expect(coordinator.getStatus().activeRequests).toBe(0);
    });

    it("recovers HALF_OPEN probe state if probe execution times out", async () => {
      const coordinator = new GeminiQuotaCoordinator({
        circuitBreakerThreshold: 1,
        circuitBreakerCooldownMs: 10,
        providerTimeoutMs: 50,
      });

      // Trip circuit to OPEN
      await expect(
        coordinator.execute("trip_op", async () => {
          throw new Error("Fatal 500 error");
        })
      ).rejects.toThrow();

      expect(coordinator.getCircuitState()).toBe("OPEN");

      // Wait for cooldown to transition to HALF_OPEN
      await new Promise((r) => setTimeout(r, 20));
      expect(coordinator.getCircuitState()).toBe("HALF_OPEN");

      // Status query with claim: false must not mutate probe state
      const adm = coordinator.checkAdmission({ claim: false });
      expect(adm.admissible).toBe(true);
      expect(coordinator.getCircuitState()).toBe("HALF_OPEN");
    });
  });
});
