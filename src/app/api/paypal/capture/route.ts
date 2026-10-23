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

export async function POST(req: NextRequest) {
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

    const service = new SettlementService();
    const result = await service.completeSettlement({ sessionId, orderId, createInvoice });

    if (!result.success) {
      const statusCode = result.blockedAtGate ? 403 : 422;
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
          auditCertificate: result.auditCertificate,
          blockedAtGate: result.blockedAtGate,
          orderId: result.orderId,
        }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: result.sessionId,
        orderId: result.orderId,
        authorizationId: result.authorizationId,
        captureId: result.captureId,
        invoiceId: result.invoiceId,
        auditCertificate: result.auditCertificate,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error occurred during audited capture processing." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
