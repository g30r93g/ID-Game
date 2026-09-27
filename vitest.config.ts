import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the `@/` imports app code uses, for tests of app modules.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "edge-runtime",
    // Inlined so their `import.meta.glob` calls resolve: convex-test's own,
    // and the one in @convex-dev/aggregate's `test` helper that registers it.
    server: { deps: { inline: ["convex-test", "@convex-dev/aggregate"] } },
  },
});
