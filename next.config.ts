import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  // Disables the 'x-powered-by: Next.js' response header to minimize fingerprinting
  poweredByHeader: false,
  // Enforce React strict mode for robust lifecycle checks
  reactStrictMode: true,
};

// Production validation must not overwrite a running development server's artifacts.
export default function configuration(phase: string): NextConfig {
  return { ...nextConfig, distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next" };
}
