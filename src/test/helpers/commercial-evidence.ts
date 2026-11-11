import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { computeAgreementHash } from "@/lib/fx-settlement";
import type { ProcurementSession } from "@/types/pactum";

/** Test fixture creation, never recovery of production evidence. Call before certification. */
export function recordCommercialFixture(session: ProcurementSession): CryptographicFlightRecorder {
  const recorder = new CryptographicFlightRecorder(session.id);
  recorder.recordEvent("MANDATE_LOCKED", { mandate: session.mandate });
  if (session.agreementRecord) recorder.recordEvent("AGREEMENT_CREATED", {
    agreementId: session.agreementRecord.agreementId,
    agreementHash: computeAgreementHash(session.agreementRecord),
    agreement: session.agreementRecord,
  });
  session.flightRecord = recorder.exportFlightRecord();
  session.preSettlementRoot = session.merkleRoot = recorder.getRootHash();
  return recorder;
}
