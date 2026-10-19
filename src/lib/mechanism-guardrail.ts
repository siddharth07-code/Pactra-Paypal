/**
 * PACTUM — Mechanism-Design Guardrail
 * As specified in GEMINI.md Section 5 and SECURITY.md Section 6.
 *
 * Implements deterministic verification of every outgoing buyer offer x_t = (p_t, q_t, d_t, r_t)
 * and outgoing buyer message m_t before transmission to any vendor.
 */

import type {
  NegotiationOffer,
  GuardrailResult,
  GuardrailCheckDetail,
  ProcurementMandate,
  VendorQuote,
} from "../types/pactum";

export interface GuardrailConfig {
  maxRounds?: number; // T, default 5, hackathon demo uses 4
  minUtility?: number; // U_min, default 0.35
  boulwareBeta?: number; // beta, default 3.0
  targetPriceDiscount?: number; // e.g. 0.25 (25% off initial ask)
  simulatedInterventionVendorId?: string; // e.g. "vendor-b"
  simulatedInterventionRound?: number; // e.g. 2
}

export interface GuardrailContext {
  mandate: ProcurementMandate;
  vendorQuote: VendorQuote;
  round: number; // t (1...T)
  previousBuyerOffer?: NegotiationOffer; // offer at t-1
  previousVendorAsk?: number; // vendor's unit ask at t-1
  config?: GuardrailConfig;
}

/**
 * Monetary helper: safely converts currency units (dollars) to integer minor units (cents)
 */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100);
}

/**
 * Monetary helper: converts integer minor units (cents) back to standard currency units
 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Predicate A — Budget and Constraint Feasibility
 *
 * Require:
 * Total(x_t) = (p_t * q_t) + S_ship(x_t) <= B_max
 * d_t <= D_max
 * r_t >= R_min
 * Also validates: positive quantities, finite non-negative prices & shipping, all required fields.
 */
export function checkPredicateA(
  offer: NegotiationOffer,
  mandate: ProcurementMandate
): GuardrailCheckDetail {
  // Validate basic numerical integrity
  if (
    !offer ||
    typeof offer.unitPrice !== "number" ||
    typeof offer.quantity !== "number" ||
    typeof offer.deliveryDays !== "number" ||
    typeof offer.returnDays !== "number" ||
    typeof offer.shippingCost !== "number"
  ) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: "Malformed offer: all attributes (unitPrice, quantity, deliveryDays, returnDays, shippingCost) must be numeric.",
    };
  }

  if (
    !Number.isFinite(offer.unitPrice) ||
    !Number.isFinite(offer.quantity) ||
    !Number.isFinite(offer.deliveryDays) ||
    !Number.isFinite(offer.returnDays) ||
    !Number.isFinite(offer.shippingCost)
  ) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: "Invalid numerical values: attributes must be finite real numbers (NaN or Infinity rejected).",
    };
  }

  if (offer.quantity <= 0 || !Number.isInteger(offer.quantity)) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Invalid quantity: ${offer.quantity}. Quantity must be a positive integer.`,
      computedValues: { quantity: offer.quantity },
    };
  }

  if (offer.unitPrice < 0) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Invalid unit price: ${offer.unitPrice}. Unit price cannot be negative.`,
      computedValues: { unitPrice: offer.unitPrice },
    };
  }

  if (offer.shippingCost < 0) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Invalid shipping cost: ${offer.shippingCost}. Shipping cost cannot be negative.`,
      computedValues: { shippingCost: offer.shippingCost },
    };
  }

  if (offer.deliveryDays <= 0) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Invalid delivery days: ${offer.deliveryDays}. Delivery time must be greater than zero.`,
      computedValues: { deliveryDays: offer.deliveryDays },
    };
  }

  if (offer.returnDays < 0) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Invalid return days: ${offer.returnDays}. Return window cannot be negative.`,
      computedValues: { returnDays: offer.returnDays },
    };
  }

  // Safe integer minor unit (cents) arithmetic for total check
  const unitPriceCents = toCents(offer.unitPrice);
  const shippingCents = toCents(offer.shippingCost);
  const totalCents = unitPriceCents * offer.quantity + shippingCents;
  const maxBudgetCents = toCents(mandate.maxTotalBudget);

  const totalCost = fromCents(totalCents);

  if (totalCents > maxBudgetCents) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Budget exceeded: total cost ${totalCost.toFixed(2)} exceeds maximum budget ${mandate.maxTotalBudget.toFixed(2)}.`,
      computedValues: {
        totalCost,
        maxBudget: mandate.maxTotalBudget,
        difference: totalCost - mandate.maxTotalBudget,
      },
    };
  }

  if (offer.deliveryDays > mandate.maxDeliveryDays) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Delivery SLA violated: ${offer.deliveryDays} days exceeds maximum allowed ${mandate.maxDeliveryDays} days.`,
      computedValues: {
        deliveryDays: offer.deliveryDays,
        maxDeliveryDays: mandate.maxDeliveryDays,
      },
    };
  }

  if (offer.returnDays < mandate.minReturnDays) {
    return {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Return policy violated: ${offer.returnDays} days is less than required minimum ${mandate.minReturnDays} days.`,
      computedValues: {
        returnDays: offer.returnDays,
        minReturnDays: mandate.minReturnDays,
      },
    };
  }

  return {
    passed: true,
    predicate: "A_FEASIBILITY",
    computedValues: {
      totalCost,
      maxBudget: mandate.maxTotalBudget,
      deliveryDays: offer.deliveryDays,
      returnDays: offer.returnDays,
    },
  };
}

