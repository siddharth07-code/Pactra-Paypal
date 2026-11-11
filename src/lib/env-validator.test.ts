import { describe, expect, it } from "vitest";
import { validateConfiguration } from "./env-validator";

const production = {
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
