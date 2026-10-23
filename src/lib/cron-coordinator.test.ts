/**
 * PACTUM — Authenticated Cron Coordinator & Safe Retention Tests
 * Tests constant-time authentication, health reporting (zero Gemini calls),
 * session retention evaluation, protected session preservation, dry-run mode,
 * and concurrency locking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CronCoordinator,
  verifyCronSecret,
} from "./cron-coordinator";
import { sessionStore } from "./session-store";
import type { ProcurementSession } from "../types/pactum";

describe("Cron Coordinator & Safe Session Retention", () => {
  let coordinator: CronCoordinator;

  beforeEach(() => {
    sessionStore.clear();
    coordinator = new CronCoordinator();
  });

  describe("Constant-Time Secret Verification", () => {
    it("returns true for matching secret with timing-safe comparison", () => {
      expect(verifyCronSecret("Bearer test_secret_123", "test_secret_123").authenticated).toBe(true);
      expect(verifyCronSecret("test_secret_123", "test_secret_123").authenticated).toBe(true);
    });

    it("returns false for non-matching, empty, or undefined secret", () => {
      expect(verifyCronSecret("Bearer wrong_secret", "test_secret_123").authenticated).toBe(false);
      expect(verifyCronSecret(null, "test_secret_123").authenticated).toBe(false);
      expect(verifyCronSecret(undefined, "test_secret_123").authenticated).toBe(false);
      expect(verifyCronSecret("Bearer ", "test_secret_123").authenticated).toBe(false);
    });

    it("returns false if expectedSecret is not configured", () => {
      expect(verifyCronSecret("Bearer whatever", "").authenticated).toBe(false);
    });
  });

  describe("Health & Readiness Reporting", () => {
    it("reports operational readiness without invoking live Gemini calls", () => {
      const health = coordinator.getHealthReport();
      expect(health.status).toBe("HEALTHY");
      expect(health.geminiCircuitBreaker.state).toBe("CLOSED");
      expect(health.rateLimiterBackend).toBeDefined();
      expect(health.sessionStore.totalSessions).toBe(0);
      expect(health.sessionStore.activeNegotiations).toBe(0);
      expect(health.timestamp).toBeDefined();
      expect(health.maintenanceConfigured).toBeDefined();
    });
  });

  describe("Protected Session Preservation Rules", () => {
    const baseSession: ProcurementSession = {
      id: "session-preserve-base",
      mandate: {
        id: "mandate-base",
        rawPrompt: "Purchase 25 monitors under $8,500",
        itemQuery: "4K Monitors",
        quantity: 25,
        maxTotalBudget: 8500,
        maxDeliveryDays: 5,
        minReturnDays: 30,
        requiredSpecs: [],
        currency: "USD",
        createdAt: new Date(Date.now() - 40 * 86400000).toISOString(), // 40 days old
      },
      quotes: [],
      turns: [],
      status: "CANCELLED",
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    };

    it("preserves active negotiations regardless of age", () => {
      const activeSession: ProcurementSession = {
        ...baseSession,
        id: "active-neg-1",
        status: "NEGOTIATING",
      };

      const evalResult = coordinator.evaluateSession(activeSession, 30);
      expect(evalResult.eligible).toBe(false);
      expect(evalResult.reason).toBe("ACTIVE_NEGOTIATION");
    });

    it("preserves settled sessions and sessions with agreements", () => {
      const settledSession: ProcurementSession = {
        ...baseSession,
        id: "settled-sess-1",
        status: "SETTLED",
        agreementRecord: {
          agreementId: "agr-1",
          sessionId: "settled-sess-1",
          vendorId: "vendor-1",
          vendorName: "Vendor One",
          sku: "SKU-1",
          agreedPrice: 300,
          agreedOffer: {
            unitPrice: 300,
            quantity: 25,
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 0,
          },
          totalCost: 7500,
          agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
          acceptingParty: "VENDOR",
          acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
          round: 3,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
      };

      const evalResult = coordinator.evaluateSession(settledSession, 30);
      expect(evalResult.eligible).toBe(false);
      expect(evalResult.reason).toBe("HAS_AGREEMENT");
    });

    it("preserves sessions with pending PayPal capture", () => {
      const pendingSession: ProcurementSession = {
        ...baseSession,
        id: "pending-capture-sess",
        status: "CAPTURE_PENDING_RECONCILIATION",
      };

      const evalResult = coordinator.evaluateSession(pendingSession, 30);
      expect(evalResult.eligible).toBe(false);
      expect(evalResult.reason).toBe("PAYPAL_CAPTURE_PENDING");
    });

    it("preserves sessions with open or active disputes", () => {
      const disputeSession: ProcurementSession = {
        ...baseSession,
        id: "dispute-sess-1",
        status: "DISPUTED",
        disputes: [
          {
            disputeId: "disp-1",
            sessionId: "dispute-sess-1",
            category: "WRONG_ITEM",
            description: "Delivered 1080p instead of 4K",
            status: "OPENED",
            openedAt: new Date().toISOString(),
            evidenceRoot: "0".repeat(64),
            verifiedInvariants: [],
            inclusionProofs: [],
          },
        ],
      };

      const evalResult = coordinator.evaluateSession(disputeSession, 30);
      expect(evalResult.eligible).toBe(false);
      expect(evalResult.reason).toBe("UNRESOLVED_DISPUTE");
    });

    it("preserves sessions with cryptographic flight-recorder Merkle evidence", () => {
      const merkleSession: ProcurementSession = {
        ...baseSession,
        id: "merkle-sess-1",
        merkleRoot: "a".repeat(64),
      };

      const evalResult = coordinator.evaluateSession(merkleSession, 30);
      expect(evalResult.eligible).toBe(false);
      expect(evalResult.reason).toBe("HAS_MERKLE_EVIDENCE");
    });

    it("identifies expired unfinalized/stale sessions past retention window as eligible", () => {
      const staleSession: ProcurementSession = {
        ...baseSession,
        id: "stale-expired-sess",
        status: "CANCELLED",
      };

      const evalResult = coordinator.evaluateSession(staleSession, 30);
      expect(evalResult.eligible).toBe(true);
      expect(evalResult.reason).toBe("SAFE_TO_CLEANUP");
    });
  });

  describe("Dry Run vs Live Cleanup Execution", () => {
    it("reports eligible sessions in dry-run mode without deleting them", async () => {
      const staleSession: ProcurementSession = {
        id: "stale-1",
        mandate: {
          id: "m-1",
          rawPrompt: "old mandate",
          itemQuery: "stuff",
          quantity: 1,
          maxTotalBudget: 100,
          maxDeliveryDays: 5,
          minReturnDays: 14,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
        },
        quotes: [],
        turns: [],
        status: "CANCELLED",
        createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
      };
      sessionStore.saveSession(staleSession);

      const report = coordinator.executeCleanup({ dryRun: true, retentionDays: 30 });
      expect(report.dryRun).toBe(true);
      expect(report.eligibleCount).toBe(1);
      expect(report.deletedCount).toBe(0);

      // Verify session was NOT deleted
      expect(sessionStore.getSession("stale-1")).toBeDefined();
    });

    it("deletes eligible sessions in live mode while preserving protected sessions", async () => {
      // Session 1: Stale and safe to delete
      const staleSession: ProcurementSession = {
        id: "stale-delete-me",
        mandate: {
          id: "m-stale",
          rawPrompt: "old mandate",
          itemQuery: "stuff",
          quantity: 1,
          maxTotalBudget: 100,
          maxDeliveryDays: 5,
          minReturnDays: 14,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
        },
        quotes: [],
        turns: [],
        status: "CANCELLED",
        createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
      };
      sessionStore.saveSession(staleSession);

      // Session 2: Active negotiation (should NOT be deleted)
      const activeSession: ProcurementSession = {
        id: "active-keep-me",
        mandate: {
          id: "m-active",
          rawPrompt: "active mandate",
          itemQuery: "monitors",
          quantity: 10,
          maxTotalBudget: 5000,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date().toISOString(),
        },
        quotes: [],
        turns: [],
        status: "NEGOTIATING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessionStore.saveSession(activeSession);

      const report = coordinator.executeCleanup({ dryRun: false, retentionDays: 30 });
      expect(report.dryRun).toBe(false);
      expect(report.eligibleCount).toBe(1);
      expect(report.deletedCount).toBe(1);
      expect(report.protectedCount).toBe(1);

      // Verify stale was deleted and active was preserved
      expect(sessionStore.getSession("stale-delete-me")).toBeUndefined();
      expect(sessionStore.getSession("active-keep-me")).toBeDefined();
    });

    it("is idempotent when executed repeatedly", async () => {
      const staleSession: ProcurementSession = {
        id: "stale-repeat",
        mandate: {
          id: "m-rep",
          rawPrompt: "old mandate",
          itemQuery: "stuff",
          quantity: 1,
          maxTotalBudget: 100,
          maxDeliveryDays: 5,
          minReturnDays: 14,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
        },
        quotes: [],
        turns: [],
        status: "CANCELLED",
        createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
      };
      sessionStore.saveSession(staleSession);

      // First run deletes it
      const report1 = coordinator.executeCleanup({ dryRun: false, retentionDays: 30 });
      expect(report1.deletedCount).toBe(1);

      // Second run finds 0 eligible
      const report2 = coordinator.executeCleanup({ dryRun: false, retentionDays: 30 });
      expect(report2.deletedCount).toBe(0);
      expect(report2.eligibleCount).toBe(0);
    });
  });

  describe("Job Concurrency & Locking", () => {
    it("acquires and releases lock properly", () => {
      const lockAcquired = coordinator.acquireLock("cleanup", 5000);
      expect(lockAcquired).toBe(true);

      // Attempting to acquire lock while held should fail
      const lockBlocked = coordinator.acquireLock("cleanup", 5000);
      expect(lockBlocked).toBe(false);

      // Release lock
      coordinator.releaseLock("cleanup");

      // Now lock can be acquired again
      const lockAcquiredAgain = coordinator.acquireLock("cleanup", 5000);
      expect(lockAcquiredAgain).toBe(true);
      coordinator.releaseLock("cleanup");
    });

    it("supports acquireLockAsync and releaseLockAsync with ownership tokens and safe expiration", async () => {
      const lock1 = await coordinator.acquireLockAsync("cleanup", 50);
      expect(lock1.acquired).toBe(true);
      expect(lock1.token).toBeTruthy();

      // Overlapping request while lock is held must fail
      const lock2 = await coordinator.acquireLockAsync("cleanup", 50);
      expect(lock2.acquired).toBe(false);

      // Attempting to release with an incorrect token must fail
      const badRelease = await coordinator.releaseLockAsync("cleanup", "invalid_token_xyz");
      expect(badRelease).toBe(false);

      // Release with correct owner token succeeds
      const goodRelease = await coordinator.releaseLockAsync("cleanup", lock1.token);
      expect(goodRelease).toBe(true);

      // Can be re-acquired immediately after release
      const lock3 = await coordinator.acquireLockAsync("cleanup", 40);
      expect(lock3.acquired).toBe(true);

      // Safe lease expiration: wait for timeout
      await new Promise((r) => setTimeout(r, 55));
      const lock4 = await coordinator.acquireLockAsync("cleanup", 50);
      expect(lock4.acquired).toBe(true);
      await coordinator.releaseLockAsync("cleanup", lock4.token);
    });

    it("reports lockBackend accurately as single-instance local memory when Redis is absent", () => {
      const health = coordinator.getHealthReport();
      expect(health.lockBackend).toBe("memory (single-instance only)");
      expect(health.cronConfig.lockBackend).toBe("memory (single-instance only)");
    });
  });

  describe("Hardened Invariant Safeguards", () => {
    const baseSession: ProcurementSession = {
      id: "session-hardened-base",
      mandate: {
        id: "mandate-hardened",
        rawPrompt: "Purchase 25 monitors under $8,500",
        itemQuery: "4K Monitors",
        quantity: 25,
        maxTotalBudget: 8500,
        maxDeliveryDays: 5,
        minReturnDays: 30,
        requiredSpecs: [],
        currency: "USD",
        createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      },
      quotes: [],
      turns: [],
      status: "CANCELLED",
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    };

    it("preserves sessions with auditCertificate even if status is AUDIT_FAILED", () => {
      const failedAuditSession: ProcurementSession = {
        ...baseSession,
        id: "failed-audit-sess",
        status: "AUDIT_FAILED",
        auditCertificate: {
          certificateId: "cert-fail-1",
          sessionId: "failed-audit-sess",
          passed: false,
          invariants: [],
          verifiedRoot: "0".repeat(64),
          timestamp: new Date().toISOString(),
        },
      };

      const result = coordinator.evaluateSession(failedAuditSession, 30);
      expect(result.eligible).toBe(false);
      expect(result.isProtected).toBe(true);
      expect(result.reason).toBe("HAS_MERKLE_EVIDENCE");
    });

    it("preserves sessions with unfinalized paypalOrderId", () => {
      const pendingOrderSession: ProcurementSession = {
        ...baseSession,
        id: "pending-order-sess",
        status: "PAYPAL_AUTHORIZED",
        paypalOrderId: "ORDER_ABC_123",
      };

      const result = coordinator.evaluateSession(pendingOrderSession, 30);
      expect(result.eligible).toBe(false);
      expect(result.isProtected).toBe(true);
      expect(result.reason).toBe("PAYPAL_CAPTURE_PENDING");
    });
  });
});
