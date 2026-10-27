/**
 * PACTUM — Restart Recovery & Settlement Reconciliation Engine
 * Automatically recovers interrupted workflows upon process restart without fabricating provider state.
 * Follows GEMINI.md Section 8, 9, 11, SECURITY.md Section 3, 7, and Phase 5 specifications.
 *
 * Invariants:
 * 1. Never blindly retries capture during recovery.
 * 2. Never fabricates provider success without authoritative Orders v2 API evidence.
 * 3. Never overwrites or corrupts historical pre-settlement Merkle roots.
 * 4. Strictly acquires session locks before executing state reconciliation.
 * 5. Re-verifies amount, currency, and custom_id bindings against remote PayPal resources.
 */

import { sessionStore } from "./session-store";
import { PayPalClient } from "./paypal-client";
import { CryptographicFlightRecorder } from "./flight-recorder";
import { settlementLogger } from "./settlement-logger";
import { defaultIdempotencyStore } from "./idempotency";
import type { ProcurementSessionStatus } from "../types/pactum";

export interface RecoverySessionScan {
  sessionId: string;
  status: ProcurementSessionStatus;
  paypalOrderId?: string;
  hasCaptureIntent: boolean;
  captureIntentStatus?: string;
  reason: string;
}

export interface RecoverySessionResult {
  sessionId: string;
  recovered: boolean;
  status: ProcurementSessionStatus;
  action: string;
  captureId?: string;
  error?: string;
}

export interface FullRecoveryReport {
  timestamp: string;
  totalScanned: number;
  interruptedCount: number;
  recoveredCount: number;
  unresolvedCount: number;
  prunedIdempotencyRecords: number;
  results: RecoverySessionResult[];
}

export class RecoveryService {
  private paypalClient: PayPalClient;

  constructor(options?: { paypalClient?: PayPalClient }) {
    this.paypalClient = options?.paypalClient ?? new PayPalClient();
  }

  /**
   * Scans all stored sessions for interrupted, pending, or uncertain settlement states.
   */
  public scanForInterruptedSessions(): RecoverySessionScan[] {
    const allSessions = sessionStore.getAllSessions();
    const interrupted: RecoverySessionScan[] = [];

    for (const session of allSessions) {
      const isReconcilePending = session.status === "CAPTURE_PENDING_RECONCILIATION";
      const intentStatus = session.captureIntent?.status;
      const isIntentUncertain = intentStatus === "UNCERTAIN" || intentStatus === "CAPTURE_SUBMITTED";
      const isMissingPostAuditLineage =
        session.status === "PAYPAL_CAPTURED" && session.flightRecord && !session.postAuditRoot;

      if (isReconcilePending || isIntentUncertain || isMissingPostAuditLineage) {
        let reason = "Unknown interrupted state";
        if (isReconcilePending) {
          reason = "Session is explicitly marked CAPTURE_PENDING_RECONCILIATION.";
        } else if (isIntentUncertain) {
          reason = `Capture intent is in '${intentStatus}' state awaiting remote outcome verification.`;
        } else if (isMissingPostAuditLineage) {
          reason = "Session was captured remotely but post-settlement flight recorder evidence was not committed.";
        }

        interrupted.push({
          sessionId: session.id,
          status: session.status,
          paypalOrderId: session.paypalOrderId,
          hasCaptureIntent: !!session.captureIntent,
          captureIntentStatus: intentStatus,
          reason,
        });
      }
    }

    return interrupted;
  }

