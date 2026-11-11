import "server-only";
import { AuthError } from "@/lib/auth/config";
import { withOrganizationTransaction, type OrganizationContext } from "@/lib/db/authorization";
import { canonicalBytes, decodeSession, digest, encodeSession, minor } from "@/lib/db/codec";
import { Prisma, type Transaction } from "@/lib/db/client";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { computeAgreementHash, computeConversionHash, computeFxConversion } from "@/lib/fx-settlement";
import type { ProcurementSession } from "@/types/pactum";
import type { Permission } from "@/lib/organizations/permissions";
import { requestScope } from "./request-scope";

export async function persistAggregate(tx: Transaction, context: { organizationId: string; userId: string | null }, session: ProcurementSession, expected: number | null): Promise<number> {
  const organizationId = context.organizationId;
  if (session.agreementRecord?.organizationId && session.agreementRecord.organizationId !== organizationId) throw new AuthError(409, "AGREEMENT_ORGANIZATION_BINDING", "Agreement belongs to another organization.");
  const prior = await tx.procurementSession.findFirst({ where: { organizationId, publicId: session.id } });
  if ((prior?.version ?? null) !== expected) throw new AuthError(409, "STALE_VERSION", "Session changed; reload before retrying.");
  if (prior?.financialBlockReason) throw new AuthError(409, "FINANCIAL_QUARANTINE", "This legacy session requires review.");
  if (prior) {
    const original = decodeSession(prior.snapshot);
    if ((original.status === "SETTLED" && !["SETTLED", "DISPUTED"].includes(session.status)) ||
      (original.status === "PAYPAL_CAPTURED" && !["PAYPAL_CAPTURED", "SETTLED", "DISPUTED"].includes(session.status)) ||
      (original.status === "DISPUTED" && session.status !== "DISPUTED")) throw new AuthError(409, "INVALID_TRANSITION", "Terminal settlement state cannot be reverted.");
  }
  const version = Math.max((expected ?? 0) + 1, session.version ?? 1);
  session.version = version;
  session.updatedAt = new Date().toISOString();
  const data = { status: session.status, snapshot: encodeSession(session), preSettlementRoot: session.preSettlementRoot, postAuditRoot: session.postAuditRoot, version };
  const row = prior ? await tx.procurementSession.update({ where: { id: prior.id, version: expected! }, data }) :
    await tx.procurementSession.create({ data: { ...data, publicId: session.id, organizationId, createdBy: context.userId || null } });
  const sessionId = row.id;
  const immutable = async (kind: string, key: string, value: unknown, sequence?: number, rootHash?: string) => {
    const bytes = canonicalBytes(value);
    const payloadHash = digest(bytes);
    const old = await tx.evidenceRecord.findUnique({ where: { sessionId_organizationId_kind_evidenceKey: { sessionId, organizationId, kind, evidenceKey: key } } });
    if (old && old.payloadHash !== payloadHash) throw new AuthError(409, "EVIDENCE_IMMUTABLE", "Committed evidence cannot be replaced.");
    if (!old) await tx.evidenceRecord.create({ data: { sessionId, organizationId, kind, evidenceKey: key, canonicalBytes: bytes, payloadHash, sequence, schemaVersion: 1, rootHash } });
  };
  const mandate = Object.fromEntries(Object.entries(session.mandate).filter(([key]) => key !== "isLocked"));
  const revision = session.mandate.version ?? 1;
  const mandateBytes = canonicalBytes(mandate);
  const oldMandate = await tx.mandateRevision.findUnique({ where: { sessionId_organizationId_revision: { sessionId, organizationId, revision } } });
  if (oldMandate && !Buffer.from(oldMandate.canonicalBytes).equals(mandateBytes)) throw new AuthError(409, "MANDATE_IMMUTABLE", "Mandate revision terms changed without a revision.");
  if (!oldMandate) await tx.mandateRevision.create({ data: { sessionId, organizationId, revision, currency: session.mandate.currency, budgetMinor: minor(session.mandate.maxTotalBudget), quantity: BigInt(session.mandate.quantity), canonicalBytes: mandateBytes } });
  if (session.agreementRecord) {
    const agreement = session.agreementRecord;
    if (agreement.sessionId !== session.id || agreement.mandateVersion !== revision) throw new AuthError(409, "AGREEMENT_BINDING", "Agreement is not bound to the current session revision.");
    const hash = computeAgreementHash(agreement);
    const old = await tx.agreement.findFirst({ where: { publicId: agreement.agreementId, organizationId, sessionId } });
    if (old && old.agreementHash !== hash) throw new AuthError(409, "AGREEMENT_IMMUTABLE", "Agreement terms cannot change.");
    if (!old) await tx.agreement.create({ data: { sessionId, organizationId, publicId: agreement.agreementId, mandateRevision: revision, currency: agreement.currency ?? session.mandate.currency, unitPriceMinor: minor(agreement.agreedOffer.unitPrice), shippingMinor: minor(agreement.agreedOffer.shippingCost), quantity: BigInt(agreement.agreedOffer.quantity), totalMinor: minor(agreement.totalCost), agreementHash: hash, canonicalBytes: canonicalBytes(agreement) } });
  }
  for (const fx of [...(session.fxQuoteHistory ?? []), ...(session.fxRecord ? [session.fxRecord] : [])]) {
    if (fx.commitmentVersion !== 2 || fx.sessionId !== session.id || computeConversionHash(fx) !== fx.conversionHash || computeFxConversion(fx.sourceAmountMinor, fx.rate, fx.rateConvention) !== fx.targetAmountMinor) throw new AuthError(409, "FX_INTEGRITY", "FX commitment failed validation.");
    const agreement = await tx.agreement.findFirst({ where: { publicId: fx.agreementId, organizationId, sessionId, agreementHash: fx.agreementHash } });
    if (!agreement) throw new AuthError(409, "FX_AGREEMENT_BINDING", "FX agreement binding is invalid.");
    const bytes = canonicalBytes(Object.fromEntries(Object.entries(fx).filter(([key]) => key !== "status" && key !== "lockedAt")));
    const old = await tx.fxCommitment.findFirst({ where: { publicId: fx.id, organizationId, sessionId } });
    if (old?.lockedAt && fx.lockedAt && old.lockedAt.toISOString() !== fx.lockedAt) throw new AuthError(409, "FX_IMMUTABLE", "FX lock timestamp cannot change.");
    if (old && !Buffer.from(old.canonicalBytes).equals(bytes)) throw new AuthError(409, "FX_IMMUTABLE", "FX commitment cannot change.");
    if (old) {
      if (old.status !== fx.status) await tx.fxCommitment.update({ where: { id: old.id }, data: { status: fx.status, version: { increment: 1 }, ...(fx.status === "LOCKED" ? { lockedAt: fx.lockedAt ? new Date(fx.lockedAt) : new Date() } : {}), ...(fx.status === "CONSUMED" ? { consumedAt: new Date() } : {}) } });
    } else await tx.fxCommitment.create({ data: { sessionId, organizationId, agreementId: agreement.id, publicId: fx.id, commitmentVersion: 2, sourceCurrency: fx.sourceCurrency, targetCurrency: fx.targetCurrency, sourceAmountMinor: BigInt(fx.sourceAmountMinor), targetAmountMinor: BigInt(fx.targetAmountMinor), rate: new Prisma.Decimal(fx.rate), rateText: fx.rate, rateConvention: fx.rateConvention, rateSource: fx.rateSource, provider: fx.provider, providerUpdatedAt: fx.referenceRate ? new Date(fx.referenceRate.updatedAt) : null, retrievedAt: fx.referenceRate ? new Date(fx.referenceRate.retrievedAt) : null, quotedAt: new Date(fx.quotedAt), expiresAt: new Date(fx.expiresAt), canonicalBytes: bytes, conversionHash: fx.conversionHash, status: fx.status } });
  }
  if (session.flightRecord) {
    if (session.flightRecord.sessionId !== session.id) throw new AuthError(409, "EVIDENCE_BINDING", "Flight record belongs to another session.");
    const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
    if (!recorder.verifyIntegrity().valid) throw new AuthError(409, "EVIDENCE_INTEGRITY", "Flight record integrity failed.");
    for (const event of recorder.getEvents()) await immutable("FLIGHT_EVENT", event.eventId, event, event.sequenceNumber, recorder.getRootHash());
  }
  for (const certificate of [...(session.auditHistory ?? []), ...(session.auditCertificate ? [session.auditCertificate] : [])]) await immutable("COMMERCIAL_AUDIT", certificate.certificateId, certificate);
  if (session.fxVerification) await immutable("FX_AUDIT", digest(canonicalBytes(session.fxVerification)), session.fxVerification);
  for (const dispute of session.disputes ?? []) {
    const old = await tx.dispute.findFirst({ where: { organizationId, sessionId, publicId: dispute.disputeId } });
    const data = { status: dispute.status, evidenceRoot: dispute.evidenceRoot, record: canonicalBytes(dispute), financialDisposition: dispute.financialDisposition ?? "UNEXECUTED" };
    if (old) await tx.dispute.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 } } });
    else await tx.dispute.create({ data: { ...data, sessionId, organizationId, publicId: dispute.disputeId } });
  }
  const configuredMerchantId = process.env.PAYPAL_MERCHANT_ID || (process.env.PAYPAL_CLIENT_ID ? "WJVLF4V68K5QW" : undefined);
  if (session.paypalOrderId && configuredMerchantId) {
    const merchantId = configuredMerchantId;
    const key = { provider: "PAYPAL", environment: "SANDBOX", merchantId, orderId: session.paypalOrderId };
    const settlement = await tx.settlement.findUnique({ where: { provider_environment_merchantId_orderId: key } });
    if (settlement && (settlement.organizationId !== organizationId || settlement.sessionId !== sessionId)) throw new AuthError(409, "PROVIDER_BINDING", "Provider order belongs to a different session.");
    const expectedMinor = session.fxRecord ? BigInt(session.fxRecord.targetAmountMinor) : session.agreementRecord ? minor(session.agreementRecord.totalCost) : null;
    if (!expectedMinor) throw new AuthError(409, "PAYMENT_BINDING", "Payment has no authoritative agreement amount.");
    if (session.paypalCaptureId && session.paypalCaptureId !== settlement?.captureId) {
      const proof = requestScope()?.verifiedCaptures.get(session.paypalOrderId);
      const committed = await tx.financialOperation.findFirst({ where: { organizationId, sessionId, kind: "CAPTURE", status: "SUCCEEDED", providerResourceId: session.paypalCaptureId } });
      if (!committed && (!proof || proof.id !== session.paypalCaptureId || proof.amountMinor !== expectedMinor || proof.currency !== (session.fxRecord?.targetCurrency ?? session.mandate.currency))) throw new AuthError(409, "CAPTURE_UNVERIFIED", "Capture requires exact provider evidence.");
    }
    const data = { amountMinor: expectedMinor, currency: session.fxRecord?.targetCurrency ?? session.mandate.currency, authorizationId: session.paypalAuthorizationId, captureId: session.paypalCaptureId, status: session.status, fxConversionHash: session.fxRecord?.conversionHash };
    if (settlement) await tx.settlement.update({ where: { id: settlement.id, organizationId }, data: { ...data, version: { increment: 1 } } });
    else await tx.settlement.create({ data: { ...key, ...data, sessionId, organizationId } });
  }
  return version;
}

