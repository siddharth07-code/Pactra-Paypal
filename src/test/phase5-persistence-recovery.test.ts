import { recordCommercialFixture } from "@/test/helpers/commercial-evidence";
/**
 * PACTUM — Phase 5: Production Reliability, Durable Persistence & Recoverable Settlement Tests
 *
 * Comprehensive adversarial verification for:
 * 1. Durable File Persistence (atomic tmp write, fsync, checksum envelope, corrupt quarantine)
 * 2. Optimistic Concurrency Control (OCC version conflict rejection)
 * 3. Durable Idempotency (replay, payload mismatch 422, concurrent execution 409, restart)
 * 4. Capture Intent Lifecycle & Safe Reconciliation (PENDING -> SUBMITTED -> UNCERTAIN -> RECONCILED)
 * 5. Webhook Replay Deduplication Ledger
 * 6. Recovery Engine (interrupted workflow scan, idempotent recovery, no blind capture)
 * 7. Configuration Safety Validator (production strictness, credential integrity)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  DurableFilePersistenceAdapter,
  MemorySessionPersistenceAdapter,
  CorruptPersistenceError,
} from "../lib/persistence/session-persistence";
import { sessionStore } from "../lib/session-store";
import {
  DurableIdempotencyStore,
  ConcurrentOperationInProgressError,
  IdempotencyPayloadMismatchError,
} from "../lib/idempotency";
import { WebhookDeduplicationLedger } from "../lib/webhook-deduplication";
import { RecoveryService } from "../lib/recovery-service";
import { SettlementService } from "../lib/settlement-service";
import { PayPalClient } from "../lib/paypal-client";
import { validateConfiguration } from "../lib/env-validator";
import type {
  ProcurementSession,
  ProcurementMandate,
  VendorQuote,
} from "../types/pactum";

const TEST_DIR = path.join(process.cwd(), ".test_phase5_durability");

describe("Phase 5: Production Reliability & Durable Persistence", () => {
  beforeEach(() => {
    sessionStore.clear();
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    sessionStore.clear();
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  const createSampleMandate = (overrides?: Partial<ProcurementMandate>): ProcurementMandate => ({
    id: "mandate_phase5_test",
    rawPrompt: "Procure 25 4K USB-C monitors under $8,500 with 5-day delivery",
    itemQuery: "4K USB-C monitor",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "USD",
    requiredSpecs: [
      { name: "Resolution", value: "4K", mandatory: true },
      { name: "Connectivity", value: "USB-C", mandatory: true },
    ],
    requiredCondition: "NEW",
    version: 1,
    isLocked: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  const createSampleQuote = (overrides?: Partial<VendorQuote>): VendorQuote => ({
    vendorId: "vendor_apex_displays",
    vendorName: "Apex Displays",
    sku: "APX-4K-27",
    productTitle: "27 4K USB-C Professional Display",
    initialUnitAsk: 375,
    currentUnitBid: 320,
    shippingCost: 150,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACCEPTED",
    dataSource: "CHANNEL3",
    ...overrides,
  });

  // =========================================================================
  // 1. DURABLE FILE PERSISTENCE & ATOMIC WRITES
  // =========================================================================
  describe("1. Durable Persistence Adapter & Corruption Quarantine", () => {
    it("atomically writes, computes SHA-256 checksum envelope, and reloads data", () => {
      const storageFile = path.join(TEST_DIR, "session_store.json");
      const adapter = new DurableFilePersistenceAdapter({ filePath: storageFile });

      const testData = {
        sessions: [
          {
            id: "session_atomic_01",
            mandate: createSampleMandate(),
            quotes: [createSampleQuote()],
            turns: [],
            status: "SOURCING" as const,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        mandateHistory: {},
      };

      adapter.save(testData);

      expect(fs.existsSync(storageFile)).toBe(true);

      // Verify file content structure: must be an envelope with version, checksum, and payload
      const raw = fs.readFileSync(storageFile, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.schemaVersion).toBe(1);
      expect(typeof parsed.checksum).toBe("string");
      expect(parsed.checksum.startsWith("sha256:")).toBe(true);
      expect(parsed.checksum.length).toBe(71); // sha256: + 64 hex chars
      expect(parsed.data.sessions[0].id).toBe("session_atomic_01");

      // Verify load
      const loaded = adapter.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.sessions.length).toBe(1);
      expect(loaded!.sessions[0].id).toBe("session_atomic_01");
    });

    it("detects tampered payload and quarantines corrupt file without silent data loss", () => {
      const storageFile = path.join(TEST_DIR, "session_store_tamper.json");
      const adapter = new DurableFilePersistenceAdapter({ filePath: storageFile });

      const testData = {
        sessions: [
          {
            id: "session_tamper_01",
            mandate: createSampleMandate({ maxTotalBudget: 8500 }),
            quotes: [],
            turns: [],
            status: "SOURCING" as const,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        mandateHistory: {},
      };

      adapter.save(testData);

      // Maliciously tamper with the payload without updating the checksum
      const raw = JSON.parse(fs.readFileSync(storageFile, "utf-8"));
      raw.data.sessions[0].mandate.maxTotalBudget = 999999; // Tampered budget!
      fs.writeFileSync(storageFile, JSON.stringify(raw), "utf-8");

      // Attempt to load tampered file: MUST throw CorruptPersistenceError
      expect(() => adapter.load()).toThrow(CorruptPersistenceError);

      // Check quarantine: original tampered file should be renamed to .corrupt.<reason>.<timestamp>
      const files = fs.readdirSync(TEST_DIR);
      const quarantined = files.find((f) => f.includes(".corrupt.checksum_mismatch"));
      expect(quarantined).toBeDefined();
    });

    it("quarantines truncated/invalid JSON file and throws CorruptPersistenceError", () => {
      const storageFile = path.join(TEST_DIR, "session_truncated.json");
      const adapter = new DurableFilePersistenceAdapter({ filePath: storageFile });

      // Write truncated/malformed JSON (e.g. power loss midway through write)
      fs.writeFileSync(storageFile, '{"version": 1, "checksum": "abc", "data": {"sessions": [', "utf-8");

      expect(() => adapter.load()).toThrow(CorruptPersistenceError);

      const files = fs.readdirSync(TEST_DIR);
      const quarantined = files.find((f) => f.includes(".corrupt.json_syntax_error"));
      expect(quarantined).toBeDefined();
    });

    it("preserves session store rehydration through adapter swap", () => {
      const storageFile = path.join(TEST_DIR, "rehydrate_store.json");
      const fileAdapter = new DurableFilePersistenceAdapter({ filePath: storageFile });

      // Save using file adapter
      fileAdapter.save({
        sessions: [
          {
            id: "session_rehydrate_01",
            mandate: createSampleMandate(),
            quotes: [],
            turns: [],
            status: "NEGOTIATING" as const,
            version: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        mandateHistory: {},
      });

      // Switch sessionStore to this adapter
      sessionStore.setAdapter(fileAdapter);

      const loaded = sessionStore.getSession("session_rehydrate_01");
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe("session_rehydrate_01");
      expect(loaded?.status).toBe("NEGOTIATING");
      expect(loaded?.version).toBe(3);

      // Reset back to memory adapter for other tests
      sessionStore.setAdapter(new MemorySessionPersistenceAdapter());
    });
  });

  // =========================================================================
  // 2. OPTIMISTIC CONCURRENCY CONTROL (OCC)
  // =========================================================================
  describe("2. Optimistic Concurrency Control (OCC)", () => {
    it("increments version monotonically on valid updates", () => {
      const session = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      expect(session.version).toBe(1);

      session.status = "SOURCING";
      sessionStore.saveSession(session);
      expect(session.version).toBe(2);

      const fetched = sessionStore.getSession(session.id);
      expect(fetched?.version).toBe(2);

      session.status = "NEGOTIATING";
      sessionStore.saveSession(session);
      expect(session.version).toBe(3);
    });

    it("rejects concurrent stale update when incoming version < existing version", () => {
      const session = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      expect(session.version).toBe(1);

      // Simulate Writer A advancing the session to version 3
      session.status = "SOURCING";
      sessionStore.saveSession(session); // version -> 2
      session.status = "NEGOTIATING";
      sessionStore.saveSession(session); // version -> 3

      // Simulate Writer B who read at version 1 trying to save
      const staleSession: ProcurementSession = {
        ...session,
        version: 1, // Stale snapshot
        status: "SOURCING",
      };

      expect(() => sessionStore.saveSession(staleSession)).toThrow(
        /Optimistic concurrency conflict on session/
      );
    });
  });

  // =========================================================================
  // 3. DURABLE IDEMPOTENCY ENGINE
  // =========================================================================
  describe("3. Durable Idempotency Engine", () => {
    it("returns cached response for identical replayed requests", async () => {
      const storageFile = path.join(TEST_DIR, "idempotency_store.json");
      const store = new DurableIdempotencyStore({ filePath: storageFile });

      let executionCount = 0;
      const executeOp = async () => {
        executionCount++;
        return { status: 200, body: { success: true, processedOrderId: "ORDER_IDEM_100" } };
      };

      // First call: executes operation
      const res1 = await store.executeIdempotent({
        scope: "PAYPAL_CAPTURE",
        key: "idem_key_unique_123",
        payload: { sessionId: "sess_100", amount: 8000 },
        execute: executeOp,
      });

      expect(res1.isReplay).toBe(false);
      expect(res1.status).toBe(200);
      expect(res1.body.processedOrderId).toBe("ORDER_IDEM_100");
      expect(executionCount).toBe(1);

      // Second call: exact same key and payload -> must return cached replay without executing
      const res2 = await store.executeIdempotent({
        scope: "PAYPAL_CAPTURE",
        key: "idem_key_unique_123",
        payload: { sessionId: "sess_100", amount: 8000 },
        execute: executeOp,
      });

      expect(res2.isReplay).toBe(true);
      expect(res2.status).toBe(200);
      expect(res2.body.processedOrderId).toBe("ORDER_IDEM_100");
      expect(executionCount).toBe(1); // Not called again!
    });

    it("rejects reuse of the same idempotency key with different request payload (422 conflict)", async () => {
      const storageFile = path.join(TEST_DIR, "idempotency_conflict.json");
      const store = new DurableIdempotencyStore({ filePath: storageFile });

      await store.executeIdempotent({
        scope: "PAYPAL_CAPTURE",
        key: "idem_reused_key",
        payload: { sessionId: "sess_100", amount: 8000 },
        execute: async () => ({ status: 200, body: { ok: true } }),
      });

      // Same key, different payload (amount changed)
      await expect(
        store.executeIdempotent({
          scope: "PAYPAL_CAPTURE",
          key: "idem_reused_key",
          payload: { sessionId: "sess_100", amount: 9999 }, // Material difference!
          execute: async () => ({ status: 200, body: { ok: true } }),
        })
      ).rejects.toThrow(IdempotencyPayloadMismatchError);
    });

    it("rejects simultaneous concurrent requests with the same key with 409", async () => {
      const storageFile = path.join(TEST_DIR, "idempotency_concurrent.json");
      const store = new DurableIdempotencyStore({ filePath: storageFile });

      // Simulate operation that is currently IN_PROGRESS
      store.recordInProgress("PAYPAL_CAPTURE", "key_in_progress", { data: 123 });

      // Second attempt while IN_PROGRESS must fail with ConcurrentOperationInProgressError
      await expect(
        store.executeIdempotent({
          scope: "PAYPAL_CAPTURE",
          key: "key_in_progress",
          payload: { data: 123 },
          execute: async () => ({ status: 200, body: { ok: true } }),
        })
      ).rejects.toThrow(ConcurrentOperationInProgressError);
    });

    it("prunes expired records and retains unexpired records across restarts", () => {
      const storageFile = path.join(TEST_DIR, "idempotency_expiry.json");
      const store = new DurableIdempotencyStore({ filePath: storageFile });

      // Add a record with TTL = -1000ms (already expired)
      store.recordInProgress("SCOPE_A", "key_expired", { val: 1 }, -1000);

      // Add a record with TTL = 1 hour (active)
      store.recordInProgress("SCOPE_A", "key_active", { val: 2 }, 3600 * 1000);

      expect(store.size()).toBe(2);

      const pruned = store.pruneExpired();
      expect(pruned).toBe(1);
      expect(store.size()).toBe(1);

      // Rehydrate in a new store instance to test durability across restarts
      const restoredStore = new DurableIdempotencyStore({ filePath: storageFile });
      expect(restoredStore.size()).toBe(1);
      expect(restoredStore.getRecord("SCOPE_A", "key_active")).toBeDefined();
    });
  });

  // =========================================================================
  // 4. CAPTURE INTENT LIFECYCLE & TIMEOUT RECONCILIATION
  // =========================================================================
  describe("4. Capture Intent Lifecycle & Safe Reconciliation", () => {
    it("creates durable CaptureIntentRecord before calling PayPal and transitions on timeout", async () => {
      const session = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      session.status = "PAYPAL_AUTHORIZED";
      session.paypalOrderId = "ORDER_TIMEOUT_TEST";
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 150,
      };
      session.selectedQuote = createSampleQuote();
      session.agreementRecord = {
        agreementId: "agree_timeout_test",
        sessionId: session.id,
        vendorId: "vendor_apex_displays",
        vendorName: "Apex Displays",
        sku: "APX-4K-27",
        agreedPrice: 320,
        agreedOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 150,
        },
        totalCost: 8150,
        agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
        acceptingParty: "BUYER",
        acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
        round: 2,
        mandateVersion: 1,
        acceptedAt: new Date().toISOString(),
      };
      session.merchantAttestation = {
        merchantUrl: "https://apex.com",
        returnPolicyText: "30-day return policy",
        timestamp: new Date().toISOString(),
      };
      recordCommercialFixture(session);
      sessionStore.saveSession(session);

      // Mock PayPalClient with timeout error
      const mockPaypal = new PayPalClient();
      vi.spyOn(mockPaypal, "getOrder").mockResolvedValue({
        id: "ORDER_TIMEOUT_TEST",
        status: "APPROVED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "8150.00" },
            custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            payments: { authorizations: [{ id: "AUTH_TIMEOUT_123", status: "CREATED" }] },
          },
        ],
      });
      vi.spyOn(mockPaypal, "capturePayment").mockRejectedValue(
        new Error("ETIMEDOUT: Connection to api-m.sandbox.paypal.com timed out after 30000ms")
      );

      const service = new SettlementService({ paypalClient: mockPaypal });
      const result = await service.completeSettlement({
        sessionId: session.id,
        orderId: "ORDER_TIMEOUT_TEST",
      });

      expect(result.success).toBe(false);
      expect(result.uncertain).toBe(true);

      // Verify authoritative session state: MUST be in CAPTURE_PENDING_RECONCILIATION
      const reloaded = sessionStore.getSession(session.id);
      expect(reloaded?.status).toBe("CAPTURE_PENDING_RECONCILIATION");

      // Verify CaptureIntentRecord was durably created and marked UNCERTAIN
      expect(reloaded?.captureIntent).toBeDefined();
      expect(reloaded?.captureIntent?.status).toBe("UNCERTAIN");
      expect(reloaded?.captureIntent?.lastError).toContain("ETIMEDOUT");

      // Verify BLIND RETRY PROTECTION: Calling completeSettlement again MUST be blocked!
      const retryResult = await service.completeSettlement({
        sessionId: session.id,
        orderId: "ORDER_TIMEOUT_TEST",
      });
      expect(retryResult.success).toBe(false);
      expect(retryResult.blockedAtGate).toBe(true);
      expect(retryResult.error).toContain("Blind capture retry is blocked");
    });

    it("reconciles uncertain session authoritatively when remote capture completed", async () => {
      const session = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORDER_RECON_SUCCESS";
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 150,
      };
      session.selectedQuote = createSampleQuote();
      session.preSettlementRoot = "root_recon_1234";
      session.captureIntent = {
        intentId: "intent_recon_01",
        sessionId: session.id,
        orderId: "ORDER_RECON_SUCCESS",
        amount: 8150,
        currency: "USD",
        mandateVersion: 1,
        preSettlementRoot: "root_recon_1234",
        status: "UNCERTAIN",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessionStore.saveSession(session);

      const mockPaypal = new PayPalClient();
      vi.spyOn(mockPaypal, "getOrder").mockResolvedValue({
        id: "ORDER_RECON_SUCCESS",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "8150.00" },
            custom_id: `VERIPAY_ROOT:root_recon_1234;SESSION:${session.id}`,
            payments: {
              captures: [
                {
                  id: "CAPTURE_REMOTE_SUCCESS_999",
                  status: "COMPLETED",
                  amount: { currency_code: "USD", value: "8150.00" },
                },
              ],
            },
          },
        ],
      });

      const service = new SettlementService({ paypalClient: mockPaypal });
      const reconResult = await service.reconcileSettlement({ sessionId: session.id });

      expect(reconResult.success).toBe(true);
      expect(reconResult.reconciled).toBe(true);
      expect(reconResult.captureId).toBe("CAPTURE_REMOTE_SUCCESS_999");

      // Verify session updated to PAYPAL_CAPTURED
      const updated = sessionStore.getSession(session.id);
      expect(updated?.status).toBe("PAYPAL_CAPTURED");
      expect(updated?.paypalCaptureId).toBe("CAPTURE_REMOTE_SUCCESS_999");
      expect(updated?.captureIntent?.status).toBe("CAPTURED");
    });
  });

  // =========================================================================
  // 5. WEBHOOK REPLAY PROTECTION & DEDUPLICATION LEDGER
  // =========================================================================
  describe("5. Webhook Replay Deduplication Ledger", () => {
    it("deduplicates repeated webhook delivery and records processing state", () => {
      const storageFile = path.join(TEST_DIR, "webhook_ledger.json");
      const ledger = new WebhookDeduplicationLedger({ filePath: storageFile });

      const eventId = "WH-EVENT-UNIQUE-9876";

      expect(ledger.isProcessed(eventId)).toBe(false);
      expect(ledger.isInProgress(eventId)).toBe(false);

      // Mark processing
      ledger.recordProcessing(eventId, "PAYMENT.CAPTURE.COMPLETED");
      expect(ledger.isInProgress(eventId)).toBe(true);
      expect(ledger.isProcessed(eventId)).toBe(false);

      // Mark processed
      ledger.recordProcessed(eventId);
      expect(ledger.isProcessed(eventId)).toBe(true);
      expect(ledger.isInProgress(eventId)).toBe(false);

      // Verify persistence across new instance
      const rehydrated = new WebhookDeduplicationLedger({ filePath: storageFile });
      expect(rehydrated.isProcessed(eventId)).toBe(true);
    });
  });

  // =========================================================================
  // 6. RESTART RECOVERY ENGINE
  // =========================================================================
  describe("6. Restart Recovery Engine", () => {
    it("scans for interrupted sessions and executes idempotent recovery sweep without blind capture", async () => {
      // 1. Create a session stuck in CAPTURE_PENDING_RECONCILIATION
      const sessionStuck = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      sessionStuck.status = "CAPTURE_PENDING_RECONCILIATION";
      sessionStuck.paypalOrderId = "ORDER_SWEEP_101";
      sessionStuck.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 150,
      };
      sessionStuck.selectedQuote = createSampleQuote();
      sessionStuck.preSettlementRoot = "root_sweep_101";
      sessionStore.saveSession(sessionStuck);

      // 2. Create an already settled session (should be ignored by sweep)
      const sessionSettled = sessionStore.createSession(createSampleMandate(), [createSampleQuote()]);
      sessionSettled.status = "SETTLED";
      sessionStore.saveSession(sessionSettled);

      const mockPaypal = new PayPalClient();
      vi.spyOn(mockPaypal, "getOrder").mockResolvedValue({
        id: "ORDER_SWEEP_101",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "8150.00" },
            custom_id: `VERIPAY_ROOT:root_sweep_101;SESSION:${sessionStuck.id}`,
            payments: {
              captures: [{ id: "CAP_SWEEP_CONFIRMED", status: "COMPLETED" }],
            },
          },
        ],
      });

      const recoveryService = new RecoveryService({ paypalClient: mockPaypal });

      // Scan
      const interrupted = recoveryService.scanForInterruptedSessions();
      expect(interrupted.length).toBe(1);
      expect(interrupted[0].sessionId).toBe(sessionStuck.id);

      // Full recovery run
      const report = await recoveryService.runFullRecovery();
      expect(report.interruptedCount).toBe(1);
      expect(report.recoveredCount).toBe(1);
      expect(report.results[0].action).toBe("SETTLED_FROM_REMOTE_CAPTURE");

      // Verify updated status
      const updated = sessionStore.getSession(sessionStuck.id);
      expect(updated?.status).toBe("PAYPAL_CAPTURED");
      expect(updated?.paypalCaptureId).toBe("CAP_SWEEP_CONFIRMED");

      // Second run: MUST be idempotent, 0 interrupted sessions left
      const secondRun = await recoveryService.runFullRecovery();
      expect(secondRun.interruptedCount).toBe(0);
      expect(secondRun.recoveredCount).toBe(0);
    });
  });

  // =========================================================================
  // 7. ENVIRONMENT & CONFIGURATION VALIDATOR
  // =========================================================================
  describe("7. Configuration Safety Validator", () => {
    it("permits development environment with placeholder credentials", () => {
      const devEnv = {
        NODE_ENV: "development",
        PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
        PAYPAL_CLIENT_ID: "MOCK_PAYPAL_CLIENT_ID",
        PAYPAL_CLIENT_SECRET: "MOCK_PAYPAL_CLIENT_SECRET",
      };

      const result = validateConfiguration(devEnv);
      expect(result.isValid).toBe(true);
      expect(result.isProduction).toBe(false);
    });

    it("rejects production deployment with placeholder or mock PayPal credentials", () => {
      const prodEnvWithMock = {
        NODE_ENV: "production",
        PAYPAL_BASE_URL: "https://api-m.paypal.com",
        PAYPAL_CLIENT_ID: "MOCK_PAYPAL_CLIENT_ID",
        PAYPAL_CLIENT_SECRET: "MOCK_PAYPAL_CLIENT_SECRET",
        PAYPAL_WEBHOOK_ID: "WH_PROD_123",
        GEMINI_API_KEY: "AIzaSyRealProdKey12345",
      };

      const result = validateConfiguration(prodEnvWithMock);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("placeholder or mock credentials"))).toBe(true);
    });

    it("rejects production deployment using sandbox URL when live credentials are required", () => {
      const prodWithSandboxUrl = {
        NODE_ENV: "production",
        PAYPAL_MODE: "live",
        PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
        PAYPAL_CLIENT_ID: "REAL_CLIENT_ID_XYZ",
        PAYPAL_CLIENT_SECRET: "REAL_CLIENT_SECRET_XYZ",
      };

      const result = validateConfiguration(prodWithSandboxUrl);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("PAYPAL_MODE is 'live' but PAYPAL_BASE_URL points to Sandbox"))).toBe(true);
    });
  });
});
