/**
 * PACTUM — Settlement Observability & Structured Diagnostic Logger
 * Emits redacted structured JSON events with correlation tracing.
 * Follows GEMINI.md Section 11, SECURITY.md Section 3, 10, and Phase 5 specifications.
 */

import crypto from "crypto";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export type SettlementEventCode =
  | "CHECKOUT_INITIATED"
  | "CHECKOUT_COMPLETED"
  | "CHECKOUT_FAILED"
  | "CAPTURE_INTENT_CREATED"
  | "CAPTURE_SUBMITTED"
  | "CAPTURE_COMPLETED"
  | "CAPTURE_TIMEOUT_UNCERTAIN"
  | "CAPTURE_FAILED"
  | "RECONCILIATION_INITIATED"
  | "RECONCILIATION_RESOLVED"
  | "RECONCILIATION_STILL_PENDING"
  | "IDEMPOTENT_REPLAY"
  | "IDEMPOTENCY_CONFLICT"
  | "WEBHOOK_RECEIVED"
  | "WEBHOOK_DEDUPLICATED"
  | "WEBHOOK_PROCESSED"
  | "STATE_RECOVERY_STARTED"
  | "STATE_RECOVERY_COMPLETED";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  eventCode: SettlementEventCode;
  correlationId: string;
  sessionId?: string;
  orderId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface OperationalMetrics {
  checkoutsInitiated: number;
  capturesAttempted: number;
  capturesSucceeded: number;
  capturesFailed: number;
  timeoutsEncountered: number;
  reconciliationsAttempted: number;
  reconciliationsSucceeded: number;
  idempotentReplays: number;
  webhooksDeduplicated: number;
}

const SENSITIVE_KEY_REGEX = /access_token|authorization|client_secret|secret|password|card|cvv|token/i;

function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 10) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      result[key] = redactSensitiveData(val, depth + 1);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export class SettlementLogger {
  private metrics: OperationalMetrics = {
    checkoutsInitiated: 0,
    capturesAttempted: 0,
    capturesSucceeded: 0,
    capturesFailed: 0,
    timeoutsEncountered: 0,
    reconciliationsAttempted: 0,
    reconciliationsSucceeded: 0,
    idempotentReplays: 0,
    webhooksDeduplicated: 0,
  };

  public createCorrelationId(prefix = "corr"): string {
    return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
  }

  public log(entry: Omit<StructuredLogEntry, "timestamp">): void {
    const fullEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
      metadata: entry.metadata ? (redactSensitiveData(entry.metadata) as Record<string, unknown>) : undefined,
    };

    this.updateMetrics(entry.eventCode);

    // In test environment, keep console output clean unless DEBUG is set
    if (process.env.NODE_ENV !== "test" || process.env.DEBUG === "true") {
      const output = JSON.stringify(fullEntry);
      if (entry.level === "ERROR") {
        console.error(output);
      } else if (entry.level === "WARN") {
        console.warn(output);
      } else {
        console.log(output);
      }
    }
  }

  public info(eventCode: SettlementEventCode, message: string, context?: { correlationId?: string; sessionId?: string; orderId?: string; metadata?: Record<string, unknown> }): void {
    this.log({
      level: "INFO",
      eventCode,
      correlationId: context?.correlationId ?? this.createCorrelationId(),
      sessionId: context?.sessionId,
      orderId: context?.orderId,
      message,
      metadata: context?.metadata,
    });
  }

  public warn(eventCode: SettlementEventCode, message: string, context?: { correlationId?: string; sessionId?: string; orderId?: string; metadata?: Record<string, unknown> }): void {
    this.log({
      level: "WARN",
      eventCode,
      correlationId: context?.correlationId ?? this.createCorrelationId(),
      sessionId: context?.sessionId,
      orderId: context?.orderId,
      message,
      metadata: context?.metadata,
    });
  }

  public error(eventCode: SettlementEventCode, message: string, context?: { correlationId?: string; sessionId?: string; orderId?: string; metadata?: Record<string, unknown> }): void {
    this.log({
      level: "ERROR",
      eventCode,
      correlationId: context?.correlationId ?? this.createCorrelationId(),
      sessionId: context?.sessionId,
      orderId: context?.orderId,
      message,
      metadata: context?.metadata,
    });
  }

  private updateMetrics(eventCode: SettlementEventCode): void {
    switch (eventCode) {
      case "CHECKOUT_INITIATED":
        this.metrics.checkoutsInitiated++;
        break;
      case "CAPTURE_SUBMITTED":
        this.metrics.capturesAttempted++;
        break;
      case "CAPTURE_COMPLETED":
        this.metrics.capturesSucceeded++;
        break;
      case "CAPTURE_FAILED":
        this.metrics.capturesFailed++;
        break;
      case "CAPTURE_TIMEOUT_UNCERTAIN":
        this.metrics.timeoutsEncountered++;
        break;
      case "RECONCILIATION_INITIATED":
        this.metrics.reconciliationsAttempted++;
        break;
      case "RECONCILIATION_RESOLVED":
        this.metrics.reconciliationsSucceeded++;
        break;
      case "IDEMPOTENT_REPLAY":
        this.metrics.idempotentReplays++;
        break;
      case "WEBHOOK_DEDUPLICATED":
        this.metrics.webhooksDeduplicated++;
        break;
    }
  }

  public getMetricsSnapshot(): OperationalMetrics {
    return { ...this.metrics };
  }

  public resetMetrics(): void {
    this.metrics = {
      checkoutsInitiated: 0,
      capturesAttempted: 0,
      capturesSucceeded: 0,
      capturesFailed: 0,
      timeoutsEncountered: 0,
      reconciliationsAttempted: 0,
      reconciliationsSucceeded: 0,
      idempotentReplays: 0,
      webhooksDeduplicated: 0,
    };
  }
}

export const settlementLogger = new SettlementLogger();
