import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Pinned to eslint@^9 (see package.json) -- eslint-config-next's bundled
// eslint-plugin-react@7.37.5 still calls the removed context.getFilename()
// API and crashes outright under eslint@10 ("contextOrFilename.getFilename
// is not a function"). Upstream fix (eslint-plugin-react#4022) is written
// and approved but stalled unmerged; tracked in vercel/next.js#89764.
// Re-check once eslint-config-next ships an eslint@10-compatible release.

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Test doubles (fake Prisma clients, etc.) legitimately need loose typing.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
