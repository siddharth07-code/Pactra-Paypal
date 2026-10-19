/**
 * PACTUM — Procurement Sessions Read API Route
 * Endpoint: GET /api/procurement/sessions
 * Returns authoritative server-side sessions for the frontend overview and history screens.
 * Follows GEMINI.md Section 11 and SECURITY.md Section 2, 3.
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
