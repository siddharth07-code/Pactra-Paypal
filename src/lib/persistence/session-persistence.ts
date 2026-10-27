/**
 * PACTUM — Durable Session Persistence Abstraction
 * Follows GEMINI.md Section 3, 11, SECURITY.md Section 2, 3, 10, and Phase 5 specifications.
 *
 * Guarantees:
 * 1. Storage-agnostic persistence interface (SessionPersistenceAdapter).
 * 2. Atomic writes via temporary files, fsync, and atomic rename (preventing torn writes / partial records).
 * 3. SHA-256 checksum envelope for corruption and truncation detection upon restart.
 * 4. Safe corruption quarantine: Corrupt or truncated files are isolated (.corrupt.<timestamp>)
 *    rather than silently discarded or overwritten with empty state.
 * 5. In-memory and file-based implementations for test isolation and durable deployment.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { canonicalJson } from "../veripay-merkle";
import type { ProcurementSession, ProcurementMandate } from "../../types/pactum";

export interface SessionPersistenceData {
  sessions: ProcurementSession[];
  mandateHistory: Record<string, ProcurementMandate[]>;
}

export interface PersistenceEnvelope<T> {
  schemaVersion: number;
  checksum: string; // sha256:<digest> over canonicalJson(data)
  updatedAt: string;
  data: T;
}

export interface SessionPersistenceAdapter {
  load(): SessionPersistenceData;
  save(data: SessionPersistenceData): void;
  clear(): void;
  getFilePath?(): string | null;
}

export class CorruptPersistenceError extends Error {
  public readonly quarantinePath?: string;
  constructor(message: string, quarantinePath?: string) {
    super(message);
    this.name = "CorruptPersistenceError";
    this.quarantinePath = quarantinePath;
  }
}

/**
 * Computes SHA-256 checksum over canonical JSON of data.
 */
export function computePersistenceChecksum(data: unknown): string {
  const canonical = canonicalJson(data);
  return `sha256:${crypto.createHash("sha256").update(Buffer.from(canonical, "utf-8")).digest("hex")}`;
}

/**
 * Durable file-backed persistence adapter with atomic rename and checksum verification.
 */
export class DurableFilePersistenceAdapter implements SessionPersistenceAdapter {
  private filePath: string;
  private strictMode: boolean;

  constructor(options?: { filePath?: string; strictMode?: boolean }) {
    this.filePath = options?.filePath || path.join(process.cwd(), ".pactum-sessions.json");
    this.strictMode = options?.strictMode ?? true;
  }

  public getFilePath(): string | null {
    return this.filePath;
  }

