import { describe, it, expect } from "vitest";
import { NegotiationOrchestrator } from "./negotiation-orchestrator";
import { DETERMINISTIC_FIXTURE_QUOTES } from "./channel3-client";
import type { ProcurementMandate } from "../types/pactum";

describe("Negotiation Orchestrator Unit Tests", () => {
  const mandate: ProcurementMandate = {
    id: "mandate-demo-orch",
    rawPrompt: "Purchase 25 4K USB-C monitors under $8,500 total budget",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  it("orchestrates 3 vendors over 4 rounds and emits required stream events", async () => {
    const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const orchestrator = new NegotiationOrchestrator({
      maxRounds: 4,
      onEvent: (event) => {
        emittedEvents.push(event);
      },
    });

    const result = await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES);

    expect(result.completed).toBe(true);
    expect(result.selectedQuote).toBeDefined();
    expect(result.totalCost).toBeDefined();
    expect(result.totalCost!).toBeLessThanOrEqual(mandate.maxTotalBudget);

    // Verify events were emitted
    const eventTypes = emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain("SESSION_INITIALIZED");
    expect(eventTypes).toContain("ROUND_STARTED");
    expect(eventTypes).toContain("BUYER_PROPOSAL");
    expect(eventTypes).toContain("VENDOR_COUNTEROFFER");
    expect(eventTypes).toContain("ROUND_COMPLETED");
    expect(eventTypes).toContain("NEGOTIATION_COMPLETED");

    // Verify deliberate demo intervention triggered in Round 2 with Vendor B (DisplayWorld)
    const interventionEvents = emittedEvents.filter((e) => e.type === "GUARDRAIL_INTERVENTION");
    expect(interventionEvents.length).toBeGreaterThanOrEqual(1);
    expect(interventionEvents[0].payload.vendorId).toBe("vendor-displayworld");
    expect(interventionEvents[0].payload.round).toBe(2);

    // Verify Merkle tree commitment of all rounds and root generation
    const root = result.merkleTree.getRootHash();
    expect(root).toBeDefined();
    expect(root.length).toBe(64);
    expect(result.session.merkleRoot).toBe(root);

    const auditNodes = result.merkleTree.getAuditNodes();
    expect(auditNodes.length).toBeGreaterThanOrEqual(6); // Mandate + Sourcing + 4 rounds
    expect(auditNodes.some((n) => n.eventType === "MANDATE_LOCKED")).toBe(true);
    expect(auditNodes.some((n) => n.eventType === "CHANNEL3_CATALOG_SNAPSHOT")).toBe(true);
    expect(auditNodes.some((n) => n.eventType === "VERIFIED_NEGOTIATION_ROUND")).toBe(true);
  });
});
