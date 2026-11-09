import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { requestScope } from "@/lib/persistence/request-scope";
import { withOrganizationTransaction } from "./authorization";
import { canonicalBytes, decodeSession, digest, minor } from "./codec";
import { AuthError } from "@/lib/auth/config";
import { computeAgreementHash, auditFxSettlement, consumeFxRecord } from "@/lib/fx-settlement";
import { orderEvidenceError, parsePaymentMinor } from "@/lib/payment-evidence";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import type { PayPalOrderDetails } from "@/lib/paypal-client";
import { persistAggregate } from "@/lib/persistence/prisma-session-repository";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";

type Kind = "CREATE_ORDER" | "AUTHORIZE" | "CAPTURE" | "CREATE_INVOICE";
const providerContext = new AsyncLocalStorage<string>();
export const providerRequestId = () => providerContext.getStore();

/** Only database work is retried. execute()/remoteOrder() always run outside transactions. */
export async function durablePayPalCall<T extends { id: string; status: string }>(
  kind: Kind, target: string, input: unknown, execute: () => Promise<T>, remoteOrder?: (result: T) => Promise<PayPalOrderDetails>,
): Promise<T> {
  const scope = requestScope();
  if (!scope) {
    if (process.env.NODE_ENV === "test") return execute();
    throw new AuthError(503, "FINANCIAL_CONTEXT_REQUIRED", "An authorized durable operation is required.");
  }
  if (scope.worker) throw new AuthError(403, "WORKER_DISPATCH_PROHIBITED", "Reconciliation workers cannot initiate payments.");
  const merchantId = process.env.PAYPAL_MERCHANT_ID || (process.env.PAYPAL_CLIENT_ID ? "WJVLF4V68K5QW" : undefined);
  if (!merchantId || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new AuthError(503, "PAYPAL_NOT_CONFIGURED", "PayPal Sandbox merchant configuration is required.");
  if (kind !== "CREATE_INVOICE" && !remoteOrder) throw new AuthError(503, "PROVIDER_VERIFICATION_REQUIRED", "Remote provider verification is required.");
  await scope.flush();
  const context = scope.organization;
  if (!context.principal) throw new AuthError(403, "USER_REQUIRED", "A financial user must authorize dispatch.");
  const principal = context.principal;
  const permission = kind === "CREATE_ORDER" ? "payment.checkout" : kind === "CREATE_INVOICE" ? "payment.capture" : "payment.capture";
  const prepared = await withOrganizationTransaction(principal, context.organizationId, permission, async tx => {
    const workspace = scope.store.getAllSessions().find(s => kind === "CREATE_ORDER" || kind === "CREATE_INVOICE" ? s.id === target : s.paypalOrderId === target || s.paypalAuthorizationId === target);
    if (!workspace) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Payment session not found.");
    const row = await tx.procurementSession.findFirst({ where: { organizationId: context.organizationId, publicId: workspace.id } });
    if (!row || row.financialBlockReason) throw new AuthError(409, "PAYMENT_BLOCKED", "Session is unavailable for financial operations.");
    const session = decodeSession(row.snapshot);
    if (!session.agreementRecord || !session.finalOffer || !session.auditCertificate?.passed || !session.flightRecord) throw new AuthError(409, "PAYMENT_BLOCKED", "Current agreement, verified evidence, and audit are required.");
    if (["CANCELLED", "DISPUTED", "AUDIT_FAILED", "CAPTURE_PENDING_RECONCILIATION"].includes(session.status)) throw new AuthError(409, "PAYMENT_BLOCKED", "Settlement lifecycle does not allow dispatch.");
    if (!new AcworldAuditor().audit({ session: structuredClone(session) }).passed) throw new AuthError(409, "PAYMENT_BLOCKED", "Authoritative ACWORLD verification failed.");
    if (session.fxRecord && !auditFxSettlement({ session, fxRecord: session.fxRecord, historical: kind === "CREATE_INVOICE" }).passed) throw new AuthError(409, "PAYMENT_BLOCKED", "Authoritative FX verification failed.");
    const amountMinor = session.fxRecord ? BigInt(session.fxRecord.targetAmountMinor) : minor(session.agreementRecord.totalCost);
    const currency = session.fxRecord?.targetCurrency ?? session.mandate.currency;
    if (kind === "CREATE_INVOICE" && session.fxRecord) throw new AuthError(409, "FX_INVOICE_UNSUPPORTED", "Invoice line items require a verified USD breakdown; settlement capture is unaffected.");
    const command = input as { totalAmount?: number; currency?: string; amount?: { value: number; currency: string }; unitPrice?: number; quantity?: number; shippingCost?: number };
    if (kind === "CREATE_INVOICE" && (command.unitPrice === undefined || command.quantity === undefined || command.shippingCost === undefined || minor(command.unitPrice) * BigInt(command.quantity) + minor(command.shippingCost) !== amountMinor || command.currency !== currency)) throw new AuthError(409, "PAYMENT_AMOUNT_MISMATCH", "Invoice command differs from the authoritative obligation.");
    if (kind === "CAPTURE" && (!command.amount || minor(command.amount.value) !== amountMinor || command.amount.currency !== currency)) throw new AuthError(409, "PAYMENT_AMOUNT_MISMATCH", "Capture command differs from the authoritative obligation.");
    if (kind === "CREATE_ORDER" && (command.totalAmount === undefined || minor(command.totalAmount) !== amountMinor || command.currency !== currency)) throw new AuthError(409, "PAYMENT_AMOUNT_MISMATCH", "Order command differs from the authoritative obligation.");
    if ((kind === "AUTHORIZE" && session.paypalOrderId !== target) || (kind === "CAPTURE" && session.paypalAuthorizationId !== target)) throw new AuthError(409, "PROVIDER_BINDING", "Provider authorization/order is not bound to this session.");
    const agreementHash = computeAgreementHash(session.agreementRecord);
    const logicalKey = digest(`${kind}:${target}:${agreementHash}`);
    const old = await tx.financialOperation.findUnique({ where: { organizationId_sessionId_kind_logicalKey: { organizationId: context.organizationId, sessionId: row.id, kind, logicalKey } } });
    if (old) {
      if (old.status === "SUCCEEDED" && old.response) return { operation: old, session, row, amountMinor, currency, replay: JSON.parse(Buffer.from(old.response).toString()) as T };
      throw new AuthError(409, "FINANCIAL_RECONCILIATION_REQUIRED", "An existing financial operation must be reconciled; repeat dispatch is blocked.");
    }
    const operation = await tx.financialOperation.create({ data: {
      organizationId: context.organizationId, sessionId: row.id, kind, logicalKey, merchantId,
      providerRequestId: kind === "CAPTURE" ? `capture-${target}` : randomUUID(),
      authorizationId: kind === "CAPTURE" ? target : null, amountMinor, currency, agreementHash,
      fxConversionHash: session.fxRecord?.conversionHash, evidenceRoot: session.preSettlementRoot ?? session.merkleRoot ?? "",
      requestedBy: context.userId, request: canonicalBytes(input),
    } });
    return { operation, session, row, amountMinor, currency, replay: null };
  });
  if (prepared.replay) return prepared.replay;
  const leaseToken = randomUUID();
  let committedSession: import("@/types/pactum").ProcurementSession | undefined;
  await withOrganizationTransaction(principal, context.organizationId, permission, async tx => {
    await tx.financialOperation.update({ where: { id: prepared.operation.id, status: "INTENT_RECORDED", version: prepared.operation.version }, data: { status: "SUBMITTING", leaseToken, leaseExpiresAt: new Date(Date.now() + 180000), attemptCount: { increment: 1 }, version: { increment: 1 } } });
  });
  let result: T;
  try {
    if ((kind === "CAPTURE" || kind === "AUTHORIZE") && remoteOrder) {
      const before = await remoteOrder({ id: target, status: "PREFLIGHT" } as T);
      const custom = `VERIPAY_ROOT:${prepared.session.preSettlementRoot ?? prepared.session.merkleRoot};SESSION:${prepared.session.id}`;
      if (kind === "CAPTURE") {
        const authorization = before.purchase_units?.[0]?.payments?.authorizations?.find(a => a.id === target && a.status === "CREATED");
        if (!authorization || authorization.amount?.currency_code !== prepared.currency || parsePaymentMinor(authorization.amount.value) !== Number(prepared.amountMinor)) throw new Error("Remote authorization is not bound to this exact capture obligation.");
      }
      if (orderEvidenceError(before, prepared.session.paypalOrderId!, custom, prepared.currency, Number(prepared.amountMinor) / 100) || before.purchase_units?.[0]?.payee?.merchant_id !== merchantId || (before.purchase_units?.[0]?.payments?.captures?.length ?? 0) > 0) throw new Error("Pre-dispatch remote binding failed or capture already exists.");
    }
    result = await providerContext.run(prepared.operation.providerRequestId, execute);
    if (!result.id || result.id.startsWith("MOCK")) throw new Error("Unverified provider identity.");
    if (kind === "CAPTURE") {
      const capture = result as T & { amount?: { currency_code?: string; value?: string } };
      if (capture.status !== "COMPLETED" || capture.amount?.currency_code !== prepared.currency || parsePaymentMinor(capture.amount?.value) !== Number(prepared.amountMinor)) throw new Error("Capture result is not exact and completed.");
    }
    if (remoteOrder) {
      const order = await remoteOrder(result);
      const expectedId = kind === "CREATE_ORDER" ? result.id : prepared.session.paypalOrderId!;
      const expectedCustom = `VERIPAY_ROOT:${prepared.session.preSettlementRoot ?? prepared.session.merkleRoot};SESSION:${prepared.session.id}`;
      if (orderEvidenceError(order, expectedId, expectedCustom, prepared.currency, Number(prepared.amountMinor) / 100) || order.purchase_units?.[0]?.payee?.merchant_id !== merchantId) throw new Error("Remote order merchant/amount/lineage was not confirmed.");
      if (kind === "CAPTURE") {
        const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
        const capture = captures[0];
        if (captures.length !== 1 || capture.id !== result.id || capture.status !== "COMPLETED" || capture.amount?.currency_code !== prepared.currency || parsePaymentMinor(capture.amount?.value) !== Number(prepared.amountMinor)) throw new Error("Remote capture evidence failed.");
      }
      if (kind === "AUTHORIZE") {
        const authorizationId = (result as T & { authorizationId?: string }).authorizationId;
        const authorization = order.purchase_units?.[0]?.payments?.authorizations?.find(item => item.id === authorizationId && item.status === "CREATED");
        if (!authorization || authorization.amount?.currency_code !== prepared.currency || parsePaymentMinor(authorization.amount?.value) !== Number(prepared.amountMinor)) throw new Error("Remote authorization evidence failed.");
      }
    }
  } catch {
    await withOrganizationTransaction(principal, context.organizationId, permission, async tx => {
      await tx.financialOperation.update({ where: { id: prepared.operation.id, leaseToken, status: "SUBMITTING" }, data: { status: "UNCERTAIN", lastErrorCode: "PROVIDER_OUTCOME_UNCONFIRMED", version: { increment: 1 } } });
    });
    throw new AuthError(503, "FINANCIAL_RECONCILIATION_REQUIRED", "Provider outcome is uncertain. Reconciliation is required; no automatic redispatch is permitted.");
  }
  // On commit failure, the previously committed SUBMITTING intent remains recoverable.
  await withOrganizationTransaction(principal, context.organizationId, permission, async tx => {
    const operation = await tx.financialOperation.findFirst({ where: { id: prepared.operation.id, organizationId: context.organizationId, leaseToken, status: "SUBMITTING", leaseExpiresAt: { gt: new Date() } } });
    if (!operation) throw new AuthError(409, "LEASE_LOST", "Financial operation lease is no longer owned.");
    await tx.financialOperation.update({ where: { id: operation.id, version: operation.version }, data: { status: "SUCCEEDED", providerResourceId: result.id, response: canonicalBytes(result), version: { increment: 1 } } });
    await tx.evidenceRecord.create({ data: { organizationId: context.organizationId, sessionId: prepared.row.id, kind: "PROVIDER_RESPONSE", evidenceKey: operation.id, schemaVersion: 1, canonicalBytes: canonicalBytes(result), payloadHash: digest(canonicalBytes(result)) } });
    const orderId = kind === "CREATE_ORDER" ? result.id : prepared.session.paypalOrderId;
    if (orderId) {
      const unique = { provider: "PAYPAL", environment: "SANDBOX", merchantId, orderId };
      const existing = await tx.settlement.findUnique({ where: { provider_environment_merchantId_orderId: unique } });
      const data = { amountMinor: prepared.amountMinor, currency: prepared.currency, status: kind === "CAPTURE" ? "PAYPAL_CAPTURED" as const : kind === "AUTHORIZE" ? "PAYPAL_AUTHORIZED" as const : kind === "CREATE_INVOICE" ? (existing?.status ?? prepared.session.status) : "AWAITING_PAYPAL_APPROVAL" as const, ...(kind === "CAPTURE" ? { captureId: result.id } : {}), ...(kind === "AUTHORIZE" ? { authorizationId: (result as T & { authorizationId: string }).authorizationId } : {}) };
      if (existing) await tx.settlement.update({ where: { id: existing.id, organizationId: context.organizationId }, data: { ...data, version: { increment: 1 } } });
      else await tx.settlement.create({ data: { ...unique, ...data, sessionId: prepared.row.id, organizationId: context.organizationId, fxConversionHash: prepared.session.fxRecord?.conversionHash } });
    }
    const current = await tx.procurementSession.findFirstOrThrow({ where: { id: prepared.row.id, organizationId: context.organizationId } });
    const session = decodeSession(current.snapshot);
    if (kind === "CREATE_ORDER") {
      const approvalUrl = (result as T & { approvalUrl?: string }).approvalUrl;
      if (!approvalUrl || !["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(new URL(approvalUrl).hostname) || new URL(approvalUrl).protocol !== "https:") throw new AuthError(409, "PROVIDER_REDIRECT_INVALID", "PayPal Sandbox approval URL is invalid.");
      session.paypalOrderId = result.id; session.paypalApprovalUrl = approvalUrl; session.status = "AWAITING_PAYPAL_APPROVAL";
    } else if (kind === "AUTHORIZE") {
      session.paypalAuthorizationId = (result as T & { authorizationId: string }).authorizationId;
      session.status = "PAYPAL_AUTHORIZED";
    } else if (kind === "CAPTURE") {
      session.paypalCaptureId = result.id; session.captureAmount = Number(prepared.amountMinor) / 100; session.status = "PAYPAL_CAPTURED";
      if (session.captureIntent) { session.captureIntent.status = "CAPTURED"; session.captureIntent.paypalCaptureId = result.id; }
      consumeFxRecord(session);
      const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord!);
      recorder.recordEvent("SETTLEMENT_CAPTURED", { sessionId: session.id, paypalOrderId: session.paypalOrderId, paypalCaptureId: result.id, amountMinor: prepared.amountMinor.toString(), currency: prepared.currency, operationId: operation.id }, { mandateVersion: session.mandate.version ?? 1, agreementId: session.agreementRecord!.agreementId, timestamp: new Date().toISOString() });
      session.flightRecord = recorder.exportFlightRecord(); session.postAuditRoot = recorder.getRootHash();
    } else { session.paypalInvoiceId = result.id; }
    await persistAggregate(tx, context, session, current.version);
    committedSession = session;
  });
  if (committedSession) scope.acceptCommitted(committedSession);
  return result!;
}
