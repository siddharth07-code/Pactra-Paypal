/**
 * PACTUM — Procurement Sessions Read API Route
 * Endpoint: GET /api/procurement/sessions
 * Returns authoritative server-side sessions for the frontend overview and history screens.
 * Follows GEMINI.md Section 11 and SECURITY.md Section 2, 3.
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.check(req, "EVIDENCE_READ");
  if (!rateLimit.allowed) {
    return rateLimit.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (sessionId) {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: `Session ${sessionId} not found.` }, { status: 404 });
      }
      return NextResponse.json({ session });
    }

    const sessions = sessionStore.getAllSessions();
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ error: "Failed to retrieve sessions." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.check(req, "MANDATE_ANALYZE");
  if (!rateLimit.allowed) {
    return rateLimit.response!;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action, sessionId, newParams } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Field 'sessionId' is required and must be a string." },
        { status: 400 }
      );
    }

    if (action === "revise") {
      if (!newParams || typeof newParams !== "object") {
        return NextResponse.json(
          { error: "Field 'newParams' must be an object containing revised mandate fields." },
          { status: 400 }
        );
      }
      try {
        const revisedSession = sessionStore.reviseMandate(sessionId, newParams);
        return NextResponse.json({
          success: true,
          action: "revise",
          session: revisedSession,
          mandateVersion: revisedSession.mandate.version,
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to revise mandate." },
          { status: 422 }
        );
      }
    }

    if (action === "lock") {
      try {
        const lockedSession = sessionStore.lockMandate(sessionId);
        return NextResponse.json({
          success: true,
          action: "lock",
          session: lockedSession,
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to lock mandate." },
          { status: 404 }
        );
      }
    }

    if (action === "history") {
      const history = sessionStore.getMandateHistory(sessionId);
      return NextResponse.json({
        success: true,
        action: "history",
        sessionId,
        history,
      });
    }

    return NextResponse.json(
      { error: `Unknown action '${action}'. Supported actions: 'revise', 'lock', 'history'.` },
      { status: 400 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Internal error processing session mutation.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

