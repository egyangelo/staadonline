import { defineConfig } from "vitest/config";

/**
 * Vitest (node env) for the web workspace's pure-TypeScript modules
 * (web/lib, web/store). No jsdom / @testing-library this phase — visual
 * behaviors verify via build + end-of-phase human check (02-02 plan).
 * Default `**/*.test.{ts,tsx}` include applies.
 */
export default defineConfig({
  test: {
    environment: "node",
  },
});