// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/reconciliation", () => ({ reconcilePendingOperations: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/rate-limiter", () => ({ defaultRateLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) } }));
import { GET } from "./route";
import { reconcilePendingOperations } from "@/lib/db/reconciliation";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Vercel reconciliation cron", () => {
  it("accepts authenticated GET requests and prevents caching", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const response = await GET(new NextRequest("https://pactra.example/api/cron/reconcile", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(reconcilePendingOperations).toHaveBeenCalledOnce();
  });
  it("denies unauthenticated GET before accessing worker operations", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    expect((await GET(new NextRequest("https://pactra.example/api/cron/reconcile"))).status).toBe(401);
    expect(reconcilePendingOperations).not.toHaveBeenCalled();
  });
});
