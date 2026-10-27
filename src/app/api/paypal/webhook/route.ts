/**
 * PACTUM — PayPal Webhook Route
 * Endpoint: POST /api/paypal/webhook
 * Verifies webhook signature and synchronizes transaction states.
 * Follows GEMINI.md Section 9, 11 and SECURITY.md Section 8.
 */

import { NextRequest } from "next/server";
import { PayPalClient } from "@/lib/paypal-client";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";
import { defaultWebhookLedger } from "@/lib/webhook-deduplication";
import { settlementLogger } from "@/lib/settlement-logger";

export async function POST(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.checkLimit(req, "PAYPAL_SETTLEMENT");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

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

    // Deduplication check: protect against duplicate replays of previously processed events
    if (event.id) {
      if (defaultWebhookLedger.isProcessed(event.id)) {
        settlementLogger.info("WEBHOOK_DEDUPLICATED", `Duplicate webhook event ${event.id} ignored`, {
          metadata: { eventId: event.id, eventType: event.event_type },
        });
        return new Response(
          JSON.stringify({ received: true, deduplicated: true, eventId: event.id }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
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

    if (event.id) {
      defaultWebhookLedger.recordProcessing(event.id, event.event_type);
    }

    // Process supported events and safely update session state
    const customId = (event.resource.custom_id as string) ?? "";
    const sessionMatch = customId.match(/SESSION:([a-zA-Z0-9_-]+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : undefined;

    if (sessionId) {
      // Concurrency lock: serialize webhook state updates against active captures and reconciliations
      let lockAcquired = sessionStore.acquireLock(sessionId);
      if (!lockAcquired) {
        // Retry shortly in case an active local capture or reconcile is just finishing
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((r) => setTimeout(r, 50));
          if (sessionStore.acquireLock(sessionId)) {
            lockAcquired = true;
            break;
          }
        }
      }

      if (lockAcquired) {
        try {
          const session = sessionStore.getSession(sessionId);
          if (session) {
            if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
              // Remote amount and currency verification
              const amountObj = event.resource.amount as
                | { value?: string; currency_code?: string }
                | undefined;
              const expectedTotal = session.finalOffer
                ? session.finalOffer.unitPrice * session.finalOffer.quantity +
                  session.finalOffer.shippingCost
                : 0;

              if (amountObj) {
                if (
                  amountObj.currency_code &&
                  amountObj.currency_code !== session.mandate.currency
                ) {
                  return new Response(
                    JSON.stringify({
                      error: `Webhook capture currency mismatch: expected ${session.mandate.currency}, got ${amountObj.currency_code}.`,
                    }),
                    { status: 422, headers: { "Content-Type": "application/json" } }
                  );
                }
                if (amountObj.value && expectedTotal > 0) {
                  const capturedVal = parseFloat(amountObj.value);
                  if (Math.abs(capturedVal - expectedTotal) > 0.01) {
                    return new Response(
                      JSON.stringify({
                        error: `Webhook capture amount mismatch: expected ${expectedTotal}, got ${capturedVal}.`,
                      }),
                      { status: 422, headers: { "Content-Type": "application/json" } }
                    );
                  }
                }
              }

              // Never downgrade a session that is already SETTLED or PAYPAL_CAPTURED
              if (session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED") {
                if (!session.paypalCaptureId && event.resource.id) {
                  session.paypalCaptureId = event.resource.id as string;
                  sessionStore.saveSession(session);
                }
              } else if (
                session.status === "AUDIT_PASSED" ||
                session.status === "PAYPAL_AUTHORIZED" ||
                session.status === "CAPTURE_PENDING_RECONCILIATION"
              ) {
                session.status = "PAYPAL_CAPTURED";
                session.paypalCaptureId =
                  (event.resource.id as string) ?? session.paypalCaptureId;
                sessionStore.saveSession(session);
              }
            } else if (event.event_type === "INVOICING.INVOICE.PAID") {
              session.invoiceStatus = "PAID";
              // A dispute must never silently revert to an ordinary settled state!
              if (session.status !== "DISPUTED") {
                session.status = "SETTLED";
              }
              sessionStore.saveSession(session);
            } else if (event.event_type === "CUSTOMER.DISPUTE.CREATED") {
              // Only captured or settled transactions can be disputed
              if (
                session.status === "SETTLED" ||
                session.status === "PAYPAL_CAPTURED"
              ) {
                session.status = "DISPUTED";
                sessionStore.saveSession(session);
              }
            } else if (
              event.event_type === "PAYMENT.CAPTURE.DENIED" ||
              event.event_type === "PAYMENT.CAPTURE.DECLINED"
            ) {
              // Stale decline cannot downgrade already captured or settled session
              if (
                session.status !== "SETTLED" &&
                session.status !== "PAYPAL_CAPTURED" &&
                session.status !== "DISPUTED"
              ) {
                session.status = "AUDIT_FAILED";
                sessionStore.saveSession(session);
              }
            }
          }
        } finally {
          sessionStore.releaseLock(sessionId);
        }
      }
    }

    if (event.id) {
      defaultWebhookLedger.recordProcessed(event.id);
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
