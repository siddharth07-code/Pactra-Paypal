import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAuthContext, type AuthContext } from "@/lib/auth/supabase-server";
import { authFailure, boundedJson, privateResponse, requireSameOrigin } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/config";
import { requireVerifiedSession, withOrganizationTransaction } from "./authorization";
import { requirePermission } from "./authorization";
import type { Permission } from "@/lib/organizations/permissions";
import { AuthoritativeSessionStore } from "@/lib/session-store";
import { MemorySessionPersistenceAdapter } from "@/lib/persistence/session-persistence";
import { PrismaSessionRepository, persistAggregate } from "@/lib/persistence/prisma-session-repository";
import { withRequestScope, type RequestScope } from "@/lib/persistence/request-scope";
import { digest, encodeSession } from "./codec";
import type { ProcurementSession } from "@/types/pactum";
import { withWorkerTransaction } from "./worker";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { minor } from "./codec";

export function withBusinessRoute(permission: Permission, handler: (req: NextRequest) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    let auth: AuthContext | undefined;
    try {
      auth = createAuthContext(request);
      const principal = await requireVerifiedSession(auth);
      if (request.method !== "GET") requireSameOrigin(request);
      const organizationId = request.headers.get("x-organization-id") ?? request.cookies.get("pactum-organization")?.value ?? "";
      let body: Record<string, unknown> = {};
      if (request.method !== "GET") {
        body = await boundedJson(request.clone(), 65536);
      }
      const actualPermission = request.nextUrl.pathname.endsWith("/sessions") && request.method === "POST" && body.action === "history" ? "session.read" : permission;
      const context = await withOrganizationTransaction(principal, organizationId, "session.read", async (_tx, context) => context);
      const repo = new PrismaSessionRepository(context, "session.read");
      const id = body.sessionId ?? request.nextUrl.searchParams.get("sessionId") ?? request.nextUrl.searchParams.get("id") ?? undefined;
      const disputeId = body.disputeId ?? request.nextUrl.searchParams.get("disputeId") ?? undefined;
      if ((id !== undefined && (typeof id !== "string" || id.length > 128)) || (disputeId !== undefined && (typeof disputeId !== "string" || disputeId.length > 128))) throw new AuthError(400, "INVALID_RESOURCE_ID", "Invalid resource identifier.");
      const loaded = await repo.load(id as string | undefined, disputeId as string | undefined);
      requirePermission(context, actualPermission);
      if (permission === "dispute.open" && request.method === "POST" && loaded[0] && !["PAYPAL_CAPTURED", "SETTLED", "DISPUTED"].includes(loaded[0].session.status)) throw new AuthError(409, "DISPUTE_LIFECYCLE", "Disputes require a captured transaction.");
      const scope = workspaceScope(context, actualPermission, loaded);
      const result = await withRequestScope(scope, async () => {
        const response = await handler(request);
        if (!(response.headers.get("content-type") ?? "").startsWith("text/event-stream")) await scope.flush();
        return response;
      });
      if (context.role === "VIEWER" && request.nextUrl.pathname.endsWith("/sessions") && result.ok) {
        const value = await result.json() as { session?: ProcurementSession; sessions?: ProcurementSession[] };
        const summary = (s: ProcurementSession) => ({ id: s.id, status: s.status, createdAt: s.createdAt, updatedAt: s.updatedAt, itemQuery: s.mandate.itemQuery, currency: s.mandate.currency });
        return auth.finish(NextResponse.json(value.session ? { session: summary(value.session), summaryOnly: true } : { sessions: (value.sessions ?? []).map(summary), summaryOnly: true }));
      }
      const response = new NextResponse(result.body, { status: result.status, headers: result.headers });
      return auth.finish(response);
    } catch (error) {
      const response = authFailure(error);
      return auth ? auth.finish(response) : privateResponse(response);
    }
  };
}

