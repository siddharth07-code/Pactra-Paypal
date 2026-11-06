import "server-only";

export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function cleanEnv(val: string | undefined): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

export function authConfiguration(env: Record<string, string | undefined> = process.env) {
  try {
    const rawUrl = cleanEnv(env.SUPABASE_URL) ?? cleanEnv(env.NEXT_PUBLIC_SUPABASE_URL) ?? "";
    const rawOrigin = cleanEnv(env.APP_ORIGIN) ?? (env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
    const rawKey = cleanEnv(env.SUPABASE_PUBLISHABLE_KEY) ?? cleanEnv(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? "";

    const url = new URL(rawUrl);
    const origin = new URL(rawOrigin);
    const key = rawKey;
    const local = (value: URL) => env.NODE_ENV !== "production" &&
      value.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname);
    if ((url.protocol !== "https:" && !local(url)) || (origin.protocol !== "https:" && !local(origin)) ||
      url.username || url.password || url.search || url.hash ||
      origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
      !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) throw new Error();
    return { url: url.origin, origin: origin.origin, key, secure: origin.protocol === "https:" };
  } catch {
    throw new AuthError(503, "AUTH_NOT_CONFIGURED", "Authentication is not configured correctly.");
  }
}

export function safeDestination(value: unknown, fallback = "/account"): string {
  if (value === undefined || value === null) return fallback;
  if (value !== "/" && value !== "/account") {
    throw new AuthError(400, "AUTH_INVALID_REDIRECT", "Redirect destination is not allowed.");
  }
  return value;
}

export function providerError(error: { status?: number; code?: string } | null): void {
  if (!error) return;
  if (error.status === 429) throw new AuthError(429, "AUTH_RATE_LIMITED", "Too many authentication attempts. Please retry later.");
  if (error.status === undefined || error.status >= 500) {
    throw new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE", "Authentication provider is temporarily unavailable.");
  }
  if (error.code === "email_not_confirmed") throw new AuthError(403, "AUTH_EMAIL_UNVERIFIED", "Confirm your email before signing in.");
  throw new AuthError(401, "AUTH_INVALID_CREDENTIALS", "Authentication failed. Check your credentials or sign in again.");
}