/**
 * Predicate B — Reservation-Price and Budget-Leak Detection
 *
 * Inspects outgoing message m_t using deterministic regex and numeric-token scanning.
 * Reject messages containing:
 * - The private maximum budget B_max.
 * - Numeric representations of the budget within the specified ±3% range.
 * - The reservation unit price p_max = B_max / q_t or ±3% of p_max.
 * - Explicit reservation-price disclosure phrases.
 */
export function checkPredicateB(
  message: string,
  mandate: ProcurementMandate,
  quantity: number
): GuardrailCheckDetail {
  if (!message || typeof message !== "string") {
    return {
      passed: true,
      predicate: "B_RESERVATION_LEAK",
      computedValues: { scannedLength: 0 },
    };
  }

  const B_max = mandate.maxTotalBudget;
  const q = quantity > 0 ? quantity : mandate.quantity;
  const p_max = B_max / q;

  // Range 1: Total budget ±3%
  const budgetMin = B_max * 0.97;
  const budgetMax = B_max * 1.03;

  // Range 2: Reservation unit price ±3%
  const unitMin = p_max * 0.97;
  const unitMax = p_max * 1.03;

  // 1. Extract all numeric tokens from message (handling currency symbols, commas, decimals)
  // e.g. "$8,500", "8500", "8500.00", "$340", "8350"
  const numberMatches = message.match(/[\$€£]?\b\d+(?:,\d{3})*(?:\.\d+)?\b/g);

  if (numberMatches) {
    for (const token of numberMatches) {
      const sanitized = token.replace(/[\$,€£]/g, "");
      const value = parseFloat(sanitized);

      if (!Number.isFinite(value)) continue;

      // Check total budget ±3%
      if (value >= budgetMin && value <= budgetMax) {
        return {
          passed: false,
          predicate: "B_RESERVATION_LEAK",
          reason: `Detected token "${token}" (${value}) disclosing private budget within ±3% range [${budgetMin.toFixed(2)}, ${budgetMax.toFixed(2)}].`,
          computedValues: {
            detectedValue: value,
            budgetMin,
            budgetMax,
          },
        };
      }

      // Check reservation unit price ±3% (only for meaningful values > 10 to prevent small false positives like 3 monitors)
      if (p_max >= 10 && value >= unitMin && value <= unitMax) {
        return {
          passed: false,
          predicate: "B_RESERVATION_LEAK",
          reason: `Detected token "${token}" (${value}) disclosing private reservation unit price within ±3% range [${unitMin.toFixed(2)}, ${unitMax.toFixed(2)}].`,
          computedValues: {
            detectedValue: value,
            unitMin,
            unitMax,
          },
        };
      }
    }
  }

  // 2. Regex patterns for explicit reservation price / budget disclosure declarations
  const disclosureRegexes = [
    /\b(?:my|our|the)\s+(?:max(?:imum)?|total|ceiling)\s+budget\s+is\b/i,
    /\b(?:we|i)\s+can\s+(?:spend|pay)\s+up\s+to\b/i,
    /\b(?:my|our)\s+reservation\s+price\b/i,
    /\b(?:max(?:imum)?\s+willingness\s+to\s+pay|wtp)\b/i,
    /\b(?:private|internal)\s+(?:budget|reservation|target)\b/i,
  ];

  for (const regex of disclosureRegexes) {
    if (regex.test(message)) {
      return {
        passed: false,
        predicate: "B_RESERVATION_LEAK",
        reason: "Prohibited semantic budget or reservation-price disclosure detected in message text.",
        computedValues: { patternMatched: regex.source },
      };
    }
  }

  return {
    passed: true,
    predicate: "B_RESERVATION_LEAK",
    computedValues: { checkedTokens: numberMatches?.length ?? 0 },
  };
}

