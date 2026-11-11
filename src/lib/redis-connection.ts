import { promises as dns } from "node:dns";
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
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const hosted = hostname.endsWith(".upstash.io");
  if ((hosted || production) &&
      (url.protocol !== "rediss:" || !url.password)) {
    throw new Error("Hosted Redis requires TLS and credentials.");
  }
  return {
    // Upstash TCP uses a fixed provider port; never inherit a mistyped URL port.
    host: hostname,
    port: hosted ? 6379 : Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0),
    lazyConnect: true,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 5000,
    retryStrategy: attempt => attempt <= 3 ? Math.min(attempt * 200, 1000) : null,
    ...(url.protocol === "rediss:" ? { tls: { ...(isIP(hostname) ? {} : { servername: hostname }), rejectUnauthorized: true } } : {}),
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

export function redisConnectionMetadata(client: Redis) {
  return {
    host: client.options.host,
    port: client.options.port,
    family: client.options.family,
    tls: Boolean(client.options.tls),
    servername: client.options.tls && client.options.tls.servername,
    region: process.env.VERCEL_REGION || "local",
    state: client.status,
  };
}

const diagnosed = new WeakSet<Redis>();
export async function diagnoseRedisConnection(client: Redis): Promise<void> {
  if (process.env.VERCEL !== "1" || diagnosed.has(client)) return;
  diagnosed.add(client);
  const metadata = redisConnectionMetadata(client);
  try {
    const addresses = await dns.lookup(client.options.host || "localhost", { all: true });
    console.info("[Redis] connection configuration", JSON.stringify({ ...metadata, addresses }));
  } catch {
    console.error("[Redis] DNS lookup failed", JSON.stringify(metadata));
  }
}

export function redisFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return "REDIS_ERROR";
  const code = (error as NodeJS.ErrnoException).code;
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(code ?? "")) return code!;
  return /^(NOPERM|WRONGPASS|NOAUTH|READONLY|LOADING|BUSY|ERR)\b/.exec(error.message)?.[1] || "REDIS_ERROR";
}
