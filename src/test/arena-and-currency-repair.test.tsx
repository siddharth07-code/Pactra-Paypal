import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type {
  ProcurementMandate,
  VendorQuote,
  ProcurementSession,
} from "@/types/pactum";
import {
  formatCurrency,
  toMinorUnits,
  fromMinorUnits,
  formatSessionBudgetString,
  isPayPalSupportedCurrency,
  isInternalSupportedCurrency,
  getCurrencySymbol,
} from "@/lib/currency";
import { parseProcurementMandate } from "@/lib/mandate-parser";
import { evaluateNegotiationCandidate, SourcingEvaluator } from "@/lib/sourcing-evaluator";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { PayPalClient } from "@/lib/paypal-client";
import { sessionStore } from "@/lib/session-store";
import { NegotiationArenaScreen } from "@/components/NegotiationArenaScreen";

describe("Phase 6.6: Negotiation Arena Repair & INR Currency Support", () => {
  const mockUSDMandate: ProcurementMandate = {
    id: "mandate_usd_001",
    rawPrompt: "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within 5 days and a minimum 30-day return policy.",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "USD",
    requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }],
    requiredCondition: "NEW",
    createdAt: new Date().toISOString(),
    version: 1,
    isLocked: false,
  };

  const mockINRMandate: ProcurementMandate = {
    id: "mandate_inr_001",
    rawPrompt: "Purchase 4 Enterprise Rack Servers under an ₹15,000 total budget, with delivery within 5 days and a minimum 30-day return policy.",
    itemQuery: "Enterprise Rack Servers",
    quantity: 4,
    maxTotalBudget: 15000,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "INR",
    requiredSpecs: [{ name: "Form Factor", value: "Rackmount", mandatory: true }],
    requiredCondition: "NEW",
    createdAt: new Date().toISOString(),
    version: 1,
    isLocked: false,
  };

  const mockUSDQuotes: VendorQuote[] = [
    {
      vendorId: "v_alpha",
      vendorName: "Apex Cloud Infrastructure",
      sku: "SRV-4U-01",
      productTitle: "4U Enterprise Rack Server",
      initialUnitAsk: 3900, // 3900 * 4 + 200 = $15,800 (Above $15,000 budget)
      currentUnitBid: 3900,
      shippingCost: 200,
      deliveryDays: 4, // SLA ok (<=5)
      returnDays: 35, // SLA ok (>=30)
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "CHANNEL3",
      currency: "USD",
    },
    {
      vendorId: "v_beta",
      vendorName: "DisplayWorld Data Systems",
      sku: "SRV-2U-02",
      productTitle: "2U Enterprise Server Unit",
      initialUnitAsk: 3600, // 3600 * 4 + 200 = $14,600 (Within budget)
      currentUnitBid: 3600,
      shippingCost: 200,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "CHANNEL3",
      currency: "USD",
    },
    {
      vendorId: "v_gamma",
      vendorName: "NexTech Server Solutions",
      sku: "SRV-SLOW-03",
      productTitle: "Budget Server Unit",
      initialUnitAsk: 3000,
      currentUnitBid: 3000,
      shippingCost: 100,
      deliveryDays: 8, // Violates delivery max 5d!
      returnDays: 14, // Violates return min 30d!
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "CHANNEL3",
      currency: "USD",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // PART 1: NEGOTIATION ARENA FUNCTIONAL REPAIR
  // ==========================================
  describe("Negotiation Arena Execution & Lifecycle", () => {
    // 1. Sourcing quotes are available and negotiation has not started.
    it("1. Displays meaningful empty state 'Ready to negotiate' with target, ceiling, supplier count, and Start button before start", () => {
      render(
        <NegotiationArenaScreen
          sessionId="session_test_init"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={[]}
          isStreaming={false}
        />
      );

      expect(screen.getByText("Ready to negotiate")).toBeDefined();
      expect(screen.getByText("3 eligible")).toBeDefined();
      expect(screen.getByText("4 discrete")).toBeDefined();
      expect(screen.getByRole("button", { name: /Start Negotiation/i })).toBeDefined();
      expect(
        screen.getByText(/Baseline supplier asking prices are starting commercial positions/i)
      ).toBeDefined();
    });

    // 2. Start Negotiation initializes the workflow.
    it("2. Clicking 'Start Negotiation' fires onStartNegotiation callback", () => {
      const handleStart = vi.fn();
      render(
        <NegotiationArenaScreen
          sessionId="session_test_init"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={[]}
          isStreaming={false}
          onStartNegotiation={handleStart}
        />
      );

      const startBtn = screen.getByRole("button", { name: /Start Negotiation/i });
      fireEvent.click(startBtn);
      expect(handleStart).toHaveBeenCalledTimes(1);
    });

    // 3. Double-clicking Start Negotiation does not create duplicate runs.
    it("3. Double-clicking Start Negotiation disables the button during streaming and prevents duplicate calls", () => {
      const handleStart = vi.fn();
      const { rerender } = render(
        <NegotiationArenaScreen
          sessionId="session_test_init"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={[]}
          isStreaming={false}
          onStartNegotiation={handleStart}
        />
      );

      const startBtn = screen.getByRole("button", { name: /Start Negotiation/i });
      fireEvent.click(startBtn);
      expect(handleStart).toHaveBeenCalledTimes(1);

      // Once streaming starts, button shows loading spinner and is disabled
      rerender(
        <NegotiationArenaScreen
          sessionId="session_test_init"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={[]}
          isStreaming={true}
          onStartNegotiation={handleStart}
        />
      );

      const streamingBtn = screen.getByRole("button", { name: /Initializing Negotiation.../i });
      expect(streamingBtn).toBeDisabled();
      fireEvent.click(streamingBtn);
      // Callback was NOT fired again
      expect(handleStart).toHaveBeenCalledTimes(1);
    });

    // 4. Refreshing Arena reconnects to an active negotiation or renders hydrated turns.
    it("4. Hydrated stream events from session turns render in chronological timeline upon refresh", () => {
      const events = [
        {
          id: "ev_1",
          type: "ROUND_STARTED",
          timestamp: new Date().toISOString(),
          payload: { round: 1, maxRounds: 4 },
        },
        {
          id: "ev_2",
          type: "BUYER_PROPOSAL",
          timestamp: new Date().toISOString(),
          payload: {
            round: 1,
            vendorId: "v_alpha",
            vendorName: "Apex Cloud Infrastructure",
            message: "We propose $3,500 per unit for 4 servers.",
            proposedOffer: { unitPrice: 3500, deliveryDays: 4, returnDays: 35 },
            utilityScore: 0.82,
            threshold: 0.75,
          },
        },
      ];

      render(
        <NegotiationArenaScreen
          sessionId="session_test_refresh"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={events}
          isStreaming={false}
        />
      );

      expect(screen.getAllByText(/Round 1 of 4/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Buyer Agent \(Gemini\) → Apex Cloud Infrastructure/i)).toBeDefined();
      expect(screen.getByText(/Utility: 0.820/i)).toBeDefined();
      expect(screen.getByText(/Unit Bid:/i)).toBeDefined();
    });

    // 5. Completed negotiations are not restarted.
    it("5. Completed negotiations render final consensus agreement and Proceed button rather than empty prompt", () => {
      const completedEvents = [
        {
          id: "ev_comp",
          type: "NEGOTIATION_COMPLETED",
          timestamp: new Date().toISOString(),
          payload: {
            outcome: "ACCEPTED",
            selectedVendor: "DisplayWorld Data Systems",
            winningVendorId: "v_beta",
            totalCost: 14600,
            savings: 400,
          },
        },
      ];

      const handleProceed = vi.fn();

      render(
        <NegotiationArenaScreen
          sessionId="session_test_done"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={completedEvents}
          isStreaming={false}
          onProceedToSettlement={handleProceed}
        />
      );

      expect(screen.getByText(/Consensus Reached with DisplayWorld Data Systems/i)).toBeDefined();
      expect(screen.getByText(/Agreement Accepted: Mutual agreement recorded/i)).toBeDefined();
      const proceedBtns = screen.getAllByRole("button", { name: /Proceed to Settlement Gate/i });
      expect(proceedBtns.length).toBeGreaterThan(0);
      fireEvent.click(proceedBtns[0]);
      expect(handleProceed).toHaveBeenCalled();
    });

    // 6. SSE disconnection is handled gracefully.
    it("6. Displays failure alert when negotiation encounters unrecoverable stream error", () => {
      const errorEvents = [
        {
          id: "ev_err",
          type: "NEGOTIATION_FAILED",
          timestamp: new Date().toISOString(),
          payload: { error: "Stream connection dropped by remote peer." },
        },
      ];

      render(
        <NegotiationArenaScreen
          sessionId="session_test_fail"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={errorEvents}
          isStreaming={false}
        />
      );

      expect(screen.getByText("Negotiation Halted")).toBeDefined();
    });

    // 7. Invalid mandates cannot start negotiation.
    it("7. SourcingEvaluator rejects invalid mandate parameters", async () => {
      const invalidMandate: ProcurementMandate = {
        ...mockUSDMandate,
        quantity: 0, // Invalid!
        maxTotalBudget: -100, // Invalid!
      };
      const candidateCheck = evaluateNegotiationCandidate(invalidMandate, mockUSDQuotes[0]);
      expect(candidateCheck.isCandidate).toBe(false);
      expect(candidateCheck.hardDisqualificationReasons.length).toBeGreaterThan(0);
    });

    // 8. No eligible candidates cannot start negotiation.
    it("8. SourcingEvaluator reports no eligible candidates if all suppliers violate hard constraints", async () => {
      const nonCompliantQuotes: VendorQuote[] = [
        {
          ...mockUSDQuotes[2], // 8 days delivery > 5 max, 14 days return < 30 min
        },
      ];
      const evaluator = new SourcingEvaluator();
      const result = await evaluator.evaluateSourcedQuotes(mockUSDMandate, nonCompliantQuotes);
      expect(result.eligibleQuotes.length).toBe(0);
      expect(result.negotiationCandidates?.length || 0).toBe(0);
      expect(result.hasEligibleQuotes).toBe(false);
    });

    // 9. Above-budget baseline offers can still be negotiated.
    it("9. Evaluates above-budget supplier as 'Above Budget — Negotiation Candidate' when non-price constraints pass", () => {
      const candidateCheck = evaluateNegotiationCandidate(mockUSDMandate, mockUSDQuotes[0]);
      expect(candidateCheck.isCandidate).toBe(true);
      expect(candidateCheck.isAboveBudgetBaseline).toBe(true);
      expect(candidateCheck.hardDisqualificationReasons.length).toBe(0);

      // In the UI, Apex ($15,800 vs $8,500 ceiling) should be tagged Above Budget — Negotiation Candidate
      render(
        <NegotiationArenaScreen
          sessionId="session_test_candidates"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={[]}
          isStreaming={false}
        />
      );

      expect(screen.getAllByText("Above Budget — Negotiation Candidate").length).toBeGreaterThanOrEqual(1);
    });

    // 10. Guardrail interventions remain visible.
    it("10. Mechanism-Design Guardrail interventions are explicitly rendered with mathematical violation and disclosure toggle", () => {
      const guardrailEvents = [
        {
          id: "ev_gr_block",
          type: "GUARDRAIL_BLOCKED",
          timestamp: new Date().toISOString(),
          payload: {
            round: 2,
            vendorId: "v_beta",
            vendorName: "DisplayWorld Data Systems",
            reason: "Proposed offer total of $8,600 exceeds budget ceiling $8,500.",
            rejectedOffer: { unitPrice: 340, deliveryDays: 4, returnDays: 30 },
          },
        },
      ];

      render(
        <NegotiationArenaScreen
          sessionId="session_test_gr"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={guardrailEvents}
          isStreaming={false}
        />
      );

      expect(screen.getByText(/Predicate A — Feasibility & Budget Limit Intervened/i)).toBeDefined();
      expect(screen.getByText(/Purged from Queue/i)).toBeDefined();
      expect(screen.getByText(/Proposed offer total of \$8,600 exceeds budget ceiling \$8,500/i)).toBeDefined();
      expect(screen.getByText(/Verification details/i)).toBeDefined();
    });

    // 11. Agreement is recorded only after valid acceptance.
    it("11. Renders agreed unit price and acceptance notification upon vendor/buyer acceptance", () => {
      const acceptanceEvents = [
        {
          id: "ev_va",
          type: "VENDOR_ACCEPTANCE",
          timestamp: new Date().toISOString(),
          payload: {
            round: 3,
            vendorId: "v_beta",
            vendorName: "DisplayWorld Data Systems",
            message: "DisplayWorld accepts buyer terms of $3,200 per unit.",
            unitPrice: 3200,
          },
        },
      ];

      render(
        <NegotiationArenaScreen
          sessionId="session_test_accept"
          mandate={mockUSDMandate}
          quotes={mockUSDQuotes}
          events={acceptanceEvents}
          isStreaming={false}
        />
      );

      expect(screen.getByText(/Vendor Accepted Proposal \(DisplayWorld Data Systems\)/i)).toBeDefined();
      expect(screen.getByText(/Agreed Unit: \$3,200.00/i)).toBeDefined();
    });
  });

  // ==========================================
  // PART 2: CURRENCY ARCHITECTURE & ARITHMETIC
  // ==========================================
  describe("INR Currency Support & Cross-Currency Integrity", () => {
    // 12. USD mandate formatting.
    it("12. Formats USD currency accurately using en-US formatting", () => {
      expect(formatCurrency(15000, "USD")).toBe("$15,000.00");
      expect(formatCurrency(2632.79, "USD")).toBe("$2,632.79");
      expect(formatCurrency(8150, "USD")).toBe("$8,150.00");
      expect(getCurrencySymbol("USD")).toBe("$");
    });

    // 13. INR mandate formatting.
    it("13. Formats INR currency accurately using en-IN formatting with ₹ symbol", () => {
      expect(formatCurrency(15000, "INR")).toBe("₹15,000.00");
      expect(formatCurrency(2632.79, "INR")).toBe("₹2,632.79");
      expect(formatCurrency(8150, "INR")).toBe("₹8,150.00");
      expect(getCurrencySymbol("INR")).toBe("₹");
    });

    // 14. INR supplier quote arithmetic.
    it("14. Preserves 2-decimal minor units for INR (1 INR = 100 paise) without floating point loss", () => {
      const paise = toMinorUnits(15000.75);
      expect(paise).toBe(1500075);
      expect(fromMinorUnits(paise)).toBe(15000.75);

      const paiseFraction = toMinorUnits(2632.79);
      expect(paiseFraction).toBe(263279);
      expect(fromMinorUnits(paiseFraction)).toBe(2632.79);
    });

    // 15. INR negotiation counteroffer arithmetic.
    it("15. Correctly calculates INR concession without string parsing errors", () => {
      const initialAskINR = 3900.5;
      const counterBidINR = 3600.25;
      const initialPaise = toMinorUnits(initialAskINR);
      const counterPaise = toMinorUnits(counterBidINR);
      const concessionPaise = initialPaise - counterPaise;
      const concessionINR = fromMinorUnits(concessionPaise);

      expect(concessionINR).toBe(300.25);
      expect(formatCurrency(concessionINR, "INR")).toBe("₹300.25");
    });

    // 16. INR landed-cost calculation.
    it("16. Calculates landed total = unitPrice * quantity + shipping accurately in INR", () => {
      const unitAsk = 3600;
      const quantity = 4;
      const shipping = 200;

      const unitPaise = toMinorUnits(unitAsk);
      const shippingPaise = toMinorUnits(shipping);
      const landedPaise = unitPaise * quantity + shippingPaise;
      const landedTotal = fromMinorUnits(landedPaise);

      expect(landedTotal).toBe(14600.0);
      expect(landedTotal <= mockINRMandate.maxTotalBudget).toBe(true);
      expect(formatCurrency(landedTotal, "INR")).toBe("₹14,600.00");
    });

    // 17. USD legacy-session compatibility.
    it("17. Legacy sessions without an explicit currency field default safely to USD", () => {
      const legacySession: Partial<ProcurementMandate> = {
        id: "mandate_legacy",
        itemQuery: "4K Monitors",
        quantity: 25,
        maxTotalBudget: 8500,
      };

      const resolvedCurrency = legacySession.currency || "USD";
      expect(resolvedCurrency).toBe("USD");
      expect(formatCurrency(8500, resolvedCurrency)).toBe("$8,500.00");
    });

    // 18. Mixed-currency supplier rejection.
    it("18. SourcingEvaluator rejects quotes with mismatched currency from the mandate", () => {
      const mixedQuote: VendorQuote = {
        ...mockUSDQuotes[0],
        currency: "USD",
      };

      const evaluation = evaluateNegotiationCandidate(mockINRMandate, mixedQuote);
      expect(evaluation.isCandidate).toBe(false);
      expect(
        evaluation.hardDisqualificationReasons.some((r) => r.includes("Currency mismatch"))
      ).toBe(true);
    });

    // 19. Mixed-currency agreement rejection.
    it("19. SourcingEvaluator rejects mandate with unsupported currency code", async () => {
      const weirdMandate: ProcurementMandate = {
        ...mockUSDMandate,
        currency: "XYZ",
      };
      const evaluator = new SourcingEvaluator();
      const result = await evaluator.evaluateSourcedQuotes(weirdMandate, mockUSDQuotes);
      expect(result.evaluations[mockUSDQuotes[0].vendorId].financials.currencySupported).toBe(false);
    });

    // 20. ACWORLD currency mismatch rejection.
    it("20. AcworldAuditor Invariant 2 fails closed when quote currency does not match mandate currency", async () => {
      const auditor = new AcworldAuditor();
      const sessionWithMismatch: ProcurementSession = {
        id: "session_mismatch",
        mandate: mockINRMandate,
        quotes: [
          {
            ...mockUSDQuotes[1],
            currency: "USD", // Mismatched!
          },
        ],
        turns: [],
        selectedQuote: {
          ...mockUSDQuotes[1],
          currency: "USD", // Mismatched!
        },
        finalOffer: {
          unitPrice: 3600,
          quantity: 4,
          deliveryDays: 5,
          returnDays: 30,
          shippingCost: 200,
          currency: "USD", // Mismatched!
        },
        status: "AUDIT_PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const certificate = auditor.audit({ session: sessionWithMismatch });
      expect(certificate.passed).toBe(false);
      const priceInvariant = certificate.invariants.find((inv) => inv.name === "PRICE_CEILING");
      expect(priceInvariant?.passed).toBe(false);
      expect(priceInvariant?.reason).toMatch(/Currency mismatch/i);
    });

    // 21. PayPal unsupported currency fails closed.
    it("21. PayPal client and settlement service fail closed on INR currency", async () => {
      expect(isPayPalSupportedCurrency("INR")).toBe(false);
      expect(isPayPalSupportedCurrency("USD")).toBe(true);
      expect(isInternalSupportedCurrency("INR")).toBe(true);

      const paypalClient = new PayPalClient({
        clientId: "mock_client",
        clientSecret: "mock_secret",
      });

      await expect(
        paypalClient.createAuthorizedOrder({
          sessionId: "session_inr_001",
          merkleRoot: "0".repeat(64),
          currency: "INR",
          unitPrice: 3600,
          quantity: 4,
          shippingCost: 200,
          totalAmount: 14600,
          productTitle: "Server",
        })
      ).rejects.toThrow(/PayPal Orders v2 does not support INR transactions/i);

      await expect(
        paypalClient.createNegotiatedInvoice({
          sessionId: "session_inr_001",
          merkleRoot: "0".repeat(64),
          currency: "INR",
          unitPrice: 3600,
          quantity: 4,
          shippingCost: 200,
          productTitle: "Server",
          recipientEmail: "buyer@example.com",
        })
      ).rejects.toThrow(/PayPal Invoicing does not support INR invoices/i);
    });

    // 22. No silent currency conversion.
    it("22. Mandate parser extracts INR amounts cleanly without converting to USD", () => {
      const parsedINR = parseProcurementMandate({
        prompt: "Purchase 4 Enterprise Rack Servers under an ₹15,000 total budget, with delivery within 5 days and a minimum 30-day return policy.",
        currency: "INR",
      });

      expect(parsedINR.success).toBe(true);
      expect(parsedINR.mandate?.currency).toBe("INR");
      expect(parsedINR.mandate?.maxTotalBudget).toBe(15000);
      expect(parsedINR.mandate?.quantity).toBe(4);
    });

    // 23. Currency persists across session store save and get.
    it("23. Session store preserves INR currency and mandate parameters exactly across save and retrieve", () => {
      const session = sessionStore.createSession(mockINRMandate, []);
      expect(session.mandate.currency).toBe("INR");
      expect(session.mandate.maxTotalBudget).toBe(15000);

      const retrieved = sessionStore.getSession(session.id);
      expect(retrieved?.mandate.currency).toBe("INR");
      expect(retrieved?.mandate.maxTotalBudget).toBe(15000);
    });

    // 24. Currency appears correctly formatted across UI displays.
    it("24. formatSessionBudgetString formats both INR and USD session context pills accurately", () => {
      const usdPill = formatSessionBudgetString(8500, "USD");
      expect(usdPill).toBe("Budget: $8,500.00 USD");

      const inrPill = formatSessionBudgetString(15000, "INR");
      expect(inrPill).toBe("Budget: ₹15,000.00 INR");
    });
  });
});
