/**
 * PACTUM — Production-Grade API Rate Limiter
 *
 * Implements configurable, atomic sliding-window rate limiting supporting:
 * 1. Operation-specific policies (session creation, negotiation stream, evidence, disputes, settlements).
 * 2. Secure client identity extraction with IP normalization and trusted proxy validation.
 * 3. Atomic in-memory sliding-window backend (for development, tests, single-instance).
 * 4. Distributed atomic Redis sliding-window backend (via Lua script) for multi-instance deployments.
 * 5. RFC 6585 standard HTTP 429 response formatting with Retry-After and X-RateLimit headers.
 * 6. Fail-safe fallback when distributed infrastructure is degraded or unconfigured.
 */

import { NextRequest } from "next/server";
import Redis from "ioredis";
import { ensureRedisReady, redisConnectionOptions } from "./redis-connection";
import crypto from "crypto";

export interface RateLimitPolicy {
  name: string;
  limit: number; // Max allowed requests in window
  windowSeconds: number; // Sliding window duration in seconds
  description: string;
}

export type RateLimitPolicyName =
  | "AUTH_REGISTER"
  | "AUTH_LOGIN"
  | "AUTH_SESSION"
  | "SESSION_CREATE"
  | "MANDATE_ANALYZE"
  | "NEGOTIATION_STREAM"
  | "EVIDENCE_READ"
  | "DISPUTE_OPS"
  | "PAYPAL_SETTLEMENT"
  | "CRON_OPS"
  | "GENERAL_DEFAULT";

export type RateLimitOperation = RateLimitPolicyName;

export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = {
  AUTH_REGISTER: { name: "AUTH_REGISTER", limit: 5, windowSeconds: 60, description: "Authentication registration" },
  AUTH_LOGIN: { name: "AUTH_LOGIN", limit: 10, windowSeconds: 60, description: "Authentication login, logout, and confirmation" },
  AUTH_SESSION: { name: "AUTH_SESSION", limit: 60, windowSeconds: 60, description: "Verified authentication session retrieval" },
  SESSION_CREATE: {
    name: "SESSION_CREATE",
    limit: 10,
    windowSeconds: 60,
    description: "Procurement session creation (/api/procurement/init)",
  },
  MANDATE_ANALYZE: {
    name: "MANDATE_ANALYZE",
    limit: 20,
    windowSeconds: 60,
    description: "Mandate prompt analysis (/api/procurement/init?analyzeOnly)",
  },
  NEGOTIATION_STREAM: {
    name: "NEGOTIATION_STREAM",
    limit: 5,
    windowSeconds: 60,
    description: "Multi-agent negotiation SSE stream (/api/negotiate/stream)",
  },
  EVIDENCE_READ: {
    name: "EVIDENCE_READ",
    limit: 60,
    windowSeconds: 60,
    description: "Evidence and session inspection (/api/procurement/evidence, sessions)",
  },
  DISPUTE_OPS: {
    name: "DISPUTE_OPS",
    limit: 15,
    windowSeconds: 60,
    description: "Dispute opening and evaluation (/api/procurement/disputes/*)",
  },
  PAYPAL_SETTLEMENT: {
    name: "PAYPAL_SETTLEMENT",
    limit: 10,
    windowSeconds: 60,
    description: "PayPal checkout, capture, settle, and cancel operations",
  },
  CRON_OPS: {
    name: "CRON_OPS",
    limit: 10,
    windowSeconds: 60,
    description: "Scheduled maintenance cron operations (/api/cron/*)",
  },
  GENERAL_DEFAULT: {
    name: "GENERAL_DEFAULT",
    limit: 30,
    windowSeconds: 60,
    description: "General endpoint default rate limit",
  },
};

export interface RateLimitResult {
  allowed: boolean;
  unavailable?: boolean;
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
  retryAfterSeconds: number;
  policy: string;
  identity: string;
}

export interface RateLimiterBackend {
  incrementAndCheck(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  close(): Promise<void>;
  isReady(): boolean;
  getBackendType(): "memory" | "redis";
}

/**
 * In-Memory Sliding-Window Log Backend.
 * Strictly thread-safe within a single Node.js event loop tick.
 */
export class MemoryRateLimiterBackend implements RateLimiterBackend {
  private windows = new Map<string, number[]>();

