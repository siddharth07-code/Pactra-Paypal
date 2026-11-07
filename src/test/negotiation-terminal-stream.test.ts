import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { AuthError } from "@/lib/auth/config";
import { DETERMINISTIC_FIXTURE_QUOTES } from "@/lib/channel3-client";
import type { ProcurementMandate } from "@/types/pactum";
const engine = vi.hoisted(() => ({ run: vi.fn(), candidates: true }));
// Domain transport tests; authentication/RLS boundaries are exercised separately.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/rate-limiter", () => ({ defaultRateLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) } }));
vi.mock("@/lib/sourcing-evaluator", () => ({ SourcingEvaluator: class { async evaluateSourcedQuotes(_mandate: unknown, quotes: unknown[]) { return { evaluations: {}, negotiationCandidates: engine.candidates ? quotes : [], eligibleQuotes: [], summary: { ineligibleCount: engine.candidates ? 0 : quotes.length, reviewCount: 0 } }; } } }));
vi.mock("@/lib/negotiation-orchestrator", () => ({ NegotiationOrchestrator: class { constructor(private options: { onEvent: (event: unknown) => unknown }) {} runNegotiation(...args: unknown[]) { return engine.run(this.options.onEvent, ...args); } } }));
import { POST } from "@/app/api/negotiate/stream/route";
const mandate: ProcurementMandate = { id: "stream-mandate", itemQuery: "Monitors", quantity: 25, maxTotalBudget: 8500, maxDeliveryDays: 5, minReturnDays: 30, currency: "USD", requiredSpecs: [], rawPrompt: "Test mandate", createdAt: new Date().toISOString() };
function request(id: string, clientSessionId = "client-a") { return new NextRequest("http://localhost/api/negotiate/stream", { method: "POST", body: JSON.stringify({ sessionId: id, clientSessionId }) }); }
beforeEach(() => { sessionStore.clear(); engine.run.mockReset(); engine.candidates = true; });
function saved() { return sessionStore.createSession(mandate, structuredClone(DETERMINISTIC_FIXTURE_QUOTES)); }
describe("negotiation terminal SSE integrity", () => {
  it("emits a safe failure with diagnostic reference and no fabricated completion", async () => {
    engine.run.mockRejectedValue(new AuthError(503, "DATABASE_UNAVAILABLE", "private stack and secret should never be sent"));
    const body = await (await POST(request(saved().id))).text();
    expect(body).toContain("event: NEGOTIATION_FAILED"); expect(body).toContain('"code":"DATABASE_UNAVAILABLE"'); expect(body).toContain('"reference":');
    expect(body).not.toContain("private stack"); expect(body).not.toContain("NEGOTIATION_COMPLETED");
  });
  it("does not mistake a missing terminal result for success", async () => {
    engine.run.mockResolvedValue({ completed: false });
    const body = await (await POST(request(saved().id))).text();
    expect(body).toContain("NEGOTIATION_FAILED"); expect(body).not.toContain("NEGOTIATION_COMPLETED");
  });
  it("emits exactly one completed result", async () => {
    engine.run.mockImplementation(async emit => { await emit({ type: "NEGOTIATION_COMPLETED", payload: { outcome: "NO_DEAL" } }); return { completed: false }; });
    const body = await (await POST(request(saved().id))).text();
    expect(body.match(/event: NEGOTIATION_COMPLETED/g)).toHaveLength(1); expect(body).not.toContain("NEGOTIATION_FAILED");
  });
  it("keeps policy blocking distinct from unexpected failure", async () => {
    engine.candidates = false;
    const body = await (await POST(request(saved().id))).text();
    expect(body).toContain("NEGOTIATION_ABORTED"); expect(body).toContain("SOURCING_POLICY_BLOCKED"); expect(body).not.toContain("NEGOTIATION_FAILED"); expect(engine.run).not.toHaveBeenCalled();
  });
  it("does not emit contradictory terminal results after a committed completion", async () => {
    engine.run.mockImplementation(async emit => { await emit({ type: "NEGOTIATION_COMPLETED", payload: { outcome: "NO_DEAL" } }); throw new Error("post-terminal failure"); });
    const body = await (await POST(request(saved().id))).text();
    expect(body.match(/event: NEGOTIATION_COMPLETED/g)).toHaveLength(1); expect(body).not.toContain("event: NEGOTIATION_FAILED");
  });
  it("retains the run claim until cancelled work actually exits", async () => {
    let finish!: () => void;
    engine.run.mockImplementation(async emit => { await new Promise<void>(resolve => { finish = resolve; }); await emit({ type: "ROUND_STARTED", payload: { round: 1 } }); });
    const id = saved().id; const response = await POST(request(id));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await response.body!.cancel();
    expect((await POST(request(id, "other-client"))).status).toBe(409);
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    engine.run.mockImplementation(async emit => { await emit({ type: "NEGOTIATION_ABORTED", payload: { reason: "Test stopped" } }); });
    const retry = await POST(request(id)); expect(retry.status).toBe(200); await retry.text();
  });
  it("uses the authoritative session identity for duplicate protection", async () => {
    let finish!: () => void;
    engine.run.mockImplementation(async emit => { await new Promise<void>(resolve => { finish = resolve; }); await emit({ type: "NEGOTIATION_ABORTED", payload: { reason: "Test stopped" } }); return { completed: false }; });
    const id = saved().id; const first = await POST(request(id, "first-client"));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const duplicate = await POST(request(id, "different-client")); expect(duplicate.status).toBe(409);
    finish(); await first.text(); expect(engine.run).toHaveBeenCalledOnce();
  });
});
