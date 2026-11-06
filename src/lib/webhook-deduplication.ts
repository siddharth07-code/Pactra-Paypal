/**
 * PACTUM — Webhook Deduplication & Replay Protection Ledger
 * Prevents duplicate webhook delivery from executing redundant state transitions.
 * Follows GEMINI.md Section 9, 11, SECURITY.md Section 8, and Phase 5 specifications.
 * Claims serialize one process only. Independent instances do not share locks or fresh snapshots.
 * Session writes and ledger completion are separate commits: a crash between them may replay work.
 * PostgreSQL unique event IDs and a transaction coupling event claims, session/evidence updates,
 * and completion are required for cross-instance/crash-atomic replay safety. File checksums are
 * not currently validated on load; they do not provide authenticated or transactional storage.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { canonicalJson } from "./veripay-merkle";

export interface WebhookLedgerEntry {
  eventId: string;
  eventType: string;
  resourceId?: string;
  status: "PROCESSING" | "PROCESSED" | "FAILED";
  receivedAt: string;
  completedAt?: string;
  error?: string;
}

export interface WebhookLedgerEnvelope {
  schemaVersion: number;
  checksum: string;
  updatedAt: string;
  entries: Record<string, WebhookLedgerEntry>;
}

export class WebhookDeduplicationLedger {
  private entries = new Map<string, WebhookLedgerEntry>();
  // Never expire a live handler's claim. The timeout only recovers claims loaded after restart.
  private activeClaims = new Set<string>();
  private filePath: string | null;
  public readonly processingTimeoutMs: number;

  constructor(options?: { filePath?: string | null; processingTimeoutMs?: number }) {
    this.processingTimeoutMs = options?.processingTimeoutMs ?? 30_000;
    if (options?.filePath !== undefined) {
      this.filePath = options.filePath;
    } else if (process.env.NODE_ENV === "test") {
      this.filePath = null; // in-memory for unit test isolation
    } else {
      this.filePath = path.join(process.cwd(), ".pactum-webhooks.json");
    }
    this.loadFromDisk();
  }

  public getEntry(eventId: string): WebhookLedgerEntry | undefined {
    const entry = this.entries.get(eventId);
    return entry ? JSON.parse(JSON.stringify(entry)) : undefined;
  }

  public isProcessed(eventId: string): boolean {
    const entry = this.entries.get(eventId);
    return entry !== undefined && entry.status === "PROCESSED";
  }

  public isProcessing(eventId: string): boolean {
    if (this.activeClaims.has(eventId)) return true;
    const entry = this.entries.get(eventId);
    if (!entry || entry.status !== "PROCESSING") return false;
    const age = Date.now() - new Date(entry.receivedAt).getTime();
    return age <= this.processingTimeoutMs;
  }

  public isInProgress(eventId: string): boolean {
    return this.isProcessing(eventId);
  }

  public recordProcessing(eventId: string, eventType: string, resourceId?: string): boolean {
    if (this.isProcessed(eventId)) {
      return false; // Already processed
    }
    if (this.isProcessing(eventId)) {
      return false; // Currently active concurrent processing
    }

    const previous = this.entries.get(eventId);
    this.entries.set(eventId, {
      eventId,
      eventType,
      resourceId,
      status: "PROCESSING",
      receivedAt: new Date().toISOString(),
    });

    this.activeClaims.add(eventId);
    try {
      this.saveToDisk();
    } catch (error) {
      if (previous) this.entries.set(eventId, previous);
      else this.entries.delete(eventId);
      this.activeClaims.delete(eventId);
      throw error;
    }
    return true;
  }

  public recordProcessed(eventId: string): void {
    const entry = this.entries.get(eventId);
    if (entry) {
      this.entries.set(eventId, { ...entry, status: "PROCESSED", completedAt: new Date().toISOString() });
      try {
        this.saveToDisk();
      } catch (error) {
        this.entries.set(eventId, entry);
        throw error;
      }
      this.activeClaims.delete(eventId);
    }
  }

  public recordFailed(eventId: string, error: string): void {
    const entry = this.entries.get(eventId);
    if (entry) {
      this.entries.set(eventId, { ...entry, status: "FAILED", error, completedAt: new Date().toISOString() });
      try {
        this.saveToDisk();
      } catch (persistError) {
        this.entries.set(eventId, entry);
        throw persistError;
      } finally {
        this.activeClaims.delete(eventId);
      }
    }
  }

  public clear(): void {
    this.entries.clear();
    this.activeClaims.clear();
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        fs.unlinkSync(this.filePath);
      } catch {
        // Ignore unlink error
      }
    }
  }

  private loadFromDisk(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as Partial<WebhookLedgerEnvelope>;

      if (parsed && typeof parsed === "object") {
        const entriesObj = parsed.entries ?? (parsed as unknown as Record<string, WebhookLedgerEntry>);
        if (entriesObj && typeof entriesObj === "object") {
          for (const [eventId, entry] of Object.entries(entriesObj)) {
            if (entry && entry.eventId) {
              this.entries.set(eventId, entry);
            }
          }
        }
      }
    } catch {
      // Corrupt file will be replaced on subsequent write
    }
  }

  private saveToDisk(): void {
    if (!this.filePath) return;
    try {
      const entriesObj = Object.fromEntries(this.entries.entries());
      const canonical = canonicalJson(entriesObj);
      const checksum = `sha256:${crypto.createHash("sha256").update(Buffer.from(canonical, "utf-8")).digest("hex")}`;

      const envelope: WebhookLedgerEnvelope = {
        schemaVersion: 1,
        checksum,
        updatedAt: new Date().toISOString(),
        entries: entriesObj,
      };

      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
      const fd = fs.openSync(tempPath, "w", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(envelope, null, 2), "utf-8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tempPath, this.filePath);
      try {
        const dirFd = fs.openSync(dir, "r");
        try {
          fs.fsyncSync(dirFd);
        } finally {
          fs.closeSync(dirFd);
        }
      } catch {
        // Ignored on filesystems or OS that restrict directory fsync
      }
    } catch {
      throw new Error("Webhook ledger persistence failed.");
    }
  }
}

// Global singleton for server-side persistence
const globalForWebhookLedger = globalThis as unknown as {
  pactumAuthoritativeWebhookLedger?: WebhookDeduplicationLedger;
};

export const defaultWebhookLedger =
  globalForWebhookLedger.pactumAuthoritativeWebhookLedger ?? new WebhookDeduplicationLedger();

if (process.env.NODE_ENV !== "production") {
  globalForWebhookLedger.pactumAuthoritativeWebhookLedger = defaultWebhookLedger;
}
