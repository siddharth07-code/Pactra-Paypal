import { canonicalJson } from "@/lib/veripay-merkle";
import { computePersistenceChecksum } from "@/lib/persistence/session-persistence";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { computeConversionHash, computeFxConversion } from "@/lib/fx-settlement";
import { digest, encodeSession, minor } from "@/lib/db/codec";
import type { ProcurementSession } from "@/types/pactum";

export interface OwnershipManifest { sourceDigest: string; sessions: Record<string, string> }
export interface LegacyReport { sourceDigest: string; manifestDigest: string; records: { id: string; organizationId?: string; digest: string; status: "VALIDATED" | "QUARANTINED"; reasons: string[]; session: ProcurementSession }[] }
/** Pure read-only validation. Never instantiates the legacy adapter (which can rename corrupt files). */
export function validateLegacy(bytes: Uint8Array, manifest: OwnershipManifest): LegacyReport {
  const sourceDigest = digest(bytes);
  if (manifest.sourceDigest !== sourceDigest) throw new Error("Ownership manifest does not match the exact source bytes.");
  const envelope = JSON.parse(Buffer.from(bytes).toString());
  if (envelope.schemaVersion !== 1 || !envelope.data || envelope.checksum !== computePersistenceChecksum(envelope.data)) throw new Error("A valid checksummed v1 snapshot is required; unsigned legacy records require manual quarantine review.");
  if (!Array.isArray(envelope.data.sessions)) throw new Error("Invalid snapshot structure.");
  const ids = new Set<string>(), references = new Set<string>();
  const records = (envelope.data.sessions as ProcurementSession[]).map(session => {
    const reasons: string[] = [], organizationId = manifest.sessions[session.id];
    if (!organizationId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(organizationId)) reasons.push("Explicit valid organization ownership is required.");
    if (!session.id || ids.has(session.id)) reasons.push("Missing or duplicated public session identity.");
    ids.add(session.id);
    try {
      encodeSession(session);
      if (session.agreementRecord) {
        const a = session.agreementRecord;
        if (a.sessionId !== session.id || minor(a.agreedOffer.unitPrice) * BigInt(a.agreedOffer.quantity) + minor(a.agreedOffer.shippingCost) !== minor(a.totalCost)) throw new Error("Agreement amount or binding mismatch.");
      }
      if (session.flightRecord && (session.flightRecord.sessionId !== session.id || !CryptographicFlightRecorder.fromSerialized(session.flightRecord).verifyIntegrity().valid)) throw new Error("Flight record integrity mismatch.");
      for (const fx of [...(session.fxQuoteHistory ?? []), ...(session.fxRecord ? [session.fxRecord] : [])]) {
        if (fx.commitmentVersion !== 2 || computeConversionHash(fx) !== fx.conversionHash || computeFxConversion(fx.sourceAmountMinor, fx.rate) !== fx.targetAmountMinor) throw new Error("FX integrity mismatch.");
        if (fx.agreementId !== session.agreementRecord?.agreementId) throw new Error("Historical agreement requires explicit recovery before import.");
      }
      if (session.captureIntent?.status === "UNCERTAIN" || ["PAYPAL_AUTHORIZED", "CAPTURE_PENDING_RECONCILIATION"].includes(session.status)) reasons.push("Financial outcome requires remote reconciliation before activation.");
      for (const ref of [session.paypalOrderId, session.paypalAuthorizationId, session.paypalCaptureId, session.paypalInvoiceId].filter(Boolean)) {
        if (references.has(ref!)) reasons.push("Duplicate provider identity in source snapshot.");
        references.add(ref!);
      }
      // Imported provider references are not independently verified by an offline import.
      if (session.paypalOrderId || session.paypalCaptureId) reasons.push("Provider identity must be independently reconciled before activation.");
    } catch (error) { reasons.push(error instanceof Error ? error.message : "Invalid record."); }
    return { id: session.id, organizationId, digest: digest(canonicalJson(session)), status: reasons.length ? "QUARANTINED" as const : "VALIDATED" as const, reasons, session };
  });
  // A duplicate contaminates both records, not only the second occurrence.
  for (const record of records) if (records.some(other => other !== record && (other.id === record.id || [record.session.paypalOrderId, record.session.paypalCaptureId].filter(Boolean).some(ref => [other.session.paypalOrderId, other.session.paypalCaptureId].includes(ref))))) { record.status = "QUARANTINED"; record.reasons.push("Ambiguous duplicate identity."); }
  return { sourceDigest, manifestDigest: digest(canonicalJson(manifest)), records };
}

export function validateLegacyLedger(bytes: Uint8Array, type: "IDEMPOTENCY" | "WEBHOOK") {
  const envelope = JSON.parse(Buffer.from(bytes).toString());
  const records = type === "IDEMPOTENCY" ? envelope.records : envelope.entries;
  if (envelope.schemaVersion !== 1 || !records || typeof records !== "object" || Array.isArray(records) || envelope.checksum !== computePersistenceChecksum(records)) throw new Error("Legacy ledger checksum or schema is invalid.");
  // These files lack verified original provider payloads/tenant identity. Archive, never infer facts.
  return { sourceDigest: digest(bytes), type, count: Object.keys(records).length, status: "QUARANTINED" as const, reason: "Original authenticated provider payloads and explicit per-record ownership require operator reconciliation." };
}
