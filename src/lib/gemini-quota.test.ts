/**
 * PACTUM — Gemini Quota Protection & Circuit Breaker Tests
 * Tests admission, concurrency caps, rate limits, 3-state circuit breaker,
 * recovery probes, bounded retries, and fallback integration.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GeminiQuotaCoordinator,
  GeminiQuotaError,
} from "./gemini-quota";
import { GeminiNegotiationClient } from "./gemini-client";
import type { ProcurementMandate, VendorQuote } from "../types/pactum";

describe("Gemini Quota Protection & Circuit Breaker", () => {
  let coordinator: GeminiQuotaCoordinator;

  beforeEach(() => {
    coordinator = new GeminiQuotaCoordinator({
      maxRequestsPerMinute: 5,
      maxConcurrentRequests: 2,
      maxAttempts: 2,
      providerTimeoutMs: 2000,
      circuitBreakerThreshold: 3,
      circuitBreakerCooldownMs: 1000,
    });
  });

  describe("Admission & Sliding-Window Quota", () => {
    it("admits requests within quota window", () => {
      for (let i = 0; i < 5; i++) {
        const admission = coordinator.checkAdmission();
        expect(admission.allowed).toBe(true);
        coordinator.recordRequestStart();
      }
    });

    it("rejects admission when RPM quota is exhausted", () => {
      for (let i = 0; i < 5; i++) {
        expect(coordinator.checkAdmission().allowed).toBe(true);
        coordinator.recordRequestStart();
      }

      const rejected = coordinator.checkAdmission();
      expect(rejected.allowed).toBe(false);
      expect(rejected.reason).toBe("QUOTA_EXHAUSTED");
      expect(rejected.retryAfterMs).toBeGreaterThan(0);
    });

    it("rejects admission when concurrent request limit is reached", () => {
      // maxConcurrent is 2
      coordinator.acquireConcurrencySlot();
      coordinator.acquireConcurrencySlot();

      const admission = coordinator.checkAdmission();
      expect(admission.allowed).toBe(false);
      expect(admission.reason).toBe("CONCURRENCY_LIMIT_REACHED");

      // Release one slot
      coordinator.releaseConcurrencySlot();
      const admissionAfterRelease = coordinator.checkAdmission();
      expect(admissionAfterRelease.allowed).toBe(true);
    });
  });

  describe("Circuit Breaker Transitions & Cooldown", () => {
    it("opens circuit breaker after repeated 503/504 failures", () => {
      expect(coordinator.getCircuitState()).toBe("CLOSED");

      // 3 consecutive 503 errors trigger threshold
      coordinator.recordFailure(new Error("503 Service Unavailable"));
      coordinator.recordFailure(new Error("504 Gateway Timeout"));
      coordinator.recordFailure(new Error("503 Service Unavailable"));

      expect(coordinator.getCircuitState()).toBe("OPEN");

      // Next admission should be blocked by circuit breaker
      const admission = coordinator.checkAdmission();
      expect(admission.allowed).toBe(false);
      expect(admission.reason).toBe("CIRCUIT_OPEN");
    });

    it("triggers immediate cooldown on 429 quota exhaustion", () => {
      coordinator.recordFailure(new Error("429 Resource has been exhausted (quota)"));
      expect(coordinator.getCircuitState()).toBe("OPEN");

      const admission = coordinator.checkAdmission();
      expect(admission.allowed).toBe(false);
      expect(admission.reason).toBe("CIRCUIT_OPEN");
    });

    it("transitions from OPEN to HALF_OPEN after cooldown and allows a single probe", async () => {
      // Use short cooldown coordinator
      const fastCoordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 10,
        maxConcurrentRequests: 2,
        maxAttempts: 2,
        providerTimeoutMs: 1000,
        circuitBreakerThreshold: 2,
        circuitBreakerCooldownMs: 50, // 50ms
      });

      fastCoordinator.recordFailure(new Error("503"));
      fastCoordinator.recordFailure(new Error("503"));
      expect(fastCoordinator.getCircuitState()).toBe("OPEN");

      // Wait for cooldown to expire
      await new Promise((r) => setTimeout(r, 60));

      // First check transitions to HALF_OPEN and admits the probe
      const firstCheck = fastCoordinator.checkAdmission();
      expect(firstCheck.allowed).toBe(true);
      expect(fastCoordinator.getCircuitState()).toBe("HALF_OPEN");

      // Concurrent request while probe is in flight is rejected
      const secondCheck = fastCoordinator.checkAdmission();
      expect(secondCheck.allowed).toBe(false);
      expect(secondCheck.reason).toBe("HALF_OPEN_PROBE_IN_FLIGHT");

      // When probe succeeds, circuit recovers to CLOSED
      fastCoordinator.recordSuccess();
      expect(fastCoordinator.getCircuitState()).toBe("CLOSED");
    });

    it("re-opens circuit immediately if HALF_OPEN probe fails", async () => {
      const fastCoordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 10,
        maxConcurrentRequests: 2,
        maxAttempts: 2,
        providerTimeoutMs: 1000,
        circuitBreakerThreshold: 1,
        circuitBreakerCooldownMs: 50,
      });

      fastCoordinator.recordFailure(new Error("503"));
      expect(fastCoordinator.getCircuitState()).toBe("OPEN");

      await new Promise((r) => setTimeout(r, 60));

      // Admit probe
      expect(fastCoordinator.checkAdmission().allowed).toBe(true);
      expect(fastCoordinator.getCircuitState()).toBe("HALF_OPEN");

      // Probe fails
      fastCoordinator.recordFailure(new Error("503 Service Unavailable"));
      expect(fastCoordinator.getCircuitState()).toBe("OPEN");
    });
  });

  describe("Execute Wrapper with Bounded Retries", () => {
    it("executes successfully and releases concurrency slot", async () => {
      const result = await coordinator.execute(
        "test-op",
        async () => "success-payload"
      );
      expect(result).toBe("success-payload");
      expect(coordinator.checkAdmission().allowed).toBe(true);
    });

    it("does not retry beyond maxAttempts and throws GeminiQuotaError when circuit opens", async () => {
      let callCount = 0;
      await expect(
        coordinator.execute("failing-op", async () => {
          callCount++;
          throw new Error("503 Overloaded");
        })
      ).rejects.toThrow();

      // maxAttempts is 2, so it should attempt at most 2 times
      expect(callCount).toBeLessThanOrEqual(2);
    });

    it("throws GeminiQuotaError immediately without invoking callback if quota is exhausted", async () => {
      // Exhaust quota
      for (let i = 0; i < 5; i++) {
        coordinator.recordRequestStart();
      }

      let invoked = false;
      await expect(
        coordinator.execute("blocked-op", async () => {
          invoked = true;
          return "unreachable";
        })
      ).rejects.toThrow(GeminiQuotaError);

      expect(invoked).toBe(false);
    });
  });

  describe("Integration with GeminiNegotiationClient & Deterministic Fallback", () => {
    const mandate: ProcurementMandate = {
      id: "mandate-quota-test",
      rawPrompt: "Purchase 25 monitors under $8,500",
      itemQuery: "4K Monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
    };

    const quote: VendorQuote = {
      vendorId: "vendor-test",
      vendorName: "Apex Displays",
      sku: "APX-4K-27",
      productTitle: "27 4K Monitor",
      initialUnitAsk: 375,
      currentUnitBid: 320,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACCEPTED",
      dataSource: "CHANNEL3",
    };

    it("falls back to deterministic negotiation with accurate provenance when quota is exhausted", async () => {
      const exhaustedCoordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 1,
        maxConcurrentRequests: 1,
        maxAttempts: 1,
        providerTimeoutMs: 1000,
        circuitBreakerThreshold: 1,
        circuitBreakerCooldownMs: 10000,
      });
      // Exhaust it immediately
      exhaustedCoordinator.recordRequestStart();

      const client = new GeminiNegotiationClient({
        apiKey: "fake-key-for-test",
        quotaCoordinator: exhaustedCoordinator,
      });
      const decision = await client.generateBuyerOffer({
        mandate,
        vendorQuote: quote,
        round: 1,
        maxRounds: 4,
        previousVendorAsk: 375,
      });

      expect(decision.generator).toBe("DETERMINISTIC_FALLBACK");
      expect(decision.unitPrice).toBeGreaterThan(0);
      expect(decision.deliveryDays).toBeLessThanOrEqual(mandate.maxDeliveryDays);
      expect(decision.returnDays).toBeGreaterThanOrEqual(mandate.minReturnDays);
    });

    it("does not create an agreement when provider is unavailable", async () => {
      const exhaustedCoordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 0, // completely blocked
        maxConcurrentRequests: 0,
        maxAttempts: 1,
        providerTimeoutMs: 1000,
        circuitBreakerThreshold: 1,
        circuitBreakerCooldownMs: 10000,
      });

      const client = new GeminiNegotiationClient({
        apiKey: "fake-key",
        quotaCoordinator: exhaustedCoordinator,
      });
      const decision = await client.generateBuyerOffer({
        mandate,
        vendorQuote: quote,
        round: 1,
        maxRounds: 4,
        previousVendorAsk: 375,
      });

      // Generator must be fallback, unit price must be a reasonable buyer counter
      expect(decision.generator).toBe("DETERMINISTIC_FALLBACK");
      expect(decision.unitPrice).toBeLessThan(quote.initialUnitAsk);
    });
  });

  describe("Probe Deadlock & Auto-Recovery Protection", () => {
    it("calling getStatus() during HALF_OPEN does NOT claim the probe or deadlock the circuit", async () => {
      const probeCoordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 10,
        maxConcurrentRequests: 2,
        maxAttempts: 2,
        providerTimeoutMs: 1000,
        circuitBreakerThreshold: 1,
        circuitBreakerCooldownMs: 50,
      });

      probeCoordinator.recordFailure(new Error("503"));
      expect(probeCoordinator.getCircuitState()).toBe("OPEN");

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 60));
      expect(probeCoordinator.getCircuitState()).toBe("HALF_OPEN");

      // Inspection via getStatus() (e.g. from monitoring / health checks)
      const status1 = probeCoordinator.getStatus();
      expect(status1.circuitState).toBe("HALF_OPEN");
      expect(status1.isAdmissible).toBe(true);

      const status2 = probeCoordinator.getStatus();
      expect(status2.isAdmissible).toBe(true);

      // The actual execution / admission probe should still be freely admissible!
      const actualProbeAdmission = probeCoordinator.checkAdmission();
      expect(actualProbeAdmission.allowed).toBe(true);

      // Second actual attempt while probe is in flight is rejected
      const secondAdmission = probeCoordinator.checkAdmission();
      expect(secondAdmission.allowed).toBe(false);
      expect(secondAdmission.reason).toBe("HALF_OPEN_PROBE_IN_FLIGHT");
    });

    it("auto-recovers from a hung probe that exceeded provider timeout", async () => {
      const autoRecoverCoordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 10,
        maxConcurrentRequests: 2,
        maxAttempts: 2,
        providerTimeoutMs: 50, // 50ms provider timeout
        circuitBreakerThreshold: 1,
        circuitBreakerCooldownMs: 20,
      });

      autoRecoverCoordinator.recordFailure(new Error("503"));
      await new Promise((r) => setTimeout(r, 30));
      expect(autoRecoverCoordinator.getCircuitState()).toBe("HALF_OPEN");

      // First check claims the probe
      const firstCheck = autoRecoverCoordinator.checkAdmission();
      expect(firstCheck.allowed).toBe(true);

      // Immediately after, second check is blocked
      expect(autoRecoverCoordinator.checkAdmission().allowed).toBe(false);

      // Wait beyond providerTimeoutMs (60ms > 50ms) without probe completion
      await new Promise((r) => setTimeout(r, 65));

      // Coordinator auto-clears the hung probe and admits next request
      const recoveredAdmission = autoRecoverCoordinator.checkAdmission();
      expect(recoveredAdmission.allowed).toBe(true);
    });
  });
});
