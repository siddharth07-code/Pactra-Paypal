// @vitest-environment node
import { describe, expect, it } from "vitest";
import { administratorConnection, restrictedUrl } from "../../scripts/database/connection.mjs";

describe("deployment connection preparation", () => {
  const project = "telhivuqsrsaesjkkxuh";
  const environment = {
    BOOTSTRAP_DATABASE_URL: `postgresql://postgres.${project}:fixture-password@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?pgbouncer=true&options=unsafe`,
    EXPECTED_SUPABASE_PROJECT_REF: project,
    DATABASE_CA_FILE: "prisma/certs/supabase-ca.cer",
  };
  it("generates strict TLS transaction and session URLs without inherited bootstrap options", () => {
    const target = administratorConnection(environment);
    expect(target.config.ssl).toMatchObject({ rejectUnauthorized: true });
    for (const [role, runtime] of [["pactum_app", true], ["pactum_jobs", true], ["pactum_migrator", false]] as const) {
      const url = new URL(restrictedUrl(target, role, "fixture-password", runtime));
      expect(url.username).toBe(`${role}.${project}`);
      expect(url.port).toBe(runtime ? "6543" : "5432");
      expect(url.searchParams.get("pgbouncer")).toBe(runtime ? "true" : null);
      expect(url.searchParams.get("sslcert")).toBe("certs/supabase-ca.cer");
      expect(url.searchParams.get("sslaccept")).toBe("strict");
      expect(url.searchParams.get("schema")).toBe("pactum");
      expect(url.searchParams.has("options")).toBe(false);
    }
  });
  it("rejects a mismatched project, transaction bootstrap, or unreadable certificate", () => {
    expect(() => administratorConnection({ ...environment, EXPECTED_SUPABASE_PROJECT_REF: "a".repeat(20) })).toThrow("Pin EXPECTED");
    expect(() => administratorConnection({ ...environment, BOOTSTRAP_DATABASE_URL: environment.BOOTSTRAP_DATABASE_URL.replace(":5432", ":6543") })).toThrow("Session Pooler");
    expect(() => administratorConnection({ ...environment, DATABASE_CA_FILE: "/missing-ca" })).toThrow("DATABASE_CA_FILE");
  });
});
