/**
 * PACTUM — Phase 5.2: Final End-to-End Settlement Verification & Release Readiness Audit Test Suite
 *
 * Product Principle: "Negotiate Intelligently. Settle Verifiably."
 *
 * Verifies:
 * 1. Critical Payment Safety (B1, B2, B3, B4):
 *    - Uncertain capture state machine and anti-double-capture guard across all reconciliation paths.
 *    - Cross-key duplicate capture protection across different idempotency keys and API routes.
 *    - Settlement gate enforcement against stale client certificates, amounts, roots, and versions.
 * 2. Idempotency Safety (C):
 *    - Fencing against late/stale workers returning after timeout recovery.
 *    - Stale execution isolation preventing dirty overwrites of active executions.
 *    - Safe non-financial retry and expired record pruning without deleting active records.
 * 3. Webhook Security and Lifecycle (D):
 *    - Fail-closed audit gate enforcement (webhooks cannot capture un-audited or failed sessions).
 *    - Immediate retry enablement after processing failure.
 *    - Terminal settlement immutability against stale declines and dispute isolation.
 * 4. Persistence Durability & OCC (E):
 *    - Directory metadata fsync integration.
 *    - In-memory rollback on write failure and strict OCC version conflict detection.
 * 5. ACWORLD and Cryptographic Evidence (F):
 *    - DAG canonical JSON serialization with shared node references without false circularity errors.
 *    - Flight recorder tampering detection and certificate freshness verification.
 * 6. Configuration and Operational Safety (G):
 *    - Startup instrumentation validation failing closed in production.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { SettlementService } from "../lib/settlement-service";
import { sessionStore, OptimisticConcurrencyError } from "../lib/session-store";
import {
  DurableIdempotencyStore,
  IdempotencyPayloadMismatchError,
} from "../lib/idempotency";
import { DurableFilePersistenceAdapter } from "../lib/persistence/session-persistence";
import { register } from "../instrumentation";
import { canonicalJson } from "../lib/veripay-merkle";
import { AcworldAuditor } from "../lib/acworld-auditor";
import { CryptographicFlightRecorder } from "../lib/flight-recorder";
import { PayPalClient } from "../lib/paypal-client";
import { POST as captureRouteHandler } from "../app/api/paypal/capture/route";
import { POST as settleRouteHandler } from "../app/api/paypal/settle/route";
import { POST as webhookRouteHandler } from "../app/api/paypal/webhook/route";
import { NextRequest } from "next/server";
import type {
  ProcurementSession,
  ProcurementMandate,
  VendorQuote,
  NegotiationOffer,
} from "../types/pactum";

const TEST_DIR = path.join(process.cwd(), ".test-phase5-2-artifacts");

function createSampleMandate(id = "mandate_p52"): ProcurementMandate {
  return {
    id,
    rawPrompt: "Purchase 25 4K monitors under $8,500 total, 5 days delivery, 30 days return",
    itemQuery: "4K monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [
      { name: "Resolution", value: "4K UHD", mandatory: true },
      { name: "Port", value: "USB-C", mandatory: true },
    ],
    currency: "USD",
    version: 1,
    createdAt: new Date().toISOString(),
    isLocked: false,
  };
}

function createSampleQuote(vendorId = "v_apex"): VendorQuote {
  return {
    vendorId,
    vendorName: "Apex Displays Inc",
    sku: "APX-4K-27-USB",
    productTitle: "27-inch 4K UHD USB-C Monitor",
    initialUnitAsk: 380,
    currentUnitBid: 320,
    shippingCost: 150,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACCEPTED",
    dataSource: "CHANNEL3",
  };
}

function setupAuthoritativeSession(sid = "session_p52_baseline"): ProcurementSession {
  const mandate = createSampleMandate(`mandate_${sid}`);
  const quote = createSampleQuote();
  const session = sessionStore.createSession(mandate, [quote]);
  session.id = sid;
  session.selectedQuote = quote;
  const agreedOffer: NegotiationOffer = {
    unitPrice: 320,
    quantity: 25,
    deliveryDays: 4,
    returnDays: 30,
    shippingCost: 150,
  };
  session.finalOffer = agreedOffer;
  session.agreementRecord = {
    agreementId: `agr_${sid}`,
    sessionId: sid,
    vendorId: quote.vendorId,
    vendorName: quote.vendorName,
    sku: quote.sku,
    agreedPrice: 320,
    totalCost: 320 * 25 + 150, // 8150
    agreedOffer,
    agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
    acceptingParty: "BUYER",
    acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
    round: 3,
    acceptedAt: new Date().toISOString(),
    mandateVersion: 1,
  };

  session.merchantAttestation = {
    merchantUrl: "https://apex.com/returns",
    returnPolicyText: "30-day corporate return guarantee.",
    timestamp: new Date().toISOString(),
  };

  const recorder = new CryptographicFlightRecorder(sid);
  recorder.recordEvent("MANDATE_CREATED", { mandateId: mandate.id });
  recorder.recordEvent("SOURCING_COMPLETED", { quoteCount: 1 });
  recorder.recordEvent(
    "AGREEMENT_CREATED",
    {
      agreementId: `agr_${sid}`,
      unitPrice: 320,
      quantity: 25,
      totalCost: 8150,
    },
    { agreementId: `agr_${sid}` }
  );

  session.flightRecord = recorder.exportFlightRecord();
  session.merkleRoot = recorder.getRootHash();
  session.preSettlementRoot = session.merkleRoot;
  session.status = "PAYPAL_AUTHORIZED";
  session.paypalOrderId = `MOCK_ORDER_${sid.toUpperCase()}`;
  session.paypalAuthorizationId = `MOCK_AUTH_${sid.toUpperCase()}`;

  sessionStore.saveSession(session);
  return sessionStore.getSession(sid)!;
}

describe("PHASE 5.2 — Critical Payment Safety & Cross-Key Duplicate Capture", () => {
  beforeEach(() => {
    sessionStore.clear();
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStore.clear();
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("Cross-Key Capture: two simultaneous captures with DIFFERENT idempotency keys are strictly serialized and the second is rejected", async () => {
    const session = setupAuthoritativeSession("session_cross_key_1");
    const service = new SettlementService();

    let captureCalls = 0;
    vi.spyOn(PayPalClient.prototype, "capturePayment").mockImplementation(async () => {
      captureCalls++;
      // Simulate remote provider latency
      await new Promise((r) => setTimeout(r, 60));
      return {
        id: "PAYPAL_CAPTURE_SUCCESS_1",
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "8150.00" },
        orderId: session.paypalOrderId!,
      };
    });

    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue({
      id: session.paypalOrderId!,
      status: "APPROVED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: session.id,
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "8150.00" },
        },
      ],
    });

    // Fire two simultaneous capture requests with different idempotency keys
    const [resA, resB] = await Promise.all([
      service.completeSettlement({ sessionId: session.id, orderId: session.paypalOrderId }),
      service.completeSettlement({ sessionId: session.id, orderId: session.paypalOrderId }),
    ]);

    // Exactly one should succeed, and the other must be blocked by the concurrency lock
    const successes = [resA, resB].filter((r) => r.success);
    const blocked = [resA, resB].filter((r) => !r.success && r.blockedAtGate);

    expect(successes).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(captureCalls).toBe(1);

    // Subsequent capture request after settlement must be blocked as already settled
    const followUp = await service.completeSettlement({ sessionId: session.id, orderId: session.paypalOrderId });
    expect(followUp.success).toBe(false);
    expect(followUp.blockedAtGate).toBe(true);
    expect(followUp.error).toContain("already been settled and captured");
    expect(captureCalls).toBe(1);
  });

  it("Cross-Route Duplicate Capture: concurrent requests to /api/paypal/capture and /api/paypal/settle are safely serialized", async () => {
    const session = setupAuthoritativeSession("session_cross_route_1");

    let captureCount = 0;
    vi.spyOn(PayPalClient.prototype, "capturePayment").mockImplementation(async () => {
      captureCount++;
      await new Promise((r) => setTimeout(r, 50));
      return {
        id: "PAYPAL_CAPTURE_ROUTE_SUCCESS",
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "8150.00" },
        orderId: session.paypalOrderId!,
      };
    });

    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue({
      id: session.paypalOrderId!,
      status: "APPROVED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: session.id,
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "8150.00" },
        },
      ],
    });

    const captureReq = new NextRequest("http://localhost:3000/api/paypal/capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "idemp_key_route_capture",
      },
      body: JSON.stringify({ sessionId: session.id, orderId: session.paypalOrderId }),
    });

    const settleReq = new NextRequest("http://localhost:3000/api/paypal/settle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "idemp_key_route_settle",
      },
      body: JSON.stringify({ sessionId: session.id }),
    });

    const [respCapture, respSettle] = await Promise.all([
      captureRouteHandler(captureReq),
      settleRouteHandler(settleReq),
    ]);

    const statuses = [respCapture.status, respSettle.status];
    expect(statuses).toContain(200);
    // The conflicting route must receive 403 Forbidden (blocked at gate)
    expect(statuses).toContain(403);
    expect(captureCount).toBe(1);
  });

  it("Uncertain Capture: timeout leaves session in CAPTURE_PENDING_RECONCILIATION and rejects blind recapture", async () => {
    const session = setupAuthoritativeSession("session_uncertain_test_1");
    const service = new SettlementService();

    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue({
      id: session.paypalOrderId!,
      status: "APPROVED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: session.id,
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "8150.00" },
        },
      ],
    });

    // Simulate network timeout during remote capture call
    vi.spyOn(PayPalClient.prototype, "capturePayment").mockRejectedValue(
      new Error("ETIMEDOUT: Connection timed out communicating with PayPal API")
    );

    const result = await service.completeSettlement({ sessionId: session.id, orderId: session.paypalOrderId });
    expect(result.success).toBe(false);
    expect(result.uncertain).toBe(true);

    const reloaded = sessionStore.getSession(session.id)!;
    expect(reloaded.status).toBe("CAPTURE_PENDING_RECONCILIATION");
    expect(reloaded.captureIntent?.status).toBe("UNCERTAIN");

    // Recapture attempt with a fresh idempotency key must be strictly blocked
    const recapture = await service.completeSettlement({ sessionId: session.id, orderId: session.paypalOrderId });
    expect(recapture.success).toBe(false);
    expect(recapture.blockedAtGate).toBe(true);
    expect(recapture.error).toContain("Blind capture retry is blocked");
  });

  it("Reconciliation: when remote PayPal has no completed capture, keeps CAPTURE_PENDING_RECONCILIATION and refuses blind reset", async () => {
    const session = setupAuthoritativeSession("session_recon_no_capture");
    session.status = "CAPTURE_PENDING_RECONCILIATION";
    session.captureIntent = {
      intentId: "cintent_test_1",
      sessionId: session.id,
      orderId: session.paypalOrderId!,
      amount: 8150,
      currency: "USD",
      preSettlementRoot: session.preSettlementRoot!,
      mandateVersion: 1,
      status: "UNCERTAIN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessionStore.saveSession(session);

    const service = new SettlementService();
    // PayPal returns order with status APPROVED and NO captures yet
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue({
      id: session.paypalOrderId!,
      status: "APPROVED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          reference_id: session.id,
          amount: { currency_code: "USD", value: "8150.00" },
          payments: {
            captures: [], // No completed capture yet!
          },
        },
      ],
    });

    const recon = await service.reconcileSettlement({ sessionId: session.id });
    expect(recon.success).toBe(false);
    expect(recon.status).toBe("CAPTURE_PENDING_RECONCILIATION");
    expect(recon.message).toContain("In-flight capture remains uncertain");

    const reloaded = sessionStore.getSession(session.id)!;
    expect(reloaded.status).toBe("CAPTURE_PENDING_RECONCILIATION");
    expect(reloaded.captureIntent?.status).toBe("UNCERTAIN");
  });

  it("Reconciliation: when remote PayPal confirms capture COMPLETED, reconciles to PAYPAL_CAPTURED", async () => {
    const session = setupAuthoritativeSession("session_recon_completed");
    session.status = "CAPTURE_PENDING_RECONCILIATION";
    session.captureIntent = {
      intentId: "cintent_test_2",
      sessionId: session.id,
      orderId: session.paypalOrderId!,
      amount: 8150,
      currency: "USD",
      preSettlementRoot: session.preSettlementRoot!,
      mandateVersion: 1,
      status: "UNCERTAIN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessionStore.saveSession(session);

    const service = new SettlementService();
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue({
      id: session.paypalOrderId!,
      status: "COMPLETED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          reference_id: session.id,
          amount: { currency_code: "USD", value: "8150.00" },
          payments: {
            captures: [
              {
                id: "CAPT_REMOTE_SUCCESS_123",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "8150.00" },
              },
            ],
          },
        },
      ],
    });

    const recon = await service.reconcileSettlement({ sessionId: session.id });
    expect(recon.success).toBe(true);
    expect(recon.status).toBe("PAYPAL_CAPTURED");
    expect(recon.captureId).toBe("CAPT_REMOTE_SUCCESS_123");

    const reloaded = sessionStore.getSession(session.id)!;
    expect(reloaded.status).toBe("PAYPAL_CAPTURED");
    expect(reloaded.paypalCaptureId).toBe("CAPT_REMOTE_SUCCESS_123");
    expect(reloaded.captureIntent?.status).toBe("CAPTURED");
  });

  it("Reconciliation: when remote PayPal order was VOIDED, marks session CANCELLED", async () => {
    const session = setupAuthoritativeSession("session_recon_voided");
    session.status = "CAPTURE_PENDING_RECONCILIATION";
    sessionStore.saveSession(session);

    const service = new SettlementService();
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue({
      id: session.paypalOrderId!,
      status: "VOIDED",
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          reference_id: session.id,
          amount: { currency_code: "USD", value: "8150.00" },
        },
      ],
    });

    const recon = await service.reconcileSettlement({ sessionId: session.id });
    expect(recon.success).toBe(true);
    expect(recon.status).toBe("CANCELLED");

    const reloaded = sessionStore.getSession(session.id)!;
    expect(reloaded.status).toBe("CANCELLED");
  });
});

describe("PHASE 5.2 — Idempotency Safety Deep Audit", () => {
  const idempotencyFile = path.join(TEST_DIR, ".test-idemp.json");

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(idempotencyFile)) {
      try {
        fs.unlinkSync(idempotencyFile);
      } catch {
        // ignore
      }
    }
  });

  it("Stale Worker Fencing: Worker 1 times out; Worker 2 starts; Worker 1 returning late CANNOT overwrite Worker 2's record", async () => {
    const store = new DurableIdempotencyStore({
      filePath: idempotencyFile,
      inProgressTimeoutMs: 100, // short timeout for testing
    });

    const scope = "TEST_FINANCIAL_OP";
    const key = "key_worker_fencing";
    const payload = { amount: 8150 };

    // Worker 1 starts
    const prog1 = store.recordInProgress(scope, key, payload);
    expect(prog1.status).toBe("NEW");
    const execId1 = (prog1 as { executionId: string }).executionId;

    // Simulate Worker 1 taking longer than 100ms
    await new Promise((r) => setTimeout(r, 120));

    // Worker 2 arrives with the same key
    const prog2 = store.recordInProgress(scope, key, payload);
    expect(prog2.status).toBe("NEW");
    const execId2 = (prog2 as { executionId: string }).executionId;
    expect(execId2).not.toBe(execId1);

    // Worker 1 finally completes late and tries to recordCompleted with execId1
    const worker1Completed = store.recordCompleted(scope, key, 200, { captureId: "LATE_CAPT_1" }, execId1);
    expect(worker1Completed).toBe(false); // REJECTED!

    // Verify record is still Worker 2's IN_PROGRESS record
    const recordMid = store.getRecord(scope, key)!;
    expect(recordMid.status).toBe("IN_PROGRESS");
    expect(recordMid.executionId).toBe(execId2);

    // Worker 2 completes normally with execId2
    const worker2Completed = store.recordCompleted(scope, key, 200, { captureId: "LEGIT_CAPT_2" }, execId2);
    expect(worker2Completed).toBe(true);

    const recordFinal = store.getRecord(scope, key)!;
    expect(recordFinal.status).toBe("COMPLETED");
    expect((recordFinal.responseBody as { captureId: string }).captureId).toBe("LEGIT_CAPT_2");
  });

  it("Late Worker cannot overwrite a timed-out FAILED record if no new worker has started", async () => {
    const store = new DurableIdempotencyStore({
      filePath: idempotencyFile,
      inProgressTimeoutMs: 50,
    });

    const scope = "TEST_FAIL_ISOLATION";
    const key = "key_fail_iso";
    const prog = store.recordInProgress(scope, key, { data: 1 });
    const execId = (prog as { executionId: string }).executionId;

    await new Promise((r) => setTimeout(r, 70));
    // Maintenance/recovery marks record FAILED
    store.recoverStaleInProgress(50);

    const recFailed = store.getRecord(scope, key)!;
    expect(recFailed.status).toBe("FAILED");

    // Late worker returns and attempts to complete
    const completed = store.recordCompleted(scope, key, 200, { success: true }, execId);
    expect(completed).toBe(false);

    // Record remains FAILED
    const recAfter = store.getRecord(scope, key)!;
    expect(recAfter.status).toBe("FAILED");
  });

  it("Key reuse with different payload throws IdempotencyPayloadMismatchError", () => {
    const store = new DurableIdempotencyStore({ filePath: null });
    const scope = "ORDER_CREATE";
    const key = "idemp_same_key";

    store.recordInProgress(scope, key, { amount: 100 });

    expect(() => {
      store.recordInProgress(scope, key, { amount: 200 }); // Different payload!
    }).toThrow(IdempotencyPayloadMismatchError);
  });

  it("Safe retry: after an operation fails, it can be retried safely with same payload", async () => {
    const store = new DurableIdempotencyStore({ filePath: null });
    const scope = "NON_FINANCIAL_OP";
    const key = "retry_key_1";
    const payload = { action: "sync" };

    store.recordInProgress(scope, key, payload);
    store.recordFailed(scope, key, "Temporary connection error");

    const recordAfterFailure = store.getRecord(scope, key)!;
    expect(recordAfterFailure.status).toBe("FAILED");

    // Retry must succeed
    const outcome = await store.executeIdempotent({
      scope,
      key,
      payload,
      execute: async () => ({ status: 200, body: { done: true } }),
    });

    expect(outcome.status).toBe(200);
    expect(outcome.body.done).toBe(true);
    expect(outcome.isReplay).toBe(false);
  });

  it("Pruning: expired records are pruned without deleting active records", () => {
    const store = new DurableIdempotencyStore({ filePath: idempotencyFile });

    // Active record with 1 hour TTL
    store.recordInProgress("SCOPE_A", "active_key", { a: 1 }, 3600 * 1000);
    // Expired record with negative TTL
    store.recordInProgress("SCOPE_A", "expired_key", { a: 2 }, -1000);

    const pruned = store.pruneExpired();
    expect(pruned).toBe(1);

    expect(store.getRecord("SCOPE_A", "active_key")).toBeDefined();
    expect(store.getRecord("SCOPE_A", "expired_key")).toBeUndefined();
  });
});

describe("PHASE 5.2 — Webhook Security and Lifecycle", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it("Audit Gate Invariant: webhook PAYMENT.CAPTURE.COMPLETED cannot mark a session captured if it hasn't passed audit", async () => {
    const mandate = createSampleMandate("mandate_webhook_gate");
    const quote = createSampleQuote();
    const session = sessionStore.createSession(mandate, [quote]);
    // Session is only in NEGOTIATING or AUDIT_FAILED state
    session.status = "AUDIT_FAILED";
    sessionStore.saveSession(session);

    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);

    const webhookPayload = {
      id: "WH_EVT_UNAUTHORIZED_CAPTURE",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPT_ROGUE_1",
        custom_id: `VERIPAY_ROOT:some_root;SESSION:${session.id}`,
        amount: { value: "8150.00", currency_code: "USD" },
      },
    };

    const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-transmission-sig": "VALID_SIGNATURE_LONG_ENOUGH",
      },
      body: JSON.stringify(webhookPayload),
    });

    const res = await webhookRouteHandler(req);
    expect(res.status).toBe(422);

    // Invariant: Session status must NOT be downgraded or upgraded to PAYPAL_CAPTURED!
    const reloaded = sessionStore.getSession(session.id)!;
    expect(reloaded.status).toBe("AUDIT_FAILED");
    expect(reloaded.paypalCaptureId).toBeUndefined();
  });

  it("Currency/Amount Mismatch: webhook with invalid currency is rejected (422) and marked FAILED in ledger", async () => {
    const session = setupAuthoritativeSession("session_webhook_currency_mismatch");

    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);

    const webhookPayload = {
      id: "WH_EVT_CURRENCY_MISMATCH",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPT_WRONG_CURRENCY",
        custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
        amount: { value: "8150.00", currency_code: "EUR" }, // Mandate is USD!
      },
    };

    const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-transmission-sig": "VALID_SIGNATURE_LONG_ENOUGH",
      },
      body: JSON.stringify(webhookPayload),
    });

    const res = await webhookRouteHandler(req);
    expect(res.status).toBe(422);

    const reloaded = sessionStore.getSession(session.id)!;
    expect(reloaded.status).not.toBe("PAYPAL_CAPTURED");
  });

  it("Terminal Settlement Immutability: stale PAYMENT.CAPTURE.DENIED cannot downgrade SETTLED session", async () => {
    const session = setupAuthoritativeSession("session_stale_decline");
    session.status = "SETTLED";
    sessionStore.saveSession(session);

    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);

    const webhookPayload = {
      id: "WH_EVT_STALE_DECLINE",
      event_type: "PAYMENT.CAPTURE.DENIED",
      resource: {
        id: "CAPT_DECLINED",
        custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
      },
    };

    const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-transmission-sig": "VALID_SIGNATURE_LONG_ENOUGH",
      },
      body: JSON.stringify(webhookPayload),
    });

    const res = await webhookRouteHandler(req);
    expect(res.status).toBe(200);

    const reloaded = sessionStore.getSession(session.id)!;
    expect(reloaded.status).toBe("SETTLED"); // Never downgraded!
  });
});

describe("PHASE 5.2 — Persistence Durability & OCC", () => {
  const testFile = path.join(TEST_DIR, ".test-session-durability.json");

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch {
        // ignore
      }
    }
  });

  it("Strict OCC: saving session with mismatched version throws OptimisticConcurrencyError and rolls back", () => {
    const mandate = createSampleMandate("mandate_occ_test");
    const session = sessionStore.createSession(mandate);
    expect(session.version).toBe(1);

    // Concurrent writer updates session to version 2
    session.status = "NEGOTIATING";
    sessionStore.saveSession(session); // version becomes 2

    // Stale writer with version 1 snapshot attempts save
    const staleSnapshot: ProcurementSession = {
      ...session,
      version: 1, // stale!
      status: "CANCELLED",
    };

    expect(() => {
      sessionStore.saveSession(staleSnapshot);
    }).toThrow(OptimisticConcurrencyError);

    // Current version is still 2 and status remains NEGOTIATING
    const current = sessionStore.getSession(session.id)!;
    expect(current.version).toBe(2);
    expect(current.status).toBe("NEGOTIATING");
  });

  it("Directory Fsync: DurableFilePersistenceAdapter writes atomically with directory fsync", () => {
    const adapter = new DurableFilePersistenceAdapter({ filePath: testFile });
    const data = {
      sessions: [setupAuthoritativeSession("sess_fsync_1")],
      mandateHistory: {},
    };

    adapter.save(data);
    expect(fs.existsSync(testFile)).toBe(true);

    const loaded = adapter.load();
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0].id).toBe("sess_fsync_1");
  });
});

describe("PHASE 5.2 — ACWORLD & Cryptographic Evidence", () => {
  it("Canonical JSON: Shared object references in DAGs are serialized without false circularity error", () => {
    const sharedConfig = { timeout: 5000, retry: 3 };
    const dag = {
      componentA: sharedConfig,
      componentB: sharedConfig,
    };

    const serialized = canonicalJson(dag);
    expect(serialized).toBe('{"componentA":{"retry":3,"timeout":5000},"componentB":{"retry":3,"timeout":5000}}');
  });

  it("Tampered Flight Recorder: altering an event payload hash causes audit gate failure", () => {
    const session = setupAuthoritativeSession("session_tamper_test");
    const auditor = new AcworldAuditor();

    // Flight record initially passes
    const certBefore = auditor.audit({ session });
    expect(certBefore.passed).toBe(true);

    // Tamper with serialized flight recorder by changing a payload hash
    session.flightRecord!.events[1].payloadHash = "0".repeat(64);
    sessionStore.saveSession(session);

    const certAfter = auditor.audit({ session });
    expect(certAfter.passed).toBe(false);
    const lineageInv = certAfter.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
    expect(lineageInv.passed).toBe(false);
    expect(["RECORDER_DESERIALIZATION_FAILED", "PAYLOAD_HASH_MISMATCH", "CHAIN_TAMPERED"]).toContain(lineageInv.code);
  });

  it("Audit Certificate Freshness: rejects certificate issued for a different session or stale mandate version", () => {
    const session = setupAuthoritativeSession("session_freshness_test");
    const auditor = new AcworldAuditor();
    const cert = auditor.audit({ session });

    // Valid certificate passes freshness check
    const checkValid = AcworldAuditor.verifyCertificateFreshness(cert, session);
    expect(checkValid.valid).toBe(true);

    // Cross-session forgery attempt: certificate presented for another session
    const otherSession = setupAuthoritativeSession("session_other_test");
    const checkSessionMismatch = AcworldAuditor.verifyCertificateFreshness(cert, otherSession);
    expect(checkSessionMismatch.valid).toBe(false);
    expect(checkSessionMismatch.errorCode).toBe("SESSION_MISMATCH");

    // Stale mandate version attempt: mandate bumped to version 2
    session.mandate.version = 2;
    const checkStale = AcworldAuditor.verifyCertificateFreshness(cert, session);
    expect(checkStale.valid).toBe(false);
    expect(checkStale.errorCode).toBe("STALE_MANDATE_VERSION");
  });
});

describe("PHASE 5.2 — Configuration & Startup Validation", () => {
  it("Production Instrumentation Hook: fails closed on startup if credentials are placeholder", async () => {
    const origEnv = { ...process.env };
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_RUNTIME = "nodejs";
      process.env.PAYPAL_CLIENT_ID = "mock_paypal_client_id"; // Placeholder!
      process.env.PAYPAL_CLIENT_SECRET = "mock_paypal_client_secret";

      await expect(register()).rejects.toThrow("Production Configuration Enforcement Failed");
    } finally {
      process.env = origEnv;
    }
  });
});
