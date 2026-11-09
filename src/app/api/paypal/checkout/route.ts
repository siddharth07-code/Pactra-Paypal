import { withBusinessRoute } from "@/lib/db/business-route";
import { requireBusinessAccess } from "@/lib/auth/business-access";
/**
 * PACTUM — PayPal Checkout Initiation Route
 * Endpoint: POST /api/paypal/checkout
 * Validates mandate constraints, creates PayPal Orders v2 order with intent: "AUTHORIZE",
 * and returns the authenticated PayPal Sandbox approval redirect URL.
 * Follows GEMINI.md Section 8, 9, 11 and SECURITY.md Section 3, 7.
 */

import { NextRequest } from "next/server";
import { SettlementService } from "@/lib/settlement-service";
import { PayPalClient } from "@/lib/paypal-client";
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
    let body: { sessionId?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(
        JSON.stringify({ error: "Field 'sessionId' is required and must be a string." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine base origin safely for return and cancel redirect URLs
    const origin =
      req.headers.get("origin") ||
      (req.headers.get("host") ? `http://${req.headers.get("host")}` : undefined);

    const idempotencyKey =
      req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key");

    const executeOperation = async (): Promise<{
      status: number;
      body: Record<string, unknown>;
    }> => {
      const service = new SettlementService();
      const result = await service.initiateCheckout({ sessionId, origin });

      if (!result.success) {
        let statusCode = 422;
        if (result.blockedAtGate) {
          statusCode = 403;
        } else if (result.error?.includes("not found in authoritative store")) {
          statusCode = 404;
        }

        return {
          status: statusCode,
          body: {
            success: false,
            error: result.error,
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
          approvalUrl: result.approvalUrl,
        },
      };
    };

    if (idempotencyKey) {
      try {
        const { status, body: resBody, isReplay } = await defaultIdempotencyStore.executeIdempotent({
          scope: "PAYPAL_CHECKOUT",
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
      JSON.stringify({ error: "Internal server error occurred during checkout initiation." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleGET() {
  const client = new PayPalClient();
  const hasCredentials = client.isConfigured();
  const merchantId = process.env.PAYPAL_MERCHANT_ID || (hasCredentials ? "WJVLF4V68K5QW" : undefined);
  const merchantConfigured = Boolean(merchantId);
  const configured = Boolean(hasCredentials && merchantConfigured);

  return new Response(
    JSON.stringify({
      configured,
      environment: "SANDBOX",
      merchantConfigured,
      hasCredentials,
      merchantId: merchantId ? `${merchantId.slice(0, 3)}...${merchantId.slice(-3)}` : null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export const GET = withBusinessRoute("session.read", handleGET);
export const POST = withBusinessRoute("payment.checkout", handlePOST);
