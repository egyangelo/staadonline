import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parser package ships TypeScript source (zero build step).
  // Next.js must transpile it at build time.
  transpilePackages: ["@staad-online/parser"],
};

export default nextConfig;
