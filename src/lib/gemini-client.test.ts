import { describe, it, expect } from "vitest";
import { GeminiNegotiationClient } from "./gemini-client";
import type { ProcurementMandate, VendorQuote } from "../types/pactum";

describe("Gemini Negotiation Client Unit Tests", () => {
  const mandate: ProcurementMandate = {
    id: "m-test",
    rawPrompt: "Purchase 25 4K USB-C monitors",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  const quote: VendorQuote = {
    vendorId: "vendor-a",
    vendorName: "Apex Displays",
    sku: "APX-4K-27",
    productTitle: "27 4K Monitor",
    initialUnitAsk: 380,
    currentUnitBid: 380,
    shippingCost: 150,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  };

  it("generates deterministic rational proposals without live API key", async () => {
    const client = new GeminiNegotiationClient();
    const proposal = await client.generateBuyerOffer({
      mandate,
      vendorQuote: quote,
      round: 1,
      maxRounds: 4,
      previousVendorAsk: 380,
    });

    expect(proposal.unitPrice).toBeGreaterThan(0);
    expect(proposal.unitPrice).toBeLessThanOrEqual(380);
    expect(proposal.deliveryDays).toBeLessThanOrEqual(mandate.maxDeliveryDays);
    expect(proposal.returnDays).toBeGreaterThanOrEqual(mandate.minReturnDays);
    expect(proposal.message).toBeDefined();
    // Verify private total budget is not exposed in message
    expect(proposal.message).not.toContain("8500");
  });

  it("validates and sanitizes model proposals, rejecting out-of-bounds prices", () => {
    const client = new GeminiNegotiationClient();

    // Invalid high price exceeding vendor ask
    const invalidHigh = client.validateAndSanitizeProposal(
      { unitPrice: 450, deliveryDays: 4, returnDays: 30, message: "Hello" },
      { mandate, vendorQuote: quote, previousVendorAsk: 380 }
    );
    expect(invalidHigh).toBeNull();

    // Valid price
    const valid = client.validateAndSanitizeProposal(
      { unitPrice: 320, deliveryDays: 4, returnDays: 30, message: "Hello" },
      { mandate, vendorQuote: quote, previousVendorAsk: 380 }
    );
    expect(valid).not.toBeNull();
    expect(valid?.unitPrice).toBe(320);
  });
});
