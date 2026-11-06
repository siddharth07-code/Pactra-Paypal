import { withBusinessRoute } from "@/lib/db/business-route";
import { requireBusinessAccess } from "@/lib/auth/business-access";
/**
 * PACTUM — PayPal Cancel API Route
 * Endpoint: POST /api/paypal/cancel
 * Reverts an awaiting checkout session back to CANCELLED state.
 * Follows GEMINI.md Section 8, 9, 11 and SECURITY.md Section 3, 7.
 */

import { NextRequest } from "next/server";
import { SettlementService } from "@/lib/settlement-service";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";

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

    const service = new SettlementService();
    const result = service.cancelCheckout(sessionId);

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, sessionId, status: result.session?.status }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error occurred during cancellation." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const POST = withBusinessRoute("payment.cancel", handlePOST);
