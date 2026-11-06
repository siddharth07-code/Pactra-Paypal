// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requireVerifiedSession, type VerifiedPrincipal } from "@/lib/db/authorization";
import { projectVerifiedLocalIdentity, revokeVerifiedLocalIdentity } from "@/lib/auth/local-identity";
import type { AuthContext } from "@/lib/auth/supabase-server";
let admin: Client;
beforeAll(async () => {
  const url = new URL(process.env.PACTUM_TEST_PROJECTION_ADMIN_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/pactum_local" || url.username !== "pactum_test_migrator") throw new Error("Disposable projection database required.");
  admin = new Client({ connectionString: url.toString() }); await admin.connect();
  vi.stubEnv("LOCAL_IDENTITY_PROJECTION", "verified_supabase");
  vi.stubEnv("LOCAL_AUTH_DATABASE_URL", process.env.PACTUM_TEST_PROJECTION_URL!);
  vi.stubEnv("DATABASE_URL", process.env.PACTUM_TEST_PROJECTION_URL!);
});
afterAll(async () => { await admin?.end(); vi.unstubAllEnvs(); });
function context(valid = true, exp = Math.floor(Date.now() / 1000) + 3600) {
  const id = randomUUID(), sessionId = randomUUID();
  const user = { id, email: "verified@example.com", aud: "authenticated", email_confirmed_at: new Date().toISOString() };
  const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: valid ? user : null }, error: null }), getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: id, aud: "authenticated", iss: "https://project.supabase.co/auth/v1", session_id: sessionId, exp } }, error: null }) };
  return { id, sessionId, auth, ctx: { client: { auth } } as unknown as AuthContext };
}
describe("verified Supabase to local PostgreSQL identity bridge", () => {
  it("persists only provider-verified identity with bounded expiry", async () => {
    const fixture = context(); const before = Date.now();
    await requireVerifiedSession(fixture.ctx);
    expect(fixture.auth.getUser).toHaveBeenCalledOnce(); expect(fixture.auth.getClaims).toHaveBeenCalledOnce();
    const row = (await admin.query('SELECT user_id,not_after FROM auth.sessions WHERE id=$1', [fixture.sessionId])).rows[0];
    expect(row.user_id).toBe(fixture.id); expect(row.not_after.getTime()).toBeLessThanOrEqual(before + 62000);
  });
  it("does not project forged or missing identities", async () => {
    const fixture = context(false);
    await expect(requireVerifiedSession(fixture.ctx)).rejects.toMatchObject({ status: 401 });
    expect((await admin.query('SELECT count(*)::int AS total FROM auth.users WHERE id=$1', [fixture.id])).rows[0].total).toBe(0);
  });
  it("rejects mismatched subjects and expired verified claims", async () => {
    const fixture = context(); fixture.auth.getClaims.mockResolvedValueOnce({ data: { claims: { sub: randomUUID() } }, error: null });
    await expect(requireVerifiedSession(fixture.ctx)).rejects.toMatchObject({ status: 401 });
    await expect(requireVerifiedSession(context(true, 1).ctx)).rejects.toMatchObject({ status: 401 });
  });
  it("cannot resurrect a locally revoked session", async () => {
    const fixture = context(), principal = await requireVerifiedSession(fixture.ctx);
    await revokeVerifiedLocalIdentity(principal);
    await expect(requireVerifiedSession(fixture.ctx)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects remote database targets and production-mode projection", async () => {
    const principal: VerifiedPrincipal = { userId: randomUUID(), authSessionId: randomUUID(), email: "verified@example.com", emailVerified: true, verifiedAt: new Date().toISOString() };
    const expiry = Math.floor(Date.now() / 1000) + 60;
    vi.stubEnv("LOCAL_AUTH_DATABASE_URL", "postgresql://pactum_local_identity:unused@example.com/pactum_local");
    await expect(projectVerifiedLocalIdentity(principal, expiry)).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("LOCAL_AUTH_DATABASE_URL", process.env.PACTUM_TEST_PROJECTION_URL!); vi.stubEnv("NODE_ENV", "production");
    await expect(projectVerifiedLocalIdentity(principal, expiry)).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("NODE_ENV", "test");
  });
});