export class PrismaSessionRepository {
  constructor(readonly context: OrganizationContext, readonly permission: Permission) {}
  transaction<T>(work: (tx: Transaction) => Promise<T>) { return withOrganizationTransaction(this.context.principal, this.context.organizationId, this.permission, tx => work(tx)); }
  async load(publicId?: string, disputeId?: string) {
    return this.transaction(async tx => {
      const selected = disputeId ? await tx.dispute.findFirst({ where: { organizationId: this.context.organizationId, publicId: disputeId }, include: { session: true } }) : null;
      if (disputeId && !selected) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Dispute not found.");
      const records = await tx.procurementSession.findMany({ where: { organizationId: this.context.organizationId, ...(publicId || selected ? { publicId: publicId ?? selected!.session.publicId } : {}) }, include: { mandateRevisions: { orderBy: { revision: "asc" } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: publicId || selected ? 1 : 100 });
      if (publicId && !records.length) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Session not found.");
      return records.map(row => ({ session: decodeSession(row.snapshot), version: row.version, rowId: row.id, history: row.mandateRevisions.map(m => JSON.parse(Buffer.from(m.canonicalBytes).toString()) as import("@/types/pactum").ProcurementMandate) }));
    });
  }
  async save(session: ProcurementSession, expected: number | null) {
    return this.transaction(tx => persistAggregate(tx, this.context, session, expected));
  }
}
