/**
 * PACTUM — Sourcing & Vendor Evaluation Intelligence Unit & Integration Tests
 * Comprehensive tests for Phase 3:
 * - Product compatibility (deterministic + Gemini fallback, category matching, unknown handling)
 * - Financial validation (integer minor units, budget ceiling, currency validation)
 * - SLA validation (delivery SLA, return window, condition)
 * - Explainable vendor ranking (score components, reproducibility, disqualified exclusion)
 * - Provenance tracking (fixtures, live quotes, AI-assisted)
 * - State integrity & negotiation handoff (disqualified quotes blocked, mandate revision invalidation)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SourcingEvaluator,
  evaluateVendorQuote,
  matchSpecificationDeterministically,
} from "./sourcing-evaluator";
import { sessionStore } from "./session-store";
import type { ProcurementMandate, VendorQuote } from "../types/pactum";

describe("Sourcing & Vendor Evaluation Intelligence (Phase 3)", () => {
  const baseMandate: ProcurementMandate = {
    id: "mandate-eval-test",
    rawPrompt: "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within 5 days and a minimum 30-day return policy.",
    itemQuery: "4K USB-C Business Monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    currency: "USD",
    requiredCondition: "NEW",
    requiredSpecs: [
      { name: "Resolution", value: "4K", mandatory: true },
      { name: "Connectivity", value: "USB-C", mandatory: true },
    ],
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const eligibleQuoteA: VendorQuote = {
    vendorId: "vendor-apex-monitors",
    vendorName: "Apex Displays Wholesale",
    sku: "APX-MON-4K-USBC-27",
    productTitle: 'Apex Pro 27" 4K UHD IPS USB-C Monitor 90W PD',
    category: "monitors",
    initialUnitAsk: 320.0, // 320 * 25 = 8000 + 150 = 8150 (<= 8500)
    currentUnitBid: 320.0,
    shippingCost: 150.0,
    deliveryDays: 4, // <= 5
    returnDays: 30, // >= 30
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  const eligibleQuoteB: VendorQuote = {
    vendorId: "vendor-displayworld-monitors",
    vendorName: "DisplayWorld Direct",
    sku: "DWD-4K-27-UB",
    productTitle: 'DisplayWorld Ultra 27" 4K Business Display USB-C',
    category: "monitors",
    initialUnitAsk: 330.0, // 330 * 25 = 8250 + 100 = 8350 (<= 8500)
    currentUnitBid: 330.0,
    shippingCost: 100.0,
    deliveryDays: 3, // <= 5
    returnDays: 35, // >= 30
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  beforeEach(() => {
    sessionStore.clear();
  });

  // =========================================================================
  // 1. PRODUCT COMPATIBILITY
  // =========================================================================
  describe("1. Product Compatibility", () => {
    it("exact structured attribute match for resolution and USB-C", () => {
      const resMatch = matchSpecificationDeterministically(
        "Resolution",
        "4K",
        'Apex Pro 27" 4K UHD IPS USB-C Monitor',
        "APX-MON-4K-USBC-27"
      );
      expect(resMatch.matchStatus).toBe("MATCH");
      expect(resMatch.actualValue).toContain("4K");

      const connMatch = matchSpecificationDeterministically(
        "Connectivity",
        "USB-C",
        'Apex Pro 27" 4K UHD IPS USB-C Monitor',
        "APX-MON-4K-USBC-27"
      );
      expect(connMatch.matchStatus).toBe("MATCH");
    });

    it("identifies attribute mismatch when title explicitly indicates lower resolution", () => {
      const match = matchSpecificationDeterministically(
        "Resolution",
        "4K",
        'Apex Pro 27" 1080p FHD USB-C Monitor',
        "APX-MON-FHD-27"
      );
      expect(match.matchStatus).toBe("MISMATCH");
    });

    it("marks missing or unstated mandatory specification as UNKNOWN (never silent match)", () => {
      const match = matchSpecificationDeterministically(
        "ColorAccuracy",
        "100% sRGB DeltaE<2",
        'Apex Pro 27" 4K UHD IPS USB-C Monitor',
        "APX-MON-4K-USBC-27"
      );
      expect(match.matchStatus).toBe("UNKNOWN");
    });

    it("unknown mandatory specification results in NEEDS_REVIEW status (cannot automatically be ELIGIBLE)", async () => {
      const mandateWithUnverifiedSpec: ProcurementMandate = {
        ...baseMandate,
        requiredSpecs: [
          { name: "Resolution", value: "4K", mandatory: true },
          { name: "ColorCalibration", value: "DeltaE<1 Factory Calibrated", mandatory: true },
        ],
      };

      const evalResult = await evaluateVendorQuote(mandateWithUnverifiedSpec, eligibleQuoteA, { skipAi: true });
      expect(evalResult.status).toBe("NEEDS_REVIEW");
      expect(evalResult.reviewReasons.length).toBeGreaterThan(0);
      expect(evalResult.reviewReasons[0]).toContain("ColorCalibration");
      expect(evalResult.rankingScore).toBeUndefined(); // Cannot rank quotes requiring review
    });

    it("commercial category mismatch disqualifies the quote immediately (INELIGIBLE)", async () => {
      const serverQuote: VendorQuote = {
        ...eligibleQuoteA,
        vendorId: "vendor-server-test",
        category: "servers",
        productTitle: "2U Rackmount Enterprise Server Dual Xeon",
      };

      const evalResult = await evaluateVendorQuote(baseMandate, serverQuote, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.compatibility.categoryMatch).toBe(false);
      expect(evalResult.disqualificationReasons.some((r) => r.includes("category mismatch"))).toBe(true);
    });

    it("product condition mismatch disqualifies the quote (mandated NEW vs offered REFURBISHED)", async () => {
      const refurbishedQuote: VendorQuote = {
        ...eligibleQuoteA,
        condition: "REFURBISHED",
      };

      const evalResult = await evaluateVendorQuote(baseMandate, refurbishedQuote, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.sla.conditionCompliant).toBe(false);
      expect(evalResult.disqualificationReasons.some((r) => r.includes("REFURBISHED"))).toBe(true);
    });
  });

  // =========================================================================
  // 2. DETERMINISTIC FINANCIAL VALIDATION
  // =========================================================================
  describe("2. Deterministic Financial Validation", () => {
    it("calculates landed cost accurately using integer minor units (p * q + s)", async () => {
      const quote: VendorQuote = {
        ...eligibleQuoteA,
        initialUnitAsk: 320.55,
        shippingCost: 149.99,
      };

      const evalResult = await evaluateVendorQuote(baseMandate, quote, { skipAi: true });
      // 320.55 * 25 = 8013.75 + 149.99 = 8163.74
      expect(evalResult.financials.landedCost).toBe(8163.74);
      expect(evalResult.financials.withinBudget).toBe(true);
      expect(evalResult.financials.budgetVariance).toBe(-336.26); // savings
    });

    it("rejects offer when landed cost exceeds the mandate total budget (INELIGIBLE)", async () => {
      const expensiveQuote: VendorQuote = {
        ...eligibleQuoteA,
        initialUnitAsk: 400.0, // 400 * 25 = 10,000 + 150 = 10,150 (> 8,500)
        shippingCost: 150.0,
      };

      const evalResult = await evaluateVendorQuote(baseMandate, expensiveQuote, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.financials.withinBudget).toBe(false);
      expect(evalResult.financials.budgetVariance).toBe(1650.0);
      expect(evalResult.disqualificationReasons.some((r) => r.includes("exceeds maximum total budget"))).toBe(true);
      expect(evalResult.rankingScore).toBeUndefined();
    });

    it("disqualifies quotes with non-positive unit price or negative shipping", async () => {
      const zeroPriceQuote: VendorQuote = {
        ...eligibleQuoteA,
        initialUnitAsk: 0,
      };
      const evalResult = await evaluateVendorQuote(baseMandate, zeroPriceQuote, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.disqualificationReasons.some((r) => r.includes("Invalid asking price"))).toBe(true);
    });

    it("disqualifies quotes with unsupported currency", async () => {
      const yenMandate: ProcurementMandate = {
        ...baseMandate,
        currency: "JPY" as unknown as ProcurementMandate["currency"],
      };
      const evalResult = await evaluateVendorQuote(yenMandate, eligibleQuoteA, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.disqualificationReasons.some((r) => r.includes("Unsupported mandate currency"))).toBe(true);
    });

    it("disqualifies invalid mandate quantity (< 1 or non-integer)", async () => {
      const invalidQtyMandate: ProcurementMandate = {
        ...baseMandate,
        quantity: 0,
      };
      const evalResult = await evaluateVendorQuote(invalidQtyMandate, eligibleQuoteA, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.disqualificationReasons.some((r) => r.includes("Invalid mandate quantity"))).toBe(true);
    });
  });

  // =========================================================================
  // 3. DETERMINISTIC SLA VALIDATION
  // =========================================================================
  describe("3. Deterministic SLA Validation", () => {
    it("passes when delivery days is strictly <= maxDeliveryDays", async () => {
      const fastQuote: VendorQuote = { ...eligibleQuoteA, deliveryDays: 4 };
      const evalResult = await evaluateVendorQuote(baseMandate, fastQuote, { skipAi: true });
      expect(evalResult.sla.deliveryCompliant).toBe(true);
    });

    it("disqualifies quote when delivery exceeds maxDeliveryDays (INELIGIBLE)", async () => {
      const slowQuote: VendorQuote = {
        ...eligibleQuoteA,
        deliveryDays: 7, // max is 5
      };
      const evalResult = await evaluateVendorQuote(baseMandate, slowQuote, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.sla.deliveryCompliant).toBe(false);
      expect(evalResult.disqualificationReasons.some((r) => r.includes("exceeds mandated maximum delivery time"))).toBe(true);
    });

    it("passes when returnDays is strictly >= minReturnDays", async () => {
      const compliantReturnQuote: VendorQuote = { ...eligibleQuoteA, returnDays: 30 };
      const evalResult = await evaluateVendorQuote(baseMandate, compliantReturnQuote, { skipAi: true });
      expect(evalResult.sla.returnCompliant).toBe(true);
    });

    it("disqualifies quote when return window is less than minReturnDays (INELIGIBLE)", async () => {
      const shortReturnQuote: VendorQuote = {
        ...eligibleQuoteA,
        returnDays: 14, // min is 30
      };
      const evalResult = await evaluateVendorQuote(baseMandate, shortReturnQuote, { skipAi: true });
      expect(evalResult.status).toBe("INELIGIBLE");
      expect(evalResult.sla.returnCompliant).toBe(false);
      expect(evalResult.disqualificationReasons.some((r) => r.includes("less than mandated minimum return window"))).toBe(true);
    });
  });

  // =========================================================================
  // 4. EXPLAINABLE VENDOR RANKING
  // =========================================================================
  describe("4. Explainable Vendor Ranking", () => {
    it("ranks multiple eligible offers deterministically and gives higher cost score to lower landed cost", async () => {
      const evaluator = new SourcingEvaluator({ skipAi: true });
      const result = await evaluator.evaluateSourcedQuotes(baseMandate, [eligibleQuoteA, eligibleQuoteB]);

      expect(result.eligibleQuotes.length).toBe(2);
      expect(result.hasEligibleQuotes).toBe(true);

      const evalA = result.evaluations[eligibleQuoteA.vendorId];
      const evalB = result.evaluations[eligibleQuoteB.vendorId];

      expect(evalA.rankingScore).toBeDefined();
      expect(evalB.rankingScore).toBeDefined();
      expect(evalA.rankingBreakdown).toBeDefined();

      // Quote A has lower landed cost ($8,150 vs $8,350), so Quote A should have higher costScore
      expect(evalA.rankingBreakdown!.costScore).toBeGreaterThanOrEqual(evalB.rankingBreakdown!.costScore);

      // Quote B has faster delivery (3d vs 4d) and longer return (35d vs 30d)
      expect(evalB.rankingBreakdown!.deliveryScore).toBeGreaterThanOrEqual(evalA.rankingBreakdown!.deliveryScore);
      expect(evalB.rankingBreakdown!.returnScore).toBeGreaterThanOrEqual(evalA.rankingBreakdown!.returnScore);

      // Verify explanation string is generated
      expect(evalA.rankingExplanation).toBeDefined();
      expect(evalA.rankingExplanation).toContain("Apex Displays Wholesale");
      expect(evalA.rankingExplanation).toContain("8150.00");
    });

    it("cheaper incompatible offer must NEVER outrank an eligible offer (hard constraints precede ranking)", async () => {
      const cheapIncompatibleQuote: VendorQuote = {
        ...eligibleQuoteA,
        vendorId: "vendor-cheap-bad-delivery",
        initialUnitAsk: 200.0, // extremely cheap: $5,150 total vs $8,500 budget
        deliveryDays: 10, // violates 5-day max delivery constraint!
      };

      const evaluator = new SourcingEvaluator({ skipAi: true });
      const result = await evaluator.evaluateSourcedQuotes(baseMandate, [cheapIncompatibleQuote, eligibleQuoteA]);

      // cheapIncompatibleQuote must be INELIGIBLE
      expect(result.ineligibleQuotes.length).toBe(1);
      expect(result.eligibleQuotes.length).toBe(1);
      expect(result.bestQuote?.vendorId).toBe(eligibleQuoteA.vendorId);
      expect(result.evaluations[cheapIncompatibleQuote.vendorId].rankingScore).toBeUndefined();
    });

    it("ranking score is completely reproducible for identical inputs", async () => {
      const evaluator1 = new SourcingEvaluator({ skipAi: true });
      const evaluator2 = new SourcingEvaluator({ skipAi: true });

      const res1 = await evaluator1.evaluateSourcedQuotes(baseMandate, [eligibleQuoteA, eligibleQuoteB]);
      const res2 = await evaluator2.evaluateSourcedQuotes(baseMandate, [eligibleQuoteA, eligibleQuoteB]);

      const scoreA1 = res1.evaluations[eligibleQuoteA.vendorId].rankingScore;
      const scoreA2 = res2.evaluations[eligibleQuoteA.vendorId].rankingScore;
      const scoreB1 = res1.evaluations[eligibleQuoteB.vendorId].rankingScore;
      const scoreB2 = res2.evaluations[eligibleQuoteB.vendorId].rankingScore;

      expect(scoreA1).toBe(scoreA2);
      expect(scoreB1).toBe(scoreB2);
    });
  });

  // =========================================================================
  // 5. PROVENANCE TRACKING
  // =========================================================================
  describe("5. Provenance Tracking", () => {
    it("distinguishes mock catalog simulation fixtures from live channel3 quotes", async () => {
      const liveQuote: VendorQuote = {
        ...eligibleQuoteA,
        vendorId: "vendor-live-test",
        dataSource: "CHANNEL3",
      };

      const evalFixture = await evaluateVendorQuote(baseMandate, eligibleQuoteA, { skipAi: true });
      const evalLive = await evaluateVendorQuote(baseMandate, liveQuote, { skipAi: true });

      expect(evalFixture.evidence.isFixture).toBe(true);
      expect(evalFixture.evidence.dataSource).toBe("MOCK_CATALOG");
      expect(evalFixture.evaluationProvenance).toBe("SIMULATED_FIXTURE");

      expect(evalLive.evidence.isFixture).toBe(false);
      expect(evalLive.evidence.dataSource).toBe("CHANNEL3");
      expect(evalLive.evidence.merchantAttestationWarning).toContain("merchant DOM attestation required");
    });
  });

  // =========================================================================
  // 6. STATE INTEGRITY & NEGOTIATION HANDOFF
  // =========================================================================
  describe("6. State Integrity & Negotiation Handoff", () => {
    it("stores evaluations in authoritative session and clears them on mandate revision", () => {
      const session = sessionStore.createSession(baseMandate, [eligibleQuoteA]);
      session.quoteEvaluations = {
        [eligibleQuoteA.vendorId]: {
          vendorId: eligibleQuoteA.vendorId,
          vendorName: eligibleQuoteA.vendorName,
          sku: eligibleQuoteA.sku,
          productTitle: eligibleQuoteA.productTitle,
          status: "ELIGIBLE",
          financials: {
            unitPrice: 320,
            quantity: 25,
            shippingCost: 150,
            landedCost: 8150,
            maxTotalBudget: 8500,
            withinBudget: true,
            budgetVariance: -350,
            currency: "USD",
            currencySupported: true,
          },
          sla: {
            offeredDeliveryDays: 4,
            mandatedMaxDeliveryDays: 5,
            deliveryCompliant: true,
            offeredReturnDays: 30,
            mandatedMinReturnDays: 30,
            returnCompliant: true,
            offeredCondition: "NEW",
            conditionCompliant: true,
          },
          compatibility: {
            categoryMatch: true,
            detectedCategory: "monitors",
            mandatedCategory: "monitors",
            specificationMatches: [],
            overallCompatibility: "MATCH",
            explanation: "Verified",
          },
          evidence: {
            dataSource: "MOCK_CATALOG",
            isFixture: true,
            hasMerchantAttestation: false,
          },
          disqualificationReasons: [],
          reviewReasons: [],
          rankingScore: 85,
          evaluationProvenance: "DETERMINISTIC_RULES",
          evaluatedAt: new Date().toISOString(),
        },
      };
      sessionStore.saveSession(session);

      const retrieved = sessionStore.getSession(session.id);
      expect(retrieved?.quoteEvaluations).toBeDefined();
      expect(retrieved?.quoteEvaluations?.[eligibleQuoteA.vendorId]?.status).toBe("ELIGIBLE");

      // Mandate revision must invalidate stale quote evaluations
      const revised = sessionStore.reviseMandate(session.id, { maxTotalBudget: 7500 });
      expect(revised.quoteEvaluations).toBeUndefined();
      expect(revised.sourcingSummary).toBeUndefined();
      expect(revised.status).toBe("MANDATE_PENDING");
    });

    it("evaluator produces hasEligibleQuotes = false when all quotes are disqualified", async () => {
      const disqualified1: VendorQuote = { ...eligibleQuoteA, initialUnitAsk: 500 }; // over budget
      const disqualified2: VendorQuote = { ...eligibleQuoteB, deliveryDays: 10 }; // slow delivery

      const evaluator = new SourcingEvaluator({ skipAi: true });
      const result = await evaluator.evaluateSourcedQuotes(baseMandate, [disqualified1, disqualified2]);

      expect(result.hasEligibleQuotes).toBe(false);
      expect(result.eligibleQuotes.length).toBe(0);
      expect(result.ineligibleQuotes.length).toBe(2);
      expect(result.summary.ineligibleCount).toBe(2);
      expect(result.bestQuote).toBeUndefined();
    });
  });
});
