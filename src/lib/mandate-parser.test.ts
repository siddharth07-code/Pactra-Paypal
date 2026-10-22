import { describe, it, expect, vi } from "vitest";
import {
  parseProcurementMandate,
  parseWrittenNumber,
  normalizeNumberWords,
  extractProcurementMandate,
} from "./mandate-parser";
import {
  MandateIntelligenceService,
} from "./mandate-intelligence";
import type { GeminiClientOptions } from "./gemini-client";

describe("Mandate Parser Unit Tests", () => {
  // =========================================================================
  // Baseline Demonstration Tests (Preserved)
  // =========================================================================
  it("successfully parses the primary demonstration mandate", () => {
    const prompt =
      "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy.";
    const result = parseProcurementMandate({ prompt });

    expect(result.success).toBe(true);
    expect(result.status).toBe("READY");
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
    expect(result.status).toBe("READY");
    const m = result.mandate!;
    expect(m.quantity).toBe(50);
    expect(m.maxTotalBudget).toBe(15000);
    expect(m.maxDeliveryDays).toBe(3);
    expect(m.minReturnDays).toBe(14);
  });

  // =========================================================================
  // A. Arbitrary Commercial Product Categories
  // =========================================================================
  describe("A. Product Categories", () => {
    it("extracts mandate for Laptops", () => {
      const prompt =
        "Procure 15 Dell XPS developer laptops under a $22,500 total budget, delivery within 7 days and 30-day return policy.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.status).toBe("READY");
      expect(res.mandate?.itemQuery.toLowerCase()).toContain("laptop");
      expect(res.mandate?.quantity).toBe(15);
      expect(res.mandate?.maxTotalBudget).toBe(22500);
      expect(res.mandate?.maxDeliveryDays).toBe(7);
      expect(res.mandate?.minReturnDays).toBe(30);
    });

    it("extracts mandate for Enterprise Servers", () => {
      const prompt =
        "Source 4 2U rackmount enterprise servers with a $16,000 maximum budget, delivery in 10 days and 60 days return window.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.status).toBe("READY");
      expect(res.mandate?.itemQuery.toLowerCase()).toContain("server");
      expect(res.mandate?.quantity).toBe(4);
      expect(res.mandate?.maxTotalBudget).toBe(16000);
      expect(res.mandate?.maxDeliveryDays).toBe(10);
      expect(res.mandate?.minReturnDays).toBe(60);
    });

    it("extracts mandate for Office Furniture (Standing Desks)", () => {
      const prompt =
        "Purchase 10 ergonomic standing desks for $4,500 total, with delivery within 5 days and a 14-day return window.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.status).toBe("READY");
      expect(res.mandate?.itemQuery.toLowerCase()).toContain("desk");
      expect(res.mandate?.quantity).toBe(10);
      expect(res.mandate?.maxTotalBudget).toBe(4500);
      expect(res.mandate?.maxDeliveryDays).toBe(5);
      expect(res.mandate?.minReturnDays).toBe(14);
    });

    it("extracts mandate for Networking Equipment (PoE Gigabit Switches)", () => {
      const prompt =
        "Order 8 Cisco 48-port PoE gigabit network switches under a $12,000 budget, delivery in 4 days and 30-day return policy.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.status).toBe("READY");
      expect(res.mandate?.itemQuery.toLowerCase()).toContain("switch");
      expect(res.mandate?.quantity).toBe(8);
      expect(res.mandate?.maxTotalBudget).toBe(12000);
      expect(res.mandate?.maxDeliveryDays).toBe(4);
      expect(res.mandate?.minReturnDays).toBe(30);
    });

    it("extracts mandate for a previously unseen category (Centrifuge Laboratory Units)", () => {
      const prompt =
        "Purchase 3 high-speed benchtop laboratory centrifuges under a $45,000 budget, delivery within 14 days and 30-day return policy.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.status).toBe("READY");
      expect(res.mandate?.itemQuery.toLowerCase()).toContain("centrifuge");
      expect(res.mandate?.quantity).toBe(3);
      expect(res.mandate?.maxTotalBudget).toBe(45000);
      expect(res.mandate?.maxDeliveryDays).toBe(14);
      expect(res.mandate?.minReturnDays).toBe(30);
    });
  });

  // =========================================================================
  // B. Numeric Extraction (Written Numbers, Hyphenated, Unit vs Total Budget)
  // =========================================================================
  describe("B. Numeric Extraction", () => {
    it("parses single written number words into integers", () => {
      expect(parseWrittenNumber("one")).toBe(1);
      expect(parseWrittenNumber("five")).toBe(5);
      expect(parseWrittenNumber("twelve")).toBe(12);
      expect(parseWrittenNumber("fifteen")).toBe(15);
      expect(parseWrittenNumber("twenty")).toBe(20);
      expect(parseWrittenNumber("fifty")).toBe(50);
      expect(parseWrittenNumber("one hundred")).toBe(100);
    });

    it("parses compound hyphenated number words", () => {
      expect(parseWrittenNumber("twenty-five")).toBe(25);
      expect(parseWrittenNumber("forty-two")).toBe(42);
      expect(parseWrittenNumber("seventy-five")).toBe(75);
      expect(parseWrittenNumber("ninety-nine")).toBe(99);
    });

    it("normalizes number words in sentences", () => {
      const text = "Purchase twenty-five monitors under eight thousand dollars with five days delivery";
      const normalized = normalizeNumberWords(text);
      expect(normalized).toContain("25");
      expect(normalized).toContain("5");
    });

    it("extracts mandate with written quantity: 'twenty-five' and written delivery: 'five days'", () => {
      const prompt =
        "Buy twenty-five 4K USB-C monitors with a total budget of $8,500, delivery within five days, and at least a 30-day return policy.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.status).toBe("READY");
      expect(res.mandate?.quantity).toBe(25);
      expect(res.mandate?.maxDeliveryDays).toBe(5);
    });

    it("extracts mandate with written quantity: 'twelve' and 'one hundred'", () => {
      const prompt12 = "Purchase twelve laptops under a $15,000 budget with 5 days delivery and 30-day return.";
      const res12 = parseProcurementMandate({ prompt: prompt12 });
      expect(res12.mandate?.quantity).toBe(12);

      const prompt100 = "Order one hundred ergonomic chairs under a $25,000 budget with 10 days delivery and 30-day return.";
      const res100 = parseProcurementMandate({ prompt: prompt100 });
      expect(res100.mandate?.quantity).toBe(100);
    });

    it("distinguishes total budget from unit price ('$340 each')", () => {
      const prompt =
        "Buy 25 monitors at $340 each with delivery within 5 days and a 30-day return policy.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.mandate?.quantity).toBe(25);
      // 25 * 340 = 8500
      expect(res.mandate?.maxTotalBudget).toBe(8500);
    });

    it("validates compatible unit price and total budget ('$340 per unit under $8,500 total')", () => {
      const prompt =
        "Buy 25 monitors at $340 per unit under an $8,500 total budget, 5 days delivery, 30 days return.";
      const res = parseProcurementMandate({ prompt });

      expect(res.success).toBe(true);
      expect(res.mandate?.quantity).toBe(25);
      expect(res.mandate?.maxTotalBudget).toBe(8500);
    });
  });

  // =========================================================================
  // C. Requirements & Constraints (SLAs, Conditions, Currencies)
  // =========================================================================
  describe("C. Requirements", () => {
    it("extracts product condition (NEW, REFURBISHED)", () => {
      const newPrompt = "Buy 10 brand new laptops under $12,000 with 5 days delivery and 30-day return.";
      const resNew = parseProcurementMandate({ prompt: newPrompt });
      expect(resNew.mandate?.requiredCondition).toBe("NEW");

      const refPrompt = "Buy 10 certified refurbished laptops under $8,000 with 5 days delivery and 30-day return.";
      const resRef = parseProcurementMandate({ prompt: refPrompt });
      expect(resRef.mandate?.requiredCondition).toBe("REFURBISHED");
    });

    it("extracts currency symbols: EUR, GBP, USD", () => {
      const eurPrompt = "Order 20 monitors under an €8,000 total budget with 5 days delivery and 30-day return.";
      const resEur = parseProcurementMandate({ prompt: eurPrompt });
      expect(resEur.mandate?.currency).toBe("EUR");

      const gbpPrompt = "Order 20 monitors under a £7,500 total budget with 5 days delivery and 30-day return.";
      const resGbp = parseProcurementMandate({ prompt: gbpPrompt });
      expect(resGbp.mandate?.currency).toBe("GBP");

      const usdPrompt = "Order 20 monitors under an $8,000 total budget with 5 days delivery and 30-day return.";
      const resUsd = parseProcurementMandate({ prompt: usdPrompt });
      expect(resUsd.mandate?.currency).toBe("USD");
    });

    it("extracts technical specifications into structured attributes", () => {
      const prompt =
        "Procure 10 4K OLED HDR USB-C monitors with $6,000 budget, 4 days delivery, 30 days return.";
      const res = parseProcurementMandate({ prompt });

      const specs = res.mandate?.requiredSpecs ?? [];
      expect(specs.some((s) => s.value === "4K UHD")).toBe(true);
      expect(specs.some((s) => s.value === "OLED")).toBe(true);
      expect(specs.some((s) => s.value === "USB-C")).toBe(true);
    });
  });

  // =========================================================================
  // D. Ambiguity & Missing Requirements (NEEDS_CLARIFICATION)
  // =========================================================================
  describe("D. Ambiguity & Missing Requirements", () => {
    it("returns NEEDS_CLARIFICATION when quantity is missing", () => {
      const prompt = "Purchase ergonomic standing desks under $4,500, delivery within 5 days and 14-day return.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("NEEDS_CLARIFICATION");
      expect(res.success).toBe(false);
      expect(res.missingFields).toContain("quantity");
      expect(res.clarificationQuestions?.some((q) => q.toLowerCase().includes("quantity"))).toBe(true);
    });

    it("returns NEEDS_CLARIFICATION when budget is missing: 'Purchase 10 ergonomic standing desks.'", () => {
      const prompt = "Purchase 10 ergonomic standing desks.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("NEEDS_CLARIFICATION");
      expect(res.success).toBe(false);
      expect(res.missingFields).toContain("maxTotalBudget");
      expect(res.missingFields).toContain("maxDeliveryDays");
      expect(res.missingFields).toContain("minReturnDays");
      expect(res.clarificationQuestions?.some((q) => q.toLowerCase().includes("budget"))).toBe(true);
    });

    it("returns NEEDS_CLARIFICATION for overly generic request: 'Buy some equipment as cheaply as possible.'", () => {
      const prompt = "Buy some equipment as cheaply as possible.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("NEEDS_CLARIFICATION");
      expect(res.success).toBe(false);
      expect(res.missingFields).toContain("itemQuery");
      expect(res.missingFields).toContain("quantity");
      expect(res.missingFields).toContain("maxTotalBudget");
      expect(res.clarificationQuestions?.length).toBeGreaterThan(0);
    });

    it("flags ambiguous or unsupported currency (e.g. Japanese Yen / JPY)", () => {
      const prompt = "Buy 25 monitors for 850,000 yen within 5 days and 30-day return policy.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("NEEDS_CLARIFICATION");
      expect(res.ambiguities?.some((a) => a.toLowerCase().includes("currency"))).toBe(true);
    });

    it("returns NEEDS_CLARIFICATION when delivery SLA is vague: 'fast delivery'", () => {
      const prompt = "Buy 25 monitors under $8,500 with fast delivery and a 30-day return policy.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("NEEDS_CLARIFICATION");
      expect(res.missingFields).toContain("maxDeliveryDays");
      expect(res.clarificationQuestions?.some((q) => q.toLowerCase().includes("delivery"))).toBe(true);
    });
  });

  // =========================================================================
  // E. Contradictions & Guardrail Failures (INVALID)
  // =========================================================================
  describe("E. Contradictions", () => {
    it("detects conflicting budget statements: 'Purchase 25 monitors for $8,500 total, but do not spend more than $6,000.'", () => {
      const prompt = "Purchase 25 monitors for $8,500 total, but do not spend more than $6,000.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("INVALID");
      expect(res.success).toBe(false);
      expect(res.contradictions?.length).toBeGreaterThan(0);
      expect(res.contradictions?.[0]).toContain("Conflicting budget statements");
    });

    it("detects unit price * quantity exceeding stated total budget", () => {
      // 25 * $500 = $12,500 > $8,500 total budget
      const prompt = "Buy 25 monitors at $500 each under an $8,500 total budget with 5 days delivery and 30 days return.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("INVALID");
      expect(res.success).toBe(false);
      expect(res.contradictions?.some((c) => c.includes("exceeds total budget"))).toBe(true);
    });

    it("detects conflicting quantity statements in prompt", () => {
      const prompt = "Order 10 laptops under $15,000 with 5 days delivery... actually we need 20 units.";
      const res = parseProcurementMandate({ prompt });

      expect(res.status).toBe("INVALID");
      expect(res.contradictions?.some((c) => c.toLowerCase().includes("quantity"))).toBe(true);
    });

    it("rejects impossible delivery SLA (0 or negative days)", () => {
      const res = parseProcurementMandate({
        prompt: "Buy 10 laptops under $10,000 within 0 days and 30-day return.",
      });
      // 0 days is rejected
      expect(res.status).not.toBe("READY");
    });
  });

  // =========================================================================
  // F. Mandate Intelligence Service: Gemini Extraction & Fallback
  // =========================================================================
  describe("F. Mandate Intelligence Service", () => {
    it("handles missing API key by operating in deterministic offline mode", async () => {
      const service = new MandateIntelligenceService({ apiKey: "" });
      expect(service.hasLiveClient()).toBe(false);

      const result = await service.extractMandate({
        prompt: "Purchase 25 4K monitors under an $8,500 total budget, delivery in 5 days, 30-day return.",
      });

      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.status).toBe("READY");
      expect(result.mandate?.quantity).toBe(25);
      expect(result.mandate?.maxTotalBudget).toBe(8500);
    });

    it("processes valid structured output from live Gemini mock and sets GEMINI_LIVE provenance", async () => {
      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          itemQuery: "Dell XPS 15 Laptops",
          quantity: 15,
          maxTotalBudget: 22500,
          currency: "USD",
          maxDeliveryDays: 7,
          minReturnDays: 30,
          requiredCondition: "NEW",
          requiredSpecs: [{ name: "Processor", value: "Core i7", mandatory: true }],
          contradictions: [],
          ambiguities: [],
          missingFields: [],
          clarificationQuestions: [],
        }),
      });

      const mockAi: NonNullable<GeminiClientOptions["aiClient"]> = {
        models: { generateContent: mockGenerateContent },
      };

      const service = new MandateIntelligenceService({
        aiClient: mockAi,
        timeoutMs: 5000,
      });

      const result = await service.extractMandate({
        prompt: "Procure 15 Dell XPS 15 laptops under $22,500 within 7 days and 30 days return.",
      });

      expect(result.extractor).toBe("GEMINI_LIVE");
      expect(result.status).toBe("READY");
      expect(result.mandate?.itemQuery).toBe("Dell XPS 15 Laptops");
      expect(result.mandate?.quantity).toBe(15);
      expect(result.mandate?.maxTotalBudget).toBe(22500);
    });

    it("recovers gracefully from malformed JSON model output via deterministic fallback", async () => {
      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: "NOT_VALID_JSON_OUTPUT_FROM_MODEL",
      });

      const mockAi: NonNullable<GeminiClientOptions["aiClient"]> = {
        models: { generateContent: mockGenerateContent },
      };

      const service = new MandateIntelligenceService({
        aiClient: mockAi,
        timeoutMs: 5000,
      });

      const result = await service.extractMandate({
        prompt: "Buy 10 ergonomic desks under $4,500 total, 5 days delivery, 14 days return.",
      });

      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.status).toBe("READY");
      expect(result.mandate?.quantity).toBe(10);
      expect(result.mandate?.maxTotalBudget).toBe(4500);
    });

    it("handles Gemini API timeout by falling back to deterministic parser safely", async () => {
      const slowCall = new Promise((resolve) => setTimeout(resolve, 500));
      const mockAi: NonNullable<GeminiClientOptions["aiClient"]> = {
        models: { generateContent: vi.fn().mockReturnValue(slowCall) },
      };

      const service = new MandateIntelligenceService({
        aiClient: mockAi,
        timeoutMs: 25, // Fast timeout
      });

      const result = await service.extractMandate({
        prompt: "Buy 25 monitors under an $8,500 total budget, 5 days delivery, 30 days return.",
      });

      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.error).toContain("REQUEST_TIMEOUT");
      expect(result.status).toBe("READY");
      expect(result.mandate?.quantity).toBe(25);
    });

    it("handles rate limiting (429) by classifying error and engaging deterministic fallback", async () => {
      const rateLimitError = new Error("Resource exhausted: quota exceeded (429)");
      const mockAi: NonNullable<GeminiClientOptions["aiClient"]> = {
        models: { generateContent: vi.fn().mockRejectedValue(rateLimitError) },
      };

      const service = new MandateIntelligenceService({
        aiClient: mockAi,
        timeoutMs: 5000,
      });

      const result = await service.extractMandate({
        prompt: "Buy 25 monitors under an $8,500 total budget, 5 days delivery, 30 days return.",
      });

      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.error).toContain("RATE_LIMITED");
      expect(result.status).toBe("READY");
      expect(result.mandate?.quantity).toBe(25);
    });

    it("authoritative deterministic gate rejects model hallucinations (e.g. negative days or non-integer qty)", () => {
      const service = new MandateIntelligenceService({ apiKey: "" });

      const hallucinatedModelOutput = {
        itemQuery: "Test Equipment",
        quantity: -5, // Invalid negative quantity
        maxTotalBudget: 1000,
        currency: "USD",
        maxDeliveryDays: 0, // Invalid SLA
        minReturnDays: 30,
        missingFields: [],
        ambiguities: [],
        contradictions: [],
        clarificationQuestions: [],
      };

      const validation = service.deterministicallyValidateExtraction(
        hallucinatedModelOutput,
        "Test prompt"
      );

      // Must be marked INVALID, never trusted blindly
      expect(validation.status).toBe("INVALID");
      expect(validation.contradictions.length).toBeGreaterThan(0);
      expect(validation.mandate).toBeUndefined();
    });
  });

  // =========================================================================
  // G. Application Integration (extractProcurementMandate wrapper)
  // =========================================================================
  describe("G. Application Integration", () => {
    it("extractProcurementMandate successfully resolves with MandateIntelligenceResult", async () => {
      const prompt =
        "Buy 25 4K USB-C monitors with a total budget of $8,500, delivery within 5 days, and at least a 30-day return policy.";
      const res = await extractProcurementMandate({ prompt });

      expect(res.status).toBe("READY");
      expect(res.extractedMandate?.quantity).toBe(25);
      expect(res.extractedMandate?.maxTotalBudget).toBe(8500);
      expect(res.extractedMandate?.maxDeliveryDays).toBe(5);
      expect(res.extractedMandate?.minReturnDays).toBe(30);
    });
  });
});
