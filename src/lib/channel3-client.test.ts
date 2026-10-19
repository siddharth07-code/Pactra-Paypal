import { describe, it, expect } from "vitest";
import { Channel3Client, DETERMINISTIC_FIXTURE_QUOTES } from "./channel3-client";
import type { ProcurementMandate } from "../types/pactum";

describe("Channel3 Sourcing Client Unit Tests", () => {
  const sampleMandate: ProcurementMandate = {
    id: "m-test",
    rawPrompt: "Purchase 25 4K USB-C monitors under $8,500 total budget",
    itemQuery: "4K USB-C Business Monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  it("returns three competing quotes with required SKU, prices, and condition", async () => {
    const client = new Channel3Client({ forceFixtures: true });
    const result = await client.sourceQuotes(sampleMandate);

    expect(result.quotes.length).toBe(3);
    expect(result.isFixture).toBe(true);
    expect(result.dataSource).toBe("MOCK_CATALOG");

    for (const q of result.quotes) {
      expect(q.sku).toBeDefined();
      expect(q.vendorId).toBeDefined();
      expect(q.initialUnitAsk).toBeGreaterThan(0);
      expect(q.shippingCost).toBeGreaterThanOrEqual(0);
      expect(q.deliveryDays).toBeGreaterThan(0);
      expect(q.returnDays).toBeGreaterThan(0);
      expect(q.condition).toBe("NEW");
    }
  });

  it("preserves deterministic fixtures when no external API key is provided", async () => {
    const client = new Channel3Client({ apiKey: undefined });
    const result = await client.sourceQuotes(sampleMandate);

    expect(result.isFixture).toBe(true);
    expect(result.quotes[0].sku).toBe(DETERMINISTIC_FIXTURE_QUOTES[0].sku);
    expect(result.quotes[1].vendorId).toBe("vendor-displayworld");
  });
});
