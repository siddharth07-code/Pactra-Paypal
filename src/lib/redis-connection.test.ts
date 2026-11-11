import { EventEmitter } from "node:events";
import Redis from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RedisRateLimiterBackend, createRateLimitResponse } from "./rate-limiter";
import { CronCoordinator } from "./cron-coordinator";
import { ensureRedisReady, redisConnectionOptions, redisConnectionMetadata, redisFailureCode } from "./redis-connection";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
function client(status: string) {
  const value = Object.assign(new EventEmitter(), { status, connect: vi.fn().mockResolvedValue(undefined) });
  return value as unknown as Redis;
}
describe("Redis serverless lifecycle", () => {
  it("limits runtime diagnostics to connection metadata without credentials", () => {
    const redis = { options: { host: "fixture.upstash.io", port: 6379, family: 4, username: "default", password: "private-password", tls: { servername: "fixture.upstash.io", rejectUnauthorized: true } }, status: "reconnecting" } as unknown as Redis;
    const metadata = JSON.stringify(redisConnectionMetadata(redis));
    expect(metadata).toContain("fixture.upstash.io");
    expect(metadata).not.toContain("private-password");
    expect(metadata).not.toContain("default");
    expect(metadata).not.toContain("rediss://");
  });
  it("enforces Upstash TCP port 6379 while preserving credentials and verified TLS", () => {
    const value = "rediss://default:fixture%2Bpassword@fixture.upstash.io:637";
    const redis = new Redis(redisConnectionOptions(value));
    expect(redis.options.port).toBe(6379);
    expect(redis.options.host).toBe("fixture.upstash.io");
    expect(redis.options.password).toBe("fixture+password");
    expect(redis.options.tls).toMatchObject({ rejectUnauthorized: true, servername: "fixture.upstash.io" });
    expect(redis.status).toBe("wait");
    redis.disconnect();
    expect(redisConnectionOptions("redis://localhost:16379").port).toBe(16379);
  });
  it("classifies Redis ACL failures without logging provider messages or credentials", () => {
    expect(redisFailureCode(new Error("NOPERM denied; private-credential"))).toBe("NOPERM");
    expect(redisFailureCode(new Error("WRONGPASS private-credential"))).toBe("WRONGPASS");
    expect(redisFailureCode(new Error("private-credential"))).toBe("REDIS_ERROR");
    expect(redisConnectionOptions("rediss://default:test@fixture.upstash.io:6379").enableReadyCheck).toBe(false);
  });
  it("requires authenticated TLS for Upstash and preserves peer verification", () => {
    expect(redisConnectionOptions("rediss://default:test-password@redis.upstash.io:6379").tls).toEqual({ servername: "redis.upstash.io", rejectUnauthorized: true });
    expect(() => redisConnectionOptions("redis://default:test-password@redis.upstash.io:6379")).toThrow();
    expect(() => redisConnectionOptions("rediss://redis.upstash.io:6379")).toThrow();
  });
  it.each([" rediss://default:test@redis.upstash.io:6379", "https://redis.upstash.io", "rediss://default:test@redis.upstash.io:6379?tls=false", "rediss://default:test@redis.upstash.io:6379/bad"])("rejects malformed configuration without echoing credentials", value => {
    expect(() => redisConnectionOptions(value)).toThrow("Invalid Redis connection configuration.");
  });
  it("shares one bounded connection wait across cold-start requests", async () => {
    const redis = client("wait");
    const first = ensureRedisReady(redis);
    const second = ensureRedisReady(redis);
    expect(first).toBe(second);
    expect(redis.connect).toHaveBeenCalledTimes(1);
    redis.emit("ready");
    await first;
    expect(redis.listenerCount("ready")).toBe(0);
  });
  it("keeps waiting when the initial socket fails but reconnection is still active", async () => {
    const redis = client("wait");
    vi.mocked(redis.connect).mockImplementation(async () => { redis.status = "reconnecting"; throw new Error("Initial socket unavailable"); });
    const wait = ensureRedisReady(redis);
    await Promise.resolve();
    await Promise.resolve();
    redis.emit("ready");
    await wait;
  });
  it("waits for an existing reconnect instead of rejecting the request immediately", async () => {
    const redis = client("reconnecting");
    const wait = ensureRedisReady(redis);
    expect(redis.connect).not.toHaveBeenCalled();
    redis.emit("ready");
    await wait;
  });
  it("bounds unavailable waits, removes listeners, and permits a later retry", async () => {
    vi.useFakeTimers();
    const redis = client("reconnecting");
    const first = ensureRedisReady(redis, 20);
    const rejected = expect(first).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(21);
    await rejected;
    expect(redis.listenerCount("ready")).toBe(0);
    const retry = ensureRedisReady(redis);
    redis.emit("ready");
    await retry;
  });
  it("restarts a client after its retry budget is exhausted", async () => {
    const redis = client("end");
    const wait = ensureRedisReady(redis);
    expect(redis.connect).toHaveBeenCalledTimes(1);
    redis.emit("ready");
    await wait;
  });
});

describe("distributed infrastructure failures", () => {
  it("fails closed with 503 rather than a quota violation even if fail-open is requested", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("RATE_LIMIT_FAIL_OPEN", "true");
    const backend = new RedisRateLimiterBackend();
    const result = await backend.incrementAndCheck("AUTH_LOGIN:test", 10, 60);
    expect(result).toMatchObject({ allowed: false, unavailable: true });
    expect(createRateLimitResponse(result).status).toBe(503);
    expect(backend.isReady()).toBe(false);
  });
  it("denies rate-limit commands when an authenticated Redis user lacks Lua permissions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const backend = new RedisRateLimiterBackend();
    const redis = Object.assign(new EventEmitter(), { status: "ready", eval: vi.fn().mockRejectedValue(new Error("NOPERM private-credential")) }) as unknown as Redis;
    (backend as unknown as { client: Redis }).client = redis;
    const result = await backend.incrementAndCheck("AUTH_LOGIN:acl", 10, 60);
    expect(result).toMatchObject({ allowed: false, unavailable: true });
    expect(createRateLimitResponse(result).status).toBe(503);
    expect(log).toHaveBeenCalledWith(expect.any(String), "NOPERM");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-credential");
    log.mockRestore();
  });
  it("does not substitute a process-local cron lock in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    await expect(new CronCoordinator().acquireLockAsync("test-job")).rejects.toThrow("Distributed cron coordination unavailable");
  });
});
