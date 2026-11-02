/**
 * PACTUM — FX Settlement Quote Route
 * Endpoint: POST /api/fx/quote
 * Generates an authoritative server-owned FX settlement quote for cross-currency settlement (e.g. INR -> USD).
 * Phase 6.8: Verifiable FX Settlement Bridge.
 */

import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { toMinorUnits } from "@/lib/currency";
import {
  getFXRateProvider,
  computeAgreementHash,
  computeConversionHash,
} from "@/lib/fx-settlement";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";
import {
  defaultIdempotencyStore,
  ConcurrentOperationInProgressError,
  IdempotencyPayloadMismatchError,
} from "@/lib/idempotency";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import type { FXRateSource } from "@/types/pactum";

export async function POST(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.checkLimit(req, "PAYPAL_SETTLEMENT");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    let body: {
      sessionId?: string;
      rateSource?: FXRateSource;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sessionId, rateSource } = body;

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

      // Check commercial agreement exists
      if (!session.agreementRecord && !session.finalOffer) {
        return {
          status: 422,
          body: {
            success: false,
            error: "Cannot generate FX quote: Commercial negotiation agreement does not exist.",
          },
        };
      }

      // Verify commercial ACWORLD audit passed and session is not AUDIT_FAILED
      if (!session.auditCertificate || !session.auditCertificate.passed || session.status === "AUDIT_FAILED") {
        return {
          status: 403,
          body: {
            success: false,
            error: "Cannot generate FX quote: Commercial agreement must pass ACWORLD audit before FX settlement.",
          },
        };
      }

      // Check agreement currency - native USD does not require FX
      const agreementCurrency = session.agreementRecord?.currency ?? session.mandate.currency;
      if (agreementCurrency === "USD") {
        return {
          status: 400,
          body: {
            success: false,
            error: "Native USD agreements do not require FX conversion.",
          },
        };
      }

      if (agreementCurrency !== "INR") {
        return {
          status: 422,
          body: {
            success: false,
            error: `Unsupported commercial currency '${agreementCurrency}'. Supported cross-currency settlement: INR -> USD.`,
          },
        };
      }

      // Calculate authoritative landed cost
      const agreement = session.agreementRecord;
      const landedCost = agreement
        ? agreement.totalCost
        : session.finalOffer!.unitPrice * session.finalOffer!.quantity +
          session.finalOffer!.shippingCost;

      const sourceAmountMinor = toMinorUnits(landedCost);
      const agreementHash = agreement
        ? computeAgreementHash(agreement)
        : "unhashed_agreement";

      // If existing locked quote is still valid for this exact agreement, return it
      if (session.fxRecord && session.fxRecord.status === "LOCKED") {
        if (session.fxRecord.agreementHash === agreementHash) {
          return {
            status: 200,
            body: {
              success: true,
              fxRecord: session.fxRecord,
              note: "Existing locked quote is bound to this agreement.",
            },
          };
        }
      }

      // Obtain provider
      const providerSource: FXRateSource = rateSource ?? "DETERMINISTIC_DEMO";
      const provider = getFXRateProvider(providerSource);

      let quote;
      try {
        quote = await provider.getQuote({
          sessionId: session.id,
          agreementHash,
          agreementId: agreement?.agreementId ?? session.id,
          sourceCurrency: "INR",
          targetCurrency: "USD",
          sourceAmountMinor,
        });
      } catch (err) {
        return {
          status: 503,
          body: {
            success: false,
            error: `FX provider error (${providerSource}): ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }

      // Bind to session and agreement
      quote.sessionId = session.id;
      quote.agreementId = agreement?.agreementId ?? session.id;
      quote.agreementHash = agreementHash;
      quote.conversionHash = computeConversionHash(quote);

      // Save to session
      session.fxRecord = quote;
      session.fxQuoteHistory = session.fxQuoteHistory || [];
      session.fxQuoteHistory.push(quote);

      // Flight recorder event
      try {
        const recorder = CryptographicFlightRecorder.getOrReconstitute(session);
        recorder.recordEvent("FX_QUOTE_CREATED", {
          quoteId: quote.id,
          sourceCurrency: quote.sourceCurrency,
          targetCurrency: quote.targetCurrency,
          sourceAmountMinor: quote.sourceAmountMinor,
          targetAmountMinor: quote.targetAmountMinor,
          rate: quote.rate,
          rateConvention: quote.rateConvention,
          rateSource: quote.rateSource,
          provider: quote.provider,
          quotedAt: quote.quotedAt,
          expiresAt: quote.expiresAt,
          roundingMode: quote.roundingMode,
          conversionHash: quote.conversionHash,
          status: quote.status,
        });
        session.flightRecord = recorder.exportFlightRecord();
        session.merkleRoot = recorder.getRootHash();
        session.preSettlementRoot = recorder.getRootHash();
      } catch {
        // Continue if recorder reconstitution has minor non-fatal issue
      }

      sessionStore.saveSession(session);

      return {
        status: 200,
        body: {
          success: true,
          fxRecord: quote,
        },
      };
    };

    if (idempotencyKey) {
      try {
        const { status, body: resBody, isReplay } = await defaultIdempotencyStore.executeIdempotent({
          scope: "FX_QUOTE",
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
        error: error instanceof Error ? error.message : "Internal server error in FX quote route.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
