import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { GET as session } from "@/app/api/auth/session/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as confirmation } from "@/app/auth/callback/route";
import { middleware } from "@/middleware";
import { authConfiguration } from "@/lib/auth/config";
import { createAuthContext } from "@/lib/auth/supabase-server";
import { requireAuthenticatedUser } from "@/lib/auth/principal";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), getClaims: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), exchangeCodeForSession: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  defaultRateLimiter: { checkLimit: mocks.limit, check: mocks.limit },
  createRateLimitResponse: vi.fn(),
}));

type Adapter = {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options: CookieOptions }[]): void;
};
let cookies: Adapter;
const user = { id: "12345678-1234-1234-1234-123456789abc", aud: "authenticated", email: "buyer@example.com", email_confirmed_at: "2026-11-06T00:00:00Z" };
const body = { email: "buyer@example.com", password: "a-long-test-password" };

function request(path: string, value?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://pactum.example${path}`, {
    method: value === undefined ? "GET" : "POST",
    headers: { Origin: "https://pactum.example", "Content-Type": "application/json", ...headers },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}
function writeCookies() {
  cookies.setAll([{ name: "pactum-auth.0", value: "private-token", options: { domain: ".evil.example", httpOnly: false, secure: false, sameSite: "none", path: "/bad", maxAge: 3600 } }]);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_public_configuration");
  vi.stubEnv("APP_ORIGIN", "https://pactum.example");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("External requests forbidden")));
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: user.id, session_id: "12345678-1234-1234-1234-123456789abd", aud: "authenticated", iss: "https://project.supabase.co/auth/v1" } }, error: null });
  vi.stubEnv("DATABASE_URL", "");
  mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  mocks.signInWithPassword.mockImplementation(async () => { writeCookies(); return { data: {}, error: null }; });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockImplementation(async () => { writeCookies(); return { data: {}, error: null }; });
  vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
    cookies = options.cookies as Adapter;
    return { auth: mocks } as unknown as ReturnType<typeof createServerClient>;
  });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

