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
    ignores: [".next/**", "convex/_generated/**", "node_modules/**"],
  },
];

export default eslintConfig;
