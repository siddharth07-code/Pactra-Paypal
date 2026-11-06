import { requireBusinessAccess } from "@/lib/auth/business-access";
/**
 * PACTUM — Independent ACWORLD Audit API Route
 * Endpoint: POST /api/procurement/audit
 * Executes independent server-side 5-invariant evaluation on the authoritative session.
 * Follows GEMINI.md Section 8 and SECURITY.md Section 3, 7, 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { applyAuditCertificate, canRunCommercialAudit } from "@/lib/settlement-lifecycle";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { defaultRateLimiter } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const accessDenied = await requireBusinessAccess(req);
  if (accessDenied) return accessDenied;

  const rateLimit = await defaultRateLimiter.check(req, "EVIDENCE_READ");
  if (!rateLimit.allowed) {
    return rateLimit.response!;
  }

  try {
    let body: { sessionId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
    }

    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Field 'sessionId' is required and must be a string." },
        { status: 400 }
      );
    }

    if (!sessionStore.acquireLock(sessionId)) return NextResponse.json({ error: "Session operation already in progress." }, { status: 409 });
    try {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: `Session ${sessionId} not found in authoritative store.` },
          { status: 404 }
        );
      }

      if (!session.finalOffer || !session.selectedQuote) {
        return NextResponse.json(
          { error: `Session ${sessionId} has no final agreed offer or selected quote to audit.` },
          { status: 422 }
        );
      }

      if (!canRunCommercialAudit(session)) return NextResponse.json({ error: "Re-audit prohibited in current settlement lifecycle." }, { status: 409 });

      if (!session.flightRecord) {
        const recorder = CryptographicFlightRecorder.getOrReconstitute(session);
        session.flightRecord = recorder.exportFlightRecord();
        session.preSettlementRoot = recorder.getRootHash();
        session.merkleRoot = recorder.getRootHash();
      }

      const auditor = new AcworldAuditor();
      const auditCertificate = auditor.audit({ session });

      applyAuditCertificate(session, auditCertificate);

      sessionStore.saveSession(session);

      return NextResponse.json({
        success: true,
        sessionId,
        auditCertificate,
        status: session.status,
        session,
      });
    } finally { sessionStore.releaseLock(sessionId); }
  } catch {
    return NextResponse.json(
      { error: "Internal server error occurred while performing ACWORLD audit." },
      { status: 500 }
    );
  }
}
