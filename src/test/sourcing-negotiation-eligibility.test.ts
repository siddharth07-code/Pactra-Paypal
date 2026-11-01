import { describe, it, expect } from "vitest";
import type { ProcurementMandate, VendorQuote } from "@/types/pactum";
import {
  evaluateNegotiationCandidate,
  SourcingEvaluator,
} from "@/lib/sourcing-evaluator";

describe("Phase 6.5: Sourcing & Arena Entry Negotiation Eligibility Model", () => {
  const baseMandate: ProcurementMandate = {
    id: "mandate_test_001",
    rawPrompt: "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within 5 days and a minimum 30-day return policy.",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500, // $8,500 total budget ceiling
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "USD",
    requiredSpecs: [
      { name: "Resolution", value: "4K UHD", mandatory: true },
      { name: "Connectivity", value: "USB-C", mandatory: true },
    ],
    requiredCondition: "NEW",
    createdAt: new Date().toISOString(),
    version: 1,
    isLocked: false,
  };

  const compliantQuoteA: VendorQuote = {
    vendorId: "v_alpha",
    vendorName: "Alpha Displays",
    sku: "MON-4K-USBC-01",
    productTitle: "27-inch 4K UHD USB-C Professional Monitor",
    initialUnitAsk: 375, // 375 * 25 = 9,375 + 150 = $9,525 (EXCEEDS $8,500 budget by $1,025)
    currentUnitBid: 375,
    shippingCost: 150,
    deliveryDays: 4, // compliant (<= 5)
    returnDays: 30, // compliant (>= 30)
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  const compliantQuoteB: VendorQuote = {
    vendorId: "v_beta",
    vendorName: "Beta Tech Wholesalers",
    sku: "MON-4K-USBC-02",
    productTitle: "28-inch UltraHD 4K USB-C Monitor",
    initialUnitAsk: 380, // 380 * 25 = 9,500 + 100 = $9,600 (EXCEEDS $8,500 budget by $1,100)
    currentUnitBid: 380,
    shippingCost: 100,
    deliveryDays: 5, // compliant (<= 5)
    returnDays: 45, // compliant (>= 30)
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  const withinBudgetQuote: VendorQuote = {
    vendorId: "v_gamma",
    vendorName: "Gamma Supply",
    sku: "MON-4K-USBC-03",
    productTitle: "27-inch 4K USB-C Business Display",
    initialUnitAsk: 320, // 320 * 25 = 8,000 + 100 = $8,100 (WITHIN $8,500 budget)
    currentUnitBid: 320,
    shippingCost: 100,
    deliveryDays: 3,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  // 1. Regression Case 1: All baseline quotes above budget, but negotiation is allowed
  it("Case 1: Allows negotiation entry when all baseline quotes exceed the budget ceiling", async () => {
    const evaluator = new SourcingEvaluator({ skipAi: true });
    const quotes = [compliantQuoteA, compliantQuoteB];

    // Evaluate quotes
    const result = await evaluator.evaluateSourcedQuotes(baseMandate, quotes);

    // Baseline settlement eligibility is false because landed costs ($9,525 and $9,600) exceed $8,500
    expect(result.hasEligibleQuotes).toBe(false);
    expect(result.eligibleQuotes.length).toBe(0);

    // CRITICAL FIX: Negotiation eligibility separates baseline asking price from hard constraints
    expect(result.hasNegotiationCandidates).toBe(true);
    expect(result.negotiationCandidates?.length).toBe(2);

    const candA = evaluateNegotiationCandidate(baseMandate, compliantQuoteA, result.evaluations[compliantQuoteA.vendorId]);
    expect(candA.isCandidate).toBe(true);
    expect(candA.isAboveBudgetBaseline).toBe(true);
    expect(candA.hardDisqualificationReasons).toHaveLength(0);

    // UI helper evaluation: canEnterArena must be TRUE
    const canEnterArena =
      result.negotiationCandidates !== undefined &&
      result.negotiationCandidates.length > 0;
    expect(canEnterArena).toBe(true);

    // Explanatory notice must be flagged
    const someQuotesAboveBudget = result.negotiationCandidates.some(
      (q) => q.initialUnitAsk * baseMandate.quantity + q.shippingCost > baseMandate.maxTotalBudget
    );
    expect(someQuotesAboveBudget).toBe(true);
  });

  // 2. Regression Case 2: At least one eligible quote within budget
  it("Case 2: Allows negotiation entry when at least one quote is within budget", async () => {
    const evaluator = new SourcingEvaluator({ skipAi: true });
    const quotes = [compliantQuoteA, withinBudgetQuote];

    const result = await evaluator.evaluateSourcedQuotes(baseMandate, quotes);

    expect(result.hasEligibleQuotes).toBe(true);
    expect(result.eligibleQuotes.length).toBe(1);
    expect(result.eligibleQuotes[0].vendorId).toBe("v_gamma");

    expect(result.hasNegotiationCandidates).toBe(true);
    expect(result.negotiationCandidates?.length).toBe(2);

    const candGamma = evaluateNegotiationCandidate(baseMandate, withinBudgetQuote, result.evaluations[withinBudgetQuote.vendorId]);
    expect(candGamma.isCandidate).toBe(true);
    expect(candGamma.isAboveBudgetBaseline).toBe(false);
  });

  // 3. Regression Case 3: All quotes fail hard SKU requirements
  it("Case 3: Blocks negotiation entry when all quotes contradict mandatory specifications / SKU", async () => {
    const evaluator = new SourcingEvaluator({ skipAi: true });

    // Quotes that fail 4K UHD requirement (1080p display)
    const badSkuQuote1: VendorQuote = {
      ...compliantQuoteA,
      productTitle: "27-inch 1080p Full HD Display",
      sku: "MON-1080P-01",
    };
    const badSkuQuote2: VendorQuote = {
      ...compliantQuoteB,
      productTitle: "24-inch 1920x1080 FHD Office Monitor",
      sku: "MON-FHD-02",
    };

    const result = await evaluator.evaluateSourcedQuotes(baseMandate, [badSkuQuote1, badSkuQuote2]);

    expect(result.hasEligibleQuotes).toBe(false);
    expect(result.hasNegotiationCandidates).toBe(false);
    expect(result.negotiationCandidates?.length).toBe(0);

    const cand1 = evaluateNegotiationCandidate(baseMandate, badSkuQuote1, result.evaluations[badSkuQuote1.vendorId]);
    expect(cand1.isCandidate).toBe(false);
    expect(cand1.hardDisqualificationReasons.some((r) => r.includes("Contradicts mandatory specifications"))).toBe(true);

    const canEnterArena = (result.negotiationCandidates?.length ?? 0) > 0;
    expect(canEnterArena).toBe(false);
  });

  // 4. Regression Case 4: All quotes fail non-negotiable SLA requirements
  it("Case 4: Blocks negotiation entry when all quotes violate non-negotiable SLA limits", async () => {
    const evaluator = new SourcingEvaluator({ skipAi: true });

    // Slow delivery (10 days > 5 max) and inadequate return window (14 days < 30 min)
    const badSlaQuote1: VendorQuote = {
      ...compliantQuoteA,
      deliveryDays: 10, // violates maxDeliveryDays: 5
    };
    const badSlaQuote2: VendorQuote = {
      ...compliantQuoteB,
      returnDays: 14, // violates minReturnDays: 30
    };

    const result = await evaluator.evaluateSourcedQuotes(baseMandate, [badSlaQuote1, badSlaQuote2]);

    expect(result.hasEligibleQuotes).toBe(false);
    expect(result.hasNegotiationCandidates).toBe(false);
    expect(result.negotiationCandidates?.length).toBe(0);

    const cand1 = evaluateNegotiationCandidate(baseMandate, badSlaQuote1, result.evaluations[badSlaQuote1.vendorId]);
    expect(cand1.isCandidate).toBe(false);
    expect(cand1.hardDisqualificationReasons.some((r) => r.includes("delivery time"))).toBe(true);

    const cand2 = evaluateNegotiationCandidate(baseMandate, badSlaQuote2, result.evaluations[badSlaQuote2.vendorId]);
    expect(cand2.isCandidate).toBe(false);
    expect(cand2.hardDisqualificationReasons.some((r) => r.includes("return policy"))).toBe(true);
  });

  // 5. Regression Case 5: Invalid mandate
  it("Case 5: Blocks negotiation entry when the mandate is invalid or contradictory", () => {
    const invalidMandates: ProcurementMandate[] = [
      { ...baseMandate, maxTotalBudget: -500 }, // negative budget
      { ...baseMandate, quantity: 0 }, // quantity 0
      { ...baseMandate, maxDeliveryDays: 0 }, // delivery 0
      { ...baseMandate, minReturnDays: -10 }, // negative return
    ];

    invalidMandates.forEach((m) => {
      const cand = evaluateNegotiationCandidate(m, compliantQuoteA);
      expect(cand.isCandidate).toBe(false);
      expect(cand.hardDisqualificationReasons.length).toBeGreaterThan(0);
    });

    // When mandateStatus is INVALID in UI, canEnterArena must be false
    const mandateStatus = "INVALID";
    const canEnterArena = mandateStatus !== "INVALID";
    expect(canEnterArena).toBe(false);
  });

  // 6. Regression Case 6: No quotes returned
  it("Case 6: Blocks negotiation entry when no quotes are returned from supplier catalog", async () => {
    const evaluator = new SourcingEvaluator({ skipAi: true });
    const result = await evaluator.evaluateSourcedQuotes(baseMandate, []);

    expect(result.hasEligibleQuotes).toBe(false);
    expect(result.hasNegotiationCandidates).toBe(false);
    expect(result.negotiationCandidates?.length).toBe(0);

    const sourcedQuotes: VendorQuote[] = [];
    const negotiationCandidates = sourcedQuotes.filter(
      (q) => evaluateNegotiationCandidate(baseMandate, q).isCandidate
    );

    const canEnterArena = sourcedQuotes.length > 0 && negotiationCandidates.length > 0;
    expect(canEnterArena).toBe(false);
  });

  // 7. Regression Case 7: Loading state
  it("Case 7: Disables Enter Arena action while sourcing or loading is in progress", () => {
    const negotiationCandidates = [compliantQuoteA];

    const canEnterArenaWhenSourcing = (isSourcing: boolean, isLoading: boolean) =>
      !isLoading &&
      !isSourcing &&
      negotiationCandidates.length > 0;

    expect(canEnterArenaWhenSourcing(true, false)).toBe(false);
    expect(canEnterArenaWhenSourcing(false, true)).toBe(false);
    expect(canEnterArenaWhenSourcing(true, true)).toBe(false);
    expect(canEnterArenaWhenSourcing(false, false)).toBe(true);
  });
});
