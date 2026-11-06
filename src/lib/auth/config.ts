import "server-only";

export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function authConfiguration(env: Record<string, string | undefined> = process.env) {
  try {
    const url = new URL(env.SUPABASE_URL ?? "");
    const origin = new URL(env.APP_ORIGIN ?? "");
    const key = env.SUPABASE_PUBLISHABLE_KEY ?? "";
    const local = (value: URL) => env.NODE_ENV !== "production" &&
      value.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname);
    if ((url.protocol !== "https:" && !local(url)) || (origin.protocol !== "https:" && !local(origin)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
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
