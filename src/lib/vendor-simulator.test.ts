import { describe, it, expect } from "vitest";
import {
  getVendorSimulationProfile,
  calculateSimulatedVendorCounteroffer,
} from "./vendor-simulator";
import type { VendorQuote, NegotiationOffer } from "../types/pactum";

describe("Vendor Simulator Unit Tests", () => {
  const quoteApex: VendorQuote = {
    vendorId: "vendor-apex-displays",
    vendorName: "Apex Displays Wholesale",
    sku: "APX-MON-4K-USBC-27",
    productTitle: 'Apex Pro 27" 4K UHD IPS USB-C Monitor',
    initialUnitAsk: 375.0,
    currentUnitBid: 375.0,
    shippingCost: 150.0,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  const quoteDisplayWorld: VendorQuote = {
    vendorId: "vendor-displayworld",
    vendorName: "DisplayWorld Direct",
    sku: "DWD-4K-27-UB",
    productTitle: 'DisplayWorld Ultra 27" 4K Business Display',
    initialUnitAsk: 385.0,
    currentUnitBid: 385.0,
    shippingCost: 100.0,
    deliveryDays: 3,
    returnDays: 35,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  const quoteNexTech: VendorQuote = {
    vendorId: "vendor-nextech-supplies",
    vendorName: "NexTech Commercial Supplies",
    sku: "NXT-4K-U27-HUB",
    productTitle: 'NexTech Commercial 27" 4K IPS USB-C Hub Monitor',
    initialUnitAsk: 360.0,
    currentUnitBid: 360.0,
    shippingCost: 250.0,
    deliveryDays: 5,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  const buyerOffer: NegotiationOffer = {
    unitPrice: 320.0,
    quantity: 25,
    deliveryDays: 4,
    returnDays: 30,
    shippingCost: 150.0,
  };

  // 1. Profile assignment and stability
  it("assigns distinct stable simulation profiles based on vendor identity", () => {
    const profileApex = getVendorSimulationProfile(quoteApex);
    expect(profileApex.strategyType).toBe("FIRM");
    expect(profileApex.concessionRateBase).toBe(0.18);
    expect(profileApex.minimumAcceptablePrice).toBe(330.0); // 88% of 375

    const profileDW = getVendorSimulationProfile(quoteDisplayWorld);
    expect(profileDW.strategyType).toBe("BALANCED");
    expect(profileDW.concessionRateBase).toBe(0.32);
    expect(profileDW.minimumAcceptablePrice).toBe(311.85); // 81% of 385

    const profileNXT = getVendorSimulationProfile(quoteNexTech);
    expect(profileNXT.strategyType).toBe("FLEXIBLE");
    expect(profileNXT.concessionRateBase).toBe(0.45);
    expect(profileNXT.minimumAcceptablePrice).toBe(273.6); // 76% of 360
  });

  // 2. Distinct concession behavior across strategies
  it("demonstrates distinct concession aggressiveness between Firm, Balanced, and Flexible", () => {
    const testQuote: VendorQuote = {
      ...quoteApex,
      initialUnitAsk: 400.0,
      currentUnitBid: 400.0,
    };
    const testOffer: NegotiationOffer = {
      ...buyerOffer,
      unitPrice: 300.0,
    };

    // Calculate counteroffers in round 1 of 4 with explicit strategy overrides
    const firmProfile = getVendorSimulationProfile(testQuote, {
      strategyType: "FIRM",
      concessionRateBase: 0.18,
      concessionRateRoundGrowth: 0.05,
      minimumAcceptablePrice: 280.0,
    });
    const balancedProfile = getVendorSimulationProfile(testQuote, {
      strategyType: "BALANCED",
      concessionRateBase: 0.32,
      concessionRateRoundGrowth: 0.1,
      minimumAcceptablePrice: 280.0,
    });
    const flexibleProfile = getVendorSimulationProfile(testQuote, {
      strategyType: "FLEXIBLE",
      concessionRateBase: 0.45,
      concessionRateRoundGrowth: 0.15,
      minimumAcceptablePrice: 280.0,
    });

    const firmResult = calculateSimulatedVendorCounteroffer({
      vendorQuote: testQuote,
      buyerOffer: testOffer,
      round: 1,
      maxRounds: 4,
      profile: firmProfile,
    });

    const balancedResult = calculateSimulatedVendorCounteroffer({
      vendorQuote: testQuote,
      buyerOffer: testOffer,
      round: 1,
      maxRounds: 4,
      profile: balancedProfile,
    });

    const flexibleResult = calculateSimulatedVendorCounteroffer({
      vendorQuote: testQuote,
      buyerOffer: testOffer,
      round: 1,
      maxRounds: 4,
      profile: flexibleProfile,
    });

    // Flexible concedes most (lowest ask), Firm concedes least (highest ask)
    expect(flexibleResult.unitAsk).toBeLessThan(balancedResult.unitAsk);
    expect(balancedResult.unitAsk).toBeLessThan(firmResult.unitAsk);

    // Verify explicit provenance
    expect(firmResult.provenance).toBe("SIMULATED_VENDOR");
    expect(balancedResult.provenance).toBe("SIMULATED_VENDOR");
    expect(flexibleResult.provenance).toBe("SIMULATED_VENDOR");
  });

  // 3. Strict reservation price / floor enforcement
  it("enforces private reservation price floor and rejects dropping below it", () => {
    const floor = 340.0;
    const profile = getVendorSimulationProfile(quoteApex, {
      minimumAcceptablePrice: floor,
    });

    // Buyer bids $250 (way below floor $340)
    const lowOffer: NegotiationOffer = {
      ...buyerOffer,
      unitPrice: 250.0,
    };

    const result = calculateSimulatedVendorCounteroffer({
      vendorQuote: quoteApex,
      buyerOffer: lowOffer,
      round: 4,
      maxRounds: 4,
      profile,
    });

    // Ask must NEVER be below the floor
    expect(result.unitAsk).toBeGreaterThanOrEqual(floor);
    expect(result.accepted).toBe(false);

    // If current ask is already at floor, vendor holds firm at floor
    const atFloorQuote: VendorQuote = {
      ...quoteApex,
      currentUnitBid: floor,
    };

    const heldResult = calculateSimulatedVendorCounteroffer({
      vendorQuote: atFloorQuote,
      buyerOffer: lowOffer,
      round: 4,
      maxRounds: 4,
      profile,
    });

    expect(heldResult.unitAsk).toBe(floor);
    expect(heldResult.atFloor).toBe(true);
    expect(heldResult.accepted).toBe(false);
    expect(heldResult.message).toContain(`$${floor.toFixed(2)}`);
    expect(heldResult.message).toContain("hold our firm offer");
  });

  // 4. Immediate acceptance when buyer meets ask
  it("accepts offer when buyer bid meets or exceeds current vendor ask", () => {
    const highOffer: NegotiationOffer = {
      ...buyerOffer,
      unitPrice: 380.0, // Higher than Apex's current ask 375
    };

    const result = calculateSimulatedVendorCounteroffer({
      vendorQuote: quoteApex,
      buyerOffer: highOffer,
      round: 2,
      maxRounds: 4,
    });

    expect(result.accepted).toBe(true);
    expect(result.unitAsk).toBe(quoteApex.currentUnitBid);
    expect(result.message).toContain("accept your proposal");
  });

  // 5. Confidentiality: No private reservation token leakage in vendor messages
  it("never leaks private reservation price variable names or internal tokens in messages", () => {
    const floor = 328.5;
    const profile = getVendorSimulationProfile(quoteApex, {
      minimumAcceptablePrice: floor,
    });

    const lowOffer: NegotiationOffer = {
      ...buyerOffer,
      unitPrice: 300.0,
    };

    const result = calculateSimulatedVendorCounteroffer({
      vendorQuote: quoteApex,
      buyerOffer: lowOffer,
      round: 1,
      maxRounds: 4,
      profile,
    });

    const message = result.message;
    expect(message).not.toMatch(/minimumAcceptablePrice/i);
    expect(message).not.toMatch(/reservation[_\s-]?price/i);
    expect(message).not.toMatch(/floorRatio/i);
    expect(message).not.toMatch(/private[_\s-]?floor/i);
    expect(message).toContain("Simulated supplier response:");
  });

  // 6. Deterministic reproducibility
  it("produces deterministic, byte-identical results given the same input state", () => {
    const run1 = calculateSimulatedVendorCounteroffer({
      vendorQuote: quoteDisplayWorld,
      buyerOffer,
      round: 2,
      maxRounds: 4,
    });

    const run2 = calculateSimulatedVendorCounteroffer({
      vendorQuote: quoteDisplayWorld,
      buyerOffer,
      round: 2,
      maxRounds: 4,
    });

    expect(run1.unitAsk).toBe(run2.unitAsk);
    expect(run1.message).toBe(run2.message);
    expect(run1.accepted).toBe(run2.accepted);
    expect(run1.atFloor).toBe(run2.atFloor);
    expect(run1.strategyType).toBe(run2.strategyType);
  });
});
