/**
 * PACTUM — Authenticated Maintenance Session Cleanup Route
 * Endpoint: POST /api/cron/cleanup (and GET /api/cron/cleanup for dry-run inspection)
 *
 * Safely prunes expired, terminal sessions lacking financial or legal commitments.
 * STRICT NON-NEGOTIABLE INVARIANTS:
 * - Active sessions, disputes, pending captures, agreements, and Merkle records are protected.
 * - Dry-run mode by default; destructive execution requires explicit dryRun=false.
 * - Concurrency lock prevents overlapping executions.
 * - Constant-time CRON_SECRET authentication required.
 *
 * Follows GEMINI.md Section 1, 8, 11 and SECURITY.md Section 3, 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, defaultCronCoordinator } from "@/lib/cron-coordinator";
import { defaultRateLimiter } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  if (process.env.NODE_ENV !== "test" || process.env.PACTUM_DATABASE_TESTS === "1") return NextResponse.json({ error: "DATABASE_RETENTION_NOT_ENABLED", message: "Database financial records are retained; legacy file cleanup is disabled." }, { status: 503 });
  // 3. Acquire distributed concurrency lock (or local memory with auto-expiration)
  const lock = await defaultCronCoordinator.acquireLockAsync("cleanup", 60000);
  if (!lock.acquired) {
    return NextResponse.json(
      {
        error: "Session cleanup maintenance job is already in progress.",
        message: "Concurrent execution prevented.",
        lockBackend: lock.backend,
      },
      { status: 409 }
    );
  }

  try {
    let body: { dryRun?: boolean; retentionDays?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable; query params may be used
    }

    const { searchParams } = new URL(req.url);
    const queryDryRun = searchParams.get("dryRun");
    const queryRetention = searchParams.get("retentionDays");

    let dryRun = true;
    if (body.dryRun !== undefined) {
      dryRun = Boolean(body.dryRun);
    } else if (queryDryRun !== null) {
      dryRun = queryDryRun === "true" || queryDryRun === "1";
    }

    let retentionDays: number | undefined;
    if (typeof body.retentionDays === "number" && body.retentionDays > 0) {
      retentionDays = body.retentionDays;
    } else if (queryRetention) {
      const parsed = parseInt(queryRetention, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        retentionDays = parsed;
      }
    }

    const report = defaultCronCoordinator.executeCleanup({
      dryRun,
      retentionDays,
    });

    return NextResponse.json({ report, ...report }, { status: 200 });
  } finally {
    await defaultCronCoordinator.releaseLockAsync("cleanup", lock.token);
  }
}

export async function GET(req: NextRequest) {
  // GET is safe read/dry-run inspection
  const rateLimit = await defaultRateLimiter.check(req, "CRON_OPS");
  if (!rateLimit.allowed) {
    return rateLimit.response!;
  }

  const auth = verifyCronSecret(req);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: "Unauthorized", message: auth.error },
      { status: 401 }
    );
  }

  if (process.env.NODE_ENV !== "test" || process.env.PACTUM_DATABASE_TESTS === "1") return NextResponse.json({ error: "DATABASE_RETENTION_NOT_ENABLED", message: "Database financial records are retained; legacy file cleanup is disabled." }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const queryRetention = searchParams.get("retentionDays");
  const retentionDays = queryRetention ? parseInt(queryRetention, 10) : undefined;

  // GET is always dryRun = true
  const report = defaultCronCoordinator.executeCleanup({
    dryRun: true,
    retentionDays,
  });

  return NextResponse.json({ report, ...report }, { status: 200 });
}
