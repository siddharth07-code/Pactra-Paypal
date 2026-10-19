/**
 * Core utility functions for PACTUM Phase 0
 */

/**
 * Returns the environment indicator string based on current runtime
 */
export function getEnvironmentLabel(): string {
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? "PRODUCTION READY" : "DEV SANDBOX (PHASE 0)";
}
