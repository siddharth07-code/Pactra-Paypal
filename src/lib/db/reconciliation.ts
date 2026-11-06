import "server-only";
import { randomUUID } from "node:crypto";
import { database, serializable } from "./client";
import { withWorkerTransaction } from "./worker";
import { canonicalBytes, decodeSession, digest } from "./codec";
import { workspaceScope } from "./business-route";
import { withRequestScope } from "@/lib/persistence/request-scope";
import { PayPalClient } from "@/lib/paypal-client";
import { consumeFxRecord } from "@/lib/fx-settlement";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { parsePaymentMinor } from "@/lib/payment-evidence";

/** Read-only provider reconciliation: NEVER creates orders, authorizations or captures. */
export async function reconcilePendingOperations(limit = 10) {
  const pending = await database(true).financialOperation.findMany({ where: { status: { in: ["SUBMITTING", "UNCERTAIN"] }, leaseExpiresAt: { lt: new Date() } }, take: Math.min(limit, 25), orderBy: { createdAt: "asc" } });
  const outcomes: { operationId: string; status: string }[] = [];
  for (const candidate of pending) {
    const token = randomUUID();
    try {
      await serializable(database(true), tx => tx.financialOperation.update({ where: { id: candidate.id, version: candidate.version, leaseExpiresAt: { lt: new Date() } }, data: { leaseToken: token, leaseExpiresAt: new Date(Date.now() + 60000), version: { increment: 1 } } }));
      const loaded = await withWorkerTransaction(candidate.organizationId, candidate.id, token, async tx => {
        const row = await tx.procurementSession.findFirstOrThrow({ where: { id: candidate.sessionId, organizationId: candidate.organizationId } });
        return { session: decodeSession(row.snapshot), version: row.version, rowId: row.id };
      });
      const scope = workspaceScope({ organizationId: candidate.organizationId, principal: null, role: null, userId: null }, "payment.reconcile", [loaded], { jobId: candidate.id, token });
      const result = await withRequestScope(scope, async () => {
        // An order-create timeout without a known remote order ID cannot be safely discovered by request ID.
        if (!loaded.session.paypalOrderId || candidate.kind !== "CAPTURE") return "MANUAL_RECONCILIATION_REQUIRED";
        const order = await new PayPalClient().getOrder(loaded.session.paypalOrderId);
        const proof = scope.verifiedCaptures.get(order.id);
        const authorizations = order.purchase_units?.[0]?.payments?.authorizations ?? [];
        if (!proof || proof.amountMinor !== candidate.amountMinor || proof.currency !== candidate.currency || !authorizations.some(a => a.id === candidate.authorizationId && a.amount?.currency_code === candidate.currency && parsePaymentMinor(a.amount?.value) === Number(candidate.amountMinor))) return "OUTCOME_UNCONFIRMED";
        const session = loaded.session;
        session.paypalCaptureId = proof.id; session.captureAmount = Number(proof.amountMinor) / 100; session.status = "PAYPAL_CAPTURED";
        if (session.captureIntent) { session.captureIntent.status = "CAPTURED"; session.captureIntent.paypalCaptureId = proof.id; }
        consumeFxRecord(session);
        const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord!);
        recorder.recordEvent("SETTLEMENT_RECONCILED", { sessionId: session.id, operationId: candidate.id, paypalCaptureId: proof.id, amountMinor: proof.amountMinor.toString(), currency: proof.currency }, { mandateVersion: session.mandate.version ?? 1, agreementId: session.agreementRecord?.agreementId, timestamp: new Date().toISOString() });
        session.flightRecord = recorder.exportFlightRecord(); session.postAuditRoot = recorder.getRootHash();
        await withWorkerTransaction(candidate.organizationId, candidate.id, token, async tx => {
          const { persistAggregate } = await import("@/lib/persistence/prisma-session-repository");
          await persistAggregate(tx, { organizationId: candidate.organizationId, userId: null }, session, loaded.version);
          const response = { id: proof.id, status: "COMPLETED", amount: { value: (Number(proof.amountMinor) / 100).toFixed(2), currency_code: proof.currency } };
          const bytes = canonicalBytes({ order });
          await tx.evidenceRecord.create({ data: { organizationId: candidate.organizationId, sessionId: candidate.sessionId, kind: "RECONCILIATION_RESPONSE", evidenceKey: candidate.id, schemaVersion: 1, canonicalBytes: bytes, payloadHash: digest(bytes) } });
          // Complete last: the lease is the RLS fence for all preceding writes.
          await tx.financialOperation.update({ where: { id: candidate.id, leaseToken: token }, data: { status: "SUCCEEDED", providerResourceId: proof.id, response: canonicalBytes(response), lastErrorCode: null, version: { increment: 1 } } });
        });
        return "CONFIRMED_CAPTURE";
      });
      outcomes.push({ operationId: candidate.id, status: result });
    } catch { outcomes.push({ operationId: candidate.id, status: "RETRY_OR_MANUAL_REVIEW_REQUIRED" }); }
  }
  return outcomes;
}
