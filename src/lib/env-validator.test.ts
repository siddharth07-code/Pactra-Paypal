import { describe, expect, it } from "vitest";
import { validateConfiguration } from "./env-validator";

const production = {
  RATE_LIMIT_BACKEND: "redis", REDIS_URL: "rediss://default:fixture-password@fixture.upstash.io:6379",
  NODE_ENV: "production", SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_configuration_test",
  APP_ORIGIN: "https://pactra.example", PAYPAL_CLIENT_ID: "sandbox-client",
  PAYPAL_CLIENT_SECRET: "sandbox-secret", PAYPAL_WEBHOOK_ID: "webhook-id",
  PAYPAL_MERCHANT_ID: "merchant-id", CRON_SECRET: "cron-secret",
  DATABASE_URL: "postgresql://pactum_app:test-password@localhost:5432/postgres?schema=pactum",
  WORKER_DATABASE_URL: "postgresql://pactum_jobs:test-password@localhost:5432/postgres?schema=pactum",
};

describe("production infrastructure configuration", () => {
  it("accepts restricted role configuration", () => {
    expect(validateConfiguration(production).valid).toBe(true);
  });
  it.each(["", "redis://default:fixture-password@fixture.upstash.io:6379", "rediss://fixture.upstash.io:6379"])("rejects unavailable or insecure Redis configuration", value => {
    expect(validateConfiguration({ ...production, REDIS_URL: value }).valid).toBe(false);
  });
  it("rejects process-local production rate limiting", () => {
    expect(validateConfiguration({ ...production, RATE_LIMIT_BACKEND: "memory" }).valid).toBe(false);
  });
  it.each(["DATABASE_URL", "WORKER_DATABASE_URL"])("rejects missing or administrator %s without leaking credentials", name => {
    for (const value of ["", "postgresql://postgres:private-password@localhost/postgres", "postgresql://pactum_migrator.project:private-password@localhost/postgres"]) {
      const result = validateConfiguration({ ...production, [name]: value });
      expect(result.valid).toBe(false);
      expect(result.errors.join()).toContain(name);
      expect(result.errors.join()).not.toContain("private-password");
    }
  });
  it.each(["PAYPAL_WEBHOOK_ID", "PAYPAL_MERCHANT_ID"])("rejects missing %s", name => {
    expect(validateConfiguration({ ...production, [name]: "" }).valid).toBe(false);
  });
  it("rejects development identity projection", () => {
    expect(validateConfiguration({ ...production, LOCAL_IDENTITY_PROJECTION: "verified_supabase" }).valid).toBe(false);
  });
});
