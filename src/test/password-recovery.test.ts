// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { handlePasswordRecovery } from "@/lib/auth/password-recovery";
import { handleConfirmation } from "@/lib/auth/handlers";

describe("server-mediated password recovery", () => {
  const user = { id: "12345678-1234-4234-8234-123456789abc", email: "buyer@example.test", email_confirmed_at: "2026-11-06T00:00:00Z", aud: "authenticated", role: "authenticated" };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = () => `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" })}.fixture-signature`;
  function request(body: unknown, cookie?: string, origin = "https://pactra.example") {
    return new NextRequest("https://pactra.example/api/auth/recovery", {
      method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
    });
  }
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_configuration_test");
    vi.stubEnv("APP_ORIGIN", "https://pactra.example");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected provider request")));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("keeps recovery PKCE server-only through exchange and authenticated password update", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://project.supabase.co");
      if (url.pathname === "/auth/v1/recover") {
        expect(url.searchParams.get("redirect_to")).toBe("https://pactra.example/auth/recovery");
        expect(JSON.parse(String(init?.body))).toMatchObject({ email: "buyer@example.test", code_challenge_method: "s256" });
        return Response.json({});
      }
      if (url.pathname === "/auth/v1/token") return Response.json({ access_token: token(), refresh_token: "private-refresh", expires_in: 3600, token_type: "bearer", user });
      if (url.pathname === "/auth/v1/user") {
        if (init?.method === "PUT") expect(JSON.parse(String(init.body))).toMatchObject({ password: "new-private-password" });
        return Response.json(user);
      }
      throw new Error("Unexpected provider path");
    });
    const recovery = await handlePasswordRecovery(request({ email: user.email }), false);
    expect(recovery.status).toBe(202);
    const verifier = recovery.cookies.get("pactum-auth-code-verifier")!;
    expect(verifier).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    const callback = await handleConfirmation(new NextRequest("https://pactra.example/auth/recovery?code=valid-recovery-code-12345", { headers: { cookie: `${verifier.name}=${verifier.value}` } }), "/auth/reset-password");
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("https://pactra.example/auth/reset-password");
    const cookie = callback.cookies.getAll().filter(c => c.value && !c.name.includes("verifier")).map(c => `${c.name}=${c.value}`).join("; ");
    const update = await handlePasswordRecovery(request({ password: "new-private-password" }, cookie), true);
    expect(update.status).toBe(200);
    expect(update.headers.get("cache-control")).toContain("no-store");
    expect(await update.text()).not.toMatch(/new-private-password|private-refresh/);
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/auth/v1/user") && init?.method === "PUT")).toBe(true);
  });
  it("rejects cross-origin recovery before provider access", async () => {
    expect((await handlePasswordRecovery(request({ email: user.email }, undefined, "https://attacker.example"), false)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not disclose unknown email addresses or reflected provider diagnostics", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "user_not_found", msg: "private-provider-diagnostic" }, { status: 400 }));
    const response = await handlePasswordRecovery(request({ email: "unknown@example.test" }), false);
    expect(response.status).toBe(202);
    expect(await response.text()).not.toContain("private-provider-diagnostic");
  });
  it("rejects password updates without a verified session", async () => {
    expect((await handlePasswordRecovery(request({ password: "new-private-password" }), true)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects short passwords and arbitrary user selection", async () => {
    expect((await handlePasswordRecovery(request({ password: "short" }), true)).status).toBe(400);
    expect((await handlePasswordRecovery(request({ password: "new-private-password", email: "other@example.test" }), true)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
