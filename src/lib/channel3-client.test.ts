import { describe, it, expect } from "vitest";
import {
  Channel3Client,
  DETERMINISTIC_FIXTURE_QUOTES,
  detectMandateCategory,
} from "./channel3-client";
import type { ProcurementMandate } from "../types/pactum";

describe("Channel3 Sourcing Client Unit Tests", () => {
  const sampleMonitorMandate: ProcurementMandate = {
    id: "m-test-mon",
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

  const sampleLaptopMandate: ProcurementMandate = {
    id: "m-test-lap",
    rawPrompt: "Procure 10 Developer Laptops under $15,000",
    itemQuery: "Developer Laptops 32GB RAM",
    quantity: 10,
    maxTotalBudget: 15000,
    maxDeliveryDays: 7,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  const sampleServerMandate: ProcurementMandate = {
    id: "m-test-srv",
    rawPrompt: "Procure 4 Enterprise Rackmount Servers under $16,000",
    itemQuery: "2U Rackmount Enterprise Servers",
    quantity: 4,
    maxTotalBudget: 16000,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  const sampleUncataloguedMandate: ProcurementMandate = {
    id: "m-test-uncat",
    rawPrompt: "Procure 2 Clinical Centrifuges under $5,000",
    itemQuery: "Laboratory Centrifuges",
    quantity: 2,
    maxTotalBudget: 5000,
    maxDeliveryDays: 10,
    minReturnDays: 14,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  it("returns three competing quotes with required SKU, prices, and condition for monitors", async () => {
    const client = new Channel3Client({ forceFixtures: true });
    const result = await client.sourceQuotes(sampleMonitorMandate);

    expect(result.quotes.length).toBe(3);
    expect(result.isFixture).toBe(true);
    expect(result.dataSource).toBe("MOCK_CATALOG");
    expect(result.category).toBe("monitors");

    for (const q of result.quotes) {
      expect(q.sku).toBeDefined();
      expect(q.vendorId).toBeDefined();
      expect(q.initialUnitAsk).toBeGreaterThan(0);
      expect(q.shippingCost).toBeGreaterThanOrEqual(0);
      expect(q.deliveryDays).toBeGreaterThan(0);
      expect(q.returnDays).toBeGreaterThan(0);
      expect(q.condition).toBe("NEW");
      expect(q.category).toBe("monitors");
    }
  });

  it("preserves deterministic fixtures when no external API key is provided", async () => {
    const client = new Channel3Client({ apiKey: undefined });
    const result = await client.sourceQuotes(sampleMonitorMandate);

    expect(result.isFixture).toBe(true);
    expect(result.quotes[0].sku).toBe(DETERMINISTIC_FIXTURE_QUOTES[0].sku);
    expect(result.quotes[1].vendorId).toBe("vendor-displayworld");
  });

  it("sources laptop fixtures for laptop mandates and does not return monitor quotes", async () => {
    const client = new Channel3Client({ forceFixtures: true });
    const result = await client.sourceQuotes(sampleLaptopMandate);

    expect(result.quotes.length).toBe(3);
    expect(result.category).toBe("laptops");
    for (const q of result.quotes) {
      expect(q.category).toBe("laptops");
      expect(q.productTitle.toLowerCase()).toContain("laptop");
      expect(q.productTitle.toLowerCase()).not.toContain("monitor");
    }
  });

  it("sources server fixtures for server mandates and does not return monitor quotes", async () => {
    const client = new Channel3Client({ forceFixtures: true });
    const result = await client.sourceQuotes(sampleServerMandate);

    expect(result.quotes.length).toBe(3);
    expect(result.category).toBe("servers");
    for (const q of result.quotes) {
      expect(q.category).toBe("servers");
      expect(q.productTitle.toLowerCase()).toContain("server");
      expect(q.productTitle.toLowerCase()).not.toContain("monitor");
    }
  });

  it("returns clear empty quote list for uncatalogued product categories", async () => {
    const client = new Channel3Client({ forceFixtures: true });
    const result = await client.sourceQuotes(sampleUncataloguedMandate);

    expect(result.quotes.length).toBe(0);
    expect(result.isFixture).toBe(true);
    expect(result.dataSource).toBe("MOCK_CATALOG");
  });

  it("detectMandateCategory correctly detects categories from structured specs and queries", () => {
    expect(detectMandateCategory(sampleMonitorMandate)).toBe("monitors");
    expect(detectMandateCategory(sampleLaptopMandate)).toBe("laptops");
    expect(detectMandateCategory(sampleServerMandate)).toBe("servers");
    expect(detectMandateCategory({
      ...sampleMonitorMandate,
      itemQuery: "Ergonomic Sit-Stand Desks",
    })).toBe("furniture");
    expect(detectMandateCategory({
      ...sampleMonitorMandate,
      itemQuery: "48-port Managed Switches",
    })).toBe("networking");
    expect(detectMandateCategory(sampleUncataloguedMandate)).toBe("unknown");
  });
});
