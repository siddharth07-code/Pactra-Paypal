/**
 * PACTUM — Durable Idempotency Engine
 * Enforces exactly-once execution for financial operations, order creation, capture, and webhooks.
 * Follows GEMINI.md Section 8, 9, 11, SECURITY.md Section 3, 7, and Phase 5 specifications.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { canonicalJson } from "./veripay-merkle";
import type { IdempotencyRecord } from "../types/pactum";

export interface IdempotencyEnvelope {
  schemaVersion: number;
  checksum: string;
  updatedAt: string;
  records: Record<string, IdempotencyRecord>;
}

export class IdempotencyConflictError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = "IDEMPOTENCY_CONFLICT", statusCode = 409) {
    super(message);
    this.name = "IdempotencyConflictError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class IdempotencyPayloadMismatchError extends IdempotencyConflictError {
  constructor(message = "Idempotency key reused with different request payload.") {
    super(message, "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH", 422);
    this.name = "IdempotencyPayloadMismatchError";
  }
}

export class ConcurrentOperationInProgressError extends IdempotencyConflictError {
  constructor(message = "An operation with this idempotency key is currently in progress.") {
    super(message, "CONCURRENT_REQUEST_IN_PROGRESS", 409);
    this.name = "ConcurrentOperationInProgressError";
  }
}

export interface IdempotentExecuteOptions<TReq, TRes> {
  scope: string;
  key: string;
  payload: TReq;
  ttlMs?: number; // Default: 24 hours
  execute: () => Promise<{ status: number; body: TRes }>;
}

export class DurableIdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private filePath: string | null;
  public readonly inProgressTimeoutMs: number;

  constructor(options?: { filePath?: string | null; inProgressTimeoutMs?: number }) {
    this.inProgressTimeoutMs = options?.inProgressTimeoutMs ?? 60_000;
    if (options?.filePath !== undefined) {
      this.filePath = options.filePath;
    } else if (process.env.NODE_ENV === "test") {
      this.filePath = null; // In-memory during automated tests unless specified
    } else {
      this.filePath = path.join(process.cwd(), ".pactum-idempotency.json");
    }
    this.loadFromDisk();
  }

  private compositeKey(scope: string, key: string): string {
    return `${scope}:${key}`;
  }

  public computeFingerprint(payload: unknown): string {
    const canonical = canonicalJson(payload);
    return crypto.createHash("sha256").update(Buffer.from(canonical, "utf-8")).digest("hex");
  }

  public getRecord<T = unknown>(scope: string, key: string): IdempotencyRecord<T> | undefined {
    const compKey = this.compositeKey(scope, key);
    const record = this.records.get(compKey);
    if (!record) return undefined;

    // Check expiration
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      this.records.delete(compKey);
      this.saveToDisk();
      return undefined;
    }

    return JSON.parse(JSON.stringify(record)) as IdempotencyRecord<T>;
  }

  public recordInProgress(
    scope: string,
    key: string,
    payload: unknown,
    ttlMs: number = 24 * 60 * 60 * 1000
  ): { status: "NEW" } | { status: "REPLAY"; record: IdempotencyRecord } {
    const compKey = this.compositeKey(scope, key);
    const fingerprint = this.computeFingerprint(payload);
    const existing = this.getRecord(scope, key);

    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new IdempotencyPayloadMismatchError(
          `Idempotency key '${key}' in scope '${scope}' was previously used with a different request payload.`
        );
      }

      if (existing.status === "IN_PROGRESS") {
        const age = Date.now() - new Date(existing.createdAt).getTime();
        if (age > this.inProgressTimeoutMs) {
          // Stale / abandoned operation from crashed or dead process
          existing.status = "FAILED";
          existing.error = "Previous execution timed out or process terminated while in progress.";
          existing.completedAt = new Date().toISOString();
          this.saveToDisk();
          // Fall through to allow fresh execution
        } else {
          throw new ConcurrentOperationInProgressError(
            `An operation for idempotency key '${key}' in scope '${scope}' is currently in progress.`
          );
        }
      }

      if (existing.status === "COMPLETED") {
        return { status: "REPLAY", record: existing };
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    const record: IdempotencyRecord = {
      key,
      scope,
      requestFingerprint: fingerprint,
      status: "IN_PROGRESS",
      createdAt: now.toISOString(),
      expiresAt,
    };

    this.records.set(compKey, record);
    this.saveToDisk();
    return { status: "NEW" };
  }

  public recordCompleted<T>(
    scope: string,
    key: string,
    responseStatus: number,
    responseBody: T
  ): void {
    const compKey = this.compositeKey(scope, key);
    const record = this.records.get(compKey);
    if (!record) return;

    record.status = "COMPLETED";
    record.responseStatus = responseStatus;
    record.responseBody = responseBody;
    record.completedAt = new Date().toISOString();

    this.saveToDisk();
  }

  public recordFailed(scope: string, key: string, error: string): void {
    const compKey = this.compositeKey(scope, key);
    const record = this.records.get(compKey);
    if (!record) return;

    record.status = "FAILED";
    record.error = error;
    record.completedAt = new Date().toISOString();

    this.saveToDisk();
  }

  /**
   * Execute an operation idempotently with durable replay caching.
   */
  public async executeIdempotent<TReq, TRes>(
    options: IdempotentExecuteOptions<TReq, TRes>
  ): Promise<{ status: number; body: TRes; isReplay: boolean }> {
    const { scope, key, payload, ttlMs, execute } = options;
    const progress = this.recordInProgress(scope, key, payload, ttlMs);

    if (progress.status === "REPLAY") {
      return {
        status: progress.record.responseStatus ?? 200,
        body: progress.record.responseBody as TRes,
        isReplay: true,
      };
    }

    try {
      const outcome = await execute();
      this.recordCompleted(scope, key, outcome.status, outcome.body);
      return {
        status: outcome.status,
        body: outcome.body,
        isReplay: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.recordFailed(scope, key, errMsg);
      throw err;
    }
  }

  public pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [compKey, record] of this.records.entries()) {
      if (new Date(record.expiresAt).getTime() < now) {
        this.records.delete(compKey);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.saveToDisk();
    }
    return pruned;
  }

  public clear(): void {
    this.records.clear();
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
      const parsed = JSON.parse(raw) as Partial<IdempotencyEnvelope>;

      if (parsed && typeof parsed === "object") {
        const recordsObj = parsed.records ?? (parsed as unknown as Record<string, IdempotencyRecord>);
        if (recordsObj && typeof recordsObj === "object") {
          for (const [compKey, record] of Object.entries(recordsObj)) {
            if (record && record.key && record.scope) {
              this.records.set(compKey, record);
            }
          }
          this.recoverStaleInProgress();
        }
      }
    } catch {
      // Corrupt file will be replaced on subsequent write
    }
  }

  public recoverStaleInProgress(maxAgeMs: number = this.inProgressTimeoutMs): number {
    const now = Date.now();
    let recovered = 0;
    for (const record of this.records.values()) {
      if (record.status === "IN_PROGRESS") {
        const age = now - new Date(record.createdAt).getTime();
        if (age >= maxAgeMs) {
          record.status = "FAILED";
          record.error = "Operation abandoned due to process restart or timeout.";
          record.completedAt = new Date().toISOString();
          recovered++;
        }
      }
    }
    if (recovered > 0) {
      this.saveToDisk();
    }
    return recovered;
  }

  private saveToDisk(): void {
    if (!this.filePath) return;
    try {
      const recordsObj = Object.fromEntries(this.records.entries());
      const canonical = canonicalJson(recordsObj);
      const checksum = `sha256:${crypto.createHash("sha256").update(Buffer.from(canonical, "utf-8")).digest("hex")}`;

      const envelope: IdempotencyEnvelope = {
        schemaVersion: 1,
        checksum,
        updatedAt: new Date().toISOString(),
        records: recordsObj,
      };

      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
      fs.writeFileSync(tempPath, JSON.stringify(envelope, null, 2), "utf-8");
      fs.renameSync(tempPath, this.filePath);
    } catch {
      // Silently continue if background disk write fails
    }
  }

  public size(): number {
    return this.records.size;
  }
}

// Global singleton for server-side persistence across Next.js API route invocations
const globalForIdempotency = globalThis as unknown as {
  pactumAuthoritativeIdempotencyStore?: DurableIdempotencyStore;
};

export const defaultIdempotencyStore =
  globalForIdempotency.pactumAuthoritativeIdempotencyStore ?? new DurableIdempotencyStore();

if (process.env.NODE_ENV !== "production") {
  globalForIdempotency.pactumAuthoritativeIdempotencyStore = defaultIdempotencyStore;
}
