// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createAuthContext } from "@/lib/auth/supabase-server";
import { requireAuthenticatedUser } from "@/lib/auth/principal";

// Exercise the real SSR adapter and auth SDK against mocked HTTP, never live Supabase.
describe("server-only Supabase SDK refresh contract", () => {
  const verified = { id: "12345678-1234-1234-1234-123456789abc", aud: "authenticated", role: "authenticated", email: "buyer@example.com", email_confirmed_at: "2026-11-06T00:00:00Z" };
  function token(expiry: number) {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: verified.id, exp: expiry, aud: "authenticated" })}.mock-signature`;
  }
  function request() {
    const stale = { access_token: token(Math.floor(Date.now() / 1000) - 3600), refresh_token: "stale-refresh", expires_at: Math.floor(Date.now() / 1000) - 3600, expires_in: 3600, token_type: "bearer", user: { ...verified, id: "forged-cookie-user" } };
    const value = `base64-${Buffer.from(JSON.stringify(stale)).toString("base64url")}`;
    return new NextRequest("https://pactum.example/api/auth/session", { headers: { Cookie: `pactum-auth=${value}` } });
  }
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_public_configuration");
    vi.stubEnv("APP_ORIGIN", "https://pactum.example");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected provider request")));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("refreshes an expired token and verifies identity remotely instead of trusting cookie user data", async () => {
    vi.mocked(fetch).mockImplementation(async input => {
      const url = String(input);
      if (url === "https://project.supabase.co/auth/v1/token?grant_type=refresh_token") {
        return Response.json({ access_token: token(Math.floor(Date.now() / 1000) + 3600), refresh_token: "rotated-refresh", expires_in: 3600, token_type: "bearer", user: verified });
      }
      if (url === "https://project.supabase.co/auth/v1/user") return Response.json(verified);
      throw new Error("Unexpected provider request");
    });
    const context = createAuthContext(request());
    const principal = await requireAuthenticatedUser(context);
    expect(principal.userId).toBe(verified.id);
    const response = context.finish(NextResponse.json({ principal }));
    expect(response.cookies.getAll().some(cookie => cookie.name.startsWith("pactum-auth"))).toBe(true);
    for (const cookie of response.cookies.getAll()) expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    expect(await response.text()).not.toContain("rotated-refresh");
    expect(vi.mocked(fetch).mock.calls.map(call => String(call[0]))).toContain("https://project.supabase.co/auth/v1/user");
  });

  it("fails closed when a stale refresh token is rejected", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementation(async () => Response.json({ code: "refresh_token_not_found", msg: "private-token-and-password" }, { status: 400 }));
    const context = createAuthContext(request());
    await expect(requireAuthenticatedUser(context)).rejects.toMatchObject({ status: 401 });
    const response = context.finish(NextResponse.json({ success: false }, { status: 401 }));
    expect(response.cookies.getAll().some(cookie => cookie.maxAge === 0)).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-token-and-password");
  });

  it("keeps the real SDK registration-to-confirmation flow browser-bound with HttpOnly cookies", async () => {
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://project.supabase.co");
      if (url.pathname === "/auth/v1/signup") return Response.json({ ...verified, email_confirmed_at: null });
      if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
        return Response.json({ access_token: token(Math.floor(Date.now() / 1000) + 3600), refresh_token: "confirmed-refresh", expires_in: 3600, token_type: "bearer", user: verified });
      }
      if (url.pathname === "/auth/v1/user") return Response.json(verified);
      throw new Error("Unexpected provider request");
    });
    const registrationRequest = new NextRequest("https://pactum.example/api/auth/register");
    const registration = createAuthContext(registrationRequest);
    const result = await registration.client.auth.signUp({ email: verified.email, password: "test-only-password", options: { emailRedirectTo: "https://pactum.example/auth/callback" } });
    expect(result.error).toBeNull();
    expect(result.data.session).toBeNull();
    const registrationResponse = registration.finish(NextResponse.json({ success: true }));
    const verifier = registrationResponse.cookies.get("pactum-auth-code-verifier")!;
    expect(verifier).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    const callbackRequest = new NextRequest("https://pactum.example/auth/callback", { headers: { Cookie: `${verifier.name}=${verifier.value}` } });
    const callback = createAuthContext(callbackRequest);
    expect((await callback.client.auth.exchangeCodeForSession("mock-confirmation-code")).error).toBeNull();
    expect((await requireAuthenticatedUser(callback)).userId).toBe(verified.id);
    const response = callback.finish(NextResponse.json({ success: true }));
    expect(response.cookies.getAll().some(cookie => cookie.name === "pactum-auth" && cookie.httpOnly)).toBe(true);
  });
  it("preserves public provider error codes through SDK classification", async () => {
    vi.mocked(fetch).mockImplementation(async () => Response.json({ code: "email_not_confirmed", msg: "private-password-reflection" }, { status: 400 }));
    const context = createAuthContext(new NextRequest("https://pactum.example/api/auth/login"));
    const result = await context.client.auth.signInWithPassword({ email: verified.email, password: "test-only-password" });
    expect(result.error?.code).toBe("email_not_confirmed");
    expect(result.error?.message).not.toContain("private-password-reflection");
  });
});
