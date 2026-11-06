import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { AuthError, authConfiguration, providerError, safeDestination } from "./config";
import { authFailure, boundedJson, credentials, requireSameOrigin } from "./http";
import { createAuthContext, type AuthContext } from "./supabase-server";
import { requireAuthenticatedUser } from "./principal";

type AuthAction = "register" | "login" | "logout" | "session";

export async function handleAuth(request: NextRequest, action: AuthAction): Promise<NextResponse> {
  let context: AuthContext | undefined;
  try {
    const policy = action === "register" ? "AUTH_REGISTER" : action === "session" ? "AUTH_SESSION" : "AUTH_LOGIN";
    const limit = await defaultRateLimiter.checkLimit(request, policy);
    if (!limit.allowed) throw new AuthError(429, "AUTH_RATE_LIMITED", "Too many authentication attempts. Please retry later.");
    if (action !== "session") requireSameOrigin(request);
    const body = action === "session" ? {} : await boundedJson(request);
    const destination = safeDestination(body.next);
    const input = action === "register" || action === "login" ? credentials(body, action === "register") : undefined;
    if (action === "logout" && Object.keys(body).length) throw new AuthError(400, "AUTH_INVALID_INPUT", "Logout requires an empty JSON object.");
    context = createAuthContext(request);

    if (action === "register") {
      const { data, error } = await context.client.auth.signUp({ ...input!, options: { emailRedirectTo: `${authConfiguration().origin}/auth/callback` } });
      if (error && !["user_already_exists", "email_exists"].includes(error.code ?? "")) {
        if (error.status === 400 || error.status === 422) throw new AuthError(400, "AUTH_INVALID_INPUT", "Registration could not be completed with these details.");
        providerError(error);
      }
      if (data.session) {
        context.clearCookies();
        throw new AuthError(503, "AUTH_CONFIRMATION_CONFIGURATION", "Email confirmation must be enabled in the authentication provider.");
      }
      return context.finish(NextResponse.json({ success: true, status: "EMAIL_CONFIRMATION_REQUIRED", message: "Check your email to confirm registration if this address is eligible." }, { status: 202 }));
    }
    if (action === "login") {
      const { error } = await context.client.auth.signInWithPassword(input!);
      providerError(error);
      const principal = await requireAuthenticatedUser(context);
      return context.finish(NextResponse.json({ success: true, principal, redirectTo: destination }));
    }
    if (action === "logout") {
      const { error } = await context.client.auth.signOut({ scope: "local" });
      providerError(error);
      context.clearCookies();
      return context.finish(NextResponse.json({ success: true }));
    }
    const principal = await requireAuthenticatedUser(context);
    return context.finish(NextResponse.json({ success: true, principal }));
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) context?.clearCookies();
    const response = authFailure(error);
    return context ? context.finish(response) : response;
  }
}

export async function handleConfirmation(request: NextRequest): Promise<NextResponse> {
  let context: AuthContext | undefined;
  try {
    const limit = await defaultRateLimiter.checkLimit(request, "AUTH_LOGIN");
    if (!limit.allowed) throw new AuthError(429, "AUTH_RATE_LIMITED", "Too many authentication attempts. Please retry later.");
    const params = request.nextUrl.searchParams;
    safeDestination(params.get("next"));
    const code = params.get("code");
    if (params.getAll("code").length !== 1 || params.getAll("next").length > 1 || !code || !/^[A-Za-z0-9_-]{16,2048}$/.test(code) ||
      !request.cookies.getAll().some(cookie => /^pactum-auth-code-verifier(?:$|\.)/.test(cookie.name))) {
      throw new AuthError(400, "AUTH_INVALID_CONFIRMATION", "Confirmation is invalid or expired. Open the link in the browser used to register.");
    }
    context = createAuthContext(request);
    const { error } = await context.client.auth.exchangeCodeForSession(code);
    providerError(error);
    await requireAuthenticatedUser(context);
    return context.finish(NextResponse.redirect(new URL("/auth/confirmed", authConfiguration().origin), 303));
  } catch (error) {
    if (error instanceof AuthError && error.status < 500) context?.clearCookies();
    const response = authFailure(error);
    return context ? context.finish(response) : response;
  }
}
