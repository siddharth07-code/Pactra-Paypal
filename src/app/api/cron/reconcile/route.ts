import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-coordinator";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { reconcilePendingOperations } from "@/lib/db/reconciliation";
import { authFailure } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const limit = await defaultRateLimiter.check(request, "CRON_OPS");
  if (!limit.allowed) return limit.response!;
  if (!verifyCronSecret(request).authenticated) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ operations: await reconcilePendingOperations() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return authFailure(error); }
}
export const GET = POST;