  public async incrementAndCheck(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const threshold = now - windowMs;

    let timestamps = this.windows.get(key) ?? [];
    // Filter out expired timestamps
    timestamps = timestamps.filter((t) => t > threshold);

    const resetEpochSeconds = Math.ceil((now + windowMs) / 1000);

    if (timestamps.length >= limit) {
      // Oldest request in window determines when slot frees up
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.windows.set(key, timestamps);

      return {
        allowed: false,
        limit,
        remaining: 0,
        resetEpochSeconds: Math.ceil((oldest + windowMs) / 1000),
        retryAfterSeconds,
        policy: key.split(":")[0] ?? "unknown",
        identity: key.split(":").slice(1).join(":"),
      };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - timestamps.length),
      resetEpochSeconds,
      retryAfterSeconds: 0,
      policy: key.split(":")[0] ?? "unknown",
      identity: key.split(":").slice(1).join(":"),
    };
  }

  public async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }

  public clear(): void {
    this.windows.clear();
  }

  public async close(): Promise<void> {
    this.windows.clear();
  }

  public isReady(): boolean {
    return true;
  }

  public getBackendType(): "memory" {
    return "memory";
  }
}

/**
 * Atomic Redis Sliding-Window Backend using Lua script.
 * Guarantees zero race conditions across distributed serverless or clustered instances.
 */
const REDIS_SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
local currentCount = redis.call('ZCARD', key)

if currentCount < limit then
    redis.call('ZADD', key, now, now .. '-' .. ARGV[4])
    redis.call('PEXPIRE', key, windowMs + 1000)
    local resetEpoch = math.ceil((now + windowMs) / 1000)
    return {1, limit - currentCount - 1, 0, resetEpoch}
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfter = 1
    local resetEpoch = math.ceil((now + windowMs) / 1000)
    if #oldest > 1 then
        local oldestTs = tonumber(oldest[2])
        retryAfter = math.max(1, math.ceil((oldestTs + windowMs - now) / 1000))
        resetEpoch = math.ceil((oldestTs + windowMs) / 1000)
    end
    return {0, 0, retryAfter, resetEpoch}
