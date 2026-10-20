/**
 * PACTUM — Authoritative Session Store
 * Manages server-side persistence and locking of procurement sessions,
 * mandate versions, revisions, and invalidation rules.
 * Follows GEMINI.md Section 3, 11 and SECURITY.md Section 2, 3, 10.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  ProcurementSession,
  ProcurementMandate,
  VendorQuote,
} from "../types/pactum";

class AuthoritativeSessionStore {
  private sessions = new Map<string, ProcurementSession>();
  private mandateHistory = new Map<string, ProcurementMandate[]>();

  constructor() {
    this.loadFromDisk();
  }

  private getCacheFilePath(): string | null {
    if (process.env.NODE_ENV === "test") {
      return null;
    }
    try {
      return path.join(process.cwd(), ".pactum-sessions.json");
    } catch {
      return null;
    }
  }

  private loadFromDisk(): void {
    const filePath = this.getCacheFilePath();
    if (!filePath) return;
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.sessions)) {
            for (const s of parsed.sessions) {
              if (s && s.id) {
                this.sessions.set(s.id, s);
              }
            }
          }
          if (parsed.mandateHistory && typeof parsed.mandateHistory === "object") {
            for (const [id, history] of Object.entries(parsed.mandateHistory)) {
              if (Array.isArray(history)) {
                this.mandateHistory.set(id, history as ProcurementMandate[]);
              }
            }
          }
        }
      }
    } catch {
      // Ignore disk read error, proceed with in-memory store
    }
  }

  private saveToDisk(): void {
    const filePath = this.getCacheFilePath();
    if (!filePath) return;
    try {
      const data = {
        sessions: Array.from(this.sessions.values()),
        mandateHistory: Object.fromEntries(this.mandateHistory.entries()),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Ignore disk write error
    }
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.mandateHistory.set(sessionId, [{ ...initialMandate }]);
    this.saveToDisk();
    return { ...session };
  }

  /**
   * Retrieves an authoritative session by ID.
   */
  public getSession(sessionId: string): ProcurementSession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? JSON.parse(JSON.stringify(session)) : undefined;
  }

  /**
   * Retrieves all authoritative sessions, sorted by updatedAt descending.
   */
  public getAllSessions(): ProcurementSession[] {
    const all = Array.from(this.sessions.values()).map((s) => JSON.parse(JSON.stringify(s)));
    all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return all;
  }

  /**
   * Saves or updates an authoritative session.
   */
  public saveSession(session: ProcurementSession): void {
    const updated = {
      ...session,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, JSON.parse(JSON.stringify(updated)));
    this.saveToDisk();
  }

  /**
   * Locks the mandate for the active session when negotiation begins.
   */
  public lockMandate(sessionId: string): ProcurementSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    session.mandate.isLocked = true;
    session.status = "NEGOTIATING";
    session.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return JSON.parse(JSON.stringify(session));
  }

  /**
   * Explicitly updates/revises a mandate.
   * If the mandate was locked, creates a new version, invalidates stale offers/audit certificates,
   * and resets negotiation status.
   */
  public reviseMandate(sessionId: string, newParams: Partial<ProcurementMandate>): ProcurementSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    // Validate proposed revision parameters
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

    if (newParams.currency !== undefined && session.mandate.currency !== newParams.currency) {
      // Currency changes require full invalidation
      session.mandate.currency = newParams.currency;
    }

    const currentVersion = session.mandate.version ?? 1;
    const newVersion = currentVersion + 1;

    const revisedMandate: ProcurementMandate = {
      ...session.mandate,
      ...newParams,
      version: newVersion,
      isLocked: false, // unlocked until negotiation re-locks it
    };

    session.mandate = revisedMandate;
    // Invalidate stale offers, certificates, and roots
    session.selectedQuote = undefined;
    session.finalOffer = undefined;
    session.auditCertificate = undefined;
    session.merkleRoot = undefined;
    session.preSettlementRoot = undefined;
    session.postAuditRoot = undefined;
    session.paypalOrderId = undefined;
    session.paypalCaptureId = undefined;
    session.status = "MANDATE_PENDING";
    session.updatedAt = new Date().toISOString();

    const history = this.mandateHistory.get(sessionId) ?? [];
    history.push({ ...revisedMandate });
    this.mandateHistory.set(sessionId, history);

    this.saveToDisk();
    return JSON.parse(JSON.stringify(session));
  }

  /**
   * Returns the mandate revision history for an audit trail.
   */
  public getMandateHistory(sessionId: string): ProcurementMandate[] {
    const history = this.mandateHistory.get(sessionId);
    return history ? JSON.parse(JSON.stringify(history)) : [];
  }

  /**
   * Resets all sessions (useful for test isolation).
   */
  public clear(): void {
    this.sessions.clear();
    this.mandateHistory.clear();
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

export const sessionStore =
  globalForSessionStore.pactumAuthoritativeSessionStore ?? new AuthoritativeSessionStore();

if (process.env.NODE_ENV !== "production") {
  globalForSessionStore.pactumAuthoritativeSessionStore = sessionStore;
}
