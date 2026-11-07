// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { computePersistenceChecksum } from "@/lib/persistence/session-persistence";
import { digest } from "@/lib/db/codec";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { database, serializable } from "@/lib/db/client";
import { identityContext, withOrganizationTransaction, type VerifiedPrincipal } from "@/lib/db/authorization";
import { PrismaSessionRepository } from "@/lib/persistence/prisma-session-repository";
import { AuthoritativeSessionStore } from "@/lib/session-store";
import { MemorySessionPersistenceAdapter } from "@/lib/persistence/session-persistence";
import type { OrganizationContext } from "@/lib/db/authorization";
import type { Role } from "@/lib/organizations/permissions";

import { NextRequest, NextResponse } from "next/server";
import * as authorization from "@/lib/db/authorization";
import { sessionStore } from "@/lib/session-store";
import { withBusinessRoute, workspaceScope } from "@/lib/db/business-route";
import { withRequestScope } from "@/lib/persistence/request-scope";
import { durablePayPalCall, providerRequestId } from "@/lib/db/financial-operations";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { withWorkerTransaction } from "@/lib/db/worker";
import { executeDatabaseIdempotency } from "@/lib/db/idempotency";
import { reconcilePendingOperations } from "@/lib/db/reconciliation";
import { computeAgreementHash } from "@/lib/fx-settlement";
import { withWebhookRoute } from "@/lib/db/webhook-route";
import { PayPalClient, WebhookVerificationUnavailableError } from "@/lib/paypal-client";
import type { PayPalOrderDetails } from "@/lib/paypal-client";
let admin: Client;
beforeAll(async () => {
  const url = new URL(process.env.PACTUM_TEST_ADMIN_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/pactum_disposable") throw new Error("Disposable database required.");
  admin = new Client({ connectionString: url.toString() }); await admin.connect();
  await database().$connect();
}, 30000);
afterAll(async () => { await database().$disconnect(); await database(true).$disconnect(); await admin?.end(); });

async function actor() {
  const principal: VerifiedPrincipal = { userId: randomUUID(), authSessionId: randomUUID(), email: `${randomUUID()}@example.com`, emailVerified: true, verifiedAt: new Date().toISOString() };
  await admin.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [principal.userId, principal.email]);
  await admin.query('INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,now()+interval \'1 day\')', [principal.authSessionId, principal.userId]);
  return principal;
}
async function organization() {
  const principal = await actor();
  const context = await serializable(database(), async tx => {
    const user = await identityContext(tx, principal);
    const organization = await tx.organization.create({ data: { name: "Disposable organization", slug: randomUUID(), createdBy: user.id } });
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    return { principal, organizationId: organization.id, userId: user.id, role: "OWNER" as const };
  });
  return context;
}
function draft(currency: "USD" | "INR" = "USD") {
  return new AuthoritativeSessionStore(new MemorySessionPersistenceAdapter()).createSession({ id: randomUUID(), rawPrompt: "Buy monitors", itemQuery: "Monitors", quantity: 2, maxTotalBudget: 1000, maxDeliveryDays: 5, minReturnDays: 14, requiredSpecs: [], currency, createdAt: new Date().toISOString() });
}
async function member(context: OrganizationContext, role: Role) {
  const principal = await actor();
  const user = await serializable(database(), tx => identityContext(tx, principal));
  await withOrganizationTransaction(context.principal, context.organizationId, "membership.manage", tx => tx.organizationMembership.create({ data: { organizationId: context.organizationId, userId: user.id, role } }));
  return principal;
}

