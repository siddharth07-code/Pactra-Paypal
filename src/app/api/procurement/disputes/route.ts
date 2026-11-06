import { withBusinessRoute } from "@/lib/db/business-route";
import { requireBusinessAccess } from "@/lib/auth/business-access";
/**
 * PACTUM — Disputes API Route
 * Endpoint: /api/procurement/disputes
 *
 * POST: Opens a new dispute on an authoritative session.
 * GET: Retrieves disputes for a session or a specific dispute by disputeId.
 * Follows GEMINI.md Section 9.4, 11 and SECURITY.md Section 3, 7.
 */

import { NextRequest, NextResponse } from "next/server";
import { disputeService } from "@/lib/dispute-service";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter, createRateLimitResponse } from "@/lib/rate-limiter";
import type { DisputeCategory } from "@/types/pactum";

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
      sessionId?: string;
      category?: DisputeCategory;
      description?: string;
      claimedValue?: number | string;
      refundRequested?: boolean;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
    }

    const { sessionId, category, description, claimedValue, refundRequested } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Field 'sessionId' is required." }, { status: 400 });
    }
    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "Field 'category' is required." }, { status: 400 });
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "Field 'description' is required." }, { status: 400 });
    }

    const dispute = disputeService.openDispute({
      sessionId,
      category,
      description,
      claimedValue,
      refundRequested,
    });

    return NextResponse.json({ success: true, dispute }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

async function handleGET(req: NextRequest) {
  const accessDenied = await requireBusinessAccess(req);
  if (accessDenied) return accessDenied;

  const rateLimit = await defaultRateLimiter.checkLimit(req, "DISPUTE_OPS");
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  try {
    const { searchParams } = new URL(req.url);
    const disputeId = searchParams.get("disputeId");
    const sessionId = searchParams.get("sessionId");

    if (disputeId) {
      const details = disputeService.getDispute(disputeId);
      return NextResponse.json({ success: true, ...details });
    }

    if (sessionId) {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: `Session ${sessionId} not found.` }, { status: 404 });
      }
      return NextResponse.json({ success: true, disputes: session.disputes ?? [] });
    }

    return NextResponse.json(
      { error: "Provide either 'disputeId' or 'sessionId' query parameter." },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export const POST = withBusinessRoute("dispute.open", handlePOST);

export const GET = withBusinessRoute("dispute.read", handleGET);