/**
 * Predicate C — Multi-Attribute Utility
 *
 * U_b(x_t) = w_p * P_t + w_d * D_t + w_r * R_t
 * Where:
 * P_t = (p_ask - p_t) / (p_ask - p_target)
 * D_t = (D_max - d_t) / (D_max - 1)
 * R_t = (r_t - R_min) / (60 - R_min)
 * Weights: w_p = 0.70, w_d = 0.15, w_r = 0.15
 *
 * Handles zero denominators, invalid ranges, and utility bounds explicitly.
 */
export function calculateUtility(
  offer: NegotiationOffer,
  mandate: ProcurementMandate,
  vendorQuote: VendorQuote,
  targetDiscount: number = 0.25
): {
  utility: number;
  P_t: number;
  D_t: number;
  R_t: number;
} {
  const w_p = 0.7;
  const w_d = 0.15;
  const w_r = 0.15;

  const p_ask = vendorQuote.initialUnitAsk;
  // target price: e.g. 25% discount off initial unit ask
  const p_target = p_ask * (1 - targetDiscount);

  // Price component P_t
  let P_t = 0;
  const priceDenom = p_ask - p_target;
  if (priceDenom > 0) {
    P_t = (p_ask - offer.unitPrice) / priceDenom;
  } else {
    P_t = offer.unitPrice <= p_ask ? 1 : 0;
  }
  // Clamp normalized component to [0, 1] for safe utility calculation
  P_t = Math.max(0, Math.min(1, P_t));

  // Delivery component D_t = (D_max - d_t) / (D_max - 1)
  let D_t = 0;
  const deliveryDenom = mandate.maxDeliveryDays - 1;
  if (deliveryDenom > 0) {
    D_t = (mandate.maxDeliveryDays - offer.deliveryDays) / deliveryDenom;
  } else {
    D_t = offer.deliveryDays <= mandate.maxDeliveryDays ? 1 : 0;
  }
  D_t = Math.max(0, Math.min(1, D_t));

  // Return window component R_t = (r_t - R_min) / (60 - R_min)
  let R_t = 0;
  const returnDenom = 60 - mandate.minReturnDays;
  if (returnDenom > 0) {
    R_t = (offer.returnDays - mandate.minReturnDays) / returnDenom;
  } else {
    R_t = offer.returnDays >= mandate.minReturnDays ? 1 : 0;
  }
  R_t = Math.max(0, Math.min(1, R_t));

  const utility = w_p * P_t + w_d * D_t + w_r * R_t;

  return {
    utility: Math.max(0, Math.min(1, utility)),
    P_t,
    D_t,
    R_t,
  };
}

/**
 * Predicate D — Boulware Threshold
 *
 * tau(t) = U_min + (1 - U_min) * (1 - (t / T)^beta)
 * Where:
 * beta = 3.0
 * T is maximum number of rounds (default 5, demo configuration 4)
 * U_min is configured minimum utility
 * Require: U_b(x_t) >= tau(t)
 */
export function calculateBoulwareThreshold(
  t: number,
  T: number = 5,
  U_min: number = 0.35,
  beta: number = 3.0
): number {
  if (T <= 0) return U_min;
  // Normalized round progress: clamped to [0, 1]
  const progress = Math.max(0, Math.min(1, t / T));
  const decay = Math.pow(progress, beta);
  const threshold = U_min + (1 - U_min) * (1 - decay);
  return Math.max(0, Math.min(1, threshold));
}

/**
 * Predicate E — Anti-Thrashing Price Monotonicity
 *
 * Enforce the specification's price monotonicity rule:
 * p_(t-1) <= p_t <= p_(vendor, t-1)
 *
 * Note on initial round t=1:
 * In round 1, there is no previous buyer offer (t-1). The lower bound p_(t-1) is not applicable.
 * The upper bound is the vendor's initial ask p_(vendor, 0).
 */
export function checkPredicateE(
  offer: NegotiationOffer,
  previousBuyerOffer?: NegotiationOffer,
  previousVendorAsk?: number
): GuardrailCheckDetail {
  const p_t = offer.unitPrice;

  // Upper bound check: p_t <= p_(vendor, t-1)
  if (typeof previousVendorAsk === "number" && Number.isFinite(previousVendorAsk)) {
    // Add micro-tolerance for floating-point arithmetic (1 cent)
    if (toCents(p_t) > toCents(previousVendorAsk)) {
      return {
        passed: false,
        predicate: "E_ANTI_THRASHING",
        reason: `Anti-thrashing violated: buyer offer ${p_t.toFixed(2)} exceeds vendor's previous ask ${previousVendorAsk.toFixed(2)} (p_t <= p_(vendor, t-1)).`,
        computedValues: {
          proposedPrice: p_t,
          vendorPreviousAsk: previousVendorAsk,
        },
      };
    }
  }

  // Lower bound check: p_(t-1) <= p_t
  if (previousBuyerOffer && Number.isFinite(previousBuyerOffer.unitPrice)) {
    const p_prev = previousBuyerOffer.unitPrice;
    if (toCents(p_t) < toCents(p_prev)) {
      return {
        passed: false,
        predicate: "E_ANTI_THRASHING",
        reason: `Anti-thrashing violated: buyer offer ${p_t.toFixed(2)} decreased below previous buyer offer ${p_prev.toFixed(2)} (p_(t-1) <= p_t).`,
        computedValues: {
          proposedPrice: p_t,
          previousBuyerOffer: p_prev,
        },
      };
    }
  }

  return {
    passed: true,
    predicate: "E_ANTI_THRASHING",
    computedValues: {
      proposedPrice: p_t,
      previousBuyerOffer: previousBuyerOffer?.unitPrice,
      previousVendorAsk,
    },
  };
}