describe("restricted PostgreSQL roles and tenant transactions", () => {
  it("uses a non-owner, non-superuser, non-bypass runtime role", async () => {
    const [role] = await database().$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    await expect(database().$executeRawUnsafe('CREATE TABLE pactum.forbidden_test(id int)')).rejects.toThrow();
  });
  it("creates an organization and provisions only its explicit owner", async () => {
    const context = await organization();
    const rows = await withOrganizationTransaction(context.principal, context.organizationId, "membership.manage", tx => tx.organizationMembership.findMany({ where: { organizationId: context.organizationId } }));
    expect(rows).toHaveLength(1); expect(rows[0].role).toBe("OWNER");
  });
  it("stores exact minor-unit money and preserves the protocol ID", async () => {
    const context = await organization(); const session = draft();
    await new PrismaSessionRepository(context, "session.write").save(session, null);
    const [loaded] = await new PrismaSessionRepository(context, "session.read").load(session.id);
    expect(loaded.session.id).toBe(session.id); expect(loaded.session.mandate.maxTotalBudget).toBe(1000);
    const row = await withOrganizationTransaction(context.principal, context.organizationId, "session.read", tx => tx.mandateRevision.findFirstOrThrow({ where: { organizationId: context.organizationId } }));
    expect(row.budgetMinor).toBe(100000n);
  });
  it("denies cross-tenant lookups and unscoped runtime enumeration", async () => {
    const first = await organization(), second = await organization(); const session = draft();
    await new PrismaSessionRepository(first, "session.write").save(session, null);
    await expect(new PrismaSessionRepository(second, "session.read").load(session.id)).rejects.toMatchObject({ status: 404 });
    expect(await database().procurementSession.findMany()).toEqual([]);
  });
  it("does not leak transaction-local tenant context to subsequent pooled queries", async () => {
    const context = await organization(); await new PrismaSessionRepository(context, "session.write").save(draft(), null);
    expect(await withOrganizationTransaction(context.principal, context.organizationId, "session.read", tx => tx.procurementSession.count())).toBe(1);
    expect(await database().procurementSession.count()).toBe(0);
  });
  it("rejects stale versions without overwriting a newer state", async () => {
    const context = await organization(), session = draft(); const repo = new PrismaSessionRepository(context, "session.write");
    await repo.save(session, null);
    const first = structuredClone(session), second = structuredClone(session);
    first.status = "SOURCING"; await repo.save(first, session.version!);
    second.status = "CANCELLED";
    await expect(repo.save(second, session.version!)).rejects.toMatchObject({ status: 409 });
    expect((await repo.load(session.id))[0].session.status).toBe("SOURCING");
  });
  it("serializes simultaneous updates through version predicates", async () => {
    const context = await organization(), session = draft(); const repo = new PrismaSessionRepository(context, "session.write"); await repo.save(session, null);
    const outcomes = await Promise.allSettled([repo.save({ ...session, status: "SOURCING" }, session.version!), repo.save({ ...session, status: "CANCELLED" }, session.version!)]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  });
  it("enforces last-owner protection in the actual database", async () => {
    const context = await organization();
    await expect(withOrganizationTransaction(context.principal, context.organizationId, "membership.manage", async tx => {
      const row = await tx.organizationMembership.findFirstOrThrow({ where: { organizationId: context.organizationId, userId: context.userId } });
      await tx.organizationMembership.update({ where: { id: row.id }, data: { role: "VIEWER" } });
    })).rejects.toThrow();
    expect((await withOrganizationTransaction(context.principal, context.organizationId, "membership.manage", tx => tx.organizationMembership.findMany({ where: { organizationId: context.organizationId } })))[0].role).toBe("OWNER");
  });
  it("revoked membership immediately loses resource access", async () => {
    const context = await organization(), principal = await member(context, "VIEWER");
    await withOrganizationTransaction(principal, context.organizationId, "session.read", async () => undefined);
    await admin.query(`UPDATE pactum."OrganizationMembership" SET status=\'REVOKED\',"revokedAt"=now() WHERE "organizationId"=$1 AND "userId"=(SELECT id FROM pactum."User" WHERE "authId"=$2)`, [context.organizationId, principal.userId]);
    await expect(withOrganizationTransaction(principal, context.organizationId, "session.read", async () => undefined)).rejects.toMatchObject({ status: 404 });
  });
  it("revoked authentication sessions fail before financial authorization", async () => {
    const context = await organization(); await admin.query('DELETE FROM auth.sessions WHERE id=$1', [context.principal.authSessionId]);
    await expect(withOrganizationTransaction(context.principal, context.organizationId, "payment.capture", async () => undefined)).rejects.toMatchObject({ status: 401 });
  });
  it("ADMIN cannot grant financial or owner roles", async () => {
    const context = await organization(), administrator = await member(context, "ADMIN"), viewer = await member(context, "VIEWER");
    await expect(withOrganizationTransaction(administrator, context.organizationId, "membership.manage", async tx => {
      const appUser = await admin.query('SELECT id FROM pactum."User" WHERE "authId"=$1', [viewer.userId]);
      await tx.organizationMembership.update({ where: { organizationId_userId: { organizationId: context.organizationId, userId: appUser.rows[0].id } }, data: { role: "FINANCE_MANAGER" } });
    })).rejects.toThrow();
  });
  it("rejects mutation of committed mandate bytes and rolls back the whole session", async () => {
    const context = await organization(), session = draft(); const repo = new PrismaSessionRepository(context, "session.write"); await repo.save(session, null);
    const corrupted = structuredClone(session); corrupted.mandate.maxTotalBudget = 900;
    await expect(repo.save(corrupted, session.version!)).rejects.toMatchObject({ status: 409 });
    expect((await repo.load(session.id))[0].session.mandate.maxTotalBudget).toBe(1000);
  });
  it("enforces composite tenant foreign keys", async () => {
    const first = await organization(), second = await organization(), session = draft(); const repo = new PrismaSessionRepository(first, "session.write"); await repo.save(session, null);
    const row = (await repo.load(session.id))[0];
    await expect(admin.query('INSERT INTO pactum."EvidenceRecord"(id,"organizationId","sessionId",kind,"evidenceKey","schemaVersion","canonicalBytes","payloadHash","updatedAt") VALUES($1,$2,$3,\'CHECKPOINT\',\'bad\',1,$4,$5,now())', [randomUUID(), second.organizationId, row.rowId, Buffer.from('{}'), 'a'.repeat(64)])).rejects.toThrow();
  });
});

function agreementSession(currency: "USD" | "INR" = "USD") {
  const s = draft(currency), now = new Date().toISOString();
  s.selectedQuote = { vendorId: "v", vendorName: "Vendor", sku: "MON", productTitle: "Monitor", initialUnitAsk: 500, currentUnitBid: 400, shippingCost: 0, deliveryDays: 3, returnDays: 30, condition: "NEW", status: "ACCEPTED", dataSource: "MOCK_CATALOG", currency };
  s.finalOffer = { unitPrice: 400, quantity: 2, shippingCost: 0, deliveryDays: 3, returnDays: 30, currency };
  s.agreementRecord = { agreementId: `agr_${s.id}`, sessionId: s.id, vendorId: "v", vendorName: "Vendor", sku: "MON", agreedPrice: 400, agreedOffer: { ...s.finalOffer }, totalCost: 800, currency, agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER", acceptingParty: "VENDOR", acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER", round: 3, mandateVersion: 1, acceptedAt: now };
  s.mandate.minReturnDays = 30;
  const recorder = CryptographicFlightRecorder.getOrReconstitute(s); s.flightRecord = recorder.exportFlightRecord();
  s.merkleRoot = s.preSettlementRoot = recorder.getRootHash();
  s.auditCertificate = new AcworldAuditor().audit({ session: s }); expect(s.auditCertificate.passed).toBe(true); s.status = "AUDIT_PASSED";
  return s;
}
function orderFor(s: ReturnType<typeof draft>, id: string): PayPalOrderDetails {
  return { id, status: "CREATED", intent: "AUTHORIZE", purchase_units: [{ amount: { value: "800.00", currency_code: "USD" }, custom_id: `VERIPAY_ROOT:${s.preSettlementRoot};SESSION:${s.id}`, payee: { merchant_id: "TEST-MERCHANT" } }] };
}
describe("durable intent and fencing", () => {
  it("commits intent before provider dispatch and binds stable request identity", async () => {
    const context = await organization(), s = agreementSession(), repo = new PrismaSessionRepository(context, "session.write"); await repo.save(s, null);
    const scope = workspaceScope(context, "payment.checkout", await repo.load(s.id));
    const execute = vi.fn(async () => {
      const rows = await admin.query('SELECT status,"providerRequestId" FROM pactum."FinancialOperation" WHERE "organizationId"=$1', [context.organizationId]);
      expect(rows.rows).toHaveLength(1); expect(rows.rows[0].status).toBe("SUBMITTING"); expect(providerRequestId()).toBe(rows.rows[0].providerRequestId);
      return { id: `ORDER-${randomUUID()}`, status: "CREATED", approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=offline" };
    });
    await withRequestScope(scope, () => durablePayPalCall("CREATE_ORDER", s.id, { totalAmount: 800, currency: "USD" }, execute, async result => orderFor(s, result.id)));
    expect(execute).toHaveBeenCalledTimes(1);
    const saved = (await repo.load(s.id))[0].session;
    expect(saved.status).toBe("AWAITING_PAYPAL_APPROVAL");
    expect((await admin.query('SELECT status FROM pactum."FinancialOperation" WHERE "organizationId"=$1', [context.organizationId])).rows[0].status).toBe("SUCCEEDED");
  });
  it("persists uncertainty and never redispatches a timed-out operation", async () => {
    const context = await organization(), s = agreementSession(), repo = new PrismaSessionRepository(context, "session.write"); await repo.save(s, null);
    const execute = vi.fn(async () => { throw new Error("timeout after send"); });
    for (let i = 0; i < 2; i++) {
      const scope = workspaceScope(context, "payment.checkout", await repo.load(s.id));
      await expect(withRequestScope(scope, () => durablePayPalCall("CREATE_ORDER", s.id, { totalAmount: 800, currency: "USD" }, execute, async () => orderFor(s, "UNCONFIRMED")))).rejects.toThrow();
    }
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await admin.query('SELECT status FROM pactum."FinancialOperation" WHERE "organizationId"=$1', [context.organizationId])).rows[0].status).toBe("UNCERTAIN");
  });
  it("denies financial dispatch following membership revocation", async () => {
    const context = await organization(), s = agreementSession(), repo = new PrismaSessionRepository(context, "session.write"); await repo.save(s, null);
    const finance = await member(context, "FINANCE_MANAGER");
    const financialContext = await withOrganizationTransaction(finance, context.organizationId, "payment.checkout", async (_tx, c) => c);
    const scope = workspaceScope(financialContext, "payment.checkout", await repo.load(s.id));
    await admin.query(`UPDATE pactum."OrganizationMembership" SET status='REVOKED' WHERE "organizationId"=$1 AND "userId"=$2`, [context.organizationId, financialContext.userId]);
    const execute = vi.fn();
    await expect(withRequestScope(scope, () => durablePayPalCall("CREATE_ORDER", s.id, { totalAmount: 800, currency: "USD" }, execute, async () => orderFor(s, "UNCONFIRMED")))).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it("fences a worker after its claim expires or is replaced", async () => {
    const context = await organization(), session = draft(), repo = new PrismaSessionRepository(context, "session.write"); await repo.save(session, null);
    const id = randomUUID(), token = randomUUID();
    await admin.query(`INSERT INTO pactum."WebhookEvent"(id,"organizationId","sessionPublicId","merchantId","providerEventId","eventType",payload,"payloadHash","verifiedAt",status,"leaseToken","leaseExpiresAt","updatedAt") VALUES($1,$2,$3,'TEST-MERCHANT',$4,'PAYMENT.CAPTURE.COMPLETED',$5,$6,now(),'PROCESSING',$7,now()+interval '1 minute',now())`, [id, context.organizationId, session.id, randomUUID(), Buffer.from('{}'), 'a'.repeat(64), token]);
    expect(await withWorkerTransaction(context.organizationId, id, token, tx => tx.procurementSession.count())).toBe(1);
    await admin.query('UPDATE pactum."WebhookEvent" SET "leaseToken"=$2 WHERE id=$1', [id, randomUUID()]);
    await expect(withWorkerTransaction(context.organizationId, id, token, tx => tx.procurementSession.count())).rejects.toMatchObject({ status: 409 });
  });
  it("durably replays idempotency and rejects a different payload", async () => {
    const context = await organization(), scope = workspaceScope(context, "session.write", []);
    const execute = vi.fn(async () => ({ status: 200, body: { local: true } }));
    const options = { scope: "test", key: randomUUID(), payload: { a: 1 }, execute };
    await withRequestScope(scope, async () => { await executeDatabaseIdempotency(options); await scope.flush(); expect((await executeDatabaseIdempotency(options)).isReplay).toBe(true); });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(withRequestScope(scope, () => executeDatabaseIdempotency({ ...options, payload: { a: 2 } }))).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("HTTP tenant boundary with real PostgreSQL authorization", () => {
  it("returns 404 for a foreign session before invoking the business handler", async () => {
    const first = await organization(), second = await organization(), session = draft();
    await new PrismaSessionRepository(first, "session.write").save(session, null);
    const verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(second.principal);
    try {
      const handler = vi.fn(async () => NextResponse.json({ leaked: true }));
      const response = await withBusinessRoute("session.read", handler)(new NextRequest(`https://pactum.example/api/procurement/sessions?sessionId=${session.id}`, { headers: { "x-organization-id": second.organizationId } }));
      expect(response.status).toBe(404); expect(handler).not.toHaveBeenCalled();
    } finally { verifier.mockRestore(); }
  });
  it("rejects a VIEWER mutation of a known tenant session with 403", async () => {
    const owner = await organization(), viewer = await member(owner, "VIEWER"), session = draft();
    await new PrismaSessionRepository(owner, "session.write").save(session, null);
    const verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(viewer);
    try {
      const handler = vi.fn(async () => NextResponse.json({ changed: true }));
      const response = await withBusinessRoute("session.write", handler)(new NextRequest("https://pactum.example/api/procurement/sessions", { method: "POST", headers: { "x-organization-id": owner.organizationId, origin: "https://pactum.example", "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.id, action: "lock" }) }));
      expect(response.status).toBe(403); expect(handler).not.toHaveBeenCalled();
    } finally { verifier.mockRestore(); }
  });
  it("hydrates the requested session from PostgreSQL rather than a global map", async () => {
    const context = await organization(), session = draft(); await new PrismaSessionRepository(context, "session.write").save(session, null);
    const verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(context.principal);
    try {
      const handler = async () => NextResponse.json({ session: sessionStore.getSession(session.id) });
      const response = await withBusinessRoute("session.read", handler)(new NextRequest(`https://pactum.example/api/procurement/sessions?sessionId=${session.id}`, { headers: { "x-organization-id": context.organizationId } }));
      expect(response.status).toBe(200); expect((await response.json()).session.id).toBe(session.id); expect(response.headers.get("cache-control")).toContain("no-store");
    } finally { verifier.mockRestore(); }
  });
});

describe("durable authenticated webhook processing", () => {
  it("preserves the full event, claims concurrent deliveries once, and commits receipt before success", async () => {
    const context = await organization(), session = agreementSession();
    session.paypalOrderId = `ORDER-${randomUUID()}`; session.status = "CAPTURE_PENDING_RECONCILIATION";
    const repo = new PrismaSessionRepository(context, "session.write"); await repo.save(session, null);
    const event = { id: `WH-${randomUUID()}`, event_type: "PAYMENT.CAPTURE.COMPLETED", extra: { preserved: true }, resource: { id: "CAPTURE-TEST", supplementary_data: { related_ids: { order_id: session.paypalOrderId } } } };
    const verifier = vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    const order = orderFor(session, session.paypalOrderId);
    order.purchase_units![0].payments = { captures: [{ id: "CAPTURE-TEST", status: "COMPLETED", amount: { value: "800.00", currency_code: "USD" } }] };
    const remote = vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(order);
    const handler = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      const s = sessionStore.getSession(session.id)!; s.paypalCaptureId = "CAPTURE-TEST"; s.captureAmount = 800; s.status = "PAYPAL_CAPTURED"; sessionStore.saveSession(s);
      return NextResponse.json({ processed: true });
    });
    const request = () => new NextRequest("https://pactum.example/api/paypal/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
    try {
      const outcomes = await Promise.all([withWebhookRoute(handler)(request()), withWebhookRoute(handler)(request())]);
      expect(outcomes.filter(r => r.status === 200)).toHaveLength(1); expect(handler).toHaveBeenCalledTimes(1);
      expect(verifier.mock.calls[0][0].webhookEvent).toEqual(event);
      expect((await repo.load(session.id))[0].session.status).toBe("PAYPAL_CAPTURED");
      const rows = await admin.query('SELECT status FROM pactum."WebhookEvent" WHERE "providerEventId"=$1', [event.id]); expect(rows.rows[0].status).toBe("PROCESSED");
      const duplicate = await withWebhookRoute(handler)(request()); expect(duplicate.status).toBe(200); expect(handler).toHaveBeenCalledTimes(1);
    } finally { verifier.mockRestore(); remote.mockRestore(); }
  });
  it("does not claim forged events or verification outages", async () => {
    const event = { id: randomUUID(), event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "UNKNOWN" } };
    const verifier = vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(false);
    const handler = vi.fn(async () => NextResponse.json({ processed: true }));
    const request = () => new NextRequest("https://pactum.example/api/paypal/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
    try {
      expect((await withWebhookRoute(handler)(request())).status).toBe(401);
      verifier.mockRejectedValue(new WebhookVerificationUnavailableError());
      expect((await withWebhookRoute(handler)(request())).status).toBe(503);
      expect(handler).not.toHaveBeenCalled(); expect((await admin.query('SELECT count(*)::int AS total FROM pactum."WebhookEvent" WHERE "providerEventId"=$1', [event.id])).rows[0].total).toBe(0);
    } finally { verifier.mockRestore(); }
  });
});

describe("capture concurrency and crash boundary", () => {
  it("captures once across concurrent request workspaces and persists exact settlement evidence", async () => {
    const context = await organization(), session = agreementSession();
    session.paypalOrderId = `ORDER-${randomUUID()}`; session.paypalAuthorizationId = `AUTH-${randomUUID()}`; session.status = "PAYPAL_AUTHORIZED";
    const repo = new PrismaSessionRepository(context, "session.write"); await repo.save(session, null);
    const scopes = await Promise.all([repo.load(session.id), repo.load(session.id)]);
    let captured = false;
    const execute = vi.fn(async () => { captured = true; return { id: `CAP-${randomUUID()}`, status: "COMPLETED", amount: { value: "800.00", currency_code: "USD" } }; });
    let responseId = "";
    const remote = async () => {
      const order = orderFor(session, session.paypalOrderId!);
      order.purchase_units![0].payments = { authorizations: [{ id: session.paypalAuthorizationId!, status: "CREATED", amount: { value: "800.00", currency_code: "USD" } }], captures: captured ? [{ id: responseId, status: "COMPLETED", amount: { value: "800.00", currency_code: "USD" } }] : [] };
      return order;
    };
    const dispatch = async () => { const result = await execute(); responseId = result.id; return result; };
    const outcomes = await Promise.allSettled(scopes.map(loaded => withRequestScope(workspaceScope(context, "payment.capture", loaded), () => durablePayPalCall("CAPTURE", session.paypalAuthorizationId!, { amount: { value: 800, currency: "USD" } }, dispatch, remote))));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(execute).toHaveBeenCalledTimes(1);
    const saved = (await repo.load(session.id))[0].session; expect(saved.paypalCaptureId).toBe(responseId); expect(saved.status).toBe("PAYPAL_CAPTURED");
    expect(CryptographicFlightRecorder.fromSerialized(saved.flightRecord!).verifyIntegrity().valid).toBe(true);
    const rows = await admin.query('SELECT "amountMinor",currency,"captureId" FROM pactum."Settlement" WHERE "organizationId"=$1', [context.organizationId]);
    expect(rows.rows[0]).toMatchObject({ amountMinor: "80000", currency: "USD", captureId: responseId });
    const verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(context.principal);
    try {
      const { POST: open } = await import("@/app/api/procurement/disputes/route");
      const { POST: packageEvidence } = await import("@/app/api/paypal/dispute/route");
      const request = (route: string, body: unknown) => new NextRequest(`https://pactum.example${route}`, { method: "POST", headers: { "x-organization-id": context.organizationId, origin: "https://pactum.example", "content-type": "application/json" }, body: JSON.stringify(body) });
      const opened = await open(request("/api/procurement/disputes", { sessionId: session.id, category: "SETTLEMENT_MISMATCH", description: "Verify local evidence packaging", refundRequested: false }));
      expect(opened.status).toBe(201); const disputeId = (await opened.json()).dispute.disputeId;
      const packaged = await packageEvidence(request("/api/paypal/dispute", { disputeId, submitToPayPal: true }));
      expect(packaged.status).toBe(200); const body = await packaged.json();
      expect(body.submissionStatus).toBe("EVIDENCE_PACKAGED_LOCAL_ONLY"); expect(body.paypalResponse.acknowledged).toBe(false);
    } finally { verifier.mockRestore(); }

  });
  it("leaves a committed intent recoverable when persistence fails after provider success", async () => {
    const context = await organization(), session = agreementSession(), repo = new PrismaSessionRepository(context, "session.write"); await repo.save(session, null);
    // Fault injection occurs only inside this disposable database, never a configured database.
    const functionName = `fault_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE FUNCTION pactum.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId"='${context.organizationId}'::uuid AND NEW.status='SUCCEEDED' THEN RAISE EXCEPTION 'injected persistence outage'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${functionName} BEFORE UPDATE ON pactum."FinancialOperation" FOR EACH ROW EXECUTE FUNCTION pactum.${functionName}()`);
    const execute = vi.fn(async () => ({ id: `ORDER-${randomUUID()}`, status: "CREATED", approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=offline" }));
    try {
      const scope = workspaceScope(context, "payment.checkout", await repo.load(session.id));
      await expect(withRequestScope(scope, () => durablePayPalCall("CREATE_ORDER", session.id, { totalAmount: 800, currency: "USD" }, execute, async r => orderFor(session, r.id)))).rejects.toMatchObject({ status: 503 });
      expect((await admin.query('SELECT status FROM pactum."FinancialOperation" WHERE "organizationId"=$1', [context.organizationId])).rows[0].status).toBe("SUBMITTING");
      expect((await repo.load(session.id))[0].session.paypalOrderId).toBeUndefined();
    } finally { await admin.query(`DROP TRIGGER ${functionName} ON pactum."FinancialOperation"; DROP FUNCTION pactum.${functionName}()`); }
    const scope = workspaceScope(context, "payment.checkout", await repo.load(session.id));
    await expect(withRequestScope(scope, () => durablePayPalCall("CREATE_ORDER", session.id, { totalAmount: 800, currency: "USD" }, execute, async r => orderFor(session, r.id)))).rejects.toMatchObject({ status: 409 });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("organization membership races and invitation identity", () => {
  it("accepts an invitation only for the verified auth email and exact role", async () => {
    const owner = await organization(), recipient = await actor();
    const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    await withOrganizationTransaction(owner.principal, owner.organizationId, "membership.manage", tx => tx.organizationInvitation.create({ data: { organizationId: owner.organizationId, email: recipient.email, role: "VIEWER", tokenHash, invitedBy: owner.userId, expiresAt: new Date(Date.now() + 60000) } }));
    await serializable(database(), async tx => {
      const user = await identityContext(tx, recipient);
      await tx.$executeRaw`SELECT set_config('app.invitation_hash', ${tokenHash}, true),set_config('app.organization_id',${owner.organizationId},true)`;
      const invitation = await tx.organizationInvitation.findUniqueOrThrow({ where: { tokenHash } });
      await tx.organizationMembership.create({ data: { organizationId: owner.organizationId, userId: user.id, role: "VIEWER" } });
      await tx.organizationInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date(), acceptedBy: user.id } });
    });
    expect(await withOrganizationTransaction(recipient, owner.organizationId, "session.read", async (_tx, context) => context.role)).toBe("VIEWER");
    const stranger = await actor();
    await serializable(database(), async tx => {
      await identityContext(tx, stranger); await tx.$executeRaw`SELECT set_config('app.invitation_hash', ${tokenHash}, true)`;
      expect(await tx.organizationInvitation.findUnique({ where: { tokenHash } })).toBeNull();
    });
  });
  it("cannot remove both owners through simultaneous requests", async () => {
    const first = await organization(), second = await member(first, "OWNER");
    const secondContext = await withOrganizationTransaction(second, first.organizationId, "membership.manage", async (_tx, context) => context);
    const outcomes = await Promise.allSettled([first, secondContext].map(context => withOrganizationTransaction(context.principal, context.organizationId, "membership.manage", tx => tx.organizationMembership.update({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.userId } }, data: { role: "VIEWER", version: { increment: 1 } } }))));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await admin.query(`SELECT count(*)::int AS total FROM pactum."OrganizationMembership" WHERE "organizationId"=$1 AND role='OWNER' AND status='ACTIVE'`, [first.organizationId])).rows[0].total).toBe(1);
  });
});

describe("reconciliation worker recovery", () => {
  it("recovers an exact completed capture without issuing another capture", async () => {
    const context = await organization(), session = agreementSession();
    session.paypalOrderId = `ORDER-${randomUUID()}`; session.paypalAuthorizationId = `AUTH-${randomUUID()}`; session.status = "CAPTURE_PENDING_RECONCILIATION";
    const repo = new PrismaSessionRepository(context, "session.write"); await repo.save(session, null);
    const [loaded] = await repo.load(session.id);
    const operation = await withOrganizationTransaction(context.principal, context.organizationId, "payment.capture", tx => tx.financialOperation.create({ data: { organizationId: context.organizationId, sessionId: loaded.rowId, kind: "CAPTURE", logicalKey: randomUUID(), merchantId: "TEST-MERCHANT", providerRequestId: `capture-${session.paypalAuthorizationId}`, authorizationId: session.paypalAuthorizationId, amountMinor: 80000n, currency: "USD", agreementHash: computeAgreementHash(session.agreementRecord!), evidenceRoot: session.preSettlementRoot!, requestedBy: context.userId, status: "UNCERTAIN", leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() - 60000), request: Buffer.from('{}') } }));
    const order = orderFor(session, session.paypalOrderId!);
    order.purchase_units![0].payments = { captures: [{ id: "RECOVERED-CAPTURE", status: "COMPLETED", amount: { value: "800.00", currency_code: "USD" } }], authorizations: [{ id: session.paypalAuthorizationId!, status: "CAPTURED", amount: { value: "800.00", currency_code: "USD" } }] };
    const remote = vi.spyOn(PayPalClient.prototype as unknown as { performGetOrder(id: string): Promise<PayPalOrderDetails> }, "performGetOrder").mockResolvedValue(order);
    const capture = vi.spyOn(PayPalClient.prototype, "capturePayment").mockRejectedValue(new Error("must never dispatch"));
    try {
      const outcomes = await reconcilePendingOperations(); expect(outcomes.find(item => item.operationId === operation.id)?.status).toBe("CONFIRMED_CAPTURE");
      expect(capture).not.toHaveBeenCalled(); expect((await repo.load(session.id))[0].session.paypalCaptureId).toBe("RECOVERED-CAPTURE");
    } finally { remote.mockRestore(); capture.mockRestore(); }
  });
});

describe("legacy import tool against a disposable database", () => {
  it("dry-runs without writes and imports digest-idempotently while retaining exact source bytes", async () => {
    const context = await organization(), session = draft();
    const data = { sessions: [session], mandateHistory: { [session.id]: [session.mandate] } };
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, checksum: computePersistenceChecksum(data), data }, null, 2));
    const directory = await mkdtemp(path.join(os.tmpdir(), "pactum-import-test-"));
    try {
      const source = path.join(directory, "snapshot.json"), mapping = path.join(directory, "mapping.json");
      await writeFile(source, bytes); await writeFile(mapping, JSON.stringify({ sourceDigest: digest(bytes), sessions: { [session.id]: context.organizationId } }));
      const run = async (apply: boolean) => promisify(execFile)(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/migration/legacy.ts", source, mapping, ...(apply ? ["--apply"] : [])], { env: { ...process.env, PACTUM_LEGACY_IMPORT_APPROVED: "1", MIGRATION_DATABASE_URL: process.env.PACTUM_TEST_ADMIN_URL }, timeout: 15000 });
      await run(false);
      expect((await admin.query('SELECT count(*)::int AS total FROM pactum."ProcurementSession" WHERE "publicId"=$1', [session.id])).rows[0].total).toBe(0);
      await run(true); await run(true);
      expect((await new PrismaSessionRepository(context, "session.read").load(session.id))[0].session.id).toBe(session.id);
      const rows = await admin.query(`SELECT "originalBytes" FROM pactum."MigrationSourceRecord" WHERE "sourceType"='SNAPSHOT_BYTES' AND "sourceDigest"=$1`, [digest(bytes)]);
      expect(rows.rows).toHaveLength(1); expect(rows.rows[0].originalBytes.equals(bytes)).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30000);
});

describe("database-backed organization and INR procurement workflows", () => {
  const request = (path: string, organizationId: string, body?: unknown) => new NextRequest(`https://pactum.example${path}`, { method: body ? "POST" : "GET", headers: { "x-organization-id": organizationId, origin: "https://pactum.example", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  it("onboards and switches organizations through the actual HTTP handlers", async () => {
    const principal = await actor(), verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(principal);
    try {
      const { POST: create, GET: list } = await import("@/app/api/organizations/route");
      const { POST: select } = await import("@/app/api/organizations/switch/route");
      const created = await create(request("/api/organizations", "", { name: "HTTP local workflow" }));
      expect(created.status).toBe(201); const id = (await created.json()).organization.id;
      const switched = await select(request("/api/organizations/switch", "", { organizationId: id }));
      expect(switched.status).toBe(200); expect(switched.headers.get("set-cookie")).toContain("HttpOnly");
      expect((await (await list(request("/api/organizations", id))).json()).active.role).toBe("OWNER");
      expect((await select(request("/api/organizations/switch", "", { organizationId: randomUUID() }))).status).toBe(404);
    } finally { verifier.mockRestore(); }
  });
  it("persists a new sourced procurement and mandate lock through HTTP", async () => {
    const context = await organization(), verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(context.principal);
    const { Channel3Client, DETERMINISTIC_FIXTURE_QUOTES } = await import("@/lib/channel3-client");
    const source = vi.spyOn(Channel3Client.prototype, "sourceQuotes").mockResolvedValue({ quotes: structuredClone(DETERMINISTIC_FIXTURE_QUOTES), isFixture: true, dataSource: "MOCK_CATALOG", timestamp: new Date().toISOString() });
    try {
      const { POST: init } = await import("@/app/api/procurement/init/route");
      const { POST: mutate } = await import("@/app/api/procurement/sessions/route");
      const response = await init(request("/api/procurement/init", context.organizationId, { rawMandate: { itemQuery: "monitors", quantity: 2, maxTotalBudget: 1000, currency: "USD", maxDeliveryDays: 5, minReturnDays: 14 } }));
      expect(response.status).toBe(200); const body = await response.json();
      const repo = new PrismaSessionRepository(context, "session.read");
      expect((await repo.load(body.sessionId))[0].session.status).toBe("SOURCING");
      const locked = await mutate(request("/api/procurement/sessions", context.organizationId, { sessionId: body.sessionId, action: "lock" }));
      expect(locked.status).toBe(200); expect((await repo.load(body.sessionId))[0].session.mandate.isLocked).toBe(true);
    } finally { verifier.mockRestore(); source.mockRestore(); }
  });
  it("persists INR FX quote, lock, authoritative verification and unchanged Merkle evidence", async () => {
    vi.stubEnv("FX_PROVIDER", "DETERMINISTIC_DEMO");
    const context = await organization(), session = agreementSession("INR"), repo = new PrismaSessionRepository(context, "session.write");
    await repo.save(session, null);
    const verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(context.principal);
    try {
      const { POST: quote } = await import("@/app/api/fx/quote/route"); const { POST: lock } = await import("@/app/api/fx/lock/route");
      const quoted = await quote(request("/api/fx/quote", context.organizationId, { sessionId: session.id }));
      expect(quoted.status).toBe(200);
      const [before] = await repo.load(session.id); expect(before.session.fxRecord?.status).toBe("QUOTED");
      const hash = before.session.fxRecord!.conversionHash;
      const locked = await lock(request("/api/fx/lock", context.organizationId, { sessionId: session.id, quoteId: before.session.fxRecord!.id }));
      expect(locked.status).toBe(200);
      const saved = (await repo.load(session.id))[0].session;
      expect(saved.fxRecord?.conversionHash).toBe(hash); expect(saved.fxRecord?.status).toBe("LOCKED"); expect(saved.fxVerification?.passed).toBe(true);
      expect(saved.agreementRecord?.currency).toBe("INR"); expect(CryptographicFlightRecorder.fromSerialized(saved.flightRecord!).verifyIntegrity().valid).toBe(true);
      const { GET: evidence } = await import("@/app/api/procurement/evidence/route");
      expect((await evidence(request(`/api/procurement/evidence?sessionId=${session.id}`, context.organizationId))).status).toBe(200);
    } finally { verifier.mockRestore(); vi.unstubAllEnvs(); }
  });
});

describe("negotiation checkpoint persistence", () => {
  it("isolates sourcing idempotency keys and durable replays across organizations", async () => {
    const a = await organization(), b = await organization();
    const execute = vi.fn(async () => ({ status: 200, body: { marker: randomUUID() } }));
    const submit = async (context: OrganizationContext) => {
      const scope = workspaceScope(context, "session.write", []);
      return withRequestScope(scope, async () => {
        const result = await executeDatabaseIdempotency({ scope: "SESSION_CREATE", key: "same-key-in-two-tenants", payload: { request: "same sourcing input" }, execute });
        await scope.flush(); return result;
      });
    };
    const firstA = await submit(a), firstB = await submit(b);
    expect(firstA.body).not.toEqual(firstB.body);
    expect((await submit(a)).body).toEqual(firstA.body);
    expect((await submit(b)).body).toEqual(firstB.body);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("preserves exact agreement amounts, failed-run history and checkpoint rollback", async () => {
    const context = await organization(), session = draft(), repo = new PrismaSessionRepository(context, "session.write");
    const { DETERMINISTIC_FIXTURE_QUOTES } = await import("@/lib/channel3-client");
    const { GeminiNegotiationClient } = await import("@/lib/gemini-client");
    const { NegotiationOrchestrator } = await import("@/lib/negotiation-orchestrator");
    session.mandate.quantity = 25; session.mandate.maxTotalBudget = 8500; session.mandate.maxDeliveryDays = 5; session.mandate.minReturnDays = 30;
    session.quotes = [structuredClone(DETERMINISTIC_FIXTURE_QUOTES[2])]; session.status = "SOURCING";
    await repo.save(session, null);
    const client = new GeminiNegotiationClient({ apiKey: "" });
    vi.spyOn(client, "generateBuyerOffer").mockResolvedValue({ unitPrice: 273.6, deliveryDays: 1, returnDays: 60, message: "Test offer", tacticalRationale: "Offline test", generator: "DETERMINISTIC_FALLBACK" });
    const scope = workspaceScope(context, "negotiation.start", await repo.load(session.id));
    const persist = scope.persist.bind(scope);
    scope.persist = async candidate => { if (candidate.agreementRecord) throw new Error("Injected final checkpoint failure"); return persist(candidate); };
    const events: string[] = [];
    await expect(withRequestScope(scope, () => new NegotiationOrchestrator({ geminiClient: client, onEvent: event => { events.push(event.type); } }).runNegotiation(session.mandate, session.quotes, session.id))).rejects.toThrow("Injected final checkpoint failure");
    const failed = (await repo.load(session.id))[0].session;
    expect(failed.status).toBe("NEGOTIATING"); expect(failed.turns.length).toBeGreaterThan(0); expect(failed.agreementRecord).toBeUndefined(); expect(failed.negotiationFailure?.reference).toBeTruthy();
    expect(scope.store.getSession(session.id)?.agreementRecord).toBeUndefined(); expect(events).not.toContain("NEGOTIATION_COMPLETED");
    const retry = workspaceScope(context, "negotiation.start", await repo.load(session.id));
    await withRequestScope(retry, () => new NegotiationOrchestrator({ geminiClient: client }).runNegotiation(failed.mandate, failed.quotes, session.id));
    const saved = (await repo.load(session.id))[0].session;
    const { minor } = await import("@/lib/db/codec");
    const agreement = saved.agreementRecord!;
    expect(minor(agreement.totalCost)).toBe(minor(agreement.agreedOffer.unitPrice) * BigInt(agreement.agreedOffer.quantity) + minor(agreement.agreedOffer.shippingCost));
    expect(saved.negotiationFailure).toBeUndefined(); expect(saved.negotiationHistory?.at(-1)?.turns).toEqual(failed.turns);
  });
  const request = (path: string, organizationId: string, body?: unknown) => new NextRequest(`https://pactum.example${path}`, { method: body ? "POST" : "GET", headers: { "x-organization-id": organizationId, origin: "https://pactum.example", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  it("persists deterministic negotiation checkpoints without Gemini or long-running database transactions", async () => {
    const context = await organization(), session = draft(), repo = new PrismaSessionRepository(context, "session.write");
    const { DETERMINISTIC_FIXTURE_QUOTES } = await import("@/lib/channel3-client");
    const { GeminiNegotiationClient } = await import("@/lib/gemini-client");
    const { NegotiationOrchestrator } = await import("@/lib/negotiation-orchestrator");
    session.quotes = structuredClone(DETERMINISTIC_FIXTURE_QUOTES); session.status = "SOURCING";
    session.merchantAttestation = {
      merchantUrl: "https://vendor.example.com",
      returnPolicyText: "30-day return policy",
      timestamp: new Date().toISOString(),
    };
    await repo.save(session, null);
    const scope = workspaceScope(context, "negotiation.start", await repo.load(session.id));
    const orchestrator = new NegotiationOrchestrator({ geminiClient: new GeminiNegotiationClient({ apiKey: "" }), maxRounds: 4 });
    const result = await withRequestScope(scope, () => orchestrator.runNegotiation(session.mandate, session.quotes, session.id));
    expect(result.completed).toBe(true);

    const saved = (await repo.load(session.id))[0].session;
    expect(saved.version).toBeGreaterThan(session.version!);
    expect(saved.merkleRoot).toBe(result.merkleTree.getRootHash());
    expect(saved.turns.length).toBe(result.session.turns.length);
    expect(saved.turns.length).toBeGreaterThan(0);

    const verifier = vi.spyOn(authorization, "requireVerifiedSession").mockResolvedValue(context.principal);
    try {
      const { POST: audit } = await import("@/app/api/procurement/audit/route");
      const auditRes = await audit(request("/api/procurement/audit", context.organizationId, { sessionId: session.id }));
      expect(auditRes.status).toBe(200);

      const audited = (await repo.load(session.id))[0].session;
      expect(audited.auditCertificate?.passed).toBe(true);
      expect(CryptographicFlightRecorder.fromSerialized(audited.flightRecord!).verifyIntegrity().valid).toBe(true);
    } finally {
      verifier.mockRestore();
    }
  });
});
