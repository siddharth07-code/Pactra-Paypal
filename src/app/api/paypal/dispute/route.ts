/**
 * PACTUM — PayPal Dispute Evidence API Route
 * Endpoint: POST /api/paypal/dispute
 *
 * Prepares and packages cryptographic Merkle evidence, inclusion proofs,
 * merchant attestation, and evaluation findings for PayPal Dispute resolution.
 * Follows GEMINI.md Section 9.4, 11 and SECURITY.md Section 7, 8.
 */

import { NextRequest, NextResponse } from "next/server";
import { disputeService } from "@/lib/dispute-service";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.checkLimit(req, "DISPUTE_OPS");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    let body: {
      disputeId?: string;
      submitToPayPal?: boolean;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
    }

    const { disputeId } = body;

    if (!disputeId || typeof disputeId !== "string") {
      return NextResponse.json({ error: "Field 'disputeId' is required." }, { status: 400 });
    }

    const evidencePackage = disputeService.preparePayPalDisputeEvidence(disputeId);

    // submitToPayPal remains accepted for compatibility. No provider submission is implemented.
    // Credentials and local packaging never constitute a PayPal acknowledgment.
    const submissionStatus = "EVIDENCE_PACKAGED_LOCAL_ONLY";
    const paypalResponse = {
      acknowledged: false,
      evidenceRoot: evidencePackage.evidenceRoot,
      proofCount: evidencePackage.inclusionProofs.length,
      notice: "Evidence packaged locally only. Evidence has not been submitted to PayPal.",
    };

    return NextResponse.json({
      success: true,
      submissionStatus,
      evidencePackage,
      paypalResponse,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
