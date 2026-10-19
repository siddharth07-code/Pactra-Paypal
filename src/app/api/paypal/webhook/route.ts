/**
 * PACTUM — PayPal Webhook Route
 * Endpoint: POST /api/paypal/webhook
 * Verifies webhook signature and synchronizes transaction states.
 * Follows GEMINI.md Section 9, 11 and SECURITY.md Section 8.
 */

import { NextRequest } from "next/server";
import { PayPalClient } from "@/lib/paypal-client";
import { sessionStore } from "@/lib/session-store";

export async function POST(req: NextRequest) {
  try {
    const authAlgo = req.headers.get("paypal-auth-algo") ?? "";
    const certUrl = req.headers.get("paypal-cert-url") ?? "";
    const transmissionId = req.headers.get("paypal-transmission-id") ?? "";
    const transmissionSig = req.headers.get("paypal-transmission-sig") ?? "";
    const transmissionTime = req.headers.get("paypal-transmission-time") ?? "";

    let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
    try {
      event = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!event.event_type || !event.resource) {
      return new Response(JSON.stringify({ error: "Invalid webhook payload structure." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const paypalClient = new PayPalClient();
    const webhookId = process.env.PAYPAL_WEBHOOK_ID ?? "MOCK_WEBHOOK_ID";

    // Verify webhook authenticity
    const isAuthentic = await paypalClient.verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookId,
      webhookEvent: event as unknown as Record<string, unknown>,
    });

    if (!isAuthentic) {
      return new Response(JSON.stringify({ error: "Unauthorized webhook signature." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process supported events and safely update session state
    const customId = (event.resource.custom_id as string) ?? "";
    const sessionMatch = customId.match(/SESSION:([a-zA-Z0-9_-]+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : undefined;

    if (sessionId) {
      const session = sessionStore.getSession(sessionId);
      if (session) {
        if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
          // Note: Webhook cannot bypass audit gate for initial capture, but safely updates state if already authorized/audited
          if (session.status === "AUDIT_PASSED" || session.status === "PAYPAL_AUTHORIZED") {
            session.status = "PAYPAL_CAPTURED";
            session.paypalCaptureId = (event.resource.id as string) ?? session.paypalCaptureId;
            sessionStore.saveSession(session);
          }
        } else if (event.event_type === "INVOICING.INVOICE.PAID") {
          session.invoiceStatus = "PAID";
          session.status = "SETTLED";
          sessionStore.saveSession(session);
        } else if (event.event_type === "CUSTOMER.DISPUTE.CREATED") {
          session.status = "DISPUTED";
          sessionStore.saveSession(session);
        }
      }
    }

    return new Response(JSON.stringify({ received: true, eventType: event.event_type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal webhook processing error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
