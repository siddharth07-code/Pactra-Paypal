// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
/**
 * PACTUM — Regression & Verification Suite
 * Gemini Request Deadline, Retry Classification, and Fallback Reliability Hotfix
 *
 * Verifies:
 * 1. Provider request deadline is never configured below the documented minimum (10s).
 * 2. Observed HTTP 400 INVALID_ARGUMENT (invalid deadline) is classified as permanent and NOT retried.
 * 3. Transient 5xx errors retain bounded retry behavior.
 * 4. Concurrency slots are released in finally blocks upon failure or success.
 * 5. Deterministic fallback provenance is preserved as DETERMINISTIC_PARSER (never GEMINI_LIVE).
 * 6. Ambiguous and contradictory mandates remain NEEDS_CLARIFICATION or INVALID through fallback.
 * 7. HTTP semantics for POST /api/procurement/init under fallback and error states.
 */

import { describe, it, expect, vi } from "vitest";
import {
  MandateIntelligenceService,
  MIN_GEMINI_PROVIDER_DEADLINE_MS,
  DEFAULT_GEMINI_PROVIDER_DEADLINE_MS,
  DEFAULT_GEMINI_INTERNAL_TIMEOUT_MS,
} from "@/lib/mandate-intelligence";
import { GeminiNegotiationClient } from "@/lib/gemini-client";
import { GeminiQuotaCoordinator } from "@/lib/gemini-quota";
import { POST as initProcurementHandler } from "@/app/api/procurement/init/route";
import { NextRequest } from "next/server";