export function workspaceScope(context: RequestScope["organization"], permission: Permission, loaded: { session: ProcurementSession; version: number; rowId: string; history?: import("@/types/pactum").ProcurementMandate[] }[], worker?: RequestScope["worker"]): RequestScope {
  const versions = new Map(loaded.map(row => [row.session.id, row.version]));
  const hashes = new Map(loaded.map(row => [row.session.id, digest(encodeSession(row.session))]));
  const references = new Set<ProcurementSession>();
  const adapter = new MemorySessionPersistenceAdapter();
  adapter.save({ sessions: loaded.map(row => row.session), mandateHistory: Object.fromEntries(loaded.map(row => [row.session.id, row.history ?? [row.session.mandate]])) });
  const store = new AuthoritativeSessionStore(adapter);
  let tail = Promise.resolve();
  const scope: RequestScope = {
    organization: context, permission, store, completions: [], orders: new Map(), verifiedCaptures: new Map(), worker,
    transaction(work) {
      if (worker) return withWorkerTransaction(context.organizationId, worker.jobId, worker.token, work);
      if (!context.principal) throw new AuthError(403, "AUTH_REQUIRED", "User authorization is required.");
      return withOrganizationTransaction(context.principal, context.organizationId, permission, tx => work(tx));
    },
    acceptCommitted(session) {
      versions.set(session.id, session.version!);
      hashes.set(session.id, digest(encodeSession(session)));
      for (const reference of references) if (reference.id === session.id) Object.assign(reference, structuredClone(session));
      const next = new MemorySessionPersistenceAdapter();
      next.save({ sessions: store.getAllSessions().map(s => s.id === session.id ? session : s), mandateHistory: Object.fromEntries(store.getAllSessions().map(s => [s.id, store.getMandateHistory(s.id)])) });
      store.setAdapter(next);
    },
    async persist(session) {
      references.add(session);
      if (permission === "negotiation.start") await scope.flush();
    },
    flush() {
      const operation = async () => {
        const pending = worker?.outcome === "FAILED" ? [] : store.getAllSessions().filter(session => digest(encodeSession(session)) !== hashes.get(session.id));
        if (!pending.length && !scope.completions.length && !worker?.outcome) return;
        await scope.transaction(async tx => {
          for (const session of pending) {
            if (worker?.outcome === "PROCESSED" && session.status === "PAYPAL_CAPTURED" && session.flightRecord) {
              const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
              recorder.recordEvent("SETTLEMENT_RECONCILED", { sessionId: session.id, paypalCaptureId: session.paypalCaptureId, providerEventId: worker.eventId, amountMinor: session.fxRecord?.targetAmountMinor?.toString() ?? minor(session.captureAmount!).toString(), currency: session.fxRecord?.targetCurrency ?? session.mandate.currency }, { mandateVersion: session.mandate.version ?? 1, agreementId: session.agreementRecord?.agreementId, timestamp: new Date().toISOString() });
              session.flightRecord = recorder.exportFlightRecord(); session.postAuditRoot = recorder.getRootHash();
            }
            await persistAggregate(tx, context, session, versions.get(session.id) ?? null);
          }
          if (worker?.receipt && worker.boundSessionId) {
            const row = await tx.procurementSession.findFirstOrThrow({ where: { organizationId: context.organizationId, publicId: worker.boundSessionId } });
            const key = { organizationId: context.organizationId, sessionId: row.id, kind: "WEBHOOK_RECEIPT", evidenceKey: worker.eventId! };
            const old = await tx.evidenceRecord.findUnique({ where: { sessionId_organizationId_kind_evidenceKey: key } });
            if (old && old.payloadHash !== digest(worker.receipt)) throw new AuthError(409, "WEBHOOK_RECEIPT_CONFLICT", "Webhook evidence differs from the committed event.");
            if (!old) await tx.evidenceRecord.create({ data: { ...key, schemaVersion: 1, canonicalBytes: worker.receipt, payloadHash: digest(worker.receipt) } });
          }
          for (const completion of scope.completions) await tx.idempotencyRecord.update({ where: { id: completion.id, organizationId: context.organizationId, executionId: completion.executionId, status: "IN_PROGRESS" }, data: { status: completion.status, responseStatus: completion.responseStatus, response: completion.response, version: { increment: 1 } } });
          if (worker?.outcome) await tx.webhookEvent.update({ where: { id: worker.jobId, leaseToken: worker.token, status: "PROCESSING", leaseExpiresAt: { gt: new Date() } }, data: { status: worker.outcome, processedAt: worker.outcome === "PROCESSED" ? new Date() : null, version: { increment: 1 } } });
        });
        scope.completions.splice(0);
        if (worker) { worker.outcome = undefined; worker.receipt = undefined; }
        for (const session of pending) {
          versions.set(session.id, session.version!);
          hashes.set(session.id, digest(encodeSession(session)));
          for (const reference of references) if (reference.id === session.id) reference.version = session.version;
        }
        const next = new MemorySessionPersistenceAdapter();
        next.save({ sessions: store.getAllSessions().map(session => pending.find(s => s.id === session.id) ?? session), mandateHistory: Object.fromEntries(store.getAllSessions().map(session => [session.id, store.getMandateHistory(session.id)])) });
        store.setAdapter(next);
      };
      const next = tail.then(operation);
      tail = next.catch(() => undefined);
      return next;
    },
  };
  return scope;
}
