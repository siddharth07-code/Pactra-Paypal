import { describe, it, expect, vi } from "vitest";
import { NegotiationOrchestrator } from "./negotiation-orchestrator";
import { DETERMINISTIC_FIXTURE_QUOTES } from "./channel3-client";
import { GeminiNegotiationClient } from "./gemini-client";
import type { ProcurementMandate, VendorQuote, StructuredNegotiationState } from "../types/pactum";

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

  // Phase 4: Vendor simulation provenance and distinct strategies
  it("tags vendor turns and SSE counteroffer events with SIMULATED_VENDOR provenance and strategy types", async () => {
    const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const orchestrator = new NegotiationOrchestrator({
      maxRounds: 1,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    const result = await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES);

    const vendorCounterEvents = emittedEvents.filter((e) => e.type === "VENDOR_COUNTEROFFER");
    expect(vendorCounterEvents.length).toBe(3); // 3 fixture vendors

    for (const vce of vendorCounterEvents) {
      expect(vce.payload.provenance).toBe("SIMULATED_VENDOR");
      expect(vce.payload.strategyType).toBeDefined();
      expect(["FIRM", "BALANCED", "FLEXIBLE"]).toContain(vce.payload.strategyType);
    }

    const vendorTurns = result.session.turns.filter((t) => t.actor === "VENDOR");
    expect(vendorTurns.length).toBe(3);
    for (const vt of vendorTurns) {
      expect(vt.vendorProvenance).toBe("SIMULATED_VENDOR");
      expect(vt.message).toContain("Simulated supplier response:");
    }
  });

  // Phase 4: Passes structured negotiation state with cross-vendor intelligence to buyer generator
  it("constructs and passes structured negotiation state with eligible competitors to buyer generator", async () => {
    let capturedState: StructuredNegotiationState | null = null;

    const mockGenerateBuyerOffer = vi.fn().mockImplementation((context) => {
      capturedState = context.structuredState;
      return Promise.resolve({
        unitPrice: 310,
        deliveryDays: 3,
        returnDays: 35,
        message: "Offer with structured state",
        tacticalRationale: "State verified",
        generator: "DETERMINISTIC_FALLBACK",
      });
    });

    const mockClient = {
      generateBuyerOffer: mockGenerateBuyerOffer,
    } as unknown as GeminiNegotiationClient;

    const orchestrator = new NegotiationOrchestrator({
      geminiClient: mockClient,
      maxRounds: 1,
    });

    await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES);

    expect(capturedState).not.toBeNull();
    expect(capturedState!.sessionId).toBeDefined();
    expect(capturedState!.round).toBe(1);
    expect(capturedState!.maxRounds).toBe(1);
    expect(capturedState!.remainingRounds).toBe(0);
    expect(capturedState!.mandateConstraints.maxTotalBudget).toBe(8500);
    expect(capturedState!.competingEligibleOffers.length).toBe(2); // 2 competitors for each vendor in a 3-vendor arena
  });

  // Phase 4: Explicit no-deal outcome when all offers exceed budget or violate SLA
  it("produces an explicit no-deal outcome when all vendor quotes are infeasible", async () => {
    const impossibleMandate: ProcurementMandate = {
      ...mandate,
      id: "mandate-impossible",
      maxTotalBudget: 1000, // Impossibly low budget ($1,000 for 25 monitors = $40/unit)
      maxDeliveryDays: 1, // Only 1 day delivery allowed (vendors offer 3-5 days)
    };

    const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const orchestrator = new NegotiationOrchestrator({
      maxRounds: 1,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    const result = await orchestrator.runNegotiation(impossibleMandate, DETERMINISTIC_FIXTURE_QUOTES);

    expect(result.completed).toBe(false);
    expect(result.selectedQuote).toBeUndefined();
    expect(result.finalOffer).toBeUndefined();
    expect(result.session.status).toBe("AUDIT_FAILED");

    const completedEvent = emittedEvents.find((e) => e.type === "NEGOTIATION_COMPLETED");
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.payload.outcome).toBe("NO_DEAL");
    expect(completedEvent?.payload.reason).toContain("No vendor counteroffer satisfied");
  });

  // Phase 4: Deterministic tie-breaking by lowest total landed cost and vendor ID
  it("breaks ties deterministically by lowest landed cost and vendor ID", async () => {
    // Two vendors offering identical utility but different landed cost
    const quote1: VendorQuote = {
      ...DETERMINISTIC_FIXTURE_QUOTES[0],
      vendorId: "vendor-tie-b",
      vendorName: "Vendor Tie B",
      currentUnitBid: 320,
      shippingCost: 200, // Landed: 320 * 25 + 200 = 8200
    };

    const quote2: VendorQuote = {
      ...DETERMINISTIC_FIXTURE_QUOTES[0],
      vendorId: "vendor-tie-a",
      vendorName: "Vendor Tie A",
      currentUnitBid: 320,
      shippingCost: 100, // Landed: 320 * 25 + 100 = 8100 (Cheaper!)
    };

    const orchestrator = new NegotiationOrchestrator({
      maxRounds: 1,
    });

    const result = await orchestrator.runNegotiation(mandate, [quote1, quote2]);

    expect(result.completed).toBe(true);
    // Lower landed cost must win
    expect(result.selectedQuote?.vendorId).toBe("vendor-tie-a");
    expect(result.totalCost).toBe(8259.75);
  });
});
