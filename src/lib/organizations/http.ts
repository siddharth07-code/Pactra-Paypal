import "server-only";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAuthContext, type AuthContext } from "@/lib/auth/supabase-server";
import { authFailure, boundedJson, requireSameOrigin } from "@/lib/auth/http";
import { AuthError, authConfiguration } from "@/lib/auth/config";
import { database, serializable, reportDatabaseFailure } from "@/lib/db/client";
import { identityContext, isUuid, requireVerifiedSession, withOrganizationTransaction } from "@/lib/db/authorization";
import { roles, canGrant, permissions, permitted, type Role } from "./permissions";

export async function organizationRoute(request: NextRequest, action: "list" | "create" | "switch" | "members" | "change" | "invite" | "accept") {
  let auth: AuthContext | undefined;
  let stage = "authentication_configuration";
  try {
    const limit = await defaultRateLimiter.check(request, "GENERAL_DEFAULT");
    if (!limit.allowed) return limit.response!;
    auth = createAuthContext(request);
    stage = "session_verification";
    const principal = await requireVerifiedSession(auth);
    stage = "organization_database";
    if (request.method !== "GET") requireSameOrigin(request);
    const body = request.method === "GET" ? {} : await boundedJson(request);
    const organizationId = request.headers.get("x-organization-id") ?? request.cookies.get("pactum-organization")?.value ?? "";
    if (action === "list") {
      const memberships = await serializable(database(), async tx => {
        const user = await identityContext(tx, principal);
        return tx.organizationMembership.findMany({ where: { userId: user.id, status: "ACTIVE", organization: { suspendedAt: null } }, include: { organization: true } });
      });
      const organizations = memberships.map(m => ({ id: m.organizationId, name: m.organization.name, role: m.role, permissions: Object.keys(permissions).filter(p => permitted(m.role, p as keyof typeof permissions)) }));
      return auth.finish(NextResponse.json({ organizations, active: organizations.find(org => org.id === organizationId) ?? null }));
    }
    if (action === "create") {
      if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 100) throw new AuthError(400, "INVALID_ORGANIZATION", "Organization name must have 2–100 characters.");
      const organization = await serializable(database(), async tx => {
        const user = await identityContext(tx, principal);
        const org = await tx.organization.create({ data: { name: (body.name as string).trim(), slug: randomUUID(), createdBy: user.id } });
        await tx.$executeRaw`SELECT set_config('app.organization_id', ${org.id}, true)`;
        await tx.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
        return { id: org.id, name: org.name };
      });
      const response = NextResponse.json({ organization }, { status: 201 });
      selectOrganization(response, organization.id);
      return auth.finish(response);
    }
    if (action === "switch") {
      if (!isUuid(body.organizationId)) throw new AuthError(400, "INVALID_ORGANIZATION", "Select a valid organization.");
      await withOrganizationTransaction(principal, body.organizationId, "session.read", async () => undefined);
      const response = NextResponse.json({ success: true });
      selectOrganization(response, body.organizationId);
      return auth.finish(response);
    }
    if (action === "accept") {
      if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) throw new AuthError(400, "INVALID_INVITATION", "Invalid invitation.");
      const tokenHash = createHash("sha256").update(body.token).digest("hex");
      const org = await serializable(database(), async tx => {
        const user = await identityContext(tx, principal);
        await tx.$executeRaw`SELECT set_config('app.invitation_hash', ${tokenHash}, true)`;
        const invitation = await tx.organizationInvitation.findUnique({ where: { tokenHash } });
        if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now() || invitation.email !== principal.email.toLowerCase()) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Invitation is unavailable.");
        await tx.$queryRaw`SELECT id FROM pactum."OrganizationInvitation" WHERE id=${invitation.id}::uuid FOR UPDATE`;
        await tx.$executeRaw`SELECT set_config('app.organization_id', ${invitation.organizationId}, true)`;
        await tx.organizationMembership.create({ data: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role } });
        await tx.organizationInvitation.update({ where: { id: invitation.id, version: invitation.version }, data: { acceptedAt: new Date(), acceptedBy: user.id, version: { increment: 1 } } });
        return invitation.organizationId;
      });
      const response = NextResponse.json({ success: true, organizationId: org });
      selectOrganization(response, org);
      return auth.finish(response);
    }
    const result = await withOrganizationTransaction(principal, organizationId, "membership.manage", async (tx, context) => {
      if (action === "members") return { memberships: await tx.organizationMembership.findMany({ where: { organizationId } }), invitations: await tx.organizationInvitation.findMany({ where: { organizationId }, select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true } }) };
      if (action === "invite") {
        if (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || !roles.includes(body.role as Role) || !canGrant(context.role, body.role as Role)) throw new AuthError(403, "PERMISSION_DENIED", "Invitation role is not permitted.");
        const token = randomBytes(32).toString("hex");
        await tx.organizationInvitation.create({ data: { organizationId, email: body.email.toLowerCase(), role: body.role as Role, invitedBy: context.userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86400000) } });
        // Local invitation creation only: no claim that an email was sent.
        return { invitationToken: token, delivery: "MANUAL_LOCAL_ONLY" };
      }
      if (body.action === "revokeInvitation") {
        if (!isUuid(body.invitationId)) throw new AuthError(400, "INVALID_INVITATION", "Invalid invitation.");
        const invitation = await tx.organizationInvitation.findFirst({ where: { id: body.invitationId, organizationId } });
        if (!invitation || !canGrant(context.role, invitation.role)) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Invitation not found.");
        await tx.organizationInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date(), version: { increment: 1 } } });
        return { success: true };
      }
      if (!isUuid(body.membershipId) || !Number.isSafeInteger(body.version)) throw new AuthError(400, "INVALID_MEMBERSHIP", "Membership ID and version are required.");
      const membership = await tx.organizationMembership.findFirst({ where: { organizationId, id: body.membershipId } });
      if (!membership) throw new AuthError(404, "RESOURCE_NOT_FOUND", "Membership not found.");
      if (!canGrant(context.role, membership.role) || (body.action !== "revoke" && (!roles.includes(body.role as Role) || !canGrant(context.role, body.role as Role)))) throw new AuthError(403, "PERMISSION_DENIED", "Role change is not permitted.");
      await tx.organizationMembership.update({ where: { id: membership.id, version: body.version as number }, data: body.action === "revoke" ? { status: "REVOKED", revokedAt: new Date(), version: { increment: 1 } } : { role: body.role as Role, version: { increment: 1 } } });
      return { success: true };
    });
    return auth.finish(NextResponse.json(result));
  } catch (error) {
    if (process.env.VERCEL === "1" && (!(error instanceof AuthError) || error.status >= 500)) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      console.error("[Organizations] request failed", JSON.stringify({ stage, code: /^(?:P[0-9]{4}|AUTH_[A-Z_]+|DATABASE_[A-Z_]+)$/.test(code) ? code : "UNEXPECTED_ERROR" }));
    }
    if (stage === "organization_database" && !(error instanceof AuthError)) {
      reportDatabaseFailure(error, "role_preflight");
      error = new AuthError(503, "DATABASE_UNAVAILABLE", "Organization database access is temporarily unavailable.");
    }
    const response = authFailure(error); return auth ? auth.finish(response) : response;
  }
}

function selectOrganization(response: NextResponse, id: string) {
  response.cookies.set("pactum-organization", id, { httpOnly: true, secure: authConfiguration().secure, sameSite: "lax", path: "/" });
}
