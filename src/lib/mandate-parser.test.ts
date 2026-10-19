import { describe, it, expect } from "vitest";
import { parseProcurementMandate } from "./mandate-parser";

describe("Mandate Parser Unit Tests", () => {
  it("successfully parses the primary demonstration mandate", () => {
    const prompt =
      "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy.";
    const result = parseProcurementMandate({ prompt });

    expect(result.success).toBe(true);
    expect(result.mandate).toBeDefined();

    const m = result.mandate!;
    expect(m.quantity).toBe(25);
    expect(m.maxTotalBudget).toBe(8500);
    expect(m.maxDeliveryDays).toBe(5);
    expect(m.minReturnDays).toBe(30);
    expect(m.currency).toBe("USD");
    expect(m.requiredSpecs.length).toBeGreaterThanOrEqual(2);
    expect(m.requiredSpecs.some((s) => s.name === "Resolution" && s.value === "4K UHD")).toBe(true);
    expect(m.requiredSpecs.some((s) => s.name === "Connectivity" && s.value === "USB-C")).toBe(true);
  });

  it("handles alternative formatting: numbers, commas, and day phrasing", () => {
    const prompt = "Need 50 displays for $15,000 max budget, deliver in 3 days, 14-day return window";
    const result = parseProcurementMandate({ prompt, currency: "USD" });

    expect(result.success).toBe(true);
    const m = result.mandate!;
    expect(m.quantity).toBe(50);
    expect(m.maxTotalBudget).toBe(15000);
    expect(m.maxDeliveryDays).toBe(3);
    expect(m.minReturnDays).toBe(14);
  });

  it("rejects incomplete mandates and lists missing fields", () => {
    const incompletePrompt = "Order some monitors under $5,000";
    const result = parseProcurementMandate({ prompt: incompletePrompt });

    expect(result.success).toBe(false);
    expect(result.missingFields).toContain("quantity");
    expect(result.missingFields).toContain("maxDeliveryDays");
    expect(result.missingFields).toContain("minReturnDays");
  });

  it("rejects empty or whitespace prompts safely", () => {
    const result = parseProcurementMandate({ prompt: "   " });
    expect(result.success).toBe(false);
    expect(result.error).toContain("empty or missing");
  });
});
