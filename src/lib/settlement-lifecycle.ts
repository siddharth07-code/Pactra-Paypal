import type { AuditCertificate, ProcurementSession } from "@/types/pactum";

export function canRunCommercialAudit(session: ProcurementSession): boolean {
  return ["NEGOTIATING", "AUDIT_PENDING", "AUDIT_FAILED", "AUDIT_PASSED"].includes(session.status);
}

export function applyAuditCertificate(session: ProcurementSession, certificate: AuditCertificate): void {
  if (["SETTLED", "PAYPAL_CAPTURED", "DISPUTED", "CANCELLED", "CAPTURE_PENDING_RECONCILIATION"].includes(session.status)) throw new Error("Audit cannot change a terminal or uncertain settlement lifecycle.");
  if (certificate.sessionId !== session.id) throw new Error("Audit certificate session mismatch.");
  if (session.auditCertificate && session.auditCertificate.certificateId !== certificate.certificateId) {
    session.auditHistory ??= [];
    if (!session.auditHistory.some(c => c.certificateId === session.auditCertificate!.certificateId)) {
      session.auditHistory.push(session.auditCertificate);
    }
  }
  session.auditCertificate = certificate;
  session.fxVerification = undefined;
  session.status = certificate.passed ? "AUDIT_PASSED" : "AUDIT_FAILED";
}