end
`;

export class RedisRateLimiterBackend implements RateLimiterBackend {
  private client: Redis | null = null;
  private fallbackMemory = new MemoryRateLimiterBackend();

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL;
    if (url) {
      try {
        this.client = new Redis(url, redisConnectionOptions(url));

        this.client.on("error", (error: NodeJS.ErrnoException) => {
          if (process.env.NODE_ENV !== "test") {
            console.error("[RateLimiter] Redis connection unavailable.", /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code ?? "") ? error.code : "REDIS_ERROR");
          }
        });
      } catch {
        this.client = null;
      }
    }
  }

  public async incrementAndCheck(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const isStrictRedisProduction =
      process.env.NODE_ENV === "production" ||
      (process.env.RATE_LIMIT_BACKEND === "redis" && process.env.RATE_LIMIT_FAIL_CLOSED === "true");

    if (!this.client) {
      if (isStrictRedisProduction) {
        console.error(
          "[RateLimiter] CRITICAL: Distributed Redis rate limiter is configured but uninitialized. Failing closed to prevent unmetered cluster traffic."
        );
        return {
          allowed: false,
          unavailable: true,
          limit,
          remaining: 0,
          resetEpochSeconds: Math.ceil(Date.now() / 1000) + 5,
          retryAfterSeconds: 5,
          policy: key.split(":")[0] ?? "unknown",
          identity: key.split(":").slice(1).join(":"),
        };
      }
      return this.fallbackMemory.incrementAndCheck(key, limit, windowSeconds);
    }

    try {
      await ensureRedisReady(this.client);

      if (this.client.status !== "ready") {
        if (isStrictRedisProduction) {
          console.error(
            `[RateLimiter] CRITICAL: Redis rate limiter is not ready (status: ${this.client.status}). Failing closed.`
          );
          return {
            allowed: false,
            unavailable: true,
            limit,
            remaining: 0,
            resetEpochSeconds: Math.ceil(Date.now() / 1000) + 5,
            retryAfterSeconds: 5,
            policy: key.split(":")[0] ?? "unknown",
            identity: key.split(":").slice(1).join(":"),
          };
        }
        return this.fallbackMemory.incrementAndCheck(key, limit, windowSeconds);
      }

      const now = Date.now();
      const nonce = Math.random().toString(36).substring(2, 9);
      const redisKey = `pactum:ratelimit:${key}`;

      const res = (await this.client.eval(
        REDIS_SLIDING_WINDOW_LUA,
        1,
        redisKey,
        now,
        windowSeconds * 1000,
        limit,
        nonce
      )) as [number, number, number, number];

      const allowed = res[0] === 1;
      const remaining = res[1];
      const retryAfterSeconds = res[2];
      const resetEpochSeconds = res[3] ?? Math.ceil((now + windowSeconds * 1000) / 1000);

      return {
        allowed,
        limit,
        remaining,
        resetEpochSeconds,
        retryAfterSeconds,
        policy: key.split(":")[0] ?? "unknown",
        identity: key.split(":").slice(1).join(":"),
      };
    } catch {
      if (isStrictRedisProduction) {
        console.error(
          "[RateLimiter] CRITICAL: Redis command unavailable. Failing closed."
        );
        return {
          allowed: false,
          unavailable: true,
          limit,
          remaining: 0,
          resetEpochSeconds: Math.ceil(Date.now() / 1000) + 5,
          retryAfterSeconds: 5,
          policy: key.split(":")[0] ?? "unknown",
          identity: key.split(":").slice(1).join(":"),
        };
      }
      return this.fallbackMemory.incrementAndCheck(key, limit, windowSeconds);
    }
  }

  public async reset(key: string): Promise<void> {
    if (this.client && this.client.status === "ready") {
      try {
        await this.client.del(`pactum:ratelimit:${key}`);
      } catch {
        // Ignore
      }
    }
    await this.fallbackMemory.reset(key);
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // Ignore
      }
    }
    await this.fallbackMemory.close();
  }

  public isReady(): boolean {
    return this.client?.status === "ready";
  }

  public getBackendType(): "redis" {
    return "redis";
  }
}

/**
 * Extracts and normalizes client identity from request headers.
 * Protects against identity header spoofing:
 * - customAuthId passed directly by authenticated server-side handlers is trusted.
 * - x-pactum-user-id / x-authenticated-user headers are ONLY trusted if verified via
 *   INTERNAL_GATEWAY_SECRET. Raw client requests cannot spoof user identity.
 * - Proxy headers (cf-connecting-ip, x-forwarded-for, x-real-ip) are ONLY trusted when
 *   TRUST_PROXY, TRUST_PROXY_HEADERS, or VERCEL=1 is explicitly configured.
 */
export function extractClientIdentity(req: NextRequest, customAuthId?: string): string {
  // 1. Explicit authenticated user identifier if passed by verified server-side caller
  if (customAuthId && /^[\w-]{1,64}$/.test(customAuthId)) {
    return `user:${customAuthId}`;
  }

  // 2. Gateway-authenticated identity: ONLY trust headers if internal gateway authentication is verified
  const internalSecret = process.env.INTERNAL_GATEWAY_SECRET || process.env.GATEWAY_SHARED_SECRET;
  const providedGatewaySecret = req.headers.get("x-internal-gateway-secret");
  const isGatewayTrusted = Boolean(
    internalSecret &&
      providedGatewaySecret &&
      internalSecret.length === providedGatewaySecret.length &&
      crypto.timingSafeEqual(Buffer.from(internalSecret), Buffer.from(providedGatewaySecret))
  );

  if (isGatewayTrusted) {
    const authUserId =
      req.headers.get("x-pactum-user-id") ||
      req.headers.get("x-authenticated-user");
    if (authUserId && /^[\w-]{1,64}$/.test(authUserId)) {
      return `user:${authUserId}`;
    }
  }

  // 3. Client IP normalization: ONLY trust proxy headers if explicit proxy trust is enabled
  const trustProxy =
    process.env.TRUST_PROXY === "true" ||
    process.env.TRUST_PROXY_HEADERS === "true" ||
    process.env.VERCEL === "1";

  let clientIp: string | null = null;

  if (trustProxy) {
    const cfIp = req.headers.get("cf-connecting-ip");
    const realIp = req.headers.get("x-real-ip");
    const forwardedFor = req.headers.get("x-forwarded-for");

    if (cfIp) {
      clientIp = cfIp.trim();
    } else if (realIp) {
      clientIp = realIp.trim();
    } else if (forwardedFor) {
      // First IP in the list represents the client
      const ips = forwardedFor.split(",");
      if (ips.length > 0 && ips[0].trim()) {
        clientIp = ips[0].trim();
      }
    }
  }

  if (!clientIp) {
    // Attempt NextRequest ip field if populated by platform
    clientIp = (req as { ip?: string }).ip ?? null;
  }

  if (clientIp) {
    // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:192.0.2.1)
    if (clientIp.startsWith("::ffff:")) {
      clientIp = clientIp.substring(7);
    }
    // Normalize localhost
    if (clientIp === "::1") {
      clientIp = "127.0.0.1";
    }
    // Clean characters
    const sanitized = clientIp.replace(/[^\w.:-]/g, "");
    if (sanitized) {
      return `ip:${sanitized}`;
    }
  }

  // Safe anonymous partition key
  return "anon:fallback_client";
}

/**
 * Creates standard HTTP 429 Too Many Requests response with safe headers.
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  const retryAfter = Math.max(1, result.retryAfterSeconds);
  if (result.unavailable) return new Response(JSON.stringify({ error: "Service Unavailable", code: "RATE_LIMIT_UNAVAILABLE", message: "Request protection is temporarily unavailable. Please retry shortly." }), { status: 503, headers: { "Content-Type": "application/json", "Retry-After": retryAfter.toString(), "Cache-Control": "no-store" } });
  const body = {
    error: "Too Many Requests",
    message: `Rate limit exceeded for ${result.policy}. Please retry after ${retryAfter} seconds.`,
    policy: result.policy,
    limit: result.limit,
    retryAfter,
    retryAfterSeconds: retryAfter,
  };

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": retryAfter.toString(),
      "X-RateLimit-Limit": result.limit.toString(),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": result.resetEpochSeconds.toString(),
    },
  });
}

/**
 * Rate Limiter Engine.
 */
export class RateLimiter {
  private backend: RateLimiterBackend;

  constructor(backend?: RateLimiterBackend) {
    if (backend) {
      this.backend = backend;
    } else if (
      process.env.NODE_ENV === "production" ||
      process.env.RATE_LIMIT_BACKEND === "redis" ||
      (process.env.REDIS_URL && process.env.NODE_ENV !== "test")
    ) {
      this.backend = new RedisRateLimiterBackend();
    } else {
      this.backend = new MemoryRateLimiterBackend();
    }
  }

  public async check(
    req: NextRequest,
    policyName: RateLimitPolicyName,
    customIdentity?: string
  ): Promise<{ allowed: boolean; result: RateLimitResult; response?: Response }> {
    const policy = RATE_LIMIT_POLICIES[policyName] ?? RATE_LIMIT_POLICIES.GENERAL_DEFAULT;
    const identity = customIdentity ?? extractClientIdentity(req);
    const key = `${policy.name}:${identity}`;

    const result = await this.backend.incrementAndCheck(
      key,
      policy.limit,
      policy.windowSeconds
    );

    if (!result.allowed) {
      return {
        allowed: false,
        result,
        response: createRateLimitResponse(result),
      };
    }

    return { allowed: true, result };
  }

  public async checkLimit(
    req: NextRequest,
    policyName: RateLimitPolicyName,
    customIdentity?: string
  ): Promise<RateLimitResult> {
    const res = await this.check(req, policyName, customIdentity);
    return res.result;
  }

  public async checkLimitDirect(
    identity: string,
    policyName: RateLimitPolicyName
  ): Promise<RateLimitResult> {
    const policy = RATE_LIMIT_POLICIES[policyName] ?? RATE_LIMIT_POLICIES.GENERAL_DEFAULT;
    return this.backend.incrementAndCheck(
      `${policy.name}:${identity}`,
      policy.limit,
      policy.windowSeconds
    );
  }

  public getBackend(): RateLimiterBackend {
    return this.backend;
  }

  public async resetKey(policyName: RateLimitPolicyName, identity: string): Promise<void> {
    await this.backend.reset(`${policyName}:${identity}`);
  }

  public resetAll(): void {
    if ("clear" in this.backend && typeof (this.backend as { clear: () => void }).clear === "function") {
      (this.backend as { clear: () => void }).clear();
    }
  }
}

export { RateLimiter as RateLimiterService };

// Global singleton rate limiter instance
const globalForRateLimiter = globalThis as unknown as {
  pactumRateLimiter?: RateLimiter;
};

export const defaultRateLimiter =
  globalForRateLimiter.pactumRateLimiter ?? new RateLimiter();

globalForRateLimiter.pactumRateLimiter = defaultRateLimiter;