  /**
   * Reconciles an individual interrupted session against the authoritative PayPal Orders v2 API.
   */
  public async reconcileSession(sessionId: string): Promise<RecoverySessionResult> {
    if (!sessionStore.acquireLock(sessionId)) {
      return {
        sessionId,
        recovered: false,
        status: "CAPTURE_PENDING_RECONCILIATION",
        action: "LOCK_CONTENTION",
        error: `Session ${sessionId} is locked by an active operation.`,
      };
    }

    try {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        return {
          sessionId,
          recovered: false,
          status: "CANCELLED",
          action: "SESSION_NOT_FOUND",
          error: `Session ${sessionId} does not exist in store.`,
        };
      }

      // Check if session has PayPal Order ID
      if (!session.paypalOrderId) {
        return {
          sessionId,
          recovered: false,
          status: session.status,
          action: "MISSING_ORDER_ID",
          error: "No PayPal Order ID associated with session for remote verification.",
        };
      }

      const finalOffer = session.finalOffer;
      const expectedTotal = finalOffer
        ? finalOffer.unitPrice * finalOffer.quantity + finalOffer.shippingCost
        : 0;
      const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";
      const expectedCustomId = `VERIPAY_ROOT:${preSettlementRoot};SESSION:${sessionId}`;

      settlementLogger.info("RECONCILIATION_INITIATED", `Reconciling session ${sessionId} against PayPal Orders v2.`, {
        sessionId,
        orderId: session.paypalOrderId,
      });

      // 1. Authoritative verification with PayPal API
      let orderDetails;
      try {
        orderDetails = await this.paypalClient.getOrder(session.paypalOrderId);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        settlementLogger.warn("RECONCILIATION_STILL_PENDING", `PayPal API query failed during reconciliation: ${errMsg}`, {
          sessionId,
          orderId: session.paypalOrderId,
        });
        return {
          sessionId,
          recovered: false,
          status: session.status,
          action: "PROVIDER_COMMUNICATION_FAILED",
          error: errMsg,
        };
      }

      // 2. Validate remote order currency
      const remoteCurrency = orderDetails.purchase_units?.[0]?.amount?.currency_code;
      if (remoteCurrency && remoteCurrency !== session.mandate.currency) {
        return {
          sessionId,
          recovered: false,
          status: session.status,
          action: "CURRENCY_MISMATCH",
          error: `Remote order currency '${remoteCurrency}' does not match mandate currency '${session.mandate.currency}'.`,
        };
      }

      // 3. Validate remote order amount
      const remoteAmountStr = orderDetails.purchase_units?.[0]?.amount?.value;
      if (remoteAmountStr && expectedTotal > 0) {
        const remoteAmount = parseFloat(remoteAmountStr);
        if (Math.abs(remoteAmount - expectedTotal) > 0.01) {
          return {
            sessionId,
            recovered: false,
            status: session.status,
            action: "AMOUNT_MISMATCH",
            error: `Remote order amount ($${remoteAmount}) does not match agreed total ($${expectedTotal}).`,
          };
        }
      }

      // 4. Validate custom_id lineage binding
      const actualCustomId = orderDetails.purchase_units?.[0]?.custom_id;
      if (actualCustomId && actualCustomId !== expectedCustomId) {
        return {
          sessionId,
          recovered: false,
          status: session.status,
          action: "CUSTOM_ID_MISMATCH",
          error: `Remote custom_id '${actualCustomId}' does not match expected lineage binding '${expectedCustomId}'.`,
        };
      }

      // 5. Inspect remote captures
      const captures = orderDetails.purchase_units?.[0]?.payments?.captures;
      const completedCapture = captures?.find((c) => c.status === "COMPLETED");

      if (completedCapture) {
        // Authoritative evidence confirms capture completed remotely
        session.paypalCaptureId = completedCapture.id;
        session.captureAmount = expectedTotal;
        session.status = "PAYPAL_CAPTURED";

        if (session.captureIntent) {
          session.captureIntent.status = "CAPTURED";
          session.captureIntent.paypalCaptureId = completedCapture.id;
          session.captureIntent.updatedAt = new Date().toISOString();
        }

        // Commit post-settlement flight recorder events if not already present
        if (session.flightRecord) {
          try {
            const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
            const events = recorder.getEvents();
            const hasSettlementEvent = events.some((e) => e.eventType === "SETTLEMENT_COMPLETED");

            if (!hasSettlementEvent) {
              recorder.recordEvent(
                "SETTLEMENT_RECONCILED",
                {
                  sessionId,
                  paypalOrderId: session.paypalOrderId,
                  paypalCaptureId: completedCapture.id,
                  amount: expectedTotal,
                  currency: session.mandate.currency,
                  status: "SETTLED_VIA_RECOVERY",
                },
                {
                  mandateVersion: session.mandate.version ?? 1,
                  agreementId: session.agreementRecord?.agreementId,
                  timestamp: new Date().toISOString(),
                }
              );
              session.flightRecord = recorder.exportFlightRecord();
              session.postAuditRoot = recorder.getRootHash();
            }
          } catch {
            // Keep existing flight record intact if re-serialization fails
          }
        }

        sessionStore.saveSession(session);

        settlementLogger.info("RECONCILIATION_RESOLVED", `Session ${sessionId} authoritatively reconciled to PAYPAL_CAPTURED with capture ${completedCapture.id}.`, {
          sessionId,
          orderId: session.paypalOrderId,
        });

        return {
          sessionId,
          recovered: true,
          status: "PAYPAL_CAPTURED",
          action: "SETTLED_FROM_REMOTE_CAPTURE",
          captureId: completedCapture.id,
        };
      }

      // 6. Inspect voided or denied status
      if (orderDetails.status === "VOIDED") {
        session.status = "CANCELLED";
        if (session.captureIntent) {
          session.captureIntent.status = "FAILED";
          session.captureIntent.error = "Remote PayPal order was VOIDED.";
          session.captureIntent.updatedAt = new Date().toISOString();
        }
        sessionStore.saveSession(session);

        return {
          sessionId,
          recovered: true,
          status: "CANCELLED",
          action: "VOIDED_FROM_REMOTE_STATUS",
        };
      }

      // 7. No capture completed remotely — Do NOT blindly retry!
      // If session had an uncertain capture intent, mark it unconfirmed and retain reconciliation requirement
      if (session.captureIntent && session.captureIntent.status === "CAPTURE_SUBMITTED") {
        session.captureIntent.status = "UNCERTAIN";
        session.captureIntent.updatedAt = new Date().toISOString();
        sessionStore.saveSession(session);
      }

      return {
        sessionId,
        recovered: false,
        status: session.status,
        action: "NO_REMOTE_CAPTURE_FOUND_NO_BLIND_RETRY",
        error: "Remote order exists in APPROVED/CREATED status with no completed captures. Blind capture retry is strictly blocked.",
      };
    } finally {
      sessionStore.releaseLock(sessionId);
    }
  }

  /**
   * Executes a full deterministic recovery sweep across all sessions.
   */
  public async runFullRecovery(): Promise<FullRecoveryReport> {
    settlementLogger.info("STATE_RECOVERY_STARTED", "Initiating full restart recovery and reconciliation sweep.");

    const interrupted = this.scanForInterruptedSessions();
    const results: RecoverySessionResult[] = [];

    for (const item of interrupted) {
      const res = await this.reconcileSession(item.sessionId);
      results.push(res);
    }

    // Recover stale in-progress idempotency records from interrupted/crashed processes
    const staleIdempotencyRecovered = defaultIdempotencyStore.recoverStaleInProgress();
    // Prune expired idempotency records
    const prunedIdempotencyRecords = defaultIdempotencyStore.pruneExpired();

    const recoveredCount = results.filter((r) => r.recovered).length;
    const unresolvedCount = results.filter((r) => !r.recovered).length;

    settlementLogger.info("STATE_RECOVERY_COMPLETED", `Recovery sweep finished: ${recoveredCount} recovered, ${unresolvedCount} unresolved, ${staleIdempotencyRecovered} stale idempotency keys recovered, ${prunedIdempotencyRecords} expired idempotency keys pruned.`, {
      metadata: {
        totalScanned: sessionStore.getAllSessions().length,
        interruptedCount: interrupted.length,
        recoveredCount,
        unresolvedCount,
        staleIdempotencyRecovered,
        prunedIdempotencyRecords,
      },
    });

    return {
      timestamp: new Date().toISOString(),
      totalScanned: sessionStore.getAllSessions().length,
      interruptedCount: interrupted.length,
      recoveredCount,
      unresolvedCount,
      prunedIdempotencyRecords,
      results,
    };
  }
}

export const defaultRecoveryService = new RecoveryService();
