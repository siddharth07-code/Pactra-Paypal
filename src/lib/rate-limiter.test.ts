/**
 * PACTUM — API Rate Limiter Unit & Concurrency Tests
 * Verifies window enforcement, concurrent access, identity extraction,
 * header generation, and separate operation policies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RateLimiterService,
  MemoryRateLimiterBackend,
  extractClientIdentity,
  createRateLimitResponse,
  RATE_LIMIT_POLICIES,
  RateLimitOperation,
} from "./rate-limiter";
import { NextRequest } from "next/server";

describe("API Rate Limiter Engine", () => {
  let backend: MemoryRateLimiterBackend;
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    backend = new MemoryRateLimiterBackend();
    rateLimiter = new RateLimiterService(backend);
  });

  describe("Identity Extraction", () => {
    it("extracts authenticated user identity when provided", () => {
      const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
        headers: { "x-authenticated-user": "user_officer_42" },
      });
      const id = extractClientIdentity(req, "user_officer_42");
      expect(id).toBe("user:user_officer_42");
    });

    it("extracts and normalizes client IP from x-forwarded-for when proxy trusted", () => {
      const original = process.env.TRUST_PROXY_HEADERS;
      process.env.TRUST_PROXY_HEADERS = "true";
      try {
        const req = new NextRequest("http://localhost:3000/api/procurement/init", {
          headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" },
        });
        const id = extractClientIdentity(req);
        expect(id).toBe("ip:198.51.100.4");
      } finally {
        if (original === undefined) {
          delete process.env.TRUST_PROXY_HEADERS;
        } else {
          process.env.TRUST_PROXY_HEADERS = original;
        }
      }
    });

    it("falls back to anonymous identity when no IP or user header is available", () => {
      const req = new NextRequest("http://localhost:3000/api/procurement/init");
      const id = extractClientIdentity(req);
      expect(id).toContain("anon:");
    });
  });

  describe("Limit Enforcement with Memory Backend", () => {
    it("allows request under the limit and tracks remaining quota", async () => {
      const res1 = await rateLimiter.checkLimitDirect("user:alice", "SESSION_CREATE");
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(RATE_LIMIT_POLICIES.SESSION_CREATE.limit - 1);
      expect(res1.limit).toBe(RATE_LIMIT_POLICIES.SESSION_CREATE.limit);

      const res2 = await rateLimiter.checkLimitDirect("user:alice", "SESSION_CREATE");
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(RATE_LIMIT_POLICIES.SESSION_CREATE.limit - 2);
    });

    it("allows request exactly at the limit and rejects on next attempt", async () => {
      const limit = RATE_LIMIT_POLICIES.NEGOTIATION_STREAM.limit; // 5 requests
      for (let i = 0; i < limit; i++) {
        const res = await rateLimiter.checkLimitDirect("user:bob", "NEGOTIATION_STREAM");
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(limit - 1 - i);
      }

      // 6th attempt should be blocked
      const blocked = await rateLimiter.checkLimitDirect("user:bob", "NEGOTIATION_STREAM");
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("resets quota after the window expires", async () => {
      // Mock time advancement by clearing the backend or testing expiry
      const key = "user:charlie";
      const op: RateLimitOperation = "CRON_OPS";
      const limit = RATE_LIMIT_POLICIES.CRON_OPS.limit;

      for (let i = 0; i < limit; i++) {
        await rateLimiter.checkLimitDirect(key, op);
      }

      const blocked = await rateLimiter.checkLimitDirect(key, op);
      expect(blocked.allowed).toBe(false);

      // Reset backend simulating window expiry
      backend.clear();

      const afterReset = await rateLimiter.checkLimitDirect(key, op);
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(limit - 1);
    });

    it("handles concurrent requests atomically without breaching limit", async () => {
      const key = "user:concurrent_tester";
      const op: RateLimitOperation = "DISPUTE_OPS";
      const limit = RATE_LIMIT_POLICIES.DISPUTE_OPS.limit; // 15

      // Fire 30 simultaneous requests
      const promises = Array.from({ length: 30 }, () =>
        rateLimiter.checkLimitDirect(key, op)
      );
      const results = await Promise.all(promises);

      const allowedCount = results.filter((r: { allowed: boolean }) => r.allowed).length;
      const blockedCount = results.filter((r: { allowed: boolean }) => !r.allowed).length;

      expect(allowedCount).toBe(limit);
      expect(blockedCount).toBe(30 - limit);
    });

    it("enforces separate policies for different endpoints independently", async () => {
      const identity = "user:multi_policy";

      // Exhaust NEGOTIATION_STREAM (limit 5)
      for (let i = 0; i < RATE_LIMIT_POLICIES.NEGOTIATION_STREAM.limit; i++) {
        const r = await rateLimiter.checkLimitDirect(identity, "NEGOTIATION_STREAM");
        expect(r.allowed).toBe(true);
      }
      const streamBlocked = await rateLimiter.checkLimitDirect(identity, "NEGOTIATION_STREAM");
      expect(streamBlocked.allowed).toBe(false);

      // EVIDENCE_READ (limit 60) should still be completely available for same identity
      const evidenceAllowed = await rateLimiter.checkLimitDirect(identity, "EVIDENCE_READ");
      expect(evidenceAllowed.allowed).toBe(true);
      expect(evidenceAllowed.remaining).toBe(RATE_LIMIT_POLICIES.EVIDENCE_READ.limit - 1);
    });
  });

  describe("HTTP 429 Response Generation", () => {
    it("generates compliant HTTP 429 response with Retry-After and rate-limit headers", async () => {
      const rateLimitResult = {
        allowed: false,
        limit: 10,
        remaining: 0,
        resetEpochSeconds: Math.ceil((Date.now() + 45000) / 1000),
        retryAfterSeconds: 45,
        policy: "PAYPAL_SETTLEMENT",
        identity: "ip:198.51.100.4",
      };

      const response = createRateLimitResponse(rateLimitResult);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("45");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();

      const body = await response.json();
      expect(body.error).toBe("Too Many Requests");
      expect(body.retryAfterSeconds).toBe(45);
      expect(body.policy).toBe("PAYPAL_SETTLEMENT");
      expect(body.message).toContain("Rate limit exceeded for PAYPAL_SETTLEMENT");
    });
  });

  describe("Adversarial Identity Spoofing & Proxy Trust", () => {
    it("rejects client-supplied user headers without internal gateway secret", () => {
      const req = new NextRequest("http://localhost:3000/api/procurement/init", {
        headers: {
          "x-authenticated-user": "victim_user_999",
          "x-pactum-user-id": "victim_user_999",
        },
      });

      // No customAuthId and no gateway secret -> MUST NOT trust user header
      const identity = extractClientIdentity(req);
      expect(identity).not.toBe("user:victim_user_999");
      expect(identity).toMatch(/^(anon:|ip:)/);
    });

    it("accepts user headers when validated by internal gateway secret", () => {
      const originalSecret = process.env.INTERNAL_GATEWAY_SECRET;
      process.env.INTERNAL_GATEWAY_SECRET = "secret_gateway_token_123";

      try {
        const req = new NextRequest("http://localhost:3000/api/procurement/init", {
          headers: {
            "x-authenticated-user": "verified_officer_1",
            "x-internal-gateway-secret": "secret_gateway_token_123",
          },
        });

        const identity = extractClientIdentity(req);
        expect(identity).toBe("user:verified_officer_1");
      } finally {
        if (originalSecret === undefined) {
          delete process.env.INTERNAL_GATEWAY_SECRET;
        } else {
          process.env.INTERNAL_GATEWAY_SECRET = originalSecret;
        }
      }
    });

    it("does not trust proxy headers in production unless TRUST_PROXY or VERCEL is explicitly configured", () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origTrust = process.env.TRUST_PROXY;
      const origTrustHeaders = process.env.TRUST_PROXY_HEADERS;
      const origVercel = process.env.VERCEL;

      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.TRUST_PROXY;
      delete process.env.TRUST_PROXY_HEADERS;
      delete process.env.VERCEL;

      try {
        const req = new NextRequest("http://localhost:3000/api/procurement/init", {
          headers: {
            "x-forwarded-for": "203.0.113.195",
            "x-real-ip": "203.0.113.195",
          },
        });

        const identity = extractClientIdentity(req);
        // Untrusted proxy headers should be ignored in production when TRUST_PROXY is not set
        expect(identity).not.toBe("ip:203.0.113.195");
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
        if (origTrust !== undefined) process.env.TRUST_PROXY = origTrust;
        if (origTrustHeaders !== undefined) process.env.TRUST_PROXY_HEADERS = origTrustHeaders;
        if (origVercel !== undefined) process.env.VERCEL = origVercel;
      }
    });
  });
});
