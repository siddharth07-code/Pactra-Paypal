/**
 * PACTUM — PayPal Checkout Initiation Route
 * Endpoint: POST /api/paypal/checkout
 * Validates mandate constraints, creates PayPal Orders v2 order with intent: "AUTHORIZE",
 * and returns the authenticated PayPal Sandbox approval redirect URL.
 * Follows GEMINI.md Section 8, 9, 11 and SECURITY.md Section 3, 7.
 */

import { NextRequest } from "next/server";
import { SettlementService } from "@/lib/settlement-service";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
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

    const service = new SettlementService();
    const result = await service.initiateCheckout({ sessionId, origin });

    if (!result.success) {
      let statusCode = 422;
      if (result.blockedAtGate) {
        statusCode = 403;
      } else if (result.error?.includes("not found in authoritative store")) {
        statusCode = 404;
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
          blockedAtGate: result.blockedAtGate,
        }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: result.sessionId,
        orderId: result.orderId,
        approvalUrl: result.approvalUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error occurred during checkout initiation." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
