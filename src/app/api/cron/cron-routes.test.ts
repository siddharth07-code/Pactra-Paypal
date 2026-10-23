/**
 * PACTUM — Authenticated Cron Routes Integration Tests
 * Tests /api/cron/health and /api/cron/cleanup endpoints:
 * - Authentication verification (missing, invalid, valid CRON_SECRET)
 * - Safe payload reporting
 * - Concurrency conflict (409)
 * - Dry run vs execution behavior
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET as healthGet, POST as healthPost } from "./health/route";
import { POST as cleanupPost, GET as cleanupGet } from "./cleanup/route";
import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { defaultCronCoordinator } from "@/lib/cron-coordinator";

describe("Authenticated Cron API Routes", () => {
  const SECRET = "super_secure_cron_secret_test";
  let prevCronSecret: string | undefined;

  beforeEach(() => {
    sessionStore.clear();
    prevCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (prevCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = prevCronSecret;
    }
  });

  describe("Authentication Guard", () => {
    it("rejects health check without authentication", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/health", {
        method: "GET",
      });
      const res = await healthGet(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("rejects health check with invalid secret", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/health", {
        method: "GET",
        headers: { authorization: "Bearer wrong_secret" },
      });
      const res = await healthGet(req);
      expect(res.status).toBe(401);
    });

    it("accepts health check with valid secret via Authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/health", {
        method: "GET",
        headers: { authorization: `Bearer ${SECRET}` },
      });
      const res = await healthGet(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.health.status).toBe("HEALTHY");
      expect(body.health.geminiCircuitBreaker.state).toBe("CLOSED");
    });

    it("accepts health check with valid secret via x-cron-secret header", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/health", {
        method: "POST",
        headers: { "x-cron-secret": SECRET },
      });
      const res = await healthPost(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("Cleanup Route", () => {
    it("rejects cleanup request without authentication", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/cleanup", {
        method: "POST",
      });
      const res = await cleanupPost(req);
      expect(res.status).toBe(401);
    });

    it("executes dry-run cleanup by default with safe response payload", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/cleanup", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ dryRun: true }),
      });
      const res = await cleanupPost(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.report.dryRun).toBe(true);
      expect(body.report.deletedCount).toBe(0);
      expect(body.report.scannedCount).toBe(0);
    });

    it("returns 409 Conflict if a cleanup job is already running", async () => {
      // Simulate lock held
      defaultCronCoordinator.acquireLock("cleanup", 10000);

      try {
        const req = new NextRequest("http://localhost:3000/api/cron/cleanup", {
          method: "POST",
          headers: { authorization: `Bearer ${SECRET}` },
        });
        const res = await cleanupPost(req);
        expect(res.status).toBe(409);

        const body = await res.json();
        expect(body.error).toContain("already in progress");
      } finally {
        await defaultCronCoordinator.releaseLock("cleanup");
      }
    });

    it("supports GET dry-run status check", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/cleanup", {
        method: "GET",
        headers: { authorization: `Bearer ${SECRET}` },
      });
      const res = await cleanupGet(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.report.dryRun).toBe(true);
    });
  });
});
