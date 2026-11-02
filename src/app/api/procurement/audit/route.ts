/**
 * PACTUM — Independent ACWORLD Audit API Route
 * Endpoint: POST /api/procurement/audit
 * Executes independent server-side 5-invariant evaluation on the authoritative session.
 * Follows GEMINI.md Section 8 and SECURITY.md Section 3, 7, 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { defaultRateLimiter } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

    const auditor = new AcworldAuditor();
    const auditCertificate = auditor.audit({ session });

    // Preserve historical audit certificate before updating authoritative outcome
    if (session.auditCertificate && session.auditCertificate.certificateId !== auditCertificate.certificateId) {
      session.auditHistory = session.auditHistory || [];
      if (!session.auditHistory.some((c) => c.certificateId === session.auditCertificate!.certificateId)) {
        session.auditHistory.push(session.auditCertificate);
      }
    }

    session.auditCertificate = auditCertificate;
    if (auditCertificate.passed) {
      if (session.status === "AUDIT_FAILED" || session.status === "AUDIT_PENDING") {
        session.status = "AUDIT_PASSED";
      }
    } else {
      session.status = "AUDIT_FAILED";
    }

    sessionStore.saveSession(session);

    return NextResponse.json({
      success: true,
      sessionId,
      auditCertificate,
      status: session.status,
      session,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error occurred while performing ACWORLD audit." },
      { status: 500 }
    );
  }
}
