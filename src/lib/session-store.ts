/**
 * PACTUM — Authoritative Session Store
 * Manages server-side persistence and locking of procurement sessions,
 * mandate versions, revisions, and invalidation rules.
 * Follows GEMINI.md Section 3, 11 and SECURITY.md Section 2, 3, 10.
 */

import fs from "fs";
import crypto from "crypto";
import { requestScope } from "./persistence/request-scope";
import {
  SessionPersistenceAdapter,
  DurableFilePersistenceAdapter,
  MemorySessionPersistenceAdapter,
  CorruptPersistenceError,
} from "./persistence/session-persistence";
import type {
  ProcurementSession,
  ProcurementSessionStatus,
  ProcurementMandate,
  VendorQuote,
} from "../types/pactum";

export { CorruptPersistenceError };

export class MandateLockError extends Error {
  constructor(message: string, public readonly status: 404 | 409) {
    super(message);
    this.name = "MandateLockError";
  }
}

export class OptimisticConcurrencyError extends Error {
  public readonly sessionId: string;
  public readonly expectedVersion?: number;
  public readonly actualVersion?: number;

  constructor(sessionId: string, expectedVersion?: number, actualVersion?: number) {
    super(
      `Optimistic concurrency conflict on session ${sessionId}: expected version ${expectedVersion}, but current version is ${actualVersion}. Stale snapshot cannot overwrite newer state.`
    );
    this.name = "OptimisticConcurrencyError";
    this.sessionId = sessionId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export const ALLOWED_SESSION_TRANSITIONS: Record<
  ProcurementSessionStatus,
  ProcurementSessionStatus[]
> = {
  MANDATE_PENDING: ["MANDATE_PENDING", "SOURCING", "NEGOTIATING", "CANCELLED"],
  SOURCING: ["SOURCING", "NEGOTIATING", "MANDATE_PENDING", "CANCELLED"],
  NEGOTIATING: [
    "NEGOTIATING",
    "AUDIT_PENDING",
    "AUDIT_PASSED",
    "AUDIT_FAILED",
    "MANDATE_PENDING",
    "CANCELLED",
  ],
  AUDIT_PENDING: [
    "AUDIT_PENDING",
    "AUDIT_PASSED",
    "AUDIT_FAILED",
    "MANDATE_PENDING",
    "CANCELLED",
  ],
  AUDIT_FAILED: [
    "AUDIT_FAILED",
    "AUDIT_PENDING",
    "AUDIT_PASSED",
    "NEGOTIATING",
    "MANDATE_PENDING",
    "CANCELLED",
  ],
  AUDIT_PASSED: [
    "AUDIT_PASSED",
    "AWAITING_PAYPAL_APPROVAL",
    "PAYPAL_AUTHORIZED",
    "MANDATE_PENDING",
    "CANCELLED",
  ],
  AWAITING_PAYPAL_APPROVAL: [
    "AWAITING_PAYPAL_APPROVAL",
    "PAYPAL_AUTHORIZED",
    "PAYPAL_CAPTURED",
    "CANCELLED",
    "MANDATE_PENDING",
  ],
  PAYPAL_AUTHORIZED: [
    "PAYPAL_AUTHORIZED",
    "PAYPAL_CAPTURED",
    "CAPTURE_PENDING_RECONCILIATION",
    "CANCELLED",
  ],
  CAPTURE_PENDING_RECONCILIATION: [
    "CAPTURE_PENDING_RECONCILIATION",
    "PAYPAL_CAPTURED",
    "PAYPAL_AUTHORIZED",
  ],
  PAYPAL_CAPTURED: ["PAYPAL_CAPTURED", "SETTLED", "DISPUTED"],
  SETTLED: ["SETTLED", "DISPUTED"],
  DISPUTED: ["DISPUTED"],
  CANCELLED: ["CANCELLED", "MANDATE_PENDING"],
};

export class AuthoritativeSessionStore {
  private sessions = new Map<string, ProcurementSession>();
  private mandateHistory = new Map<string, ProcurementMandate[]>();
  private sessionLocks = new Set<string>();
  private adapter: SessionPersistenceAdapter;

  constructor(adapter?: SessionPersistenceAdapter) {
    if (adapter) {
      this.adapter = adapter;
    } else if (process.env.NODE_ENV === "test" && !process.env.TEST_PERSISTENCE) {
      this.adapter = new MemorySessionPersistenceAdapter();
    } else {
      this.adapter = new DurableFilePersistenceAdapter();
    }
    this.rehydrateFromPersistence();
  }

  public setAdapter(adapter: SessionPersistenceAdapter): void {
    this.adapter = adapter;
    this.rehydrateFromPersistence();
  }

  public getAdapter(): SessionPersistenceAdapter {
    return this.adapter;
  }

  /**
   * Acquire a local in-memory lock for a session ID.
   * Multi-instance note: In single-process deployments (local, dev, single container),
   * this provides atomic serialization. Multi-instance cluster deployments require
   * distributed Redis locks (e.g. Redlock).
   */
  public acquireLock(sessionId: string): boolean {
    if (this.sessionLocks.has(sessionId)) {
      return false;
    }
    this.sessionLocks.add(sessionId);
    return true;
  }

  public releaseLock(sessionId: string): void {
    this.sessionLocks.delete(sessionId);
  }

  public isLocked(sessionId: string): boolean {
    return this.sessionLocks.has(sessionId);
  }

  public getCacheFilePath(): string | null {
    return this.adapter.getFilePath ? this.adapter.getFilePath() : null;
  }

  public rehydrateFromPersistence(): void {
    this.sessions.clear();
    this.mandateHistory.clear();
    try {
      const loaded = this.adapter.load();
      if (loaded && typeof loaded === "object") {
        if (Array.isArray(loaded.sessions)) {
          for (const s of loaded.sessions) {
            if (s && s.id) {
              this.sessions.set(s.id, s);
            }
          }
        }
        if (loaded.mandateHistory && typeof loaded.mandateHistory === "object") {
          for (const [id, history] of Object.entries(loaded.mandateHistory)) {
            if (Array.isArray(history)) {
              this.mandateHistory.set(id, history as ProcurementMandate[]);
            }
          }
        }
      }
    } catch (err) {
      if (process.env.STRICT_PERSISTENCE === "true" || err instanceof CorruptPersistenceError) {
        throw err;
      }
    }
  }

  public saveToDisk(): void {
    this.adapter.save({
      sessions: Array.from(this.sessions.values()),
      mandateHistory: Object.fromEntries(this.mandateHistory.entries()),
    });
  }

  /**
   * Creates a new authoritative procurement session.
   */
  public createSession(mandate: ProcurementMandate, quotes: VendorQuote[] = []): ProcurementSession {
    const sessionId = `session_${crypto.randomBytes(8).toString("hex")}`;
    const initialMandate: ProcurementMandate = {
      ...mandate,
      version: mandate.version ?? 1,
      isLocked: false,
    };

    const session: ProcurementSession = {
      id: sessionId,
      mandate: initialMandate,
      quotes: quotes.map((q) => ({ ...q })),
      turns: [],
      status: "MANDATE_PENDING",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, JSON.parse(JSON.stringify(session)));
    this.mandateHistory.set(sessionId, [{ ...initialMandate }]);
    this.saveToDisk();
    return { ...session };
  }

  /**
   * Retrieves an authoritative session by ID.
   */
  public getSession(sessionId: string): ProcurementSession | undefined {
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.rehydrateFromPersistence();
      session = this.sessions.get(sessionId);
    }
    return session ? JSON.parse(JSON.stringify(session)) : undefined;
  }

  /**
   * Retrieves all authoritative sessions, sorted by updatedAt descending.
   */
  public getAllSessions(): ProcurementSession[] {
    if (this.sessions.size === 0) {
      this.rehydrateFromPersistence();
    }
    const all = Array.from(this.sessions.values()).map((s) => JSON.parse(JSON.stringify(s)));
    all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return all;
  }

  /**
   * Saves or updates an authoritative session with state transition validation
   * and strict Optimistic Concurrency Control (OCC).
   * If expectedVersion is provided or session.version differs from existing.version,
   * conflicting updates are rejected.
   * If persistence fails, in-memory state is atomically rolled back.
   */
  public saveSession(session: ProcurementSession, expectedVersion?: number): void {
    const existing = this.sessions.get(session.id);
    if (existing) {
      // Strict Optimistic Concurrency Control (OCC) check
      if (expectedVersion !== undefined) {
        if (existing.version !== undefined && existing.version !== expectedVersion) {
          throw new OptimisticConcurrencyError(session.id, expectedVersion, existing.version);
        }
      } else if (existing.version !== undefined) {
        if (session.version !== undefined && session.version !== existing.version) {
          throw new OptimisticConcurrencyError(session.id, session.version, existing.version);
        }
      }

      if (existing.status === "CANCELLED" && session.status !== "CANCELLED" && session.status !== "MANDATE_PENDING") {
        throw new Error("Invalid state transition: cancelled session requires explicit mandate revision.");
      }

      // Validate critical terminal invariants to prevent illegal status downgrades
      if (existing.status === "SETTLED" && session.status !== "SETTLED" && session.status !== "DISPUTED") {
        throw new Error(
          `Invalid state transition: Cannot downgrade SETTLED session ${session.id} to '${session.status}'.`
        );
      }
      if (
        existing.status === "PAYPAL_CAPTURED" &&
        session.status !== "PAYPAL_CAPTURED" &&
        session.status !== "SETTLED" &&
        session.status !== "DISPUTED"
      ) {
        throw new Error(
          `Invalid state transition: Cannot revert PAYPAL_CAPTURED session ${session.id} to '${session.status}'.`
        );
      }
      if (existing.status === "DISPUTED" && session.status !== "DISPUTED") {
        throw new Error(
          `Invalid state transition: Cannot silently revert DISPUTED session ${session.id} to '${session.status}'.`
        );
      }
      if (
        existing.status === "CAPTURE_PENDING_RECONCILIATION" &&
        session.status !== "CAPTURE_PENDING_RECONCILIATION" &&
        session.status !== "PAYPAL_CAPTURED" &&
        session.status !== "PAYPAL_AUTHORIZED" &&
        session.status !== "CANCELLED"
      ) {
        throw new Error(
          `Invalid state transition: CAPTURE_PENDING_RECONCILIATION session ${session.id} must be reconciled before transitioning to '${session.status}'.`
        );
      }
    }

    const priorSnapshot = existing ? JSON.parse(JSON.stringify(existing)) : undefined;
    const nextVersion = existing?.version !== undefined ? existing.version + 1 : (session.version ?? 1);
    const updated: ProcurementSession = {
      ...JSON.parse(JSON.stringify(session)),
      version: nextVersion,
      updatedAt: session.updatedAt ?? new Date().toISOString(),
    };

    this.sessions.set(session.id, updated);
    try {
      this.saveToDisk();
      session.version = nextVersion;
    } catch (persistErr) {
      // Atomic rollback: restore prior in-memory snapshot if disk persistence fails
      if (priorSnapshot) {
        this.sessions.set(session.id, priorSnapshot);
      } else {
        this.sessions.delete(session.id);
      }
      throw persistErr;
    }
  }

  /**
   * Locks the mandate for the active session when negotiation begins.
   */
  public lockMandate(sessionId: string): ProcurementSession {
    if (!this.acquireLock(sessionId)) {
      throw new MandateLockError("Session operation already in progress.", 409);
    }
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        throw new MandateLockError(`Session ${sessionId} not found.`, 404);
      }
      if (!ALLOWED_SESSION_TRANSITIONS[session.status]?.includes("NEGOTIATING")) {
        throw new MandateLockError(`Cannot lock mandate for session ${sessionId} in status '${session.status}'.`, 409);
      }

      // Mutate only a detached snapshot; saveSession enforces OCC and rolls back failed writes.
      session.mandate.isLocked = true;
      session.status = "NEGOTIATING";
      session.updatedAt = new Date().toISOString();
      this.saveSession(session, session.version);
      return session;
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * Explicitly updates/revises a mandate using an atomic clone-and-swap pattern.
   * If validation fails or persistence fails, in-memory state remains completely unmodified.
   * Invalidates stale quotes, offers, agreements, audit certificates, Merkle roots, and settlement references.
   */
  public reviseMandate(sessionId: string, newParams: Partial<ProcurementMandate>): ProcurementSession {
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    // Prohibit revision if transaction is already in captured, settled, disputed, or active payment states
    if (
      current.status === "PAYPAL_CAPTURED" ||
      current.status === "SETTLED" ||
      current.status === "CAPTURE_PENDING_RECONCILIATION" ||
      current.status === "AWAITING_PAYPAL_APPROVAL" ||
      current.status === "PAYPAL_AUTHORIZED" ||
      current.status === "DISPUTED"
    ) {
      throw new Error(
        `Cannot revise mandate for session ${sessionId}: transaction is currently in status '${current.status}'. Settled or open payment operations strictly prohibit mandate revision (transaction is already captured and settled or in payment).`
      );
    }

    // Validate proposed revision parameters BEFORE modifying any state
    if (newParams.maxTotalBudget !== undefined) {
      if (!Number.isFinite(newParams.maxTotalBudget) || newParams.maxTotalBudget <= 0) {
        throw new Error(`Invalid budget revision: ${newParams.maxTotalBudget}. Budget must be positive and finite.`);
      }
    }

    if (newParams.quantity !== undefined) {
      if (!Number.isInteger(newParams.quantity) || newParams.quantity <= 0) {
        throw new Error(`Invalid quantity revision: ${newParams.quantity}. Quantity must be a positive integer.`);
      }
    }

    if (newParams.maxDeliveryDays !== undefined) {
      if (!Number.isInteger(newParams.maxDeliveryDays) || newParams.maxDeliveryDays < 1) {
        throw new Error(`Invalid delivery SLA revision: ${newParams.maxDeliveryDays}. Must be an integer >= 1.`);
      }
    }

    if (newParams.minReturnDays !== undefined) {
      if (!Number.isInteger(newParams.minReturnDays) || newParams.minReturnDays < 0) {
        throw new Error(`Invalid return policy revision: ${newParams.minReturnDays}. Must be an integer >= 0.`);
      }
    }

    // Transactional clone-and-swap: work on deep copies so failed mutations leave zero dirty state
    const sessionClone: ProcurementSession = JSON.parse(JSON.stringify(current));
    const historyClone: ProcurementMandate[] = JSON.parse(
      JSON.stringify(this.mandateHistory.get(sessionId) ?? [])
    );

    const currentVersion = sessionClone.mandate.version ?? 1;
    const newVersion = currentVersion + 1;

    const revisedMandate: ProcurementMandate = {
      ...sessionClone.mandate,
      ...newParams,
      version: newVersion,
      isLocked: false, // unlocked until negotiation re-locks it
    };

    const revisedSession: ProcurementSession = {
      ...sessionClone,
      mandate: revisedMandate,
      // Strictly invalidate all stale offers, agreements, certificates, roots, orders, and turns
      selectedQuote: undefined,
      finalOffer: undefined,
      agreementRecord: undefined,
      auditCertificate: undefined,
      fxVerification: undefined,
      fxRecord: undefined,
      fxQuoteHistory: undefined,
      merkleRoot: undefined,
      preSettlementRoot: undefined,
      postAuditRoot: undefined,
      paypalOrderId: undefined,
      paypalAuthorizationId: undefined,
      paypalApprovalUrl: undefined,
      paypalCaptureId: undefined,
      paypalInvoiceId: undefined,
      captureAmount: undefined,
      captureIntent: undefined,
      invoiceStatus: undefined,
      quoteEvaluations: undefined,
      sourcingSummary: undefined,
      turns: [],
      flightRecord: undefined,
      status: "MANDATE_PENDING",
      updatedAt: new Date().toISOString(),
    };

    historyClone.push({ ...revisedMandate });

    // Commit to in-memory state
    this.sessions.set(sessionId, revisedSession);
    this.mandateHistory.set(sessionId, historyClone);

    try {
      this.saveToDisk();
    } catch (diskErr) {
      // Rollback to original unmodified session and history on disk failure
      this.sessions.set(sessionId, current);
      this.mandateHistory.set(sessionId, this.mandateHistory.get(sessionId) ?? []);
      throw new Error(
        `Mandate revision failed during disk persistence: ${diskErr instanceof Error ? diskErr.message : String(diskErr)}`
      );
    }

    return JSON.parse(JSON.stringify(revisedSession));
  }

  /**
   * Returns the mandate revision history for an audit trail.
   */
  public getMandateHistory(sessionId: string): ProcurementMandate[] {
    const history = this.mandateHistory.get(sessionId);
    return history ? JSON.parse(JSON.stringify(history)) : [];
  }

  /**
   * Deletes an authoritative session by ID (e.g. during scheduled maintenance cleanup).
   */
  public deleteSession(sessionId: string): boolean {
    const existed = this.sessions.delete(sessionId);
    this.mandateHistory.delete(sessionId);
    if (existed) {
      this.saveToDisk();
    }
    return existed;
  }

  /**
   * Resets all sessions (useful for test isolation).
   */
  public clear(): void {
    this.sessions.clear();
    this.mandateHistory.clear();
    this.adapter.clear();
    const filePath = this.getCacheFilePath();
    if (filePath) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // Ignore unlink error
      }
    }
  }
}

// Global singleton instance for server-side persistence across Next.js route chunks
const globalForSessionStore = globalThis as unknown as {
  pactumAuthoritativeSessionStore?: AuthoritativeSessionStore;
};

const legacySessionStore = globalForSessionStore.pactumAuthoritativeSessionStore ?? new AuthoritativeSessionStore(new MemorySessionPersistenceAdapter());
// Runtime callers must enter a database-authorized request scope. Maps are detached workspaces,
// never an alternative financial source when PostgreSQL is unavailable.
export const sessionStore = new Proxy(legacySessionStore, {
  get(target, property) {
    const scope = requestScope();
    if (!scope && process.env.NODE_ENV !== "test") throw new Error("An authorized database session scope is required.");
    const store = scope?.store ?? target;
    const value: unknown = Reflect.get(store, property);
    return value;
  },
});

export async function saveSessionCheckpoint(session: ProcurementSession): Promise<void> {
  sessionStore.saveSession(session);
  const scope = requestScope();
  if (scope) await scope.persist(session);
}

if (process.env.NODE_ENV !== "production") {
  globalForSessionStore.pactumAuthoritativeSessionStore = legacySessionStore;
}
