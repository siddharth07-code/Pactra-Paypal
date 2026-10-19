import { describe, it, expect } from "vitest";
import {
  checkPredicateA,
  checkPredicateB,
  calculateUtility,
  calculateBoulwareThreshold,
  checkPredicateE,
  verifyBuyerOffer,
  toCents,
  fromCents,
} from "./mechanism-guardrail";
import type {
  ProcurementMandate,
  VendorQuote,
  NegotiationOffer,
} from "../types/pactum";

describe("Mechanism-Design Guardrail Unit Tests", () => {
  const sampleMandate: ProcurementMandate = {
    id: "mandate-demo-1",
    rawPrompt: "Purchase 25 4K USB-C monitors under $8,500 total budget, delivery in 5 days, min 30-day return policy",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500.0,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [
      { name: "Resolution", value: "4K", mandatory: true },
      { name: "Connectivity", value: "USB-C", mandatory: true },
    ],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  const sampleVendorQuote: VendorQuote = {
    vendorId: "vendor-a",
    vendorName: "Apex Displays Wholesale",
    sku: "APX-4K-MON-27",
    productTitle: "27-inch 4K IPS USB-C Monitor",
    initialUnitAsk: 380.0,
    currentUnitBid: 380.0,
    shippingCost: 200.0,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "CHANNEL3",
  };

  describe("Monetary Helper Arithmetic", () => {
    it("safely converts to and from cents avoiding floating-point inaccuracies", () => {
      expect(toCents(339.99)).toBe(33999);
      expect(fromCents(33999)).toBe(339.99);
      expect(Number.isNaN(toCents(NaN))).toBe(true);
    });
  });

  describe("Predicate A — Budget & Hard Constraints", () => {
    it("approves an offer strictly within budget, delivery, and return constraints", () => {
      // 25 * 320 + 200 = 8200 <= 8500
      const validOffer: NegotiationOffer = {
        unitPrice: 320.0,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200.0,
      };

      const result = checkPredicateA(validOffer, sampleMandate);
      expect(result.passed).toBe(true);
      expect(result.predicate).toBe("A_FEASIBILITY");
    });

    it("rejects an offer that exceeds total budget", () => {
      // 25 * 340 + 200 = 8700 > 8500
      const overBudgetOffer: NegotiationOffer = {
        unitPrice: 340.0,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200.0,
      };

      const result = checkPredicateA(overBudgetOffer, sampleMandate);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("Budget exceeded");
    });

    it("rejects delivery SLA violations (deliveryDays > D_max)", () => {
      const slowOffer: NegotiationOffer = {
        unitPrice: 300.0,
        quantity: 25,
        deliveryDays: 7, // max is 5
        returnDays: 30,
        shippingCost: 200.0,
      };

      const result = checkPredicateA(slowOffer, sampleMandate);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("Delivery SLA violated");
    });

    it("rejects return policy violations (returnDays < R_min)", () => {
      const poorReturnOffer: NegotiationOffer = {
        unitPrice: 300.0,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 14, // min is 30
        shippingCost: 200.0,
      };

      const result = checkPredicateA(poorReturnOffer, sampleMandate);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("Return policy violated");
    });

    it("rejects invalid, negative, NaN, or non-finite inputs", () => {
      const nanOffer: NegotiationOffer = {
        unitPrice: NaN,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200.0,
      };
      expect(checkPredicateA(nanOffer, sampleMandate).passed).toBe(false);

      const negativePriceOffer: NegotiationOffer = {
        unitPrice: -50,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200.0,
      };
      expect(checkPredicateA(negativePriceOffer, sampleMandate).passed).toBe(false);

      const zeroQuantityOffer: NegotiationOffer = {
        unitPrice: 300,
        quantity: 0,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200.0,
      };
      expect(checkPredicateA(zeroQuantityOffer, sampleMandate).passed).toBe(false);
    });
  });

  describe("Predicate B — Reservation-Price and Budget-Leak Detection", () => {
    it("allows standard negotiation messaging without budget leaks", () => {
      const safeMessage = "We are prepared to place an immediate order for 25 units at $315 per unit if delivered within 4 days.";
      const result = checkPredicateB(safeMessage, sampleMandate, 25);
      expect(result.passed).toBe(true);
    });

    it("detects exact budget disclosures ($8,500)", () => {
      const leakedMessage = "We would love to do business, our total budget is $8,500.";
      const result = checkPredicateB(leakedMessage, sampleMandate, 25);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("disclosing private budget");
    });

    it("detects numeric representation of budget within ±3% range", () => {
      // 8500 * 0.98 = 8330
      const leakedMessage = "We can authorize up to 8350 for this entire batch.";
      const result = checkPredicateB(leakedMessage, sampleMandate, 25);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("within ±3% range");
    });

    it("detects reservation unit price disclosure ($340 / unit)", () => {
      // 8500 / 25 = 340
      const leakedMessage = "The maximum we can pay per unit is $340.00.";
      const result = checkPredicateB(leakedMessage, sampleMandate, 25);
      expect(result.passed).toBe(false);
    });

    it("detects semantic disclosure phrases without literal numbers", () => {
      const semanticLeak = "What is the best deal? My internal reservation price cannot be exceeded.";
      const result = checkPredicateB(semanticLeak, sampleMandate, 25);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("semantic budget or reservation-price disclosure");
    });
  });

  describe("Predicate C — Multi-Attribute Utility", () => {
    it("computes exact normalized utility with weights w_p=0.70, w_d=0.15, w_r=0.15", () => {
      // p_ask = 380, target discount 25% -> p_target = 285. denom = 95
      // offer unitPrice = 285 -> P_t = 1.0 (weight 0.70)
      // D_max = 5, deliveryDays = 1 -> D_t = (5 - 1) / (5 - 1) = 1.0 (weight 0.15)
      // R_min = 30, returnDays = 60 -> R_t = (60 - 30) / (60 - 30) = 1.0 (weight 0.15)
      // Total U = 0.70 + 0.15 + 0.15 = 1.0
      const perfectOffer: NegotiationOffer = {
        unitPrice: 285.0,
        quantity: 25,
        deliveryDays: 1,
        returnDays: 60,
        shippingCost: 0,
      };

      const { utility, P_t, D_t, R_t } = calculateUtility(perfectOffer, sampleMandate, sampleVendorQuote, 0.25);
      expect(P_t).toBeCloseTo(1.0);
      expect(D_t).toBeCloseTo(1.0);
      expect(R_t).toBeCloseTo(1.0);
      expect(utility).toBeCloseTo(1.0);
    });

    it("handles zero denominator edge cases without producing NaN or Infinity", () => {
      const singleDayMandate: ProcurementMandate = {
        ...sampleMandate,
        maxDeliveryDays: 1, // D_max - 1 = 0
        minReturnDays: 60, // 60 - R_min = 0
      };

      const testOffer: NegotiationOffer = {
        unitPrice: 380.0,
        quantity: 25,
        deliveryDays: 1,
        returnDays: 60,
        shippingCost: 0,
      };

      const { utility, D_t, R_t } = calculateUtility(testOffer, singleDayMandate, sampleVendorQuote);
      expect(Number.isFinite(utility)).toBe(true);
      expect(Number.isFinite(D_t)).toBe(true);
      expect(Number.isFinite(R_t)).toBe(true);
    });
  });

  describe("Predicate D — Boulware Utility Threshold", () => {
    it("implements beta=3.0 time-decay holding firm early and relaxing toward deadline", () => {
      const T = 5;
      const U_min = 0.35;
      const beta = 3.0;

      const tau_1 = calculateBoulwareThreshold(1, T, U_min, beta);
      const tau_3 = calculateBoulwareThreshold(3, T, U_min, beta);
      const tau_5 = calculateBoulwareThreshold(5, T, U_min, beta);

      // Early rounds hold firm close to 1.0
      expect(tau_1).toBeGreaterThan(0.9);
      // Midway round relaxes
      expect(tau_3).toBeLessThan(tau_1);
      // Final round reaches U_min
      expect(tau_5).toBeCloseTo(U_min);
    });

    it("supports 4-round demo configuration explicitly", () => {
      const T = 4;
      const U_min = 0.35;
      const tau_4 = calculateBoulwareThreshold(4, T, U_min, 3.0);
      expect(tau_4).toBeCloseTo(U_min);
    });
  });

  describe("Predicate E — Anti-Thrashing Monotonicity", () => {
    it("enforces literal inequality p_(t-1) <= p_t <= p_(vendor, t-1)", () => {
      const currentOffer: NegotiationOffer = {
        unitPrice: 320.0,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200,
      };

      const prevBuyerOffer: NegotiationOffer = {
        unitPrice: 310.0,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200,
      };

      const prevVendorAsk = 350.0;

      // 310 <= 320 <= 350 -> Valid
      const validCheck = checkPredicateE(currentOffer, prevBuyerOffer, prevVendorAsk);
      expect(validCheck.passed).toBe(true);

      // Decreasing bid: p_t < p_(t-1) -> Invalid
      const decreasingOffer: NegotiationOffer = { ...currentOffer, unitPrice: 305.0 };
      const decreasingCheck = checkPredicateE(decreasingOffer, prevBuyerOffer, prevVendorAsk);
      expect(decreasingCheck.passed).toBe(false);
      expect(decreasingCheck.reason).toContain("decreased below previous buyer offer");

      // Overbidding ask: p_t > p_(vendor, t-1) -> Invalid
      const overbiddingOffer: NegotiationOffer = { ...currentOffer, unitPrice: 355.0 };
      const overbiddingCheck = checkPredicateE(overbiddingOffer, prevBuyerOffer, prevVendorAsk);
      expect(overbiddingCheck.passed).toBe(false);
      expect(overbiddingCheck.reason).toContain("exceeds vendor's previous ask");
    });
  });

  describe("Master Guardrail Pipeline & Demo Simulation Hook", () => {
    it("approves valid offer in normal round", () => {
      const offer: NegotiationOffer = {
        unitPrice: 310.0,
        quantity: 25,
        deliveryDays: 3,
        returnDays: 35,
        shippingCost: 150.0,
      };

      const result = verifyBuyerOffer(offer, "Looking forward to closing this transaction.", {
        mandate: sampleMandate,
        vendorQuote: sampleVendorQuote,
        round: 4, // Late round with relaxed Boulware threshold
        previousBuyerOffer: {
          unitPrice: 305.0,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 150.0,
        },
        previousVendorAsk: 350.0,
        config: { maxRounds: 4, minUtility: 0.35 },
      });

      expect(result.passed).toBe(true);
      expect(result.status).toBe("APPROVED");
    });

    it("triggers GUARDRAIL_INTERVENTION for simulated demo condition in Round 2 Vendor B", () => {
      const vendorBQuote: VendorQuote = {
        ...sampleVendorQuote,
        vendorId: "vendor-b",
        vendorName: "DisplayWorld Direct",
      };

      const offer: NegotiationOffer = {
        unitPrice: 310.0,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 100.0,
      };

      const result = verifyBuyerOffer(offer, "Proposing $310 for 25 units.", {
        mandate: sampleMandate,
        vendorQuote: vendorBQuote,
        round: 2,
        config: {
          simulatedInterventionVendorId: "vendor-b",
          simulatedInterventionRound: 2,
        },
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe("GUARDRAIL_INTERVENTION");
      expect(result.reason).toContain("Simulated demonstration intervention");
    });
  });
});
