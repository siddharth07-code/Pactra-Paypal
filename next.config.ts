import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disables the 'x-powered-by: Next.js' response header to minimize fingerprinting
  poweredByHeader: false,
  // Enforce React strict mode for robust lifecycle checks
  reactStrictMode: true,
};

export default nextConfig;
