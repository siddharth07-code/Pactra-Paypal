/**
 * PACTUM — FX Settlement Lock Route
 * Endpoint: POST /api/fx/lock
 * Locks an active FX quote and runs ACWORLD FX Settlement Verification before PayPal authorization.
 * Phase 6.8: Verifiable FX Settlement Bridge.
 */

import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import {
  lockFXQuote,
  auditFxSettlement,
} from "@/lib/fx-settlement";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";
import {
  defaultIdempotencyStore,
  ConcurrentOperationInProgressError,
  IdempotencyPayloadMismatchError,
} from "@/lib/idempotency";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";

export async function POST(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.checkLimit(req, "PAYPAL_SETTLEMENT");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    let body: {
      sessionId?: string;
      quoteId?: string;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sessionId, quoteId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(
        JSON.stringify({ error: "Field 'sessionId' is required and must be a string." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const idempotencyKey =
      req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key");

    const executeOperation = async (): Promise<{
      status: number;
      body: Record<string, unknown>;
    }> => {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        return {
          status: 404,
          body: { success: false, error: `Session ${sessionId} not found in authoritative store.` },
        };
      }

      if (!session.agreementRecord) {
        return {
          status: 422,
          body: {
            success: false,
            error: "Cannot lock FX quote: Commercial negotiation agreement does not exist.",
          },
        };
      }

      if (!session.auditCertificate || !session.auditCertificate.passed) {
        return {
          status: 403,
          body: {
            success: false,
            error: "Cannot lock FX quote: Commercial agreement must pass ACWORLD audit first.",
          },
        };
      }

      const activeQuote = session.fxRecord;
      if (!activeQuote) {
        return {
          status: 404,
          body: {
            success: false,
            error: "No active FX quote found for this session. Please request a quote first.",
          },
        };
      }

      if (quoteId && activeQuote.id !== quoteId) {
        return {
          status: 409,
          body: {
            success: false,
            error: `Specified quoteId '${quoteId}' does not match the active session quote '${activeQuote.id}'.`,
          },
        };
      }

      // Idempotency: If already locked and valid, return successfully
      if (activeQuote.status === "LOCKED") {
        return {
          status: 200,
          body: {
            success: true,
            fxRecord: activeQuote,
            alreadyLocked: true,
          },
        };
      }

      // Lock quote using authoritative logic
      let lockedQuote;
      try {
        lockedQuote = lockFXQuote(activeQuote, session.agreementRecord);
      } catch (err) {
        return {
          status: 422,
          body: {
            success: false,
            error: `Failed to lock FX quote: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }

      // Run ACWORLD FX Settlement Verification
      const fxAudit = auditFxSettlement({
        session,
        fxRecord: lockedQuote,
      });

      if (!fxAudit.passed) {
        const failureReasons = fxAudit.checks
          .filter((c) => !c.passed && c.reason)
          .map((c) => c.reason!)
          .join("; ") || fxAudit.error || "ACWORLD FX Verification failed.";
        return {
          status: 422,
          body: {
            success: false,
            error: `ACWORLD FX Settlement Verification failed: ${failureReasons}`,
            fxAuditReport: fxAudit,
          },
        };
      }

      // Update session state
      session.fxRecord = lockedQuote;

      // Append/update in quote history
      if (session.fxQuoteHistory) {
        const idx = session.fxQuoteHistory.findIndex((q) => q.id === lockedQuote.id);
        if (idx >= 0) {
          session.fxQuoteHistory[idx] = lockedQuote;
        } else {
          session.fxQuoteHistory.push(lockedQuote);
        }
      }

      // Flight recorder logging
      try {
        const recorder = CryptographicFlightRecorder.getOrReconstitute(session);
        recorder.recordEvent("FX_QUOTE_LOCKED", {
          quoteId: lockedQuote.id,
          agreementHash: lockedQuote.agreementHash,
          sourceCurrency: lockedQuote.sourceCurrency,
          targetCurrency: lockedQuote.targetCurrency,
          sourceAmountMinor: lockedQuote.sourceAmountMinor,
          targetAmountMinor: lockedQuote.targetAmountMinor,
          rate: lockedQuote.rate,
          rateConvention: lockedQuote.rateConvention,
          rateSource: lockedQuote.rateSource,
          provider: lockedQuote.provider,
          quotedAt: lockedQuote.quotedAt,
          expiresAt: lockedQuote.expiresAt,
          roundingMode: lockedQuote.roundingMode,
          conversionHash: lockedQuote.conversionHash,
          status: "LOCKED",
        });

        recorder.recordEvent("FX_SETTLEMENT_VERIFIED", {
          quoteId: lockedQuote.id,
          conversionHash: lockedQuote.conversionHash,
          verifiedAt: new Date().toISOString(),
          status: "VERIFIED",
        });

        session.flightRecord = recorder.exportFlightRecord();
        session.merkleRoot = recorder.getRootHash();
      } catch {
        // Non-fatal recording issue
      }

      sessionStore.saveSession(session);

      return {
        status: 200,
        body: {
          success: true,
          fxRecord: lockedQuote,
          fxAuditReport: fxAudit,
        },
      };
    };

    if (idempotencyKey) {
      try {
        const { status, body: resBody, isReplay } = await defaultIdempotencyStore.executeIdempotent({
          scope: "FX_LOCK",
          key: idempotencyKey,
          payload: body,
          execute: executeOperation,
        });

        return new Response(JSON.stringify(resBody), {
          status,
          headers: {
            "Content-Type": "application/json",
            "X-Idempotent-Replay": isReplay ? "true" : "false",
          },
        });
      } catch (err) {
        if (err instanceof ConcurrentOperationInProgressError) {
          return new Response(
            JSON.stringify({ error: err.message, code: "CONCURRENT_OPERATION_IN_PROGRESS" }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        if (err instanceof IdempotencyPayloadMismatchError) {
          return new Response(
            JSON.stringify({ error: err.message, code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }

    const outcome = await executeOperation();
    return new Response(JSON.stringify(outcome.body), {
      status: outcome.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error in FX lock route.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
