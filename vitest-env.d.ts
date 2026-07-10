// Ambient typing for Vitest's import.meta.glob (used by convex-test to load
// the Convex module graph). vite/client types aren't resolvable under this
// repo's pnpm layout, so declare the minimal surface we use.
interface ImportMeta {
  glob: (
    pattern: string | string[],
  ) => Record<string, () => Promise<Record<string, unknown>>>;
}
