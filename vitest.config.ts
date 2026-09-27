import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the `@/` imports app code uses (proxy.test.ts imports proxy.ts).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
