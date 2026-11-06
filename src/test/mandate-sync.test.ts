// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import { vi } from "vitest";
import { describe, it, expect, beforeEach } from "vitest";
import { POST as streamPOST } from "@/app/api/negotiate/stream/route";
import { POST as initPOST } from "@/app/api/procurement/init/route";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { NextRequest } from "next/server";
import type { ProcurementMandate } from "@/types/pactum";

describe("Mandate Input Synchronization & Session Reuse Tests", () => {
  beforeEach(() => {
    sessionStore.clear();
    defaultRateLimiter.resetAll();
  });

  it("accepts custom structured rawMandate and establishes negotiation stream with custom values", async () => {
    const rawMandate: Partial<ProcurementMandate> = {
      itemQuery: "Ergonomic 4K OLED Monitors",
      quantity: 15,
      maxTotalBudget: 6200,
      maxDeliveryDays: 3,
      minReturnDays: 45,
      currency: "USD",
    };

    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Purchase 15 Ergonomic 4K OLED Monitors under $6,200",
        rawMandate,
      }),
    });

    const res = await streamPOST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.body).toBeDefined();

    // Consume stream chunks to let asynchronous negotiation session initialize
    const reader = res.body!.getReader();
    let chunkCount = 0;
    while (true) {
      const { done } = await reader.read();
      if (done || chunkCount > 5) break;
      chunkCount++;
    }

    // Verify session in store was created with the custom structured constraints
    const sessions = sessionStore.getAllSessions();
    expect(sessions.length).toBeGreaterThan(0);
    const created = sessions[0];
    expect(created.mandate.quantity).toBe(15);
    expect(created.mandate.maxTotalBudget).toBe(6200);
    expect(created.mandate.maxDeliveryDays).toBe(3);
    expect(created.mandate.minReturnDays).toBe(45);
    expect(created.mandate.itemQuery).toBe("Ergonomic 4K OLED Monitors");
  });

  it("rejects non-positive quantity in structured mandate with 422", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Test mandate",
        rawMandate: {
          itemQuery: "Monitors",
          quantity: 0,
          maxTotalBudget: 5000,
        },
      }),
    });

    const res = await streamPOST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("Quantity must be a positive integer");
  });

  it("rejects non-positive budget in structured mandate with 422", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Test mandate",
        rawMandate: {
          itemQuery: "Monitors",
          quantity: 10,
          maxTotalBudget: -100,
        },
      }),
    });

    const res = await streamPOST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("Maximum budget must be a positive number");
  });

  it("rejects invalid delivery SLA in structured mandate with 422", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Test mandate",
        rawMandate: {
          itemQuery: "Monitors",
          quantity: 10,
          maxTotalBudget: 5000,
          maxDeliveryDays: 0,
        },
      }),
    });

    const res = await streamPOST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("Max delivery days must be at least 1");
  });

  it("rejects negative return window in structured mandate with 422", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Test mandate",
        rawMandate: {
          itemQuery: "Monitors",
          quantity: 10,
          maxTotalBudget: 5000,
          minReturnDays: -5,
        },
      }),
    });

    const res = await streamPOST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("Min return days must be non-negative");
  });

  it("reuses pre-initialized procurement session without duplicate sourcing calls", async () => {
    // 1. Initialize session via /api/procurement/init (as done in Sourcing preview)
    const initReq = new NextRequest("http://localhost:3000/api/procurement/init", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Procure 10 Enterprise Workstation Laptops under $4,000 total budget",
        rawMandate: {
          itemQuery: "Enterprise Workstation Laptops",
          quantity: 10,
          maxTotalBudget: 4000,
          maxDeliveryDays: 4,
          minReturnDays: 30,
          currency: "USD",
        },
      }),
    });

    const initRes = await initPOST(initReq);
    expect(initRes.status).toBe(200);
    const initData = await initRes.json();
    expect(initData.sessionId).toBeDefined();
    expect(initData.quotes.length).toBe(3);

    const initialSessionCount = sessionStore.getAllSessions().length;
    expect(initialSessionCount).toBe(1);

    // 2. Commencing negotiation stream passing the existing sessionId
    const streamReq = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        sessionId: initData.sessionId,
      }),
    });

    const streamRes = await streamPOST(streamReq);
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get("Content-Type")).toContain("text/event-stream");

    // Consume stream chunks
    const reader = streamRes.body!.getReader();
    let chunkCount = 0;
    while (true) {
      const { done } = await reader.read();
      if (done || chunkCount > 5) break;
      chunkCount++;
    }

    // Proves that no extra duplicate session was created
    const afterSessionCount = sessionStore.getAllSessions().length;
    expect(afterSessionCount).toBe(1);

    const session = sessionStore.getSession(initData.sessionId);
    expect(session).toBeDefined();
    expect(session?.mandate.quantity).toBe(10);
    expect(session?.mandate.maxTotalBudget).toBe(4000);
  });
});
