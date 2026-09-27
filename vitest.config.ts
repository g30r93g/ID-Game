import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the `@/` imports app code uses, for tests of app modules.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