/**
 * Master Verification Pipeline:
 * Validates outgoing buyer offer x_t and optional message m_t against all predicates.
 */
export function verifyBuyerOffer(
  offer: NegotiationOffer,
  message: string,
  context: GuardrailContext
): GuardrailResult {
  const { mandate, vendorQuote, round, previousBuyerOffer, previousVendorAsk, config } = context;

  const T = config?.maxRounds ?? 5;
  const U_min = config?.minUtility ?? 0.35;
  const beta = config?.boulwareBeta ?? 3.0;
  const targetDiscount = config?.targetPriceDiscount ?? 0.25;

  const details: GuardrailCheckDetail[] = [];

  // Check demo simulation hook: Round 2 with Vendor B
  if (
    config?.simulatedInterventionVendorId &&
    config?.simulatedInterventionRound &&
    vendorQuote.vendorId === config.simulatedInterventionVendorId &&
    round === config.simulatedInterventionRound
  ) {
    const interventionDetail: GuardrailCheckDetail = {
      passed: false,
      predicate: "A_FEASIBILITY",
      reason: `Simulated demonstration intervention triggered in Round ${round} for ${vendorQuote.vendorName}: deliberate boundary constraint check.`,
      computedValues: {
        vendorId: vendorQuote.vendorId,
        round,
      },
    };
    return {
      passed: false,
      status: "GUARDRAIL_INTERVENTION",
      reason: interventionDetail.reason,
      predicateFailed: "A_FEASIBILITY",
      details: [interventionDetail],
    };
  }

  // Predicate A: Feasibility
  const predA = checkPredicateA(offer, mandate);
  details.push(predA);
  if (!predA.passed) {
    return {
      passed: false,
      status: "GUARDRAIL_BLOCKED",
      reason: predA.reason,
      predicateFailed: "A_FEASIBILITY",
      details,
    };
  }

  // Predicate B: Reservation-Price Leakage
  const predB = checkPredicateB(message, mandate, offer.quantity);
  details.push(predB);
  if (!predB.passed) {
    return {
      passed: false,
      status: "GUARDRAIL_BLOCKED",
      reason: predB.reason,
      predicateFailed: "B_RESERVATION_LEAK",
      details,
    };
  }

  // Predicate C: Multi-attribute Utility calculation
  const { utility, P_t, D_t, R_t } = calculateUtility(offer, mandate, vendorQuote, targetDiscount);
  const predC: GuardrailCheckDetail = {
    passed: true,
    predicate: "C_UTILITY",
    computedValues: { utility, P_t, D_t, R_t },
  };
  details.push(predC);

  // Predicate D: Boulware Threshold check
  const threshold = calculateBoulwareThreshold(round, T, U_min, beta);
  const predDPassed = utility >= threshold - 1e-6; // small tolerance for floating point
  const predD: GuardrailCheckDetail = {
    passed: predDPassed,
    predicate: "D_BOULWARE",
    reason: predDPassed
      ? undefined
      : `Utility score ${utility.toFixed(4)} fails Boulware threshold ${threshold.toFixed(4)} in round ${round} of ${T}.`,
    computedValues: { utility, threshold, round, maxRounds: T },
  };
  details.push(predD);

  if (!predD.passed) {
    return {
      passed: false,
      status: "GUARDRAIL_BLOCKED",
      reason: predD.reason,
      predicateFailed: "D_BOULWARE",
      details,
      utilityScore: utility,
      boulwareThreshold: threshold,
    };
  }

  // Predicate E: Anti-Thrashing
  const predE = checkPredicateE(offer, previousBuyerOffer, previousVendorAsk);
  details.push(predE);
  if (!predE.passed) {
    return {
      passed: false,
      status: "GUARDRAIL_BLOCKED",
      reason: predE.reason,
      predicateFailed: "E_ANTI_THRASHING",
      details,
      utilityScore: utility,
      boulwareThreshold: threshold,
    };
  }

  return {
    passed: true,
    status: "APPROVED",
    details,
    utilityScore: utility,
    boulwareThreshold: threshold,
  };
}
