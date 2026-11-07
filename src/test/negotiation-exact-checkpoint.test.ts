import { afterEach, describe, expect, it, vi } from "vitest";
import { NegotiationOrchestrator } from "@/lib/negotiation-orchestrator";
import { GeminiNegotiationClient } from "@/lib/gemini-client";
import { DETERMINISTIC_FIXTURE_QUOTES } from "@/lib/channel3-client";
import * as sessions from "@/lib/session-store";
import { encodeSession, minor } from "@/lib/db/codec";
import type { ProcurementMandate, ProcurementSession } from "@/types/pactum";

afterEach(() => vi.restoreAllMocks());
describe("negotiation exact-money database checkpoint regression", () => {
  it("releases the run lock when currency validation rejects the request", async () => {
    const mandate: ProcurementMandate = { id: "currency-mandate", itemQuery: "Monitors", quantity: 25, maxTotalBudget: 8500, maxDeliveryDays: 5, minReturnDays: 30, currency: "USD", requiredSpecs: [], rawPrompt: "Test", createdAt: new Date().toISOString() };
    const orchestrator = new NegotiationOrchestrator({ geminiClient: new GeminiNegotiationClient({ apiKey: "" }) });
    await expect(orchestrator.runNegotiation(mandate, [{ ...DETERMINISTIC_FIXTURE_QUOTES[0], currency: "INR" }], "currency-session")).rejects.toThrow("Currency mismatch");
    expect(NegotiationOrchestrator.activeNegotiationLocks.has("currency-session")).toBe(false);
  });
  it("commits a valid cent-priced agreement without floating-point residue", async () => {
    sessions.sessionStore.clear();
    const mandate: ProcurementMandate = { id: "exact-mandate", itemQuery: "4K USB-C monitors", quantity: 25, maxTotalBudget: 8500, maxDeliveryDays: 5, minReturnDays: 30, currency: "USD", requiredSpecs: [], rawPrompt: "Test procurement", createdAt: new Date().toISOString() };
    const client = new GeminiNegotiationClient({ apiKey: "" });
    vi.spyOn(client, "generateBuyerOffer").mockResolvedValue({ unitPrice: 273.6, deliveryDays: 1, returnDays: 60, message: "We offer these commercial terms.", tacticalRationale: "Test offer", generator: "DETERMINISTIC_FALLBACK" });
    const checkpoint = sessions.saveSessionCheckpoint;
    const attempts: ProcurementSession[] = [];
    vi.spyOn(sessions, "saveSessionCheckpoint").mockImplementation(async session => {
      attempts.push(structuredClone(session));
      encodeSession(session);
      await checkpoint(session);
    });
    const events: string[] = [];
    const orchestrator = new NegotiationOrchestrator({ geminiClient: client, onEvent: event => { events.push(event.type); } });
    const result = await orchestrator.runNegotiation(mandate, [structuredClone(DETERMINISTIC_FIXTURE_QUOTES[2])]);
    expect(result.completed).toBe(true);
    expect(result.session.agreementRecord?.totalCost).toBe(7269.5);
    expect(minor(result.session.agreementRecord!.totalCost)).toBe(726950n);
    expect(events.at(-1)).toBe("NEGOTIATION_COMPLETED");
    expect(attempts.at(-1)?.agreementRecord).toBeDefined();
  });
});
