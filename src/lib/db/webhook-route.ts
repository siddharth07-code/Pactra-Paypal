import "server-only";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PayPalClient, WebhookVerificationUnavailableError } from "@/lib/paypal-client";
import { AuthError } from "@/lib/auth/config";
import { authFailure, boundedJson } from "@/lib/auth/http";
import { database, serializable } from "./client";
import { canonicalBytes, decodeSession, digest } from "./codec";
import { withWorkerTransaction } from "./worker";
import { workspaceScope } from "./business-route";
import { withRequestScope } from "@/lib/persistence/request-scope";
import { recordVerifiedOrder } from "./provider-evidence";

export function withWebhookRoute(handler: (request: NextRequest) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      const limit = await defaultRateLimiter.check(request, "GENERAL_DEFAULT");
      if (!limit.allowed) return limit.response!;
      const event = await boundedJson(request.clone(), 65536);
      if (typeof event.id !== "string" || !event.id || typeof event.event_type !== "string" || !event.resource || typeof event.resource !== "object" || Array.isArray(event.resource)) throw new AuthError(400, "INVALID_WEBHOOK", "Webhook event ID, type, and resource are required.");
      const client = new PayPalClient();
      const authentic = await client.verifyWebhookSignature({ authAlgo: request.headers.get("paypal-auth-algo") ?? "", certUrl: request.headers.get("paypal-cert-url") ?? "", transmissionId: request.headers.get("paypal-transmission-id") ?? "", transmissionSig: request.headers.get("paypal-transmission-sig") ?? "", transmissionTime: request.headers.get("paypal-transmission-time") ?? "", webhookId: process.env.PAYPAL_WEBHOOK_ID ?? "", webhookEvent: event });
      if (!authentic) throw new AuthError(401, "INVALID_WEBHOOK_SIGNATURE", "Unauthorized webhook signature.");
      const merchantId = process.env.PAYPAL_MERCHANT_ID || (process.env.PAYPAL_CLIENT_ID ? "WJVLF4V68K5QW" : undefined);
      if (!merchantId) throw new AuthError(503, "PAYPAL_NOT_CONFIGURED", "PayPal Sandbox merchant binding is required.");
      const payload = canonicalBytes(event), payloadHash = digest(payload);
      const resource = event.resource as Record<string, unknown>;
      const related = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
      const disputed = resource.disputed_transactions as { seller_transaction_id?: string }[] | undefined;
      const orderId = related?.order_id ?? disputed?.[0]?.seller_transaction_id ?? (typeof resource.id === "string" ? resource.id : "");
      const bindings = await database(true).$queryRaw<{ organizationId: string; sessionPublicId: string }[]>`SELECT * FROM pactum.resolve_order(${orderId},${merchantId})`;
      const binding = bindings[0];
      const supported = ["PAYMENT.CAPTURE.COMPLETED", "INVOICING.INVOICE.PAID", "CUSTOMER.DISPUTE.CREATED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"].includes(event.event_type);
      const token = randomUUID();
      const claim = await serializable(database(true), async tx => {
        const key = { provider: "PAYPAL", environment: "SANDBOX", merchantId, providerEventId: event.id as string };
        const old = await tx.webhookEvent.findUnique({ where: { provider_environment_merchantId_providerEventId: key } });
        if (old) {
          if (old.payloadHash !== payloadHash) throw new AuthError(409, "WEBHOOK_PAYLOAD_CONFLICT", "Event identity was reused with different payload bytes.");
          if (old.status === "PROCESSED" || old.status === "QUARANTINED") return { row: old, duplicate: true };
          if (old.status === "PROCESSING" && old.leaseExpiresAt && old.leaseExpiresAt.getTime() > Date.now()) throw new AuthError(409, "WEBHOOK_CLAIM_BUSY", "Event is already processing.");
          const row = await tx.webhookEvent.update({ where: { id: old.id, version: old.version }, data: { leaseToken: token, leaseExpiresAt: new Date(Date.now() + 60000), status: !binding || !supported ? "QUARANTINED" : "PROCESSING", version: { increment: 1 } } });
          return { row, duplicate: false };
        }
        const row = await tx.webhookEvent.create({ data: { ...key, organizationId: binding?.organizationId, sessionPublicId: binding?.sessionPublicId, eventType: event.event_type as string, payload, payloadHash, verifiedAt: new Date(), status: !binding || !supported ? "QUARANTINED" : "PROCESSING", leaseToken: token, leaseExpiresAt: new Date(Date.now() + 60000) } });
        return { row, duplicate: false };
      });
      if (claim.row.status === "QUARANTINED") return NextResponse.json({ received: true, processed: false, quarantined: true, deduplicated: claim.duplicate }, { status: 202 });
      if (claim.duplicate) return NextResponse.json({ received: true, processed: true, deduplicated: true });
      if (!binding) throw new AuthError(409, "WEBHOOK_BINDING", "Verified event is not bound to an organization.");
      const customId = typeof resource.custom_id === "string" ? resource.custom_id : "";
      const declared = customId.match(/SESSION:([a-zA-Z0-9_-]+)/)?.[1];
      if (declared && declared !== binding.sessionPublicId) throw new AuthError(409, "WEBHOOK_BINDING", "Event session metadata differs from the provider resource binding.");
      const loaded = await withWorkerTransaction(binding.organizationId, claim.row.id, token, async tx => {
        const row = await tx.procurementSession.findFirstOrThrow({ where: { organizationId: binding.organizationId, publicId: binding.sessionPublicId } });
        return [{ session: decodeSession(row.snapshot), version: row.version, rowId: row.id }];
      });
      const worker = { jobId: claim.row.id, token, eventId: event.id, verifiedEventHash: payloadHash, boundSessionId: binding.sessionPublicId, receipt: new Uint8Array(payload) };
      const scope = workspaceScope({ organizationId: binding.organizationId, principal: null, userId: null, role: null }, "payment.reconcile", loaded, worker);
      return await withRequestScope(scope, async () => {
        const orderId = loaded[0].session.paypalOrderId;
        if (!orderId) throw new AuthError(409, "WEBHOOK_BINDING", "Session has no provider order binding.");
        recordVerifiedOrder(await client.getOrder(orderId));
        const response = await handler(request);
        scope.worker!.outcome = response.ok ? "PROCESSED" : "FAILED";
        await scope.flush();
        return response;
      });
    } catch (error) {
      if (error instanceof WebhookVerificationUnavailableError) return authFailure(new AuthError(503, "WEBHOOK_VERIFICATION_UNAVAILABLE", "Provider verification is temporarily unavailable."));
      return authFailure(error);
    }
  };
}
