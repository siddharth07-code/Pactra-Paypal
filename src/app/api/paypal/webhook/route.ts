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
import { fromMinorUnits } from "@/lib/currency";
import { computeAgreementHash } from "@/lib/fx-settlement";

export async function POST(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.checkLimit(req, "PAYPAL_SETTLEMENT");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  let webhookEvent: { id?: string; event_type?: string; resource?: Record<string, unknown> } | undefined;

  try {
    const authAlgo = req.headers.get("paypal-auth-algo") ?? "";
    const certUrl = req.headers.get("paypal-cert-url") ?? "";
    const transmissionId = req.headers.get("paypal-transmission-id") ?? "";
    const transmissionSig = req.headers.get("paypal-transmission-sig") ?? "";
    const transmissionTime = req.headers.get("paypal-transmission-time") ?? "";

    try {
      webhookEvent = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (
      !webhookEvent ||
      typeof webhookEvent.event_type !== "string" ||
      !webhookEvent.resource ||
      typeof webhookEvent.resource !== "object"
    ) {
      return new Response(JSON.stringify({ error: "Invalid webhook payload structure." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = {
      id: webhookEvent.id,
      event_type: webhookEvent.event_type,
      resource: webhookEvent.resource,
    };

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
      if (defaultWebhookLedger.isProcessing(event.id)) {
        settlementLogger.warn("WEBHOOK_CONCURRENT_PROCESSING", `Concurrent webhook delivery for event ${event.id} is already in progress`, {
          metadata: { eventId: event.id, eventType: event.event_type },
        });
        return new Response(
          JSON.stringify({ error: "Concurrent webhook processing in progress.", eventId: event.id }),
          { status: 409, headers: { "Content-Type": "application/json" } }
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

              const isFxSettlement = !!session.fxRecord;
              const expectedCurrency = isFxSettlement
                ? session.fxRecord!.targetCurrency
                : session.mandate.currency;
              const expectedTotal = isFxSettlement
                ? fromMinorUnits(session.fxRecord!.targetAmountMinor)
                : session.finalOffer
                ? session.finalOffer.unitPrice * session.finalOffer.quantity +
                  session.finalOffer.shippingCost
                : 0;

              // If FX settlement, verify FX record binds to authoritative agreement
              if (isFxSettlement && session.agreementRecord) {
                const computedHash = computeAgreementHash(session.agreementRecord);
                if (session.fxRecord!.agreementHash !== computedHash) {
                  const errMsg = `Webhook FX verification failed: agreement hash mismatch.`;
                  if (event.id) {
                    defaultWebhookLedger.recordFailed(event.id, errMsg);
                  }
                  return new Response(
                    JSON.stringify({ error: errMsg }),
                    { status: 422, headers: { "Content-Type": "application/json" } }
                  );
                }
              }

              if (amountObj) {
                if (
                  amountObj.currency_code &&
                  amountObj.currency_code !== expectedCurrency
                ) {
                  const errMsg = `Webhook capture currency mismatch: expected ${expectedCurrency}, got ${amountObj.currency_code}.`;
                  if (event.id) {
                    defaultWebhookLedger.recordFailed(event.id, errMsg);
                  }
                  return new Response(
                    JSON.stringify({ error: errMsg }),
                    { status: 422, headers: { "Content-Type": "application/json" } }
                  );
                }
                if (amountObj.value && expectedTotal > 0) {
                  const capturedVal = parseFloat(amountObj.value);
                  if (Math.abs(capturedVal - expectedTotal) > 0.01) {
                    const errMsg = `Webhook capture amount mismatch: expected ${expectedTotal}, got ${capturedVal}.`;
                    if (event.id) {
                      defaultWebhookLedger.recordFailed(event.id, errMsg);
                    }
                    return new Response(
                      JSON.stringify({ error: errMsg }),
                      { status: 422, headers: { "Content-Type": "application/json" } }
                    );
                  }
                }
              }

              // Update session capture amount if value present
              if (amountObj?.value) {
                session.captureAmount = parseFloat(amountObj.value);
              }

              // Transition fxRecord status to CONSUMED if locked
              if (session.fxRecord && session.fxRecord.status === "LOCKED") {
                session.fxRecord.status = "CONSUMED";
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
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (webhookEvent?.id) {
      defaultWebhookLedger.recordFailed(webhookEvent.id, errMsg);
    }
    return new Response(JSON.stringify({ error: "Internal webhook processing error.", detail: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
