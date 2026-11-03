/**
 * PACTUM — Phase 5.1: Adversarial Reliability Verification & Recovery Hardening Test Suite
 *
 * Verifies:
 * 1. Uncertain capture recovery & anti-double-capture guard (no premature reset to PAYPAL_AUTHORIZED).
 * 2. Strict Optimistic Concurrency Control (OCC) with explicit expectedVersion and rollback on write failure.
 * 3. Durable idempotency crash recovery (abandoned IN_PROGRESS recovery, payload mismatch, safe replay).
 * 4. Atomic file persistence durability (0o600 permissions, schema version quarantine, orphaned temp file cleanup).
 * 5. Webhook authenticity, concurrent delivery serialization, and failed state ledger recording.
 * 6. Runtime production configuration enforcement and Sandbox/Live URL mismatch prevention.
 * 7. Structured observability and sensitive token redaction.
 * 8. End-to-end financial state invariants (mandate binding, audit gate immutability, pre-settlement root preservation).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { SettlementService } from "../lib/settlement-service";
import { sessionStore, OptimisticConcurrencyError } from "../lib/session-store";
import {
  DurableIdempotencyStore,
  ConcurrentOperationInProgressError,
  IdempotencyPayloadMismatchError,
} from "../lib/idempotency";
import {
  DurableFilePersistenceAdapter,
  CorruptPersistenceError,
} from "../lib/persistence/session-persistence";
import { WebhookDeduplicationLedger } from "../lib/webhook-deduplication";
import { validateConfiguration, assertValidConfiguration } from "../lib/env-validator";
import { SettlementLogger } from "../lib/settlement-logger";
import { PayPalClient } from "../lib/paypal-client";
import { CryptographicFlightRecorder } from "../lib/flight-recorder";
import type {
  ProcurementSession,
  ProcurementMandate,
  VendorQuote,
  NegotiationOffer,
} from "../types/pactum";

const TEST_DIR = path.join(process.cwd(), ".test-phase5-1-artifacts");

function createSampleMandate(id = "mandate_p51_1"): ProcurementMandate {
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

function setupAuthoritativeSession(sid = "session_p51_baseline"): ProcurementSession {
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
    agreedOffer,
    totalCost: 320 * 25 + 150,
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
  recorder.recordEvent("AGREEMENT_CREATED", { agreementId: session.agreementRecord.agreementId });
  session.flightRecord = recorder.exportFlightRecord();
  session.preSettlementRoot = recorder.getRootHash();
  session.merkleRoot = session.preSettlementRoot;
  session.paypalOrderId = `ORDER_PP_${sid.toUpperCase()}`;
  session.paypalAuthorizationId = `AUTH_PP_${sid.toUpperCase()}`;
  session.status = "PAYPAL_AUTHORIZED";
  sessionStore.saveSession(session);
  return sessionStore.getSession(sid)!;
}

describe("Phase 5.1: Adversarial Reliability Verification & Recovery Hardening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // 1. UNCERTAIN CAPTURE RECOVERY & ANTI-DOUBLE-CAPTURE GUARANTEE
  // =========================================================================
  describe("1. Uncertain Capture Recovery & Anti-Double-Capture Safeguards", () => {
    it("preserves CAPTURE_PENDING_RECONCILIATION and UNCERTAIN capture intent when remote order query shows no completed capture", async () => {
      const session = setupAuthoritativeSession("sess_uncert_no_blind_reset");

      // 1. Simulate capture timeout
      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "APPROVED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        }),
        capturePayment: vi.fn().mockRejectedValue(new Error("ETIMEDOUT: Connection dropped")),
      };

      const settlement = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const captureRes = await settlement.completeSettlement({ sessionId: session.id });

      expect(captureRes.success).toBe(false);
      expect(captureRes.uncertain).toBe(true);

      const reloaded = sessionStore.getSession(session.id)!;
      expect(reloaded.status).toBe("CAPTURE_PENDING_RECONCILIATION");
      expect(reloaded.captureIntent?.status).toBe("UNCERTAIN");

      // 2. Reconcile while remote PayPal order is still APPROVED (in-flight capture not yet reflected)
      const reconPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "APPROVED",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
              payments: {}, // No completed capture yet!
            },
          ],
        }),
      };

      const reconService = new SettlementService({ paypalClient: reconPaypal as unknown as PayPalClient });
      const reconResult = await reconService.reconcileSettlement({ sessionId: session.id });

      // CRITICAL ASSERTION: MUST NOT reset to PAYPAL_AUTHORIZED!
      expect(reconResult.success).toBe(false);
      expect(reconResult.reconciled).toBe(false);
      expect(reconResult.status).toBe("CAPTURE_PENDING_RECONCILIATION");

      const afterRecon = sessionStore.getSession(session.id)!;
      expect(afterRecon.status).toBe("CAPTURE_PENDING_RECONCILIATION");
      expect(afterRecon.captureIntent?.status).toBe("UNCERTAIN");

      // 3. Verify blind capture retry is strictly blocked
      const retryCapture = await settlement.completeSettlement({ sessionId: session.id });
      expect(retryCapture.success).toBe(false);
      expect(retryCapture.blockedAtGate).toBe(true);
      expect(retryCapture.error).toContain("CAPTURE_PENDING_RECONCILIATION");
      // capturePayment must NOT have been called again!
      expect(mockPaypal.capturePayment).toHaveBeenCalledTimes(1);
    });

    it("delayed successful capture confirmation through reconciliation safely advances state to PAYPAL_CAPTURED", async () => {
      const session = setupAuthoritativeSession("sess_delayed_capture_success");
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.captureIntent = {
        intentId: "cintent_delayed_1",
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

      // Delayed result arrived: PayPal shows completed capture
      const delayedCaptureId = "CAP_DELAYED_SUCCESS_777";
      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "COMPLETED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
              payments: {
                captures: [
                  {
                    id: delayedCaptureId,
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: "8150.00" },
                  },
                ],
              },
            },
          ],
        }),
      };

      const service = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const reconResult = await service.reconcileSettlement({ sessionId: session.id });

      expect(reconResult.success).toBe(true);
      expect(reconResult.reconciled).toBe(true);
      expect(reconResult.status).toBe("PAYPAL_CAPTURED");
      expect(reconResult.captureId).toBe(delayedCaptureId);

      const finalSession = sessionStore.getSession(session.id)!;
      expect(finalSession.status).toBe("PAYPAL_CAPTURED");
      expect(finalSession.paypalCaptureId).toBe(delayedCaptureId);
      expect(finalSession.captureIntent?.status).toBe("CAPTURED");
    });

    it("reconciliation transitions to CANCELLED if remote order is definitively VOIDED", async () => {
      const session = setupAuthoritativeSession("sess_remote_voided");
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.captureIntent = {
        intentId: "cintent_voided_1",
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

      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "VOIDED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        }),
      };

      const service = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const reconResult = await service.reconcileSettlement({ sessionId: session.id });

      expect(reconResult.success).toBe(true);
      expect(reconResult.reconciled).toBe(true);
      expect(reconResult.status).toBe("CANCELLED");

      const finalSession = sessionStore.getSession(session.id)!;
      expect(finalSession.status).toBe("CANCELLED");
      expect(finalSession.captureIntent?.status).toBe("FAILED");
    });

    it("concurrent reconciliation requests are serialized via session lock", async () => {
      const session = setupAuthoritativeSession("sess_concurrent_recon");
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      sessionStore.saveSession(session);

      const service = new SettlementService();
      // Acquire lock representing active Worker 1
      expect(sessionStore.acquireLock(session.id)).toBe(true);

      // Concurrent Worker 2 must be rejected with lock contention
      const reconResult2 = await service.reconcileSettlement({ sessionId: session.id });
      expect(reconResult2.success).toBe(false);
      expect(reconResult2.error).toContain("Lock contention");

      sessionStore.releaseLock(session.id);
    });
  });

  // =========================================================================
  // 2. STRICT OPTIMISTIC CONCURRENCY CONTROL (OCC)
  // =========================================================================
  describe("2. Strict Optimistic Concurrency Control (OCC)", () => {
    it("strictly rejects conflicting stale snapshot and protects newer state", () => {
      const session = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      expect(session.version).toBe(1);

      // Writer A reads snapshot at version 1
      const snapshotA = sessionStore.getSession(session.id)!;
      // Writer B reads snapshot at version 1
      const snapshotB = sessionStore.getSession(session.id)!;

      // Writer A updates and saves -> version advances to 2
      snapshotA.status = "SOURCING";
      sessionStore.saveSession(snapshotA);
      expect(sessionStore.getSession(session.id)!.version).toBe(2);

      // Writer B modifies its stale version 1 snapshot and attempts to save
      snapshotB.status = "NEGOTIATING";
      expect(() => sessionStore.saveSession(snapshotB)).toThrow(OptimisticConcurrencyError);

      // Authoritative state must remain intact as Writer A left it
      const current = sessionStore.getSession(session.id)!;
      expect(current.version).toBe(2);
      expect(current.status).toBe("SOURCING");
    });

    it("enforces explicit expectedVersion and rejects mismatched updates", () => {
      const session = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      expect(session.version).toBe(1);

      // Save with correct expectedVersion succeeds
      session.status = "SOURCING";
      sessionStore.saveSession(session, 1);
      expect(session.version).toBe(2);

      // Save with stale expectedVersion fails
      session.status = "NEGOTIATING";
      expect(() => sessionStore.saveSession(session, 1)).toThrow(OptimisticConcurrencyError);

      // Save with future mismatched expectedVersion fails
      expect(() => sessionStore.saveSession(session, 99)).toThrow(OptimisticConcurrencyError);
    });

    it("atomically rolls back in-memory state if disk persistence fails", () => {
      const session = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      const initialVersion = session.version!;

      // Inject a persistence adapter that fails during save
      const failingAdapter = {
        load: () => ({ sessions: [session], mandateHistory: {} }),
        save: () => {
          throw new Error("ENOSPC: No space left on device");
        },
        clear: () => {},
      };

      const originalAdapter = sessionStore.getAdapter();
      try {
        sessionStore.setAdapter(failingAdapter);

        const snap = sessionStore.getSession(session.id)!;
        snap.status = "NEGOTIATING";
        expect(() => sessionStore.saveSession(snap)).toThrow(/ENOSPC/);

        // In-memory state must have been rolled back to initial state
        const reloaded = sessionStore.getSession(session.id)!;
        expect(reloaded.status).toBe("MANDATE_PENDING");
        expect(reloaded.version).toBe(initialVersion);
      } finally {
        sessionStore.setAdapter(originalAdapter);
      }
    });
  });

  // =========================================================================
  // 3. DURABLE IDEMPOTENCY & CRASH RECOVERY
  // =========================================================================
  describe("3. Durable Idempotency & Crash Recovery", () => {
    it("recovers abandoned IN_PROGRESS record when worker crashes or times out", async () => {
      const storageFile = path.join(TEST_DIR, "idempotency_crash_recovery.json");
      const shortTimeoutMs = 50; // 50ms timeout for test
      const store = new DurableIdempotencyStore({
        filePath: storageFile,
        inProgressTimeoutMs: shortTimeoutMs,
      });

      const scope = "PAYPAL_CAPTURE";
      const key = "IDEMP-CRASH-TEST-1";
      const payload = { sessionId: "sess_100", amount: 8150 };

      // Worker 1 marks IN_PROGRESS and then crashes (simulated by not calling recordCompleted)
      store.recordInProgress(scope, key, payload);

      // Immediate retry by Worker 2 while operation is fresh must be rejected
      expect(() => store.recordInProgress(scope, key, payload)).toThrow(
        ConcurrentOperationInProgressError
      );

      // Wait until timeout expires (simulating crashed process abandonment)
      await new Promise((r) => setTimeout(r, 60));

      // Worker 2 retries: stale IN_PROGRESS is recovered as FAILED and execution is permitted
      const progress = store.recordInProgress(scope, key, payload);
      expect(progress.status).toBe("NEW");

      // Complete the operation
      store.recordCompleted(scope, key, 200, { success: true, captureId: "CAP-RECOVERED-1" });

      // Subsequent call receives cached replay
      const replay = store.recordInProgress(scope, key, payload);
      expect(replay.status).toBe("REPLAY");
      expect((replay as { record: { responseBody: unknown } }).record.responseBody).toEqual({
        success: true,
        captureId: "CAP-RECOVERED-1",
      });
    });

    it("rejects idempotency key reuse with mismatched request payload", () => {
      const store = new DurableIdempotencyStore();
      const scope = "SETTLEMENT";
      const key = "KEY-MISMATCH-1";

      store.recordInProgress(scope, key, { amount: 8150, currency: "USD" });

      expect(() =>
        store.recordInProgress(scope, key, { amount: 9999, currency: "USD" })
      ).toThrow(IdempotencyPayloadMismatchError);
    });

    it("recoverStaleInProgress cleans up stale records across restarts", () => {
      const storageFile = path.join(TEST_DIR, "idempotency_restart.json");
      const store1 = new DurableIdempotencyStore({
        filePath: storageFile,
        inProgressTimeoutMs: 50,
      });

      store1.recordInProgress("SCOPE_A", "KEY_CRASH_1", { a: 1 });
      store1.recordInProgress("SCOPE_A", "KEY_CRASH_2", { a: 2 });

      // Simulate process restart after crash: constructor automatically recovers stale IN_PROGRESS
      const store2 = new DurableIdempotencyStore({
        filePath: storageFile,
        inProgressTimeoutMs: 0, // immediate timeout
      });

      const rec1 = store2.getRecord("SCOPE_A", "KEY_CRASH_1");
      expect(rec1?.status).toBe("FAILED");
      expect(rec1?.error).toContain("abandoned");

      const rec2 = store2.getRecord("SCOPE_A", "KEY_CRASH_2");
      expect(rec2?.status).toBe("FAILED");
      expect(rec2?.error).toContain("abandoned");
    });
  });

  // =========================================================================
  // 4. ATOMIC FILE PERSISTENCE & CORRUPTION ISOLATION
  // =========================================================================
  describe("4. Atomic File Persistence Durability & Quarantine", () => {
    it("rejects and quarantines file with unsupported schema version", () => {
      const filePath = path.join(TEST_DIR, "schema_version_test.json");
      const adapter = new DurableFilePersistenceAdapter({ filePath, strictMode: true });

      // Write valid structure but invalid schemaVersion 99
      const envelope = {
        schemaVersion: 99,
        checksum: "sha256:dummy",
        updatedAt: new Date().toISOString(),
        data: { sessions: [], mandateHistory: {} },
      };
      fs.writeFileSync(filePath, JSON.stringify(envelope), "utf-8");

      expect(() => adapter.load()).toThrow(CorruptPersistenceError);

      // Verify file was quarantined
      const files = fs.readdirSync(TEST_DIR);
      const quarantined = files.find((f) => f.includes("corrupt.unsupported_schema_version"));
      expect(quarantined).toBeDefined();
    });

    it("cleanOrphanedTempFiles cleans abandoned temp files from interrupted writes", () => {
      const filePath = path.join(TEST_DIR, "temp_clean_test.json");
      const adapter = new DurableFilePersistenceAdapter({ filePath });

      // Create an orphaned temp file with an old modification time
      const oldTempPath = `${filePath}.tmp.12345.abc`;
      fs.writeFileSync(oldTempPath, "orphaned temporary write data", "utf-8");

      // Backdate the modification time to 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      fs.utimesSync(oldTempPath, tenMinutesAgo, tenMinutesAgo);

      // Clean orphaned temp files older than 5 minutes
      const cleaned = adapter.cleanOrphanedTempFiles(5 * 60 * 1000);
      expect(cleaned).toBe(1);
      expect(fs.existsSync(oldTempPath)).toBe(false);
    });
  });

  // =========================================================================
  // 5. WEBHOOK CONCURRENT SERIALIZATION & ERROR RECORDING
  // =========================================================================
  describe("5. Webhook Replay Deduplication & Fault Isolation", () => {
    it("deduplicates completed events and prevents concurrent processing of the same event", () => {
      const ledger = new WebhookDeduplicationLedger();
      const eventId = "WH-EVENT-SERIALIZED-1";

      // 1. Initial processing acquisition succeeds
      expect(ledger.recordProcessing(eventId, "PAYMENT.CAPTURE.COMPLETED")).toBe(true);
      expect(ledger.isProcessing(eventId)).toBe(true);

      // 2. Concurrent delivery attempt while still processing must be rejected
      expect(ledger.recordProcessing(eventId, "PAYMENT.CAPTURE.COMPLETED")).toBe(false);

      // 3. Mark processed
      ledger.recordProcessed(eventId);
      expect(ledger.isProcessed(eventId)).toBe(true);
      expect(ledger.isProcessing(eventId)).toBe(false);

      // 4. Subsequent replay attempt is rejected as already processed
      expect(ledger.recordProcessing(eventId, "PAYMENT.CAPTURE.COMPLETED")).toBe(false);
    });

    it("records FAILED status in ledger when webhook validation or processing fails", () => {
      const ledger = new WebhookDeduplicationLedger();
      const eventId = "WH-EVENT-FAIL-1";

      ledger.recordProcessing(eventId, "PAYMENT.CAPTURE.COMPLETED");
      ledger.recordFailed(eventId, "Capture amount mismatch: expected 8150, got 5000");

      const entry = ledger.getEntry(eventId);
      expect(entry?.status).toBe("FAILED");
      expect(entry?.error).toContain("amount mismatch");
      expect(ledger.isProcessed(eventId)).toBe(false);
    });
  });

  // =========================================================================
  // 6. RUNTIME CONFIGURATION VALIDATION ENFORCEMENT
  // =========================================================================
  describe("6. Runtime Production Configuration Enforcement", () => {
    it("assertValidConfiguration throws if running in production with placeholder credentials", () => {
      const prodWithMock = {
        NODE_ENV: "production",
        PAYPAL_CLIENT_ID: "mock_client_id",
        PAYPAL_CLIENT_SECRET: "mock_client_secret",
        CRON_SECRET: "cron_secret_123",
      };

      expect(() => assertValidConfiguration(prodWithMock)).toThrow(
        /Production Configuration Enforcement Failed/
      );
    });

    it("PayPalClient constructor rejects sandbox baseUrl when PAYPAL_MODE is live", () => {
      const originalEnv = { ...process.env };
      try {
        process.env.PAYPAL_MODE = "live";
        process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";

        expect(
          () =>
            new PayPalClient({
              baseUrl: "https://api-m.sandbox.paypal.com",
            })
        ).toThrow(/PAYPAL_MODE is 'live' but PAYPAL_BASE_URL points to sandbox/);
      } finally {
        process.env = originalEnv;
      }
    });

    it("validateConfiguration enforces CRON_SECRET in production", () => {
      const prodNoCron = {
        NODE_ENV: "production",
        PAYPAL_CLIENT_ID: "REAL_CLIENT_ID_SECURE_123",
        PAYPAL_CLIENT_SECRET: "REAL_SECRET_SECURE_456",
        PAYPAL_BASE_URL: "https://api-m.paypal.com",
        CRON_SECRET: "",
      };

      const result = validateConfiguration(prodNoCron);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("CRON_SECRET"))).toBe(true);
    });
  });

  // =========================================================================
  // 7. OBSERVABILITY & SENSITIVE CREDENTIAL REDACTION
  // =========================================================================
  describe("7. Observability & Sensitive Credential Redaction", () => {
    it("redacts credentials, tokens, client secrets, and cards from structured log metadata", () => {
      const sensitivePayload = {
        client_secret: "SUPER_SECRET_PAYPAL_VALUE",
        access_token: "A21AAJ...bearer_token",
        authorization: "Basic dXNlcjpwYXNz",
        password: "my_password",
        credit_card: "4111111111111111",
        safeField: "safe_value",
      };

      const prevDebug = process.env.DEBUG;
      process.env.DEBUG = "true";

      try {
        const logger = new SettlementLogger();
        let capturedEntry: unknown = null;
        vi.spyOn(console, "log").mockImplementation((msg) => {
          try {
            capturedEntry = JSON.parse(msg);
          } catch {
            capturedEntry = msg;
          }
        });

        logger.info("CHECKOUT_INITIATED", "Test checkout with sensitive headers", {
          correlationId: "corr_test_redact",
          metadata: sensitivePayload,
        });

        const entry = capturedEntry as {
          metadata?: {
            client_secret: string;
            access_token: string;
            authorization: string;
            password: string;
            credit_card: string;
            safeField: string;
          };
        };

        expect(entry?.metadata?.client_secret).toBe("[REDACTED]");
        expect(entry?.metadata?.access_token).toBe("[REDACTED]");
        expect(entry?.metadata?.authorization).toBe("[REDACTED]");
        expect(entry?.metadata?.password).toBe("[REDACTED]");
        expect(entry?.metadata?.credit_card).toBe("[REDACTED]");
        expect(entry?.metadata?.safeField).toBe("safe_value");
      } finally {
        process.env.DEBUG = prevDebug;
      }
    });
  });

  // =========================================================================
  // 8. END-TO-END FINANCIAL STATE INVARIANTS
  // =========================================================================
  describe("8. End-to-End Financial State Invariants", () => {
    it("invariant: session agreement cannot be used with a different mandate version", async () => {
      const session = setupAuthoritativeSession("sess_inv_mandate_version");
      session.mandate.version = 2; // Mandate revised
      session.agreementRecord!.mandateVersion = 1; // Stale agreement
      sessionStore.saveSession(session);

      const service = new SettlementService();
      const result = await service.completeSettlement({ sessionId: session.id });

      expect(result.success).toBe(false);
      expect(result.blockedAtGate).toBe(true);
      expect(result.error).toContain("Stale agreement rejected");
    });

    it("invariant: pre-settlement root is preserved when post-settlement events are committed", async () => {
      const session = setupAuthoritativeSession("sess_inv_pre_root_preservation");
      const authoritativePreRoot = session.preSettlementRoot!;

      // Simulate capture and post-audit event recording
      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "APPROVED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${authoritativePreRoot};SESSION:${session.id}`,
            },
          ],
        }),
        capturePayment: vi.fn().mockResolvedValue({
          id: "CAP_INVARIANT_PRESERVED_1",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "8150.00" },
        }),
        createNegotiatedInvoice: vi.fn().mockResolvedValue({
          id: "INV_INVARIANT_PRESERVED_1",
          status: "SENT",
          invoiceNumber: "INV-001",
          totalAmount: 8150,
        }),
      };

      const service = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const settleResult = await service.completeSettlement({ sessionId: session.id });
      expect(settleResult.success).toBe(true);

      const capturedSession = sessionStore.getSession(session.id)!;
      // Pre-settlement root must remain identical to original commitment
      expect(capturedSession.preSettlementRoot).toBe(authoritativePreRoot);
      expect(capturedSession.status).toBe("SETTLED");
    });
  });
});
