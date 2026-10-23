/**
 * PACTUM — Deterministic Vendor Simulation Engine
 * Implements Phase 4 realistic vendor simulations with distinct commercial strategies
 * and private commercial constraints (reservation prices / margin floors).
 *
 * Distinct simulation strategies:
 * - FIRM: Protects margins, concedes slowly, defends high floor.
 * - BALANCED: Makes moderate concessions, balances volume with margin.
 * - FLEXIBLE: Prioritizes closing deals, concedes aggressively within limits.
 *
 * Follows GEMINI.md Section 6 and Phase 4 Master Engineering Specification.
 */

import type { VendorQuote, NegotiationOffer, VendorStrategyType } from "../types/pactum";

/**
 * Internal private vendor simulation profile.
 * Maintained strictly server-side. Private reservation prices (minimumAcceptablePrice)
 * must NEVER be exposed in public SSE payloads or buyer-facing messages.
 */
export interface VendorSimulationProfile {
  vendorId: string;
  vendorName: string;
  strategyType: VendorStrategyType;
  initialUnitAsk: number;
  minimumAcceptablePrice: number; // Private reservation unit price (floor)
  concessionRateBase: number; // Base fraction of spread conceded (e.g. 0.18, 0.32, 0.45)
  concessionRateRoundGrowth: number; // Acceleration per round (e.g. 0.05, 0.10, 0.15)
  maxConcessionPerRound?: number; // Optional cap on price drop in a single round
  deliveryDays: number;
  returnDays: number;
  description: string;
}

/**
 * Output of a simulated vendor counteroffer.
 */
export interface VendorSimulationResult {
  unitAsk: number;
  message: string;
  accepted: boolean;
  atFloor: boolean;
  provenance: "SIMULATED_VENDOR";
  strategyType: VendorStrategyType;
}

/**
 * Deterministically derives a stable simulation profile for any vendor quote.
 * Standard fixture vendors (Apex, DisplayWorld, NexTech) have explicit assigned profiles.
 * Dynamic or unknown vendor IDs are assigned deterministically via stable hashing.
 */
export function getVendorSimulationProfile(
  quote: VendorQuote,
  customOverrides?: Partial<VendorSimulationProfile>
): VendorSimulationProfile {
  const idLower = quote.vendorId.toLowerCase();
  const nameLower = quote.vendorName.toLowerCase();

  // 1. Apex Displays / Firm Profile
  if (
    idLower.includes("apex") ||
    nameLower.includes("apex") ||
    idLower === "vendor-a"
  ) {
    const floor = Math.round(quote.initialUnitAsk * 0.88 * 100) / 100; // 12% max discount floor
    return {
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      strategyType: "FIRM",
      initialUnitAsk: quote.initialUnitAsk,
      minimumAcceptablePrice: customOverrides?.minimumAcceptablePrice ?? floor,
      concessionRateBase: 0.18,
      concessionRateRoundGrowth: 0.05,
      deliveryDays: quote.deliveryDays,
      returnDays: quote.returnDays,
      description: "Firm margin-protective supplier. Concedes slowly and defends a strict wholesale floor.",
      ...customOverrides,
    };
  }

  // 2. DisplayWorld / Balanced Profile
  if (
    idLower.includes("displayworld") ||
    nameLower.includes("displayworld") ||
    idLower === "vendor-b"
  ) {
    const floor = Math.round(quote.initialUnitAsk * 0.81 * 100) / 100; // 19% max discount floor
    return {
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      strategyType: "BALANCED",
      initialUnitAsk: quote.initialUnitAsk,
      minimumAcceptablePrice: customOverrides?.minimumAcceptablePrice ?? floor,
      concessionRateBase: 0.32,
      concessionRateRoundGrowth: 0.10,
      deliveryDays: quote.deliveryDays,
      returnDays: quote.returnDays,
      description: "Balanced commercial supplier. Balances margin preservation with deal progression.",
      ...customOverrides,
    };
  }

  // 3. NexTech / Flexible Profile
  if (
    idLower.includes("nextech") ||
    nameLower.includes("nextech") ||
    idLower === "vendor-c"
  ) {
    const floor = Math.round(quote.initialUnitAsk * 0.76 * 100) / 100; // 24% max discount floor
    return {
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      strategyType: "FLEXIBLE",
      initialUnitAsk: quote.initialUnitAsk,
      minimumAcceptablePrice: customOverrides?.minimumAcceptablePrice ?? floor,
      concessionRateBase: 0.45,
      concessionRateRoundGrowth: 0.15,
      deliveryDays: quote.deliveryDays,
      returnDays: quote.returnDays,
      description: "Flexible volume-oriented supplier. Concedes aggressively to secure wholesale volume.",
      ...customOverrides,
    };
  }

  // Deterministic fallback for arbitrary/custom vendor IDs
  const hash = idLower.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 3;

  if (hash === 0) {
    const floor = Math.round(quote.initialUnitAsk * 0.88 * 100) / 100;
    return {
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      strategyType: "FIRM",
      initialUnitAsk: quote.initialUnitAsk,
      minimumAcceptablePrice: customOverrides?.minimumAcceptablePrice ?? floor,
      concessionRateBase: 0.18,
      concessionRateRoundGrowth: 0.05,
      deliveryDays: quote.deliveryDays,
      returnDays: quote.returnDays,
      description: "Firm margin-protective supplier profile.",
      ...customOverrides,
    };
  } else if (hash === 1) {
    const floor = Math.round(quote.initialUnitAsk * 0.81 * 100) / 100;
    return {
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      strategyType: "BALANCED",
      initialUnitAsk: quote.initialUnitAsk,
      minimumAcceptablePrice: customOverrides?.minimumAcceptablePrice ?? floor,
      concessionRateBase: 0.32,
      concessionRateRoundGrowth: 0.10,
      deliveryDays: quote.deliveryDays,
      returnDays: quote.returnDays,
      description: "Balanced commercial supplier profile.",
      ...customOverrides,
    };
  } else {
    const floor = Math.round(quote.initialUnitAsk * 0.76 * 100) / 100;
    return {
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      strategyType: "FLEXIBLE",
      initialUnitAsk: quote.initialUnitAsk,
      minimumAcceptablePrice: customOverrides?.minimumAcceptablePrice ?? floor,
      concessionRateBase: 0.45,
      concessionRateRoundGrowth: 0.15,
      deliveryDays: quote.deliveryDays,
      returnDays: quote.returnDays,
      description: "Flexible volume-oriented supplier profile.",
      ...customOverrides,
    };
  }
}

