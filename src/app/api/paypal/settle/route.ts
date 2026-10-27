/**
 * PACTUM — PayPal Settlement API Route
 * Endpoint: POST /api/paypal/settle
 * Executes server-side authoritative ACWORLD audit and audited PayPal capture.
 * Follows GEMINI.md Section 8, 9, 11 and SECURITY.md Section 3, 7.
 */

import { NextRequest } from "next/server";
import { SettlementService } from "@/lib/settlement-service";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";
import {
  defaultIdempotencyStore,
  ConcurrentOperationInProgressError,
  IdempotencyPayloadMismatchError,
} from "@/lib/idempotency";

export async function POST(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.checkLimit(req, "PAYPAL_SETTLEMENT");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    let body: { sessionId?: string; createInvoice?: boolean };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sessionId, createInvoice = true } = body;

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
      const service = new SettlementService();
      const result = await service.settle({ sessionId, createInvoice });

      if (!result.success) {
        const statusCode = result.blockedAtGate ? 403 : 422;
        return {
          status: statusCode,
          body: {
            success: false,
            error: result.error,
            auditCertificate: result.auditCertificate,
            blockedAtGate: result.blockedAtGate,
          },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          sessionId: result.sessionId,
          orderId: result.orderId,
          captureId: result.captureId,
          invoiceId: result.invoiceId,
          auditCertificate: result.auditCertificate,
        },
      };
    };

    if (idempotencyKey) {
      try {
        const { status, body: resBody, isReplay } = await defaultIdempotencyStore.executeIdempotent({
          scope: "PAYPAL_SETTLE",
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
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error occurred during settlement processing." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
