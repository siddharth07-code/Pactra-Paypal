import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { AuthError } from "./config";
import type { VerifiedPrincipal } from "@/lib/db/authorization";

let client: PrismaClient | undefined;
export function localIdentityProjectionEnabled() { return process.env.LOCAL_IDENTITY_PROJECTION === "verified_supabase"; }
function localClient() {
  try {
    if (process.env.NODE_ENV === "production") throw new Error();
    const url = new URL(process.env.LOCAL_AUTH_DATABASE_URL ?? "");
    const runtime = new URL(process.env.DATABASE_URL ?? "");
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.pathname !== "/pactum_local" || url.username !== "pactum_local_identity" || url.search || url.hash || runtime.hostname !== url.hostname || runtime.port !== url.port || runtime.pathname !== url.pathname) throw new Error();
    return client ??= new PrismaClient({ datasources: { db: { url: url.toString() } } });
  } catch { throw new AuthError(503, "LOCAL_AUTH_CONFIGURATION", "The local verified identity projection is not configured safely."); }
}
/** Called only after Supabase getUser AND cryptographically verified getClaims succeed.
 * No JWT decoding, test identity, password store, membership grant or remote database access.
 */
export async function projectVerifiedLocalIdentity(principal: VerifiedPrincipal, expiresAt: unknown) {
  if (!localIdentityProjectionEnabled()) return;
  if (!Number.isSafeInteger(expiresAt) || Number(expiresAt) * 1000 <= Date.now()) throw new AuthError(401, "AUTH_EXPIRED", "A current verified authentication token is required.");
  // Bound long-running transaction/checkpoint access; each new HTTP request verifies with Supabase again.
  const notAfter = new Date(Math.min(Number(expiresAt) * 1000, Date.now() + 60000));
  try {
    await localClient().$transaction(async tx => {
      const [role] = await tx.$queryRaw<{ allowed: boolean }[]>`SELECT (current_user='pactum_local_identity' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) AS allowed FROM pg_roles WHERE rolname=current_user`;
      if (!role?.allowed) throw new AuthError(503, "LOCAL_AUTH_ROLE", "Restricted local identity credentials are required.");
      const users = await tx.$queryRaw<{ id: string }[]>`INSERT INTO auth.users(id,email) VALUES(${principal.userId}::uuid,${principal.email}) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email WHERE auth.users.deleted_at IS NULL RETURNING id`;
      if (!users.length) throw new AuthError(401, "AUTH_REVOKED", "Local application identity is disabled.");
      const sessions = await tx.$queryRaw<{ id: string }[]>`INSERT INTO auth.sessions(id,user_id,not_after) VALUES(${principal.authSessionId}::uuid,${principal.userId}::uuid,${notAfter}) ON CONFLICT(id) DO UPDATE SET not_after=EXCLUDED.not_after WHERE auth.sessions.user_id=EXCLUDED.user_id AND auth.sessions.revoked_at IS NULL RETURNING id`;
      if (!sessions.length) throw new AuthError(401, "AUTH_REVOKED", "Local application session is revoked.");
    }, { timeout: 5000 });
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(503, "LOCAL_AUTH_UNAVAILABLE", "Local verified identity persistence is unavailable.");
  }
}
export async function revokeVerifiedLocalIdentity(principal: VerifiedPrincipal) {
  if (!localIdentityProjectionEnabled()) return;
  try { await localClient().$executeRaw`UPDATE auth.sessions SET not_after=now(),revoked_at=now() WHERE id=${principal.authSessionId}::uuid AND user_id=${principal.userId}::uuid`; }
  catch { throw new AuthError(503, "LOCAL_AUTH_UNAVAILABLE", "Local session revocation could not be committed."); }
}