describe("Gemini Request Deadline & Fallback Reliability Hotfix", () => {
  // =========================================================================
  // 1. PROVIDER DEADLINE CONFIGURATION & SAFETY
  // =========================================================================
  describe("1. Provider Deadline Configuration", () => {
    it("ensures default provider deadline satisfies provider minimum of at least 10s", () => {
      expect(MIN_GEMINI_PROVIDER_DEADLINE_MS).toBe(10000);
      expect(DEFAULT_GEMINI_PROVIDER_DEADLINE_MS).toBeGreaterThanOrEqual(10000);
      expect(DEFAULT_GEMINI_INTERNAL_TIMEOUT_MS).toBeGreaterThan(DEFAULT_GEMINI_PROVIDER_DEADLINE_MS);

      const service = new MandateIntelligenceService();
      expect(service.getProviderDeadlineMs()).toBeGreaterThanOrEqual(10000);
      expect(service.getInternalTimeoutMs()).toBeGreaterThanOrEqual(service.getProviderDeadlineMs());
    });

    it("clamps provider deadline to at least 10s when configured with the observed 8s (or less)", () => {
      // The bug observed in logs was 8000ms (8s)
      const serviceWith8s = new MandateIntelligenceService({
        timeoutMs: 8000,
      });

      expect(serviceWith8s.getProviderDeadlineMs()).toBe(10000);
      expect(serviceWith8s.getProviderDeadlineMs()).toBeGreaterThanOrEqual(10000);

      // Even when passed an extreme small deadline like 1000ms
      const serviceWith1s = new MandateIntelligenceService({
        providerDeadlineMs: 1000,
      });
      expect(serviceWith1s.getProviderDeadlineMs()).toBe(10000);
    });

    it("respects higher configured provider deadlines (e.g. 15s)", () => {
      const serviceWith15s = new MandateIntelligenceService({
        providerDeadlineMs: 15000,
      });
      expect(serviceWith15s.getProviderDeadlineMs()).toBe(15000);
      expect(serviceWith15s.getInternalTimeoutMs()).toBeGreaterThanOrEqual(15000);
    });

    it("ensures GeminiNegotiationClient provider deadline is also clamped to at least 10s", () => {
      const clientWith8s = new GeminiNegotiationClient({
        timeoutMs: 8000,
      });
      expect(clientWith8s.getProviderDeadlineMs()).toBe(10000);

      const defaultClient = new GeminiNegotiationClient();
      expect(defaultClient.getProviderDeadlineMs()).toBeGreaterThanOrEqual(10000);
    });

    it("passes clamped provider deadline (>= 10,000ms) in httpOptions to Gemini SDK", async () => {
      let capturedConfig: unknown = null;
      const mockAi = {
        models: {
          generateContent: vi.fn().mockImplementation((args: { config?: { httpOptions?: { timeout?: number } } }) => {
            capturedConfig = args.config ?? null;
            return Promise.resolve({
              text: JSON.stringify({
                status: "READY",
                itemQuery: "4K Monitors",
                quantity: 25,
                maxTotalBudget: 8500,
                maxDeliveryDays: 5,
                minReturnDays: 30,
                currency: "USD",
                requiredSpecs: [],
                requiredCondition: "NEW",
              }),
            });
          }),
        },
      };

      // Even if initialized with 8000ms
      const service = new MandateIntelligenceService({
        aiClient: mockAi,
        timeoutMs: 8000,
      });

      await service.extractMandate({
        prompt: "Purchase 25 4K monitors under $8,500 with 5 days delivery and 30 days return.",
      });

      expect(mockAi.models.generateContent).toHaveBeenCalledTimes(1);
      expect(capturedConfig).toBeDefined();
      const typedConfig = capturedConfig as { httpOptions?: { timeout?: number } } | null;
      expect(typedConfig?.httpOptions?.timeout).toBeGreaterThanOrEqual(10000);
      expect(typedConfig?.httpOptions?.timeout).not.toBe(8000);
    });
  });

  // =========================================================================
  // 2. RETRY CLASSIFICATION & NO-RETRY ON PERMANENT CONFIGURATION ERRORS
  // =========================================================================
  describe("2. Retry Classification & Permanent Configuration Errors", () => {
    interface HttpError extends Error {
      status?: number;
    }

    const createHttpError = (message: string, status: number): HttpError => {
      const err: HttpError = new Error(message);
      err.status = status;
      return err;
    };

    it("correctly classifies HTTP 400 INVALID_ARGUMENT as a permanent configuration error", () => {
      const coordinator = new GeminiQuotaCoordinator();

      const deadlineError = createHttpError(
        'HTTP 400 INVALID_ARGUMENT: "Manually set deadline 8s is too short. Minimum allowed deadline is 10s."',
        400
      );

      expect(coordinator.isPermanentConfigurationError(deadlineError)).toBe(true);
      expect(coordinator.isTransientServerError(deadlineError)).toBe(false);
      expect(coordinator.isRateLimitOrQuotaError(deadlineError)).toBe(false);
    });

    it("does NOT retry HTTP 400 INVALID_ARGUMENT errors (single attempt only)", async () => {
      const coordinator = new GeminiQuotaCoordinator({
        maxAttempts: 3, // Configured for 3 attempts, but should abort after 1
      });

      const deadlineError = createHttpError(
        'HTTP 400 INVALID_ARGUMENT: "Manually set deadline 8s is too short. Minimum allowed deadline is 10s."',
        400
      );

      const action = vi.fn().mockRejectedValue(deadlineError);

      await expect(coordinator.execute("testPermanentError", action)).rejects.toThrow(
        /INVALID_ARGUMENT|too short/
      );

      // Must be called exactly ONCE: permanent error must not be retried
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("does not retry when MandateIntelligenceService encounters HTTP 400 INVALID_ARGUMENT", async () => {
      const deadlineError = createHttpError(
        'HTTP 400 INVALID_ARGUMENT: "Manually set deadline 8s is too short. Minimum allowed deadline is 10s."',
        400
      );

      const mockGenerate = vi.fn().mockRejectedValue(deadlineError);
      const mockAi = {
        models: { generateContent: mockGenerate },
      };

      const customCoordinator = new GeminiQuotaCoordinator({
        maxAttempts: 3,
      });

      const service = new MandateIntelligenceService({
        aiClient: mockAi,
        quotaCoordinator: customCoordinator,
      });

      const result = await service.extractMandate({
        prompt: "Purchase 25 4K monitors under $8,500 with 5 days delivery and 30 days return.",
      });

      // Called only once — never retried twice or thrice
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      // Fallback engaged
      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.error).toContain("INVALID_ARGUMENT");
    });
  });

  // =========================================================================
  // 3. TRANSIENT ERROR RETRIES
  // =========================================================================
  describe("3. Transient Error Bounded Retries", () => {
    it("retries transient 503 Service Unavailable errors and recovers on attempt 2", async () => {
      const coordinator = new GeminiQuotaCoordinator({
        maxAttempts: 3,
      });

      const transient503 = new Error("503 Service Unavailable");
      const action = vi
        .fn()
        .mockRejectedValueOnce(transient503)
        .mockResolvedValueOnce({ text: "success" });

      const result = await coordinator.execute("testTransientRecovery", action);
      expect(result).toEqual({ text: "success" });
      expect(action).toHaveBeenCalledTimes(2);
    });

    it("stops after maxAttempts if transient errors persist (bounded retry)", async () => {
      const coordinator = new GeminiQuotaCoordinator({
        maxAttempts: 2,
      });

      const transient503 = new Error("503 Service Unavailable");
      const action = vi.fn().mockRejectedValue(transient503);

      await expect(coordinator.execute("testTransientFailure", action)).rejects.toThrow("503");
      expect(action).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 4. CONCURRENCY SLOT CLEANUP
  // =========================================================================
  describe("4. Concurrency Slot Accounting in Finally Blocks", () => {
    it("releases concurrency slot when action succeeds", async () => {
      const coordinator = new GeminiQuotaCoordinator({ maxConcurrentRequests: 2 });
      const admissionBefore = coordinator.checkAdmission();
      expect(admissionBefore.allowed).toBe(true);

      await coordinator.execute("testSuccessSlot", async () => "ok");

      // Verify slot is free by acquiring both allowed slots
      coordinator.acquireConcurrencySlot();
      coordinator.acquireConcurrencySlot();
      expect(coordinator.checkAdmission().allowed).toBe(false);
      coordinator.releaseConcurrencySlot();
      coordinator.releaseConcurrencySlot();
    });

    it("releases concurrency slot when action throws permanent configuration error", async () => {
      const coordinator = new GeminiQuotaCoordinator({ maxConcurrentRequests: 2 });

      const err: Error & { status?: number } = new Error("400 INVALID_ARGUMENT");
      err.status = 400;

      await expect(
        coordinator.execute("testPermanentFailSlot", async () => {
          throw err;
        })
      ).rejects.toThrow();

      // Slot must be available: 2 slots can still be acquired
      coordinator.acquireConcurrencySlot();
      coordinator.acquireConcurrencySlot();
      expect(coordinator.checkAdmission().allowed).toBe(false);
      coordinator.releaseConcurrencySlot();
      coordinator.releaseConcurrencySlot();
    });

    it("releases concurrency slot when action times out", async () => {
      const coordinator = new GeminiQuotaCoordinator({
        maxConcurrentRequests: 2,
        providerTimeoutMs: 30, // Fast timeout
      });

      await expect(
        coordinator.execute("testTimeoutSlot", async () => {
          return new Promise((resolve) => setTimeout(resolve, 200));
        })
      ).rejects.toThrow(/PROVIDER_TIMEOUT/);

      // Verify slot was decremented and released
      coordinator.acquireConcurrencySlot();
      coordinator.acquireConcurrencySlot();
      expect(coordinator.checkAdmission().allowed).toBe(false);
      coordinator.releaseConcurrencySlot();
      coordinator.releaseConcurrencySlot();
    });
  });

  // =========================================================================
  // 5. DETERMINISTIC FALLBACK PROVENANCE
  // =========================================================================
  describe("5. Fallback Provenance & Labeling", () => {
    it("labels live Gemini extraction with GEMINI_LIVE provenance", async () => {
      const mockAi = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: JSON.stringify({
              status: "READY",
              itemQuery: "Dell XPS 15 Laptops",
              quantity: 10,
              maxTotalBudget: 15000,
              maxDeliveryDays: 7,
              minReturnDays: 30,
              currency: "USD",
              requiredSpecs: [],
              requiredCondition: "NEW",
            }),
          }),
        },
      };

      const service = new MandateIntelligenceService({ aiClient: mockAi });
      const result = await service.extractMandate({
        prompt: "Order 10 Dell XPS 15 Laptops under $15,000 within 7 days and 30 days return.",
      });

      expect(result.extractor).toBe("GEMINI_LIVE");
      expect(result.status).toBe("READY");
    });

    it("labels fallback extraction with DETERMINISTIC_PARSER provenance when Gemini fails", async () => {
      const mockAi = {
        models: {
          generateContent: vi.fn().mockRejectedValue(
            new Error("HTTP 400 INVALID_ARGUMENT: deadline 8s is too short")
          ),
        },
      };

      const service = new MandateIntelligenceService({ aiClient: mockAi });
      const result = await service.extractMandate({
        prompt: "Order 10 Dell XPS 15 Laptops under $15,000 within 7 days and 30 days return.",
      });

      // Must be explicitly marked as DETERMINISTIC_PARSER, never GEMINI_LIVE
      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.extractor).not.toBe("GEMINI_LIVE");
      expect(result.status).toBe("READY");
      expect(result.mandate?.quantity).toBe(10);
    });
  });

  // =========================================================================
  // 6. PRESERVE NEEDS_CLARIFICATION & INVALID IN FALLBACK
  // =========================================================================
  describe("6. Validation Integrity in Fallback", () => {
    it("preserves NEEDS_CLARIFICATION when requirements are ambiguous", async () => {
      const mockAi = {
        models: {
          generateContent: vi.fn().mockRejectedValue(new Error("Gemini unavailable")),
        },
      };

      const service = new MandateIntelligenceService({ aiClient: mockAi });
      // Ambiguous prompt without quantity, category, or budget
      const result = await service.extractMandate({
        prompt: "I need some equipment as cheaply as possible.",
      });

      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.status).toBe("NEEDS_CLARIFICATION");
      expect(result.mandate).toBeUndefined();
      expect(result.missingFields).toContain("quantity");
      expect(result.missingFields).toContain("itemQuery");
      expect(result.clarificationQuestions.length).toBeGreaterThan(0);
    });

    it("preserves INVALID when requirements have contradictory specifications", async () => {
      const mockAi = {
        models: {
          generateContent: vi.fn().mockRejectedValue(new Error("Gemini unavailable")),
        },
      };

      const service = new MandateIntelligenceService({ aiClient: mockAi });
      // Contradictory quantities: 25 vs 50
      const result = await service.extractMandate({
        prompt: "Purchase 25 monitors and also order 50 units of monitors under $8,500 total.",
      });

      expect(result.extractor).toBe("DETERMINISTIC_PARSER");
      expect(result.status).toBe("INVALID");
      expect(result.mandate).toBeUndefined();
      expect(result.contradictions.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 7. HTTP RESPONSE SEMANTICS IN /api/procurement/init
  // =========================================================================
  describe("7. HTTP Response Semantics for /api/procurement/init", () => {
    it("returns HTTP 200 with READY when deterministic fallback successfully parses valid mandate", async () => {
      // Natural language prompt that deterministic parser successfully handles
      const req = new NextRequest("http://localhost:3000/api/procurement/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Purchase 25 4K monitors under an $8,500 total budget, with delivery within 5 days and 30-day return policy.",
          currency: "USD",
        }),
      });

      const res = await initProcurementHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe("READY");
      expect(json.mandate).toBeDefined();
      expect(json.mandate.quantity).toBe(25);
      expect(json.mandate.maxTotalBudget).toBe(8500);
      expect(json.sessionId).toBeDefined();
    });

    it("returns HTTP 200 with NEEDS_CLARIFICATION when analyzeOnly is true on ambiguous prompt", async () => {
      const req = new NextRequest("http://localhost:3000/api/procurement/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "I need some equipment as cheaply as possible.",
          analyzeOnly: true,
        }),
      });

      const res = await initProcurementHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe("NEEDS_CLARIFICATION");
      expect(json.clarificationQuestions.length).toBeGreaterThan(0);
    });

    it("returns HTTP 422 when attempting to initialize session with ambiguous prompt (analyzeOnly: false)", async () => {
      const req = new NextRequest("http://localhost:3000/api/procurement/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "I need some equipment as cheaply as possible.",
          analyzeOnly: false,
        }),
      });

      const res = await initProcurementHandler(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe("NEEDS_CLARIFICATION");
      expect(json.error).toBeDefined();
    });

    it("returns HTTP 400 when prompt is empty", async () => {
      const req = new NextRequest("http://localhost:3000/api/procurement/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "   ",
        }),
      });

      const res = await initProcurementHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe("INVALID");
      expect(json.error).toContain("required");
    });
  });
});
