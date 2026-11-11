import { describe, it, expect, vi } from "vitest";
import { NegotiationOrchestrator } from "./negotiation-orchestrator";
import { DETERMINISTIC_FIXTURE_QUOTES } from "./channel3-client";
import { GeminiNegotiationClient } from "./gemini-client";
import { sessionStore } from "./session-store";
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

    const feasibleQuote: VendorQuote = {
      ...DETERMINISTIC_FIXTURE_QUOTES[0],
      initialUnitAsk: 340.0,
      currentUnitBid: 326.39,
      shippingCost: 150.0,
    };

    const result = await orchestrator.runNegotiation(mandate, [feasibleQuote]);

    expect(result.completed).toBe(true);
    // In round 1, for 1 vendor: exactly 1 approved BUYER turn and 1 VENDOR turn
    const r1Turns = result.session.turns.filter((t) => t.round === 1);
    const r1BuyerApproved = r1Turns.filter((t) => t.actor === "BUYER" && t.guardrailStatus === "APPROVED");
    expect(r1BuyerApproved.length).toBe(1);

    const nodes = result.merkleTree.getAuditNodes();
    expect(nodes.length).toBe(5);
    expect(result.session.flightRecord?.events.filter(event => event.eventType === "AGREEMENT_CREATED")).toHaveLength(1);
    expect(result.session.flightRecord?.events.filter(event => event.eventType === "VERIFIED_NEGOTIATION_ROUND")).toHaveLength(2);
    expect(result.session.flightRecord?.rootHash).toBe(result.merkleTree.getRootHash());
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

    const feasibleLiveQuote: VendorQuote = {
      ...DETERMINISTIC_FIXTURE_QUOTES[0],
      initialUnitAsk: 340.0,
      currentUnitBid: 310.0,
      shippingCost: 150.0,
    };

    const result = await orchestrator.runNegotiation(mandate, [feasibleLiveQuote]);

    expect(result.completed).toBe(true);
    const buyerProposalEvents = emittedEvents.filter((e) => e.type === "BUYER_PROPOSAL");
    expect(buyerProposalEvents.length).toBe(1);
    expect(buyerProposalEvents[0].payload.generator).toBe("GEMINI_LIVE");
    expect(buyerProposalEvents[0].payload.turn).toBeDefined();

    const turn = result.session.turns.find((t) => t.actor === "BUYER");
    expect(turn?.generator).toBe("GEMINI_LIVE");
    expect(turn?.message).toContain("USD 310.00 per unit");
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
    expect(result.totalCost).toBe(8100);
  });

  describe("Agreement Semantics & Terminal Outcomes Verification (Phase 4.1)", () => {
    it("creates an explicit AgreementRecord with mutual acceptance and records turnType/offerState", async () => {
      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 4,
      });

      const result = await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES);

      expect(result.completed).toBe(true);
      expect(result.session.agreementRecord).toBeDefined();

      const record = result.session.agreementRecord!;
      expect(record.agreementId).toBeDefined();
      expect(record.vendorId).toBe(result.selectedQuote?.vendorId);
      expect(record.agreedPrice).toBe(result.finalOffer?.unitPrice);
      expect(record.totalCost).toBe(result.totalCost);
      expect(["VENDOR_ACCEPTED_BUYER_OFFER", "BUYER_ACCEPTED_VENDOR_COUNTEROFFER"]).toContain(record.agreedBy);
      expect(record.mandateVersion).toBe(mandate.version ?? 1);

      // Verify all turns have explicit turnType and offerState
      for (const turn of result.session.turns) {
        expect(turn.turnType).toBeDefined();
        expect(["PROPOSAL", "COUNTEROFFER", "ACCEPTANCE", "REJECTION"]).toContain(turn.turnType);
        expect(turn.offerState).toBeDefined();
        expect(["PROPOSED", "COUNTEROFFERED", "ACCEPTED", "REJECTED", "EXPIRED"]).toContain(turn.offerState);
      }
    });

    it("clears winner and final offer on NO_DEAL, leaving no stale agreement record", async () => {
      const impossibleMandate: ProcurementMandate = {
        ...mandate,
        id: "mandate-impossible-nodeal",
        maxTotalBudget: 500, // $20/unit, cannot be satisfied
      };

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 2,
      });

      const result = await orchestrator.runNegotiation(impossibleMandate, DETERMINISTIC_FIXTURE_QUOTES);

      expect(result.completed).toBe(false);
      expect(result.selectedQuote).toBeUndefined();
      expect(result.finalOffer).toBeUndefined();
      expect(result.totalCost).toBeUndefined();
      expect(result.session.agreementRecord).toBeUndefined();
      expect(result.session.status).toBe("AUDIT_FAILED");
    });

    it("invalidates stale agreement record when mandate is revised in sessionStore", () => {
      const session = sessionStore.createSession(mandate);
      session.status = "AUDIT_PASSED";
      session.selectedQuote = DETERMINISTIC_FIXTURE_QUOTES[0];
      session.finalOffer = {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 150,
      };
      session.agreementRecord = {
        agreementId: "agree-123",
        sessionId: session.id,
        vendorId: DETERMINISTIC_FIXTURE_QUOTES[0].vendorId,
        vendorName: DETERMINISTIC_FIXTURE_QUOTES[0].vendorName,
        sku: DETERMINISTIC_FIXTURE_QUOTES[0].sku,
        mandateVersion: 1,
        agreedPrice: 320,
        agreedOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 150,
        },
        totalCost: 8150,
        round: 4,
        agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
        acceptingParty: "VENDOR",
        acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
        acceptedAt: new Date().toISOString(),
      };
      session.auditCertificate = {
        certificateId: "cert-123",
        sessionId: session.id,
        passed: true,
        invariants: [
          { name: "SKU_INTEGRITY", passed: true },
          { name: "PRICE_CEILING", passed: true },
          { name: "RETURN_POLICY", passed: true },
          { name: "DELIVERY_SLA", passed: true },
          { name: "CRYPTOGRAPHIC_LINEAGE", passed: true },
        ],
        timestamp: new Date().toISOString(),
        verifiedRoot: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      };

      // Revise the mandate with new budget
      const revisedSession = sessionStore.reviseMandate(session.id, {
        maxTotalBudget: 9000,
      });

      expect(revisedSession.mandate.version).toBe(2);
      expect(revisedSession.agreementRecord).toBeUndefined();
      expect(revisedSession.selectedQuote).toBeUndefined();
      expect(revisedSession.finalOffer).toBeUndefined();
      expect(revisedSession.auditCertificate).toBeUndefined();
      expect(revisedSession.status).toBe("MANDATE_PENDING");
    });
  });

  describe("Phase 4.2 Mutual Acceptance & Winner Selection Policy", () => {
    it("emits explicit VENDOR_ACCEPTANCE or BUYER_ACCEPTANCE event on deal formation", async () => {
      const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 4,
        onEvent: (ev) => {
          emittedEvents.push(ev);
        },
      });

      const result = await orchestrator.runNegotiation(mandate, DETERMINISTIC_FIXTURE_QUOTES);

      expect(result.completed).toBe(true);
      expect(result.session.agreementRecord).toBeDefined();

      const record = result.session.agreementRecord!;
      expect(record.offerReference).toBeDefined();
      expect(["VENDOR", "BUYER"]).toContain(record.acceptingParty);
      expect([
        "VENDOR_ACCEPTED_BUYER_OFFER",
        "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
      ]).toContain(record.acceptanceMechanism);

      // Verify explicit acceptance event was emitted for the agreed deal
      const acceptanceEvents = emittedEvents.filter(
        (e) => e.type === "VENDOR_ACCEPTANCE" || e.type === "BUYER_ACCEPTANCE"
      );
      expect(acceptanceEvents.length).toBeGreaterThanOrEqual(1);
      const matchingEvent = acceptanceEvents.find((e) => e.payload.agreementId === record.agreementId);
      expect(matchingEvent).toBeDefined();
      expect(matchingEvent!.payload.agreedPrice).toBe(record.agreedPrice);
    });

    it("ranks candidates by highest multi-attribute utility (utility-maximizing policy)", async () => {
      // Both vendors use the same FLEXIBLE strategy profile (via 'nextech' prefix)
      // Vendor 1: slightly higher price ($320), but 1-day delivery and 60-day return policy
      // Vendor 2: slightly lower price ($310, $10 cheaper), but 5-day delivery and 30-day return policy
      // SLA utility differential is +0.3000, while price utility differential is only 0.70 * (10 / 93.75) = -0.0747
      // Net utility is higher for Vendor 1 (0.7107 vs 0.4853), so Vendor 1 must win under multi-attribute utility policy!
      const quoteHighUtility: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-nextech-high-util",
        vendorName: "NexTech High Utility",
        initialUnitAsk: 380,
        currentUnitBid: 345,
        deliveryDays: 1, // max SLA utility (D_t = 1.0)
        returnDays: 60,   // max SLA utility (R_t = 1.0)
        shippingCost: 100, // Landed: 345 * 25 + 100 = 8725 -> after concession: ~330 * 25 + 100 = 8350 <= 8500
      };

      const quoteLowCost: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-nextech-low-cost",
        vendorName: "NexTech Low Cost",
        initialUnitAsk: 380,
        currentUnitBid: 335,
        deliveryDays: 5, // min SLA utility (D_t = 0.0)
        returnDays: 30,   // min SLA utility (R_t = 0.0)
        shippingCost: 100, // Landed: ~320 * 25 + 100 = 8100 (Cheaper!)
      };

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 1,
      });

      const result = await orchestrator.runNegotiation(mandate, [quoteLowCost, quoteHighUtility]);

      expect(result.completed).toBe(true);
      // Under multi-attribute utility policy, the superior SLA package wins despite higher price
      expect(result.selectedQuote?.vendorId).toBe("vendor-nextech-high-util");
    });

    it("breaks utility ties by lowest total landed cost (secondary tie-breaker)", async () => {
      // Two vendors with identical SLAs and unit price, but different shipping costs
      const quoteCheaperShipping: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-cheap-ship",
        currentUnitBid: 315,
        deliveryDays: 3,
        returnDays: 35,
        shippingCost: 50, // Landed: 315 * 25 + 50 = 7925
      };

      const quoteExpensiveShipping: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-exp-ship",
        currentUnitBid: 315,
        deliveryDays: 3,
        returnDays: 35,
        shippingCost: 200, // Landed: 315 * 25 + 200 = 8075
      };

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 1,
      });

      const result = await orchestrator.runNegotiation(mandate, [
        quoteExpensiveShipping,
        quoteCheaperShipping,
      ]);

      expect(result.completed).toBe(true);
      expect(result.selectedQuote?.vendorId).toBe("vendor-cheap-ship");
      expect(result.totalCost).toBe(7925);
    });

    it("breaks equal utility and equal landed cost ties alphabetically by vendorId (tertiary tie-breaker)", async () => {
      const quoteA: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-alpha",
        currentUnitBid: 315,
        deliveryDays: 3,
        returnDays: 35,
        shippingCost: 100, // Landed: 315 * 25 + 100 = 7975
      };

      const quoteB: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-beta",
        currentUnitBid: 315,
        deliveryDays: 3,
        returnDays: 35,
        shippingCost: 100, // Landed: 315 * 25 + 100 = 7975
      };

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 1,
      });

      // Pass quoteB first to ensure sort order determines winner, not insertion order
      const result = await orchestrator.runNegotiation(mandate, [quoteB, quoteA]);

      expect(result.completed).toBe(true);
      expect(result.selectedQuote?.vendorId).toBe("vendor-alpha");
    });

    it("prevents duplicate acceptance events and preserves original agreement when vendor already agreed in early round", async () => {
      const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const quoteAgreeEarly: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-agree-early",
        initialUnitAsk: 300,
        currentUnitBid: 280,
        shippingCost: 50,
      };

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 4,
        onEvent: (ev) => {
          emittedEvents.push(ev);
        },
      });

      const result = await orchestrator.runNegotiation(mandate, [quoteAgreeEarly]);
      expect(result.completed).toBe(true);
      expect(result.session.agreementRecord).toBeDefined();

      // Only ONE acceptance event should be emitted across all 4 rounds
      const acceptanceEvents = emittedEvents.filter(
        (e) => e.type === "VENDOR_ACCEPTANCE" || e.type === "BUYER_ACCEPTANCE"
      );
      expect(acceptanceEvents.length).toBe(1);
      expect(acceptanceEvents[0].payload.agreementId).toBe(result.session.agreementRecord!.agreementId);
    });

    it("marks counteroffers as expired and produces NO_DEAL when deadline reached without acceptable counteroffer", async () => {
      const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const quoteUnfeasible: VendorQuote = {
        ...DETERMINISTIC_FIXTURE_QUOTES[0],
        vendorId: "vendor-unfeasible",
        initialUnitAsk: 450,
        currentUnitBid: 420,
        shippingCost: 500, // Landed: 420 * 25 + 500 = 11,000 >> $8,500
      };

      const orchestrator = new NegotiationOrchestrator({
        maxRounds: 2,
        onEvent: (ev) => {
          emittedEvents.push(ev);
        },
      });

      const result = await orchestrator.runNegotiation(mandate, [quoteUnfeasible]);
      expect(result.completed).toBe(false);
      expect(result.session.status).toBe("AUDIT_FAILED");
      expect(result.session.agreementRecord).toBeUndefined();
      expect(result.selectedQuote).toBeUndefined();
      expect(result.finalOffer).toBeUndefined();

      // Verify NO acceptance events were emitted
      const acceptanceEvents = emittedEvents.filter(
        (e) => e.type === "VENDOR_ACCEPTANCE" || e.type === "BUYER_ACCEPTANCE"
      );
      expect(acceptanceEvents.length).toBe(0);

      const noDealEvent = emittedEvents.find((e) => e.type === "NEGOTIATION_COMPLETED");
      expect(noDealEvent).toBeDefined();
      expect(noDealEvent!.payload.outcome).toBe("NO_DEAL");
    });
  });
});


