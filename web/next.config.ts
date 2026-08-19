import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parser package ships TypeScript source (zero build step).
  // Next.js must transpile it at build time.
  transpilePackages: ["@staad-online/parser"],
  // (D-09) Static export served by Capacitor's local WebView server.
  // basePath/assetPrefix stay '' (defaults) so asset URLs resolve under the
  // local origin (http://localhost) — a subpath would break local serving.
  output: "export",
};

export default nextConfig;
