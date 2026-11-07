import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const dependencies = vi.hoisted(() => ({ scope: {} as object | undefined, database: vi.fn(), retainedStore: vi.fn() }));
// Route domain test; real authentication, tenant authorization and RLS have separate suites.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/persistence/request-scope", () => ({ requestScope: () => dependencies.scope }));
vi.mock("@/lib/db/idempotency", () => ({ executeDatabaseIdempotency: dependencies.database }));
vi.mock("@/lib/idempotency", async importOriginal => ({ ...await importOriginal<object>(), defaultIdempotencyStore: { executeIdempotent: dependencies.retainedStore } }));
vi.mock("@/lib/rate-limiter", () => ({ defaultRateLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) } }));
import { POST } from "@/app/api/procurement/init/route";
function request() { return new NextRequest("http://localhost:3000/api/procurement/init", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "same-request" }, body: JSON.stringify({ prompt: "Monitor request", rawMandate: { itemQuery: "Monitors", quantity: 2, maxTotalBudget: 1000, maxDeliveryDays: 5, minReturnDays: 30, currency: "USD" } }) }); }
beforeEach(() => {
  dependencies.scope = {};
  dependencies.database.mockReset().mockResolvedValue({ status: 200, body: { sessionId: "saved-request" }, isReplay: false });
  dependencies.retainedStore.mockReset().mockRejectedValue(new Error("An authorized database scope is required for idempotency."));
});
describe("sourcing idempotency authority", () => {
  it("uses current-request database authority even when a retained facade sees stale context", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(dependencies.database).toHaveBeenCalledWith(expect.objectContaining({ scope: "SESSION_CREATE", key: "same-request" }));
    expect(dependencies.retainedStore).not.toHaveBeenCalled();
  });
  it("preserves durable replay responses", async () => {
    dependencies.database.mockResolvedValue({ status: 200, body: { sessionId: "original-request" }, isReplay: true });
    const response = await POST(request());
    expect(await response.json()).toEqual({ sessionId: "original-request" });
    expect(response.headers.get("X-Idempotent-Replay")).toBe("true");
  });
  it("does not silently create a local result when authorized scope is absent", async () => {
    dependencies.scope = undefined;
    expect((await POST(request())).status).toBe(500);
    expect(dependencies.database).not.toHaveBeenCalled();
  });
});
