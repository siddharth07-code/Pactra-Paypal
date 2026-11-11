/**
 * PACTUM — Scheduled Maintenance & Cron Coordination Layer
 *
 * Implements:
 * 1. Constant-time authentication for CRON_SECRET.
 * 2. Distributed / in-memory job concurrency locking to prevent overlapping executions.
 * 3. Invariant-preserving session retention analysis (protecting audit records, disputes, and settlements).
 * 4. Idempotent dry-run and deletion execution.
 *
 * Follows GEMINI.md Section 1, 8, 11, SECURITY.md Section 3, 7, 10, and Phase 4/5 specifications.
 */

import crypto from "crypto";
import { NextRequest } from "next/server";
import Redis from "ioredis";
import { ensureRedisReady, redisConnectionOptions } from "./redis-connection";
import { sessionStore } from "./session-store";
import { defaultGeminiQuotaCoordinator } from "./gemini-quota";
import { defaultRateLimiter } from "./rate-limiter";
import type { ProcurementSession } from "../types/pactum";

export interface CronAuthResult {
  authenticated: boolean;
  error?: string;
}

/**
 * Validates request authentication against CRON_SECRET using constant-time comparison.
 * Fails closed if CRON_SECRET is missing or empty.
 */
export function verifyCronSecret(
  reqOrToken: NextRequest | string | null | undefined,
  expectedSecretOverride?: string
): CronAuthResult {
  const configuredSecret =
    expectedSecretOverride !== undefined
      ? expectedSecretOverride
      : (process.env.CRON_SECRET || "");

  if (!configuredSecret || !configuredSecret.trim()) {
    return {
      authenticated: false,
      error: "CRON_SECRET is not configured on the server. Maintenance endpoints are disabled.",
    };
  }

  let token = "";
  if (typeof reqOrToken === "string") {
    token = reqOrToken.startsWith("Bearer ") ? reqOrToken.substring(7).trim() : reqOrToken.trim();
  } else if (reqOrToken && typeof reqOrToken === "object" && "headers" in reqOrToken) {
    const authHeader = reqOrToken.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else {
      token = reqOrToken.headers.get("x-cron-secret")?.trim() || "";
    }
  }

  if (!token) {
    return {
      authenticated: false,
      error: "Missing cron authentication credentials. Provide 'Authorization: Bearer <CRON_SECRET>' or 'x-cron-secret'.",
    };
  }

  const configuredBuffer = Buffer.from(configuredSecret, "utf-8");
  const providedBuffer = Buffer.from(token, "utf-8");

  if (configuredBuffer.length !== providedBuffer.length) {
    return {
      authenticated: false,
      error: "Invalid cron authentication secret.",
    };
  }

  const isMatch = crypto.timingSafeEqual(configuredBuffer, providedBuffer);
  if (!isMatch) {
    return {
      authenticated: false,
      error: "Invalid cron authentication secret.",
    };
  }

  return { authenticated: true };
}

export interface SystemHealthReport {
  status: "healthy" | "degraded" | "HEALTHY" | "DEGRADED";
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  maintenanceConfigured: boolean;
  rateLimiterBackend: string;
  lockBackend: string;
  sessionStore: {
    totalSessions: number;
    activeNegotiations: number;
    settled: number;
    disputed: number;
    pendingReconciliation: number;
    terminalWithoutAgreement: number;
  };
  geminiCircuitBreaker: {
    state: string;
  };
  geminiQuota: {
    circuitState: string;
    consecutiveFailures: number;
    activeConcurrentRequests: number;
    requestsInWindow: number;
    windowLimit: number;
    cooldownRemainingMs: number;
    isAdmissible: boolean;
  };
  rateLimiter: {
    backend: "memory" | "redis";
    isReady: boolean;
  };
  cronConfig: {
    cronConfigured: boolean;
    retentionDays: number;
    lockBackend?: string;
  };
}

export interface CleanupSessionEvaluation {
  sessionId: string;
  status: string;
  ageDays: number;
  updatedAt: string;
  isProtected: boolean;
  protectionReason?: string;
  eligibleForDeletion: boolean;
  eligible: boolean;
  reason?: string;
}

export interface CleanupReport {
  success: boolean;
  dryRun: boolean;
  retentionDays: number;
  cutoffDate: string;
  totalScanned: number;
  scannedCount: number;
  protectedCount: number;
  eligibleCount: number;
  deletedCount: number;
  evaluations: CleanupSessionEvaluation[];
}