  public load(): SessionPersistenceData {
    if (!fs.existsSync(this.filePath)) {
      return { sessions: [], mandateHistory: {} };
    }

    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, "utf-8");
    } catch (readErr) {
      if (this.strictMode) {
        throw new Error(`Failed to read persistence file at ${this.filePath}: ${readErr instanceof Error ? readErr.message : String(readErr)}`);
      }
      return { sessions: [], mandateHistory: {} };
    }

    // Check for empty file
    if (!raw.trim()) {
      const quarantinePath = this.quarantineCorruptFile("empty_file");
      if (this.strictMode) {
        throw new CorruptPersistenceError(`Authoritative persistence file at ${this.filePath} is empty. Quarantined to ${quarantinePath}.`, quarantinePath);
      }
      return { sessions: [], mandateHistory: {} };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      const quarantinePath = this.quarantineCorruptFile("json_syntax_error");
      const err = new CorruptPersistenceError(
        `Persistence file at ${this.filePath} is corrupt (syntax error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}). Quarantined to ${quarantinePath}.`,
        quarantinePath
      );
      if (this.strictMode) {
        throw err;
      }
      console.error(`[DurableFilePersistenceAdapter] ${err.message}`);
      return { sessions: [], mandateHistory: {} };
    }

    if (!parsed || typeof parsed !== "object") {
      const quarantinePath = this.quarantineCorruptFile("invalid_root_structure");
      const err = new CorruptPersistenceError(`Persistence file has non-object root. Quarantined to ${quarantinePath}.`, quarantinePath);
      if (this.strictMode) throw err;
      return { sessions: [], mandateHistory: {} };
    }

    // Check if envelope format (with checksum)
    const envelope = parsed as Partial<PersistenceEnvelope<SessionPersistenceData>>;
    if (envelope.checksum && envelope.data) {
      const expectedChecksum = computePersistenceChecksum(envelope.data);
      if (envelope.checksum !== expectedChecksum) {
        const quarantinePath = this.quarantineCorruptFile("checksum_mismatch");
        const err = new CorruptPersistenceError(
          `Checksum mismatch in persistence file: recorded ${envelope.checksum}, recomputed ${expectedChecksum}. File has been tampered with or truncated. Quarantined to ${quarantinePath}.`,
          quarantinePath
        );
        if (this.strictMode) throw err;
        console.error(`[DurableFilePersistenceAdapter] ${err.message}`);
        return { sessions: [], mandateHistory: {} };
      }

      return {
        sessions: Array.isArray(envelope.data.sessions) ? envelope.data.sessions : [],
        mandateHistory: envelope.data.mandateHistory && typeof envelope.data.mandateHistory === "object" ? envelope.data.mandateHistory : {},
      };
    }

    // Legacy un-enveloped format: { sessions: [...], mandateHistory: {...} }
    const legacy = parsed as Partial<SessionPersistenceData>;
    return {
      sessions: Array.isArray(legacy.sessions) ? legacy.sessions : [],
      mandateHistory: legacy.mandateHistory && typeof legacy.mandateHistory === "object" ? legacy.mandateHistory : {},
    };
  }

  public save(data: SessionPersistenceData): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const checksum = computePersistenceChecksum(data);
    const envelope: PersistenceEnvelope<SessionPersistenceData> = {
      schemaVersion: 1,
      checksum,
      updatedAt: new Date().toISOString(),
      data,
    };

    const serialized = JSON.stringify(envelope, null, 2);
    const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;

    try {
      const fd = fs.openSync(tempPath, "w");
      fs.writeSync(fd, serialized, 0, "utf-8");
      // Flush kernel buffers to ensure durable physical write before rename
      try {
        fs.fsyncSync(fd);
      } catch {
        // Some virtualized or test filesystems may not support fsync
      }
      fs.closeSync(fd);

      // Atomic rename replaces target atomically
      fs.renameSync(tempPath, this.filePath);
    } catch (writeErr) {
      // Clean up temporary file on failure
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Ignore unlink error
      }
      if (this.strictMode) {
        throw new Error(`Failed to write durable session state to ${this.filePath}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
      }
    }
  }

  public clear(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        fs.unlinkSync(this.filePath);
      } catch {
        // Ignore unlink error
      }
    }
  }

  private quarantineCorruptFile(reason: string): string {
    const timestamp = Date.now();
    const quarantinePath = `${this.filePath}.corrupt.${reason}.${timestamp}`;
    try {
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, quarantinePath);
      }
    } catch {
      // Ignore rename failure during quarantine
    }
    return quarantinePath;
  }
}

/**
 * Ephemeral in-memory persistence adapter for unit testing and isolated benchmarks.
 */
export class MemorySessionPersistenceAdapter implements SessionPersistenceAdapter {
  private data: SessionPersistenceData = { sessions: [], mandateHistory: {} };

  public load(): SessionPersistenceData {
    return JSON.parse(JSON.stringify(this.data));
  }

  public save(data: SessionPersistenceData): void {
    this.data = JSON.parse(JSON.stringify(data));
  }

  public clear(): void {
    this.data = { sessions: [], mandateHistory: {} };
  }

  public getFilePath(): string | null {
    return null;
  }
}
