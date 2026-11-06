import { withBusinessRoute } from "@/lib/db/business-route";
import { requireBusinessAccess } from "@/lib/auth/business-access";
/**
 * PACTUM — Dispute Evaluation API Route
 * Endpoint: POST /api/procurement/disputes/evaluate
 *
 * Deterministically evaluates an open dispute against authoritative Merkle evidence
 * and external observations (tracking, delivery date, delivered SKU, billed price).
 * Follows GEMINI.md Section 9.4, 11 and SECURITY.md Section 3, 7.
 */

import { NextRequest, NextResponse } from "next/server";
import { disputeService } from "@/lib/dispute-service";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

async function handlePOST(req: NextRequest) {
  const accessDenied = await requireBusinessAccess(req);
  if (accessDenied) return accessDenied;

  const rateLimit = await defaultRateLimiter.checkLimit(req, "DISPUTE_OPS");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    let body: {
      disputeId?: string;
      externalEvidence?: {
        deliveredSku?: string;
        actualLandedPrice?: number;
        actualDeliveryDays?: number;
        returnRefusedWithinWindow?: boolean;
        carrierTrackingVerified?: boolean;
      };
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
    }

    const { disputeId, externalEvidence } = body;

    if (!disputeId || typeof disputeId !== "string") {
      return NextResponse.json({ error: "Field 'disputeId' is required." }, { status: 400 });
    }

    const evaluated = disputeService.evaluateDispute({
      disputeId,
      externalEvidence,
    });

    return NextResponse.json({ success: true, dispute: evaluated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const POST = withBusinessRoute("dispute.evaluate", handlePOST);