/**
 * Calculates a realistic vendor counteroffer based on the vendor's simulation profile,
 * commercial strategy, current ask, buyer bid, and round progression.
 *
 * Guarantees:
 * 1. Vendor NEVER accepts or drops below its private minimumAcceptablePrice.
 * 2. If buyer bid is at or above current ask, vendor accepts immediately.
 * 3. Concession magnitude reflects the vendor's explicit strategy type (Firm, Balanced, Flexible).
 * 4. Deterministic and reproducible across rounds.
 * 5. Private reservation prices are never disclosed in the message text.
 */
export function calculateSimulatedVendorCounteroffer(params: {
  vendorQuote: VendorQuote;
  buyerOffer: NegotiationOffer;
  round: number;
  maxRounds: number;
  profile?: VendorSimulationProfile;
}): VendorSimulationResult {
  const { vendorQuote, buyerOffer, round, maxRounds } = params;
  const profile = params.profile ?? getVendorSimulationProfile(vendorQuote);

  const currentAsk = vendorQuote?.currentUnitBid;
  const buyerBid = buyerOffer?.unitPrice;
  const floor = profile?.minimumAcceptablePrice;
  const safeMaxRounds = Number.isFinite(maxRounds) && maxRounds > 0 ? maxRounds : 4;
  const safeRound = Number.isFinite(round) && round > 0 ? round : 1;
  const roundProgress = Math.max(0, Math.min(1, safeRound / safeMaxRounds));

  // Defensive validation: handle malformed or non-numeric commercial inputs
  if (
    !Number.isFinite(currentAsk) ||
    currentAsk <= 0 ||
    !Number.isFinite(buyerBid) ||
    buyerBid <= 0 ||
    !Number.isFinite(floor) ||
    floor <= 0
  ) {
    const safeHoldPrice = Number.isFinite(floor) && floor > 0 ? floor : (vendorQuote?.initialUnitAsk ?? 350);
    return {
      unitAsk: safeHoldPrice,
      message: `Simulated supplier response: Commercial parameters are invalid or non-numeric. We hold our firm offer at $${safeHoldPrice.toFixed(2)} per unit.`,
      accepted: false,
      atFloor: true,
      provenance: "SIMULATED_VENDOR",
      strategyType: profile?.strategyType ?? "FIRM",
    };
  }

  // Case 1: Buyer bid meets or exceeds vendor's current ask -> Immediate agreement
  if (buyerBid >= currentAsk) {
    const agreedPrice = currentAsk;
    return {
      unitAsk: agreedPrice,
      message: `Simulated supplier response: We accept your proposal of $${agreedPrice.toFixed(2)} per unit for ${buyerOffer.quantity} units with ${vendorQuote.deliveryDays}-day delivery and ${vendorQuote.returnDays}-day return protection.`,
      accepted: true,
      atFloor: agreedPrice <= floor + 0.01,
      provenance: "SIMULATED_VENDOR",
      strategyType: profile.strategyType,
    };
  }

  // Case 2: Buyer bid is strictly below vendor's private reservation price (floor)
  if (buyerBid < floor) {
    // If vendor is already at or near floor, vendor holds firm
    if (currentAsk <= floor + 0.01) {
      const heldPrice = floor;
      return {
        unitAsk: heldPrice,
        message: `Simulated supplier response: While we appreciate your business, our wholesale cost structure does not allow us to reduce pricing below $${heldPrice.toFixed(2)} per unit. We hold our firm offer at $${heldPrice.toFixed(2)} for ${buyerOffer.quantity} units.`,
        accepted: false,
        atFloor: true,
        provenance: "SIMULATED_VENDOR",
        strategyType: profile.strategyType,
      };
    }

    // Vendor is above floor, but buyer bid is below floor -> Vendor concedes toward floor without breaching it
    const concessionRate = profile.concessionRateBase + profile.concessionRateRoundGrowth * roundProgress;
    const spread = Math.max(0, currentAsk - floor);
    let concession = Math.round(spread * concessionRate * 100) / 100;
    if (profile.maxConcessionPerRound) {
      concession = Math.min(concession, profile.maxConcessionPerRound);
    }

    const newUnitAsk = Math.max(floor, Math.round((currentAsk - concession) * 100) / 100);
    const atFloor = newUnitAsk <= floor + 0.01;

    return {
      unitAsk: newUnitAsk,
      message: `Simulated supplier response: We cannot meet your requested price of $${buyerBid.toFixed(2)} due to margin limits, but we can lower our wholesale price to $${newUnitAsk.toFixed(2)} per unit for ${buyerOffer.quantity} units with ${vendorQuote.deliveryDays}-day delivery.`,
      accepted: false,
      atFloor,
      provenance: "SIMULATED_VENDOR",
      strategyType: profile.strategyType,
    };
  }

  // Case 3: Buyer bid is above or equal to floor and below current ask -> Concede based on strategy
  const spread = Math.max(0, currentAsk - buyerBid);
  const concessionRate = profile.concessionRateBase + profile.concessionRateRoundGrowth * roundProgress;
  let concession = Math.round(spread * concessionRate * 100) / 100;
  if (profile.maxConcessionPerRound) {
    concession = Math.min(concession, profile.maxConcessionPerRound);
  }

  const candidateAsk = Math.round((currentAsk - concession) * 100) / 100;
  // Never drop below buyer's bid and never drop below floor
  const newUnitAsk = Math.max(buyerBid, Math.max(floor, candidateAsk));

  // If the concession reached the buyer's bid exactly
  if (newUnitAsk === buyerBid) {
    return {
      unitAsk: newUnitAsk,
      message: `Simulated supplier response: We agree to your revised offer of $${newUnitAsk.toFixed(2)} per unit for ${buyerOffer.quantity} units with ${vendorQuote.deliveryDays}-day delivery and ${vendorQuote.returnDays}-day return protection.`,
      accepted: true,
      atFloor: newUnitAsk <= floor + 0.01,
      provenance: "SIMULATED_VENDOR",
      strategyType: profile.strategyType,
    };
  }

  // Strategy-specific counteroffer messaging
  let strategyMessage: string;
  switch (profile.strategyType) {
    case "FIRM":
      strategyMessage = `Simulated supplier response: In the interest of an agreement, we can adjust our wholesale pricing to $${newUnitAsk.toFixed(2)} per unit for ${buyerOffer.quantity} units with our standard ${vendorQuote.deliveryDays}-day delivery SLA.`;
      break;
    case "BALANCED":
      strategyMessage = `Simulated supplier response: Thank you for your counter-proposal. We can adjust our price to $${newUnitAsk.toFixed(2)} per unit for ${buyerOffer.quantity} units, maintaining our ${vendorQuote.deliveryDays}-day delivery timeline.`;
      break;
    case "FLEXIBLE":
      strategyMessage = `Simulated supplier response: To help secure your order today, we are willing to sharpen our wholesale pricing down to $${newUnitAsk.toFixed(2)} per unit for ${buyerOffer.quantity} units with ${vendorQuote.deliveryDays}-day delivery.`;
      break;
  }

  return {
    unitAsk: newUnitAsk,
    message: strategyMessage,
    accepted: false,
    atFloor: newUnitAsk <= floor + 0.01,
    provenance: "SIMULATED_VENDOR",
    strategyType: profile.strategyType,
  };
}
