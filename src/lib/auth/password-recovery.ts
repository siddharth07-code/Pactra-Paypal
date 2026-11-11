import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { AuthError, authConfiguration, providerError } from "./config";
import { authFailure, boundedJson, requireSameOrigin } from "./http";
import { requireAuthenticatedUser } from "./principal";
import { createAuthContext, type AuthContext } from "./supabase-server";

export async function handlePasswordRecovery(request: NextRequest, update: boolean) {
  let context: AuthContext | undefined;
  try {
    const limit = await defaultRateLimiter.checkLimit(request, "AUTH_LOGIN");
    if (!limit.allowed) throw new AuthError(429, "AUTH_RATE_LIMITED", "Too many authentication attempts. Please retry later.");
    requireSameOrigin(request);
    const body = await boundedJson(request);
    const field = update ? "password" : "email";
    if (Object.keys(body).some(key => key !== field)) throw new AuthError(400, "AUTH_INVALID_INPUT", "Invalid recovery details.");
    context = createAuthContext(request);
    if (update) {
      if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) {
        throw new AuthError(400, "AUTH_INVALID_INPUT", "Use a password between 12 and 128 characters.");
      }
      await requireAuthenticatedUser(context);
      const { error } = await context.client.auth.updateUser({ password: body.password });
      providerError(error);
      return context.finish(NextResponse.json({ success: true }));
    }
    if (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      throw new AuthError(400, "AUTH_INVALID_INPUT", "Enter a valid email address.");
    }
    const { error } = await context.client.auth.resetPasswordForEmail(body.email.trim().toLowerCase(), {
      redirectTo: `${authConfiguration().origin}/auth/recovery`,
    });
    // Return the same response for eligible and unknown addresses.
    if (error && !["user_not_found", "email_not_found"].includes(error.code ?? "")) providerError(error);
    return context.finish(NextResponse.json({ success: true, message: "Check your email for a reset link if this address is eligible. Open it in this browser." }, { status: 202 }));
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) context?.clearCookies();
    const response = authFailure(error);
    return context ? context.finish(response) : response;
  }
}
