import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest (node env) for the web workspace's pure-TypeScript modules
 * (web/lib, web/store). No jsdom / @testing-library this phase ? visual
 * behaviors verify via build + end-of-phase human check (02-02 plan).
 * The default test-file include pattern applies.
 *
 * The `@/*` tsconfig path alias is mirrored here so component tests can import
 * stores/libs the same way Next.js resolves them at runtime.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
