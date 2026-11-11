import { describe, expect, it } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import configuration from "../../next.config";

describe("Next.js development/build output isolation", () => {
  it("keeps production builds from overwriting the live development output", () => {
    const development = configuration(PHASE_DEVELOPMENT_SERVER);
    const build = configuration(PHASE_PRODUCTION_BUILD);
    expect(development.distDir).toBe(".next-dev");
    expect(build.distDir).toBe(".next");
    expect(development.distDir).not.toBe(build.distDir);
    expect(configuration(PHASE_PRODUCTION_SERVER).distDir).toBe(build.distDir);
  });
  it("includes the public CA and excludes private local files from deployment tracing", () => {
    const build = configuration(PHASE_PRODUCTION_BUILD);
    expect(build.outputFileTracingIncludes?.["/*"]).toContain("./prisma/certs/supabase-ca.cer");
    expect(build.outputFileTracingIncludes?.["/*"]).toContain("./src/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node");
    expect(build.outputFileTracingExcludes?.["/*"]).toEqual(expect.arrayContaining(["./.env", "./.env.*", "./.pactum-*.json", "./.pactum-local/**/*"]));
  });
});
