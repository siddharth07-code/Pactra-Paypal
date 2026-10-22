import { describe, it, expect, vi } from "vitest";
import { NegotiationOrchestrator } from "./negotiation-orchestrator";
import { DETERMINISTIC_FIXTURE_QUOTES } from "./channel3-client";
import { GeminiNegotiationClient } from "./gemini-client";
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

  it("orchestrates 3 vendors over 4 rounds and emits required stream events with provenance", async () => {
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
    expect(interventionEvents[0].payload.generator).toBe("DETERMINISTIC_FALLBACK");

    // Step 4 & 19: Verify provenance in BUYER_PROPOSAL events and turns
    const proposalEvents = emittedEvents.filter((e) => e.type === "BUYER_PROPOSAL");
    expect(proposalEvents.length).toBeGreaterThan(0);
    for (const pe of proposalEvents) {
      expect(pe.payload.generator).toBe("DETERMINISTIC_FALLBACK");
      expect(pe.payload.turn).toBeDefined();
      const turn = pe.payload.turn as { generator?: string };
      expect(turn.generator).toBe("DETERMINISTIC_FALLBACK");
    }

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

  // 17. Guardrail rejection and bounded regeneration
  it("records rejected turn on guardrail intervention and executes bounded regeneration", async () => {
    const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const orchestrator = new NegotiationOrchestrator({
      maxRounds: 4,
      onEvent: (event) => {
        emittedEvents.push(event);
      },
    });

    const result = await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES);

    // Verify that turns list contains the rejected turn and the subsequently approved turn
    const displayWorldTurns = result.session.turns.filter(
      (t) => t.vendorId === "vendor-displayworld" && t.round === 2 && t.actor === "BUYER"
    );

    // Should have 1 rejected turn and 1 approved turn after bounded regeneration
    expect(displayWorldTurns.length).toBe(2);
    expect(displayWorldTurns[0].guardrailStatus).toBe("GUARDRAIL_INTERVENTION");
    expect(displayWorldTurns[1].guardrailStatus).toBe("APPROVED");
    expect(displayWorldTurns[0].generator).toBe("DETERMINISTIC_FALLBACK");
    expect(displayWorldTurns[1].generator).toBe("DETERMINISTIC_FALLBACK");
  });

  // 18. No duplicate proposal or evidence commitment after timeout or retry
  it("prevents duplicate proposal or evidence commitment when live client times out", async () => {
    // Mock a Gemini client whose generateContent hangs and times out
    const mockHangingContent = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000))
    );

    const timeoutGeminiClient = new GeminiNegotiationClient({
      timeoutMs: 30, // 30ms timeout
      aiClient: {
        models: {
          generateContent: mockHangingContent,
        },
      },
    });

    const orchestrator = new NegotiationOrchestrator({
      geminiClient: timeoutGeminiClient,
      maxRounds: 2, // 2 rounds for fast test
    });

    const result = await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES.slice(0, 1));

    expect(result.completed).toBe(true);
    // In round 1, for 1 vendor: exactly 1 approved BUYER turn and 1 VENDOR turn
    const r1Turns = result.session.turns.filter((t) => t.round === 1);
    const r1BuyerApproved = r1Turns.filter((t) => t.actor === "BUYER" && t.guardrailStatus === "APPROVED");
    expect(r1BuyerApproved.length).toBe(1);

    // Merkle tree should have exactly 4 nodes: MANDATE_LOCKED, CHANNEL3_CATALOG_SNAPSHOT, ROUND 1, ROUND 2
    const nodes = result.merkleTree.getAuditNodes();
    expect(nodes.length).toBe(4);
  });

  // 19. Backward compatibility and live provenance
  it("propagates GEMINI_LIVE provenance through orchestrator and SSE payload when live client succeeds", async () => {
    const mockLiveContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        unitPrice: 310.0,
        deliveryDays: 3,
        returnDays: 45,
        message: "Live Gemini offer of $310.",
        tacticalRationale: "AI rational concession",
      }),
    });

    const liveGeminiClient = new GeminiNegotiationClient({
      aiClient: {
        models: {
          generateContent: mockLiveContent,
        },
      },
    });

    const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const orchestrator = new NegotiationOrchestrator({
      geminiClient: liveGeminiClient,
      maxRounds: 1,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    const result = await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES.slice(0, 1));

    expect(result.completed).toBe(true);
    const buyerProposalEvents = emittedEvents.filter((e) => e.type === "BUYER_PROPOSAL");
    expect(buyerProposalEvents.length).toBe(1);
    expect(buyerProposalEvents[0].payload.generator).toBe("GEMINI_LIVE");
    expect(buyerProposalEvents[0].payload.turn).toBeDefined();

    const turn = result.session.turns.find((t) => t.actor === "BUYER");
    expect(turn?.generator).toBe("GEMINI_LIVE");
    expect(turn?.message).toBe("Live Gemini offer of $310.");
  });
});
