import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    // eslint-plugin-react's "detect" mode calls the removed
    // `context.getFilename()` API under ESLint 10, crashing the lint run.
    // Pin the version explicitly (matches the installed `react` package) to
    // skip auto-detection entirely; behavior is unchanged since detection
    // would have resolved to this same version anyway.
    settings: {
      react: {
        version: "19.2.7",
      },
    },
  },
  {
    // app/env.ts validates with t3-env and zod; imported from client code it
    // ships both to every page. Client code reads lib/public-env.ts instead.
    // (A `server-only` import in app/env.ts would say this more directly, but
    // next.config.ts loads that file through jiti in plain Node, where
    // `server-only` throws outside the react-server condition.)
    files: ["components/**", "providers/**", "lib/**"],
    ignores: [
      // Server-only modules that legitimately read the validated env.
      "lib/auth-server.ts",
      "lib/invite.ts",
      "lib/og.tsx",
      "lib/posthog.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/app/env",
              message:
                "Client code must not import app/env.ts (it bundles zod). Use @/lib/public-env.",
            },
          ],
        },
      ],
    },
  },
  {
    // posthog-js is about 94 KB gz, and lib/analytics.ts loads it lazily after
    // the page's `load` event. A static import anywhere in the app (including
    // posthog-js/react, which imports it too) would put it back in every
    // page's entry chunks. Type-only imports are erased, so they're allowed.
    // This uses the typescript-eslint variant so it doesn't override the
    // core no-restricted-imports rule above for the same files.
    files: ["app/**", "components/**", "providers/**", "lib/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "posthog-js",
              message:
                "posthog-js must stay out of the entry chunks. Use @/lib/analytics, which loads it after `load`.",
              allowTypeImports: true,
            },
            {
              name: "posthog-js/react",
              message:
                "posthog-js/react imports posthog-js statically. Use @/lib/analytics instead.",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ["posthog-js/*"],
              message:
                "posthog-js must stay out of the entry chunks. Use @/lib/analytics, which loads it after `load`.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [".next/**", "convex/_generated/**", "node_modules/**"],
  },
];

export default eslintConfig;
