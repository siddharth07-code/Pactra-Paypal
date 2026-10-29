/**
 * PACTUM — Application Runtime Instrumentation & Startup Validation
 * Follows GEMINI.md Section 10, 13, SECURITY.md Section 1, 3, and Phase 5 specifications.
 *
 * Enforces production security readiness immediately upon process startup,
 * failing closed before any requests can be served if credentials are invalid or placeholders.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertValidConfiguration } = await import("./lib/env-validator");
    if (process.env.NODE_ENV === "production") {
      assertValidConfiguration();
    }
  }
}
