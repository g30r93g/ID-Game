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
    ignores: [".next/**", "convex/_generated/**", "node_modules/**"],
  },
];

export default eslintConfig;
