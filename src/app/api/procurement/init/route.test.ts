// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import { vi } from "vitest";
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";

describe("Procurement Init & Sourcing Intelligence API Route Tests", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it("sources quotes and returns evaluated and ranked vendor quotes for valid mandate", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/init", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Purchase 25 4K USB-C monitors under a $10,000 total budget, with delivery within 5 days and a minimum 30-day return policy.",
        currency: "USD",
        rawMandate: {
          itemQuery: "4K USB-C monitors",
          quantity: 25,
          maxTotalBudget: 10000,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          currency: "USD",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sessionId).toBeDefined();
    expect(data.quotes.length).toBe(3);
    expect(data.evaluations).toBeDefined();
    expect(data.rankedQuotes).toBeDefined();
    expect(data.hasEligibleQuotes).toBe(true);
    expect(data.sourcingSummary).toBeDefined();
    expect(data.sourcingSummary.totalQuotesEvaluated).toBe(3);
    expect(data.sourcingSummary.eligibleCount).toBe(3);

    // Verify session store has persisted evaluations
    const session = sessionStore.getSession(data.sessionId);
    expect(session).toBeDefined();
    expect(session?.quoteEvaluations).toBeDefined();
    expect(session?.sourcingSummary).toBeDefined();
  });

  it("marks quotes as ineligible when landed cost exceeds the mandate total budget", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/init", {
      method: "POST",
      body: JSON.stringify({
        rawMandate: {
          itemQuery: "4K USB-C monitors",
          quantity: 25,
          maxTotalBudget: 8500, // 25 * 375 + 150 = 9525 > 8500
          maxDeliveryDays: 5,
          minReturnDays: 30,
          currency: "USD",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.quotes.length).toBe(3);
    expect(data.hasEligibleQuotes).toBe(false);
    expect(data.sourcingSummary.ineligibleCount).toBe(3);
    expect(data.evaluations["vendor-apex-displays"].disqualificationReasons.some((r: string) => r.includes("exceeds maximum total budget"))).toBe(true);
  });

  it("evaluates uncatalogued category and returns 0 quotes with hasEligibleQuotes = false", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/init", {
      method: "POST",
      body: JSON.stringify({
        rawMandate: {
          itemQuery: "Industrial Centrifuges",
          quantity: 2,
          maxTotalBudget: 5000,
          maxDeliveryDays: 10,
          minReturnDays: 14,
          currency: "USD",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.quotes.length).toBe(0);
    expect(data.hasEligibleQuotes).toBe(false);
    expect(data.sourcingSummary.totalQuotesEvaluated).toBe(0);
  });

  it("rejects invalid mandate parameters with 422", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/init", {
      method: "POST",
      body: JSON.stringify({
        rawMandate: {
          itemQuery: "4K Monitors",
          quantity: -5, // invalid
          maxTotalBudget: -100, // invalid
          currency: "BITCOIN", // unsupported
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Mandate validation failed");
  });
});
