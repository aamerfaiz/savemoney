import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/finance-engine ships raw TS source (Phase 5.0b monorepo
  // extraction) — Next compiles it itself rather than expecting prebuilt JS.
  transpilePackages: ["@savemoney/finance-engine"],
};

export default nextConfig;
