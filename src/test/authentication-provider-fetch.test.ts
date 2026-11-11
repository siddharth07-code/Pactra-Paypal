import { afterEach, describe, expect, it, vi } from "vitest";
import { authProviderFetch } from "@/lib/auth/provider-fetch";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("authentication provider transport sanitization", () => {
  it("removes reflected secrets before errors can reach SDK logging", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "invalid_credentials", msg: "password-token-cookie", detail: "secret" }, { status: 400 })));
    const response = await authProviderFetch("https://project.supabase.co/auth/v1/token");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid_credentials", error_code: "invalid_credentials", msg: "Authentication provider rejected the request." });
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it("does not propagate arbitrary provider error codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "secret-reflected-as-code" }, { status: 401 })));
    expect(await (await authProviderFetch("https://project.supabase.co/auth/v1/user")).text()).not.toContain("secret-reflected-as-code");
  });
  it("converts transport exceptions to sanitized retryable failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("credential-bearing-url")));
    const response = await authProviderFetch("https://project.supabase.co/auth/v1/user");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("credential-bearing-url");
  });
  it("reports upstream failures without exposing provider bodies, headers, or URL queries", async () => {
    vi.stubEnv("VERCEL", "1");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ msg: "private-provider-secret" }, { status: 503 })));
    const response = await authProviderFetch("https://project.supabase.co/auth/v1/.well-known/jwks.json?token=private-query-secret", { headers: { Authorization: "Bearer private-header-secret" } });
    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledWith("[AuthProvider] request failed", JSON.stringify({ endpoint: "jwks", stage: "upstream_status", status: 503, reason: "UPSTREAM_REJECTED" }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-(?:provider|query|header)-secret/);
  });
  it("identifies TLS transport errors without logging the original exception", async () => {
    vi.stubEnv("VERCEL", "1");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-transport-secret", { cause: { code: "CERT_HAS_EXPIRED" } })));
    expect((await authProviderFetch("https://project.supabase.co/auth/v1/user")).status).toBe(503);
    expect(JSON.stringify(log.mock.calls)).toContain("CERT_HAS_EXPIRED");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-transport-secret");
  });
  it("bounds provider error-body consumption", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret".repeat(5000), { status: 500 })));
    const response = await authProviderFetch("https://project.supabase.co/auth/v1/user");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
  it.each(["secret-token", "null", '"secret-token"', "[]"])("sanitizes malformed success bodies before SDK parsing", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { headers: { "Content-Type": "application/json" } })));
    const response = await authProviderFetch("https://project.supabase.co/auth/v1/user");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-token");
  });
  it("bounds successful provider response size", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ tooLarge: "x".repeat(70000) })));
    expect((await authProviderFetch("https://project.supabase.co/auth/v1/user")).status).toBe(503);
  });
});
