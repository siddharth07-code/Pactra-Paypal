import { isIP } from "node:net";
import type Redis from "ioredis";
import type { RedisOptions } from "ioredis";

export function redisConnectionOptions(value: string, production = process.env.NODE_ENV === "production"): RedisOptions {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid Redis connection configuration."); }
  if (/\s/.test(value) || !["redis:", "rediss:"].includes(url.protocol) ||
      !url.hostname || url.hash || url.search || !/^\/(?:\d+)?$/.test(url.pathname || "/")) {
    throw new Error("Invalid Redis connection configuration.");
  }
  const hosted = url.hostname.endsWith(".upstash.io");
  if ((hosted || production) &&
      (url.protocol !== "rediss:" || !url.password)) {
    throw new Error("Hosted Redis requires TLS and credentials.");
  }
  return {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 5000,
    retryStrategy: attempt => attempt <= 3 ? Math.min(attempt * 200, 1000) : null,
    ...(url.protocol === "rediss:" ? { tls: { ...(isIP(url.hostname) ? {} : { servername: url.hostname }), rejectUnauthorized: true } } : {}),
  };
}

const pending = new WeakMap<Redis, Promise<void>>();

// Share the readiness wait across concurrent requests without buffering commands.
export function ensureRedisReady(client: Redis, timeoutMs = 5500): Promise<void> {
  if (client.status === "ready") return Promise.resolve();
  const existing = pending.get(client);
  if (existing) return existing;
  const ready = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      client.off("ready", onReady);
      client.off("end", onEnd);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onEnd = () => { cleanup(); reject(new Error("Redis unavailable.")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Redis readiness timed out.")); }, timeoutMs);
    client.once("ready", onReady);
    client.once("end", onEnd);
    if (client.status === "wait" || client.status === "end") {
      void client.connect().catch(() => { if (client.status === "end") onEnd(); });
    }
  });
  pending.set(client, ready);
  void ready.finally(() => { if (pending.get(client) === ready) pending.delete(client); }).catch(() => {});
  return ready;
}