export class CronCoordinator {
  private redisClient: Redis | null = null;
  private localMemoryLocks = new Map<
    string,
    { token: string; expiresAt: number; timer?: NodeJS.Timeout }
  >();
  private startTime = Date.now();

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL;
    if (url) {
      try {
        this.redisClient = new Redis(redisConnectionOptions(url));

        this.redisClient.on("error", () => {
          if (process.env.NODE_ENV !== "test") {
            console.error("[CronCoordinator] Redis lock connection unavailable.");
          }
        });
      } catch {
        this.redisClient = null;
      }
    }
  }

  /**
   * Acquires a distributed lock using Redis if available (via atomic SET key token PX leaseMs NX),
   * or safely falls back to local in-memory lock with ownership token and auto-expiration.
   */
  public async acquireLockAsync(
    jobId: string,
    leaseMs: number = 60000
  ): Promise<{ acquired: boolean; token?: string; backend: "redis" | "memory" }> {
    const token = crypto.randomUUID();
    const lockKey = `pactum:lock:${jobId}`;

    if (this.redisClient) {
      try {
        await ensureRedisReady(this.redisClient);
        if (this.redisClient.status === "ready") {
          const res = await this.redisClient.set(lockKey, token, "PX", leaseMs, "NX");
          if (res === "OK") {
            return { acquired: true, token, backend: "redis" };
          }
          return { acquired: false, backend: "redis" };
        }
      } catch {
        if (process.env.NODE_ENV !== "test") {
          console.warn("[CronCoordinator] Distributed Redis lock unavailable.");
        }
      }
    }

    if (process.env.NODE_ENV === "production" || process.env.RATE_LIMIT_BACKEND === "redis") {
      throw new Error("Distributed cron coordination unavailable.");
    }

    // Local in-memory lock (Single-Instance Only)
    const now = Date.now();
    const existing = this.localMemoryLocks.get(jobId);
    if (existing && existing.expiresAt > now) {
      return { acquired: false, backend: "memory" };
    }

    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.localMemoryLocks.delete(jobId);
    }, leaseMs);

    this.localMemoryLocks.set(jobId, { token, expiresAt: now + leaseMs, timer });
    return { acquired: true, token, backend: "memory" };
  }

  /**
   * Releases a distributed or in-memory job lock with strict ownership token verification.
   * If Redis is used, executes an atomic Lua script ensuring only the lock owner can delete the key.
   */
  public async releaseLockAsync(jobId: string, token?: string): Promise<boolean> {
    const lockKey = `pactum:lock:${jobId}`;

    if (this.redisClient && this.redisClient.status === "ready" && token) {
      try {
        const LUA_RELEASE = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const res = (await this.redisClient.eval(LUA_RELEASE, 1, lockKey, token)) as number;
        return res === 1;
      } catch {
        // Fall through to memory cleanup
      }
    }

    const existing = this.localMemoryLocks.get(jobId);
    if (existing) {
      if (!token || existing.token === token) {
        if (existing.timer) clearTimeout(existing.timer);
        this.localMemoryLocks.delete(jobId);
        return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Synchronous job lock acquisition for in-process single-instance execution and testing.
   * Enforces auto-expiration timeout and ownership token generation.
   */
  public acquireLock(jobId: string, timeoutMs: number = 60000): boolean {
    const now = Date.now();
    const existing = this.localMemoryLocks.get(jobId);
    if (existing && existing.expiresAt > now) {
      return false;
    }
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }
    const token = crypto.randomUUID();
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            this.localMemoryLocks.delete(jobId);
          }, timeoutMs)
        : undefined;

    this.localMemoryLocks.set(jobId, { token, expiresAt: now + timeoutMs, timer });
    return true;
  }

  /**
   * Synchronous job lock release.
   */
  public releaseLock(jobId: string): void {
    const existing = this.localMemoryLocks.get(jobId);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }
    this.localMemoryLocks.delete(jobId);
  }

  /**
   * Compiles safe operational readiness metadata without consuming any AI tokens.
   */
  public getHealthReport(): SystemHealthReport {
    const sessions = sessionStore.getAllSessions();
    const quotaStatus = defaultGeminiQuotaCoordinator.getStatus();
    const limiterBackend = defaultRateLimiter.getBackend();

    let activeNegotiations = 0;
    let settled = 0;
    let disputed = 0;
    let pendingReconciliation = 0;
    let terminalWithoutAgreement = 0;

    for (const s of sessions) {
      if (
        s.status === "MANDATE_PENDING" ||
        s.status === "SOURCING" ||
        s.status === "NEGOTIATING" ||
        s.status === "AUDIT_PENDING"
      ) {
        activeNegotiations++;
      } else if (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED") {
        settled++;
      } else if (s.status === "DISPUTED") {
        disputed++;
      } else if (s.status === "CAPTURE_PENDING_RECONCILIATION") {
        pendingReconciliation++;
      } else if (!s.agreementRecord && (s.status === "CANCELLED" || s.status === "AUDIT_FAILED")) {
        terminalWithoutAgreement++;
      }
    }

    const retentionDays = Number(process.env.SESSION_RETENTION_DAYS) || 30;
    const isDegraded =
      quotaStatus.circuitState === "OPEN" ||
      pendingReconciliation > 0 ||
      !limiterBackend.isReady();

    const lockBackend =
      this.redisClient && this.redisClient.status === "ready"
        ? "redis"
        : "memory (single-instance only)";

    return {
      status: isDegraded ? "DEGRADED" : "HEALTHY",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      environment: process.env.NODE_ENV || "development",
      maintenanceConfigured: Boolean(process.env.CRON_SECRET),
      rateLimiterBackend: limiterBackend.getBackendType(),
      lockBackend,
      sessionStore: {
        totalSessions: sessions.length,
        activeNegotiations,
        settled,
        disputed,
        pendingReconciliation,
        terminalWithoutAgreement,
      },
      geminiCircuitBreaker: {
        state: quotaStatus.circuitState,
      },
      geminiQuota: {
        circuitState: quotaStatus.circuitState,
        consecutiveFailures: quotaStatus.consecutiveFailures,
        activeConcurrentRequests: quotaStatus.activeRequests,
        requestsInWindow: quotaStatus.requestsInCurrentWindow,
        windowLimit: quotaStatus.windowLimit,
        cooldownRemainingMs: quotaStatus.cooldownRemainingMs,
        isAdmissible: quotaStatus.isAdmissible,
      },
      rateLimiter: {
        backend: limiterBackend.getBackendType(),
        isReady: limiterBackend.isReady(),
      },
      cronConfig: {
        cronConfigured: Boolean(process.env.CRON_SECRET),
        retentionDays,
        lockBackend,
      },
    };
  }

  /**
   * Deterministically evaluates sessions for safe retention.
   * STRICT NON-NEGOTIABLE INVARIANTS:
   * 1. Never delete sessions with active or unresolved disputes.
   * 2. Never delete sessions with pending or ambiguous PayPal captures.
   * 3. Never delete active negotiations.
   * 4. Never delete cryptographic Merkle evidence / flight-recorder history.
   * 5. Never delete settled agreements, audit certificates, or settlement records.
   * 6. Only prune abandoned/cancelled/failed sessions with zero financial or agreement records older than retentionDays.
   */
  public evaluateSession(session: ProcurementSession, cutoffMsOrDays: number): CleanupSessionEvaluation {
    const cutoffMs =
      cutoffMsOrDays < 10000
        ? Date.now() - cutoffMsOrDays * 24 * 60 * 60 * 1000
        : cutoffMsOrDays;

    const sessionTimestampStr =
      session.updatedAt ||
      session.createdAt ||
      session.mandate?.createdAt ||
      new Date().toISOString();
    const updatedAtMs = new Date(sessionTimestampStr).getTime();
    const ageDays = Math.max(0, Math.floor((Date.now() - updatedAtMs) / (1000 * 60 * 60 * 24)));

    // Invariant 1: Unresolved disputes
    if (
      session.status === "DISPUTED" ||
      (session.disputes && session.disputes.length > 0 && session.disputes.some((d) => d.status !== "RESOLVED"))
    ) {
      return {
        sessionId: session.id,
        status: session.status,
        ageDays,
        updatedAt: sessionTimestampStr,
        isProtected: true,
        protectionReason: "Contains active or unresolved dispute record.",
        eligibleForDeletion: false,
        eligible: false,
        reason: "UNRESOLVED_DISPUTE",
      };
    }

    // Invariant 2: Pending or uncertain PayPal capture / unfinalized order
    if (
      session.status === "CAPTURE_PENDING_RECONCILIATION" ||
      session.status === "AWAITING_PAYPAL_APPROVAL" ||
      session.status === "PAYPAL_AUTHORIZED" ||
      session.paypalAuthorizationId ||
      (session.paypalOrderId && !session.paypalCaptureId && session.status !== "CANCELLED")
    ) {
      return {
        sessionId: session.id,
        status: session.status,
        ageDays,
        updatedAt: sessionTimestampStr,
        isProtected: true,
        protectionReason: "Pending or uncertain PayPal payment authorization/capture.",
        eligibleForDeletion: false,
        eligible: false,
        reason: "PAYPAL_CAPTURE_PENDING",
      };
    }

    // Invariant 3: Active negotiations
    if (
      session.status === "MANDATE_PENDING" ||
      session.status === "SOURCING" ||
      session.status === "NEGOTIATING" ||
      session.status === "AUDIT_PENDING"
    ) {
      return {
        sessionId: session.id,
        status: session.status,
        ageDays,
        updatedAt: sessionTimestampStr,
        isProtected: true,
        protectionReason: "Active procurement or negotiation session.",
        eligibleForDeletion: false,
        eligible: false,
        reason: "ACTIVE_NEGOTIATION",
      };
    }

    // Invariant 4: Merkle evidence / flight-recorder lineage & audit certificates
    if (
      session.merkleRoot ||
      session.preSettlementRoot ||
      session.postAuditRoot ||
      session.flightRecord ||
      session.auditCertificate
    ) {
      return {
        sessionId: session.id,
        status: session.status,
        ageDays,
        updatedAt: sessionTimestampStr,
        isProtected: true,
        protectionReason: "Preserved for cryptographic SHA-256 Merkle flight-recorder evidence and audit verification.",
        eligibleForDeletion: false,
        eligible: false,
        reason: "HAS_MERKLE_EVIDENCE",
      };
    }

    // Invariant 5: Audited agreements & settled transactions
    if (
      session.agreementRecord ||
      session.paypalCaptureId ||
      session.status === "SETTLED" ||
      session.status === "PAYPAL_CAPTURED" ||
      session.status === "AUDIT_PASSED"
    ) {
      return {
        sessionId: session.id,
        status: session.status,
        ageDays,
        updatedAt: sessionTimestampStr,
        isProtected: true,
        protectionReason: "Preserved for financial audit, agreement verification, and settlement records.",
        eligibleForDeletion: false,
        eligible: false,
        reason: "HAS_AGREEMENT",
      };
    }

    // Invariant 6: Retention threshold
    if (updatedAtMs >= cutoffMs) {
      return {
        sessionId: session.id,
        status: session.status,
        ageDays,
        updatedAt: sessionTimestampStr,
        isProtected: true,
        protectionReason: "Within active retention window.",
        eligibleForDeletion: false,
        eligible: false,
        reason: "WITHIN_RETENTION_WINDOW",
      };
    }

    // Session is safe for expiration
    return {
      sessionId: session.id,
      status: session.status,
      ageDays,
      updatedAt: sessionTimestampStr,
      isProtected: false,
      protectionReason: undefined,
      eligibleForDeletion: true,
      eligible: true,
      reason: "SAFE_TO_CLEANUP",
    };
  }

  /**
   * Executes session cleanup or dry run.
   */
  public executeCleanup(options?: { dryRun?: boolean; retentionDays?: number }): CleanupReport {
    const dryRun = options?.dryRun !== false; // Default true for safety
    const retentionDays = options?.retentionDays ?? (Number(process.env.SESSION_RETENTION_DAYS) || 30);
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs).toISOString();

    const allSessions = sessionStore.getAllSessions();
    const evaluations: CleanupSessionEvaluation[] = [];
    let eligibleCount = 0;
    let protectedCount = 0;
    let deletedCount = 0;

    for (const session of allSessions) {
      const evaluation = this.evaluateSession(session, cutoffMs);
      evaluations.push(evaluation);

      if (evaluation.eligibleForDeletion) {
        eligibleCount++;
        if (!dryRun) {
          // Perform authoritative session deletion
          sessionStore.deleteSession(session.id);
          deletedCount++;
        }
      } else {
        protectedCount++;
      }
    }

    return {
      success: true,
      dryRun,
      retentionDays,
      cutoffDate,
      totalScanned: allSessions.length,
      scannedCount: allSessions.length,
      protectedCount,
      eligibleCount,
      deletedCount,
      evaluations,
    };
  }
}

// Global singleton instance
const globalForCron = globalThis as unknown as {
  pactumCronCoordinator?: CronCoordinator;
};

export const defaultCronCoordinator =
  globalForCron.pactumCronCoordinator ?? new CronCoordinator();

globalForCron.pactumCronCoordinator = defaultCronCoordinator;
