/**
 * PACTUM — Configuration & Environment Validator
 * Enforces production security readiness, rejects placeholder credentials,
 * and distinguishes development fallbacks from production deployment.
 * Follows GEMINI.md Section 10, 13, SECURITY.md Section 1, 3, and Phase 5 specifications.
 */

import { authConfiguration } from "./auth/config";

export interface ConfigValidationResult {
  valid: boolean;
  isValid: boolean;
  environment: "production" | "development" | "test";
  isProduction: boolean;
  errors: string[];
  warnings: string[];
  details: {
    paypalConfigured: boolean;
    paypalBaseUrl: string;
    geminiConfigured: boolean;
    cronConfigured: boolean;
    redisConfigured: boolean;
    rateLimiterBackend: string;
  };
}

const PLACEHOLDER_STRINGS = [
  "",
  "mock",
  "mock_client_id",
  "mock_client_secret",
  "mock_paypal_client_id",
  "mock_paypal_client_secret",
  "replace_me",
  "your_paypal_client_id",
  "your_paypal_secret",
  "changeme",
];

function isPlaceholder(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim().toLowerCase();
  if (trimmed.startsWith("mock_") || trimmed.startsWith("placeholder")) return true;
  return PLACEHOLDER_STRINGS.includes(trimmed);
}

export function validateConfiguration(
  envOverrides?: Record<string, string | undefined>
): ConfigValidationResult {
  const env = envOverrides || process.env;
  const nodeEnv = (env.NODE_ENV || "development").toLowerCase();
  const environment = nodeEnv === "production" ? "production" : nodeEnv === "test" ? "test" : "development";

  const errors: string[] = [];
  const warnings: string[] = [];

  const paypalClientId = env.PAYPAL_CLIENT_ID;
  const paypalSecret = env.PAYPAL_CLIENT_SECRET;
  const paypalBaseUrl = env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  const geminiApiKey = env.GEMINI_API_KEY;
  const cronSecret = env.CRON_SECRET;
  const rateLimitBackend = (env.RATE_LIMIT_BACKEND || "memory").toLowerCase();
  const redisUrl = env.REDIS_URL;

  const paypalConfigured = !isPlaceholder(paypalClientId) && !isPlaceholder(paypalSecret);
  const geminiConfigured = !isPlaceholder(geminiApiKey);
  const cronConfigured = !isPlaceholder(cronSecret);
  const redisConfigured = !isPlaceholder(redisUrl);

  // Production security checks
  if (environment === "production") {
    for (const name of ["DATABASE_URL", "WORKER_DATABASE_URL"] as const) {
      try {
        const url = new URL(env[name] ?? "");
        const role = decodeURIComponent(url.username).split(".")[0];
        if (!["postgres:", "postgresql:"].includes(url.protocol) || !role || !url.password ||
          ["postgres", "supabase_admin", "service_role"].includes(role) || role.endsWith("_migrator")) throw new Error();
      } catch {
        errors.push(`${name} must use valid restricted PostgreSQL credentials in production.`);
      }
    }
    if (env.LOCAL_IDENTITY_PROJECTION) {
      errors.push("LOCAL_IDENTITY_PROJECTION must be unset in production.");
    }
    if (isPlaceholder(env.PAYPAL_WEBHOOK_ID) || isPlaceholder(env.PAYPAL_MERCHANT_ID)) {
      errors.push("PAYPAL_WEBHOOK_ID and PAYPAL_MERCHANT_ID must be configured in production.");
    }
    try { authConfiguration(env); } catch {
      errors.push("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and HTTPS APP_ORIGIN must be configured for production authentication.");
    }
    if (!paypalConfigured) {
      errors.push("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be configured with authentic provider credentials in production (placeholder or mock credentials are prohibited).");
    }
    if (!cronConfigured) {
      errors.push("CRON_SECRET must be configured in production to secure maintenance and health endpoints.");
    }
    if (rateLimitBackend === "redis" && !redisConfigured) {
      errors.push("RATE_LIMIT_BACKEND=redis requires valid REDIS_URL in production.");
    }
    if (paypalBaseUrl.includes("sandbox") && (env.PAYPAL_ENVIRONMENT === "live" || env.PAYPAL_MODE === "live")) {
      errors.push("PAYPAL_MODE is 'live' but PAYPAL_BASE_URL points to Sandbox.");
    }
    if (!geminiConfigured) {
      warnings.push("GEMINI_API_KEY is not configured in production; negotiations will strictly use deterministic fallbacks.");
    }
  } else {
    // Development / Test checks
    if (!paypalConfigured && environment !== "test") {
      warnings.push("PayPal credentials are using development mocks. Real Sandbox API calls will fail.");
    }
    if (!geminiConfigured && environment !== "test") {
      warnings.push("GEMINI_API_KEY is not configured; deterministic fallback engine will be used.");
    }
  }

  const isValid = errors.length === 0;

  return {
    valid: isValid,
    isValid,
    environment,
    isProduction: environment === "production",
    errors,
    warnings,
    details: {
      paypalConfigured,
      paypalBaseUrl,
      geminiConfigured,
      cronConfigured,
      redisConfigured,
      rateLimiterBackend: rateLimitBackend,
    },
  };
}

/**
 * Enforces valid configuration at runtime, throwing if running in production with invalid credentials.
 */
export function assertValidConfiguration(
  envOverrides?: Record<string, string | undefined>
): ConfigValidationResult {
  const result = validateConfiguration(envOverrides);
  if (!result.valid) {
    throw new Error(
      `Production Configuration Enforcement Failed: ${result.errors.join("; ")}`
    );
  }
  return result;
}

