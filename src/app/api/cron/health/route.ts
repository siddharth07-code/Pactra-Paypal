/**
 * PACTUM — Authenticated Maintenance Operational Health Route
 * Endpoint: POST /api/cron/health (and GET /api/cron/health)
 *
 * Provides safe operational metadata:
 * - System uptime and status
 * - Session store counts
 * - Gemini quota and circuit breaker state
 * - Rate limiter backend status
 * - Cron maintenance readiness
 *
 * Does NOT call Gemini. Requires valid CRON_SECRET authentication.
 * Follows GEMINI.md Section 1, 8, 11 and SECURITY.md Section 3, 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, defaultCronCoordinator } from "@/lib/cron-coordinator";
import { defaultRateLimiter } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

async function handleHealthCheck(req: NextRequest) {
  // 1. Rate limiting check
  const rateLimit = await defaultRateLimiter.check(req, "CRON_OPS");
  if (!rateLimit.allowed) {
    return rateLimit.response!;
  }

  // 2. Constant-time CRON_SECRET authentication
  const auth = verifyCronSecret(req);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: "Unauthorized", message: auth.error },
      { status: 401 }
    );
  }

  // 3. Compile safe operational report without external AI calls
  const report = defaultCronCoordinator.getHealthReport();
  return NextResponse.json({ success: true, health: report, ...report }, { status: 200 });
}

export async function GET(req: NextRequest) {
  return handleHealthCheck(req);
}

export async function POST(req: NextRequest) {
  return handleHealthCheck(req);
}
