/**
 * PACTUM — PayPal Settlement API Route
 * Endpoint: POST /api/paypal/settle
 * Executes server-side authoritative ACWORLD audit and audited PayPal capture.
 * Follows GEMINI.md Section 8, 9, 11 and SECURITY.md Section 3, 7.
 */

import { NextRequest } from "next/server";
import { SettlementService } from "@/lib/settlement-service";

export async function POST(req: NextRequest) {
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

    const service = new SettlementService();
    const result = await service.settle({ sessionId, createInvoice });

    if (!result.success) {
      const statusCode = result.blockedAtGate ? 403 : 422;
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
          auditCertificate: result.auditCertificate,
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
        captureId: result.captureId,
        invoiceId: result.invoiceId,
        auditCertificate: result.auditCertificate,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error occurred during settlement processing." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
