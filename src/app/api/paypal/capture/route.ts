import { withBusinessRoute } from "@/lib/db/business-route";
import { requireBusinessAccess } from "@/lib/auth/business-access";
/**
 * PACTUM — PayPal Audited Capture API Route
 * Endpoint: POST /api/paypal/capture
 * Verifies buyer approval, authorizes order, executes ACWORLD audit,
 * and releases payment capture only if audit passes (FAIL-CLOSED GATE).
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

async function handlePOST(req: NextRequest) {
  const accessDenied = await requireBusinessAccess(req);
  if (accessDenied) return accessDenied;

  const rateLimit = await defaultRateLimiter.checkLimit(req, "PAYPAL_SETTLEMENT");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    let body: { sessionId?: string; orderId?: string; createInvoice?: boolean };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sessionId, orderId, createInvoice = true } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(
        JSON.stringify({ error: "Field 'sessionId' is required and must be a string." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ error: "Field 'orderId' is required and must be a string." }),
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
      const result = await service.completeSettlement({ sessionId, orderId, createInvoice });

      if (!result.success) {
        const statusCode = result.blockedAtGate ? 403 : 422;
        return {
          status: statusCode,
          body: {
            success: false,
            error: result.error,
            auditCertificate: result.auditCertificate,
            blockedAtGate: result.blockedAtGate,
            orderId: result.orderId,
          },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          sessionId: result.sessionId,
          orderId: result.orderId,
          authorizationId: result.authorizationId,
          captureId: result.captureId,
          invoiceId: result.invoiceId,
          auditCertificate: result.auditCertificate,
        },
      };
    };

    if (idempotencyKey) {
      try {
        const { status, body: resBody, isReplay } = await defaultIdempotencyStore.executeIdempotent({
          scope: "PAYPAL_CAPTURE",
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
      JSON.stringify({ error: "Internal server error occurred during audited capture processing." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const POST = withBusinessRoute("payment.capture", handlePOST);
