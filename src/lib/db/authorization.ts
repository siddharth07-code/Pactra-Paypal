import "server-only";
import { projectVerifiedLocalIdentity } from "@/lib/auth/local-identity";
import type { AuthContext } from "@/lib/auth/supabase-server";
import { requireAuthenticatedUser, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { AuthError, authConfiguration, providerError } from "@/lib/auth/config";
import { database, serializable, type Transaction } from "./client";
import { permitted, type Permission, type Role } from "@/lib/organizations/permissions";

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export interface VerifiedPrincipal extends AuthenticatedPrincipal { readonly authSessionId: string }
export interface OrganizationContext { readonly principal: VerifiedPrincipal; readonly organizationId: string; readonly userId: string; readonly role: Role }

export async function requireVerifiedSession(context: AuthContext): Promise<VerifiedPrincipal> {
  const principal = await requireAuthenticatedUser(context);
  const { data, error } = await context.client.auth.getClaims();
  providerError(error);
  const claims = data?.claims;
  if (!claims || claims.sub !== principal.userId || claims.iss !== `${authConfiguration().url}/auth/v1` || claims.aud !== "authenticated" || !isUuid(claims.session_id)) throw new AuthError(401, "AUTH_REQUIRED", "A verified authentication session is required.");
  const verified = Object.freeze({ ...principal, authSessionId: claims.session_id });
  await projectVerifiedLocalIdentity(verified, claims.exp);
  return verified;
}

export async function identityContext(tx: Transaction, principal: VerifiedPrincipal) {
  await tx.$executeRaw`SELECT set_config('app.auth_user_id', ${principal.userId}, true), set_config('app.auth_session_id', ${principal.authSessionId}, true)`;
  const active = await tx.$queryRaw<{ active: boolean }[]>`SELECT pactum.auth_session_active() AS active`;
  if (!active[0]?.active) throw new AuthError(401, "AUTH_REVOKED", "Authentication session is no longer active.");
  const user = await tx.user.upsert({ where: { authId: principal.userId }, create: { authId: principal.userId }, update: {} });
  if (user.disabledAt) throw new AuthError(403, "USER_DISABLED", "Application access is disabled.");
  await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`;
  return user;
}

export async function requireOrganizationMembership(tx: Transaction, principal: VerifiedPrincipal, organizationId: string): Promise<OrganizationContext> {
  if (!isUuid(organizationId)) throw new AuthError(400, "ORGANIZATION_REQUIRED", "Select a valid organization.");
  const user = await identityContext(tx, principal);
  await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
  // Serialize revocation/role updates with authorization acceptance. No provider calls in this transaction.
  await tx.$queryRaw`SELECT id FROM pactum."Organization" WHERE id = ${organizationId}::uuid FOR SHARE`;
  const membership = await tx.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } });
  if (!membership || membership.status !== "ACTIVE") throw new AuthError(404, "RESOURCE_NOT_FOUND", "Organization or resource not found.");
  const organization = await tx.organization.findFirst({ where: { id: organizationId } });
  if (!organization || organization.suspendedAt) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Organization or resource not found.");
  return { principal, organizationId, userId: user.id, role: membership.role };
}
export function requirePermission(context: OrganizationContext, permission: Permission) {
  if (!permitted(context.role, permission)) throw new AuthError(403, "PERMISSION_DENIED", "This operation is not permitted.");
}
export async function withOrganizationTransaction<T>(principal: VerifiedPrincipal, organizationId: string, permission: Permission, work: (tx: Transaction, context: OrganizationContext) => Promise<T>): Promise<T> {
  return serializable(database(), async tx => {
    const context = await requireOrganizationMembership(tx, principal, organizationId);
    requirePermission(context, permission);
    return work(tx, context);
  });
}
export async function requireSessionAccess(tx: Transaction, organizationId: string, publicId: string) {
  const row = await tx.procurementSession.findFirst({ where: { organizationId, publicId } });
  if (!row) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Session not found.");
  return row;
}
export async function requireFinancialOperationAccess(tx: Transaction, organizationId: string, operationId: string) {
  const row = await tx.financialOperation.findFirst({ where: { id: operationId, organizationId } });
  if (!row) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Financial operation not found.");
  return row;
}
