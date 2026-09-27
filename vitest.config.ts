import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    // Inlined so their `import.meta.glob` calls resolve: convex-test's own,
    // and the one in @convex-dev/aggregate's `test` helper that registers it.
    server: { deps: { inline: ["convex-test", "@convex-dev/aggregate"] } },
  },
});
