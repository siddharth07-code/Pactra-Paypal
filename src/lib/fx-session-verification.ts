import { AcworldAuditor } from "./acworld-auditor";
import { evaluateSettlementEligibility } from "./settlement-service";
import { verifyFlightRecorderChain } from "./flight-recorder";
import type { ProcurementSession } from "@/types/pactum";

/** The commercial certificate may predate appended FX events, but must commit to a verified prefix. */
export function verifyFxCommercialSession(session: ProcurementSession): string | undefined {
  if (session.flightRecord && session.flightRecord.sessionId !== session.id) return "Commercial certificate root is not part of the authoritative evidence history.";
  const eligibility = evaluateSettlementEligibility(session, { requireFx: false });
  if (!eligibility.eligible) return eligibility.blockers.join("; ");
  if (!session.agreementRecord || !session.auditCertificate) return "A current authoritative agreement and commercial certificate are required.";
  const certificate = session.auditCertificate;
  const freshness = AcworldAuditor.verifyCertificateFreshness(certificate, session, certificate.verifiedRoot);
  if (!freshness.valid) return freshness.reason;
  if (session.flightRecord) {
    if (session.flightRecord.sessionId !== session.id) {
      return "Commercial certificate root is not part of the authoritative evidence history.";
    }
    const events = session.flightRecord.events;
    const matchesChain = events.some((_, index) => verifyFlightRecorderChain(events.slice(0, index + 1), session.id, certificate.verifiedRoot).valid);
    if (!matchesChain) {
      return "Commercial certificate root is not part of the authoritative evidence history.";
    }
  }
  // Independently verify current complete terms instead of relying on an old passed flag.
  if (!new AcworldAuditor().audit({ session: structuredClone(session) }).passed) return "Current commercial agreement no longer passes ACWORLD. Run a new commercial audit.";
}
