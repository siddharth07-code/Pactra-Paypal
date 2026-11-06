// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { MemorySessionPersistenceAdapter } from "@/lib/persistence/session-persistence";
import { POST } from "./route";

vi.mock("@/lib/rate-limiter", () => ({
  defaultRateLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) },
}));

describe("mandate lock API lifecycle protection", () => {
  beforeEach(() => {
    sessionStore.setAdapter(new MemorySessionPersistenceAdapter());
  });

  function createSession() {
    return sessionStore.createSession({
      id: "mandate-lock-api", rawPrompt: "Buy monitors", itemQuery: "Monitors",
      quantity: 1, maxTotalBudget: 100, maxDeliveryDays: 5, minReturnDays: 14,
      requiredSpecs: [], currency: "USD", createdAt: new Date().toISOString(),
    });
  }

  function lock(sessionId: string) {
    return POST(new NextRequest("http://localhost/api/procurement/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock", sessionId }),
    }));
  }

  it("returns the versioned locked session for a valid draft", async () => {
    const session = createSession();
    const response = await lock(session.id);
    expect(response.status).toBe(200);
    expect((await response.json()).session).toMatchObject({
      status: "NEGOTIATING", version: session.version! + 1, mandate: { isLocked: true },
    });
  });

  it("returns conflict and preserves a cancelled session", async () => {
    const session = createSession();
    session.status = "CANCELLED";
    sessionStore.saveSession(session);
    const response = await lock(session.id);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("CANCELLED");
    expect(sessionStore.getSession(session.id)).toEqual(session);
  });

  it("returns conflict for a competing operation without releasing its lock", async () => {
    const session = createSession();
    sessionStore.acquireLock(session.id);
    try {
      expect((await lock(session.id)).status).toBe(409);
      expect(sessionStore.isLocked(session.id)).toBe(true);
      expect(sessionStore.getSession(session.id)).toEqual(session);
    } finally {
      sessionStore.releaseLock(session.id);
    }
  });

  it("retains not-found responses for unknown sessions", async () => {
    expect((await lock("missing")).status).toBe(404);
  });

  it("returns server failure and preserves state when persistence fails", async () => {
    const session = createSession();
    const save = vi.spyOn(sessionStore.getAdapter(), "save").mockImplementationOnce(() => {
      throw new Error("Disk unavailable");
    });
    try {
      expect((await lock(session.id)).status).toBe(500);
      expect(sessionStore.getSession(session.id)).toEqual(session);
      expect(sessionStore.isLocked(session.id)).toBe(false);
    } finally {
      save.mockRestore();
    }
  });
});