describe("authentication routes", () => {
  it("registers with a configured canonical PKCE callback and no user/token disclosure", async () => {
    const response = await register(request("/api/auth/register", body));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, status: "EMAIL_CONFIRMATION_REQUIRED" });
    expect(mocks.signUp).toHaveBeenCalledWith({ ...body, options: { emailRedirectTo: "https://pactum.example/auth/callback" } });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it.each([
    { ...body, password: "short" }, { ...body, email: "bad" }, { ...body, userId: user.id },
    { ...body, organizationId: "organization" }, { ...body, role: "OWNER" },
  ])("rejects invalid registration and identity/role injection", async input => {
    expect((await register(request("/api/auth/register", input))).status).toBe(400);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("does not enumerate an existing email", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { status: 422, code: "user_already_exists" } });
    expect((await register(request("/api/auth/register", body))).status).toBe(202);
  });
  it("rejects provider configurations that bypass email confirmation", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "never-expose" } }, error: null });
    const response = await register(request("/api/auth/register", body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("never-expose");
  });
  it("returns only a server-verified principal on login", async () => {
    const response = await login(request("/api/auth/login", body));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.principal).toMatchObject({ userId: user.id, email: user.email, emailVerified: true });
    expect(result.principal).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("session");
    expect(JSON.stringify(result)).not.toContain("private-token");
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
  it("ignores user and organization identity headers supplied by the caller", async () => {
    const response = await session(request("/api/auth/session", undefined, { "x-pactum-user-id": "forged", "x-organization-id": "forged" }));
    const result = await response.json();
    expect(result.principal.userId).toBe(user.id);
    expect(result.principal).not.toHaveProperty("organizationId");
  });
  it("distinguishes invalid login credentials from provider failure", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { status: 400, code: "invalid_credentials", message: body.password } });
    const response = await login(request("/api/auth/login", body));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(body.password);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it.each([500, 503])("returns retryable provider outage for HTTP %s", async status => {
    mocks.signInWithPassword.mockResolvedValue({ error: { status, message: "secret-token-and-password" } });
    const response = await login(request("/api/auth/login", body));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(await response.text()).not.toContain("secret-token-and-password");
  });
  it("sanitizes transport failures", async () => {
    mocks.getUser.mockRejectedValue(new Error("credentials-in-provider-url"));
    const response = await session(request("/api/auth/session"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("credentials-in-provider-url");
  });
  it.each(["AUTH_INVALID", "expired_token", "refresh_token_not_found"])("rejects forged/expired sessions: %s", async code => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, code } });
    const response = await session(request("/api/auth/session", undefined, { Cookie: "pactum-auth=forged" }));
    expect(response.status).toBe(401);
    expect(response.cookies.get("pactum-auth")?.value).toBe("");
  });
  it("rejects missing authentication", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    expect((await session(request("/api/auth/session"))).status).toBe(401);
  });
  it("rejects an unconfirmed email", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
    expect((await session(request("/api/auth/session"))).status).toBe(403);
  });
  it.each([{ ...user, id: "client-supplied-id" }, { ...user, aud: "other-project" }])("rejects invalid provider identities", async invalidUser => {
    mocks.getUser.mockResolvedValue({ data: { user: invalidUser }, error: null });
    expect((await session(request("/api/auth/session"))).status).toBe(401);
  });
  it("propagates refreshed cookies with enforced host-only security and no cache", async () => {
    mocks.getUser.mockImplementation(async () => { writeCookies(); return { data: { user }, error: null }; });
    const response = await session(request("/api/auth/session"));
    const cookie = response.cookies.get("pactum-auth.0")!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(cookie.domain).toBeUndefined();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });
  it("preserves existing cookies on provider outage rather than claiming refresh success", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    const response = await session(request("/api/auth/session", undefined, { Cookie: "pactum-auth=existing" }));
    expect(response.status).toBe(503);
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it("logs out the local Supabase session and expires all token/verifier chunks", async () => {
    const response = await logout(request("/api/auth/logout", {}, { Cookie: "pactum-auth.0=one; pactum-auth.1=two; pactum-auth-code-verifier=pkce; unrelated=keep" }));
    expect(response.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.cookies.getAll().map(cookie => cookie.name)).toEqual(["pactum-auth.0", "pactum-auth.1", "pactum-auth-code-verifier"]);
    for (const cookie of response.cookies.getAll()) expect(cookie).toMatchObject({ value: "", maxAge: 0, httpOnly: true });
  });
  it("does not claim logout success during a provider outage", async () => {
    mocks.signOut.mockResolvedValue({ error: { status: 503 } });
    const response = await logout(request("/api/auth/logout", {}, { Cookie: "pactum-auth=existing" }));
    expect(response.status).toBe(503);
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it.each(["https://evil.example", "null", ""])("rejects CSRF Origin %s", async origin => {
    expect((await login(request("/api/auth/login", body, { Origin: origin }))).status).toBe(403);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
  it("rejects missing Origin and cross-site fetches", async () => {
    const missing = request("/api/auth/logout", {}); missing.headers.delete("origin");
    expect((await logout(missing)).status).toBe(403);
    expect((await login(request("/api/auth/login", body, { "Sec-Fetch-Site": "cross-site" }))).status).toBe(403);
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/account?next=https://evil.example"])("rejects redirect %s", async next => {
    expect((await login(request("/api/auth/login", { ...body, next }))).status).toBe(400);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
  it("allows an explicit approved redirect", async () => {
    const response = await login(request("/api/auth/login", { ...body, next: "/" }));
    expect((await response.json()).redirectTo).toBe("/");
  });
  it("enforces content type and body size", async () => {
    expect((await login(request("/api/auth/login", body, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await login(request("/api/auth/login", { ...body, password: "x".repeat(5000) }))).status).toBe(413);
    expect((await login(request("/api/auth/login", body, { "Content-Length": "5000" }))).status).toBe(413);
  });
  it.each([null, [], "bad", { email: "x" }])("rejects malformed auth bodies", async input => {
    expect((await login(request("/api/auth/login", input))).status).toBe(400);
  });
  it("rejects malformed JSON", async () => {
    const req = new NextRequest("https://pactum.example/api/auth/login", { method: "POST", headers: { Origin: "https://pactum.example", "Content-Type": "application/json" }, body: "{" });
    expect((await login(req)).status).toBe(400);
  });
  it("enforces authentication rate limits before invoking Supabase", async () => {
    mocks.limit.mockResolvedValue({ allowed: false });
    expect((await login(request("/api/auth/login", body))).status).toBe(429);
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("does not let an unexpected provider error reach application logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signInWithPassword.mockRejectedValue(new Error("password-cookie-secret"));
    const response = await login(request("/api/auth/login", body));
    expect(response.status).toBe(503);
    expect(log).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("password-cookie-secret");
  });
  it("fails closed on missing configuration and rejects secret keys", async () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_secret_do_not_use");
    expect((await session(request("/api/auth/session"))).status).toBe(503);
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("requires production HTTPS and permits local HTTP only outside production", () => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    expect(authConfiguration().secure).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => authConfiguration()).toThrow();
  });
  it("uses server-owned PKCE with no browser token flow", async () => {
    const context = createAuthContext(request("/api/auth/session"));
    const principal = await requireAuthenticatedUser(context);
    expect(Object.isFrozen(principal)).toBe(true);
    expect(vi.mocked(createServerClient).mock.calls[0][2].auth).toMatchObject({ flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false });
  });
});

describe("PKCE email confirmation", () => {
  const path = "/auth/callback?code=valid_confirmation_code_1234";
  it("exchanges a browser-bound code, verifies the user, and preserves auth cookies on redirect", async () => {
    const response = await confirmation(request(path, undefined, { Cookie: "pactum-auth-code-verifier=private-verifier" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://pactum.example/auth/confirmed");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.cookies.get("pactum-auth.0")?.httpOnly).toBe(true);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid_confirmation_code_1234");
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });
  it.each(["/auth/callback", path, `${path}&next=//evil.example`])("rejects invalid or browser-unbound confirmation %s", async callback => {
    expect((await confirmation(request(callback))).status).toBe(400);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("rejects failed code exchange", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { status: 400, code: "bad_code" } });
    expect((await confirmation(request(path, undefined, { Cookie: "pactum-auth-code-verifier=verifier" }))).status).toBe(401);
  });
});

describe("private pages and independent machine endpoints", () => {
  it("refreshes and forwards cookies for private navigation", async () => {
    mocks.getUser.mockImplementation(async () => { writeCookies(); return { data: { user }, error: null }; });
    const response = await middleware(request("/account"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.get("pactum-auth.0")?.secure).toBe(true);
    expect(response.headers.get("x-middleware-request-cookie")).toContain("private-token");
  });
  it("redirects unauthenticated page navigation to the canonical login URL", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    const response = await middleware(request("/"));
    expect(response.headers.get("location")).toBe("https://pactum.example/login");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("does not redirect provider outages as if credentials were invalid", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    expect((await middleware(request("/account"))).status).toBe(503);
  });
  it.each(["/api/paypal/webhook", "/api/cron/health", "/api/cron/cleanup", "/api/auth/login", "/auth/callback", "/login", "/register"])("excludes %s from user middleware", async path => {
    expect((await middleware(request(path))).headers.get("x-middleware-next")).toBe("1");
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("serves a friendly HTML error page for browser navigation when authentication is not configured", async () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    const htmlReq = new NextRequest("https://pactum.example/", {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const response = await middleware(htmlReq);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("text/html");
    const text = await response.text();
    expect(text).toContain("PACTUM");
    expect(text).toContain("AUTH_NOT_CONFIGURED");
  });
  it("serves raw JSON for non-HTML/API callers when authentication is not configured", async () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    const jsonReq = new NextRequest("https://pactum.example/", {
      headers: { Accept: "application/json" },
    });
    const response = await middleware(jsonReq);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    const json = await response.json();
    expect(json.error.code).toBe("AUTH_NOT_CONFIGURED");
  });
});

describe("configuration resilience and normalization", () => {
  it("normalizes quoted environment variables and handles NEXT_PUBLIC fallbacks", () => {
    const config = authConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: '"https://project.supabase.co/rest/v1/"',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '"sb_publishable_quoted_fallback_key"',
      NODE_ENV: "development",
    });
    expect(config.url).toBe("https://project.supabase.co");
    expect(config.key).toBe("sb_publishable_quoted_fallback_key");
    expect(config.origin).toBe("http://localhost:3000");
    expect(config.secure).toBe(false);
  });
});

describe("business APIs fail closed independently of middleware", () => {
  const loaders = {
    "procurement/init": () => import("@/app/api/procurement/init/route"),
    "procurement/sessions": () => import("@/app/api/procurement/sessions/route"),
    "procurement/audit": () => import("@/app/api/procurement/audit/route"),
    "procurement/evidence": () => import("@/app/api/procurement/evidence/route"),
    "procurement/disputes": () => import("@/app/api/procurement/disputes/route"),
    "procurement/disputes/evaluate": () => import("@/app/api/procurement/disputes/evaluate/route"),
    "negotiate/stream": () => import("@/app/api/negotiate/stream/route"),
    "fx/quote": () => import("@/app/api/fx/quote/route"),
    "fx/lock": () => import("@/app/api/fx/lock/route"),
    "paypal/checkout": () => import("@/app/api/paypal/checkout/route"),
    "paypal/capture": () => import("@/app/api/paypal/capture/route"),
    "paypal/settle": () => import("@/app/api/paypal/settle/route"),
    "paypal/reconcile": () => import("@/app/api/paypal/reconcile/route"),
    "paypal/cancel": () => import("@/app/api/paypal/cancel/route"),
    "paypal/dispute": () => import("@/app/api/paypal/dispute/route"),
  };
  const routes = [
    ["procurement/init", "POST"], ["procurement/sessions", "GET"], ["procurement/sessions", "POST"],
    ["procurement/audit", "POST"], ["procurement/evidence", "GET"], ["procurement/disputes", "GET"],
    ["procurement/disputes", "POST"], ["procurement/disputes/evaluate", "POST"], ["negotiate/stream", "POST"],
    ["fx/quote", "POST"], ["fx/lock", "POST"], ["paypal/checkout", "POST"], ["paypal/capture", "POST"],
    ["paypal/settle", "POST"], ["paypal/reconcile", "POST"], ["paypal/cancel", "POST"], ["paypal/dispute", "POST"],
  ] as const;
  it.each(routes)("denies anonymous and identity-only access to %s %s", async (path, method) => {
    const route = await loaders[path]() as Record<string, (req: NextRequest) => Promise<Response>>;
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    expect((await route[method](request(`/api/${path}`, method === "POST" ? { sessionId: "victim", organizationId: "forged" } : undefined))).status).toBe(401);
    const response = await route[method](request(`/api/${path}`, method === "POST" ? {} : undefined));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DATABASE_UNAVAILABLE");
  });
});
