import "server-only";
import { NextRequest } from "next/server";
import { AuthError } from "./config";
import { authFailure } from "./http";
import { createAuthContext, type AuthContext } from "./supabase-server";
import { requireAuthenticatedUser } from "./principal";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { requestScope } from "@/lib/persistence/request-scope";

/** No configuration flag or development bypass: identity alone never grants tenant access. */
export async function requireBusinessAccess(request: NextRequest): Promise<Response | null> {
  if (requestScope()) return null;
  let context: AuthContext | undefined;
  try {
    const limit = await defaultRateLimiter.checkLimit(request, "GENERAL_DEFAULT");
    if (limit.unavailable) throw new AuthError(503, "AUTH_INFRASTRUCTURE_UNAVAILABLE", "Authentication is temporarily unavailable. Please retry shortly.");
    if (!limit.allowed) throw new AuthError(429, "AUTH_RATE_LIMITED", "Too many requests. Please retry later.");
    context = createAuthContext(request);
    await requireAuthenticatedUser(context);
    throw new AuthError(503, "TENANT_AUTHORIZATION_UNAVAILABLE", "Organization authorization is not available yet. Business operations are disabled.");
  } catch (error) {
    const response = authFailure(error);
    return context ? context.finish(response) : response;
  }
}
