import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * ESLint for the app and the tests. TypeScript-aware rules come from
 * typescript-eslint's recommended set; formatting is Prettier's job, so
 * eslint-config-prettier turns every stylistic rule off.
 *
 * `@eslint/js` is ESLint's own recommended rule set, pulled in by ESLint
 * itself as a dependency; it is declared here because the flat config
 * imports it directly.
 */
export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "guide-src/captured/**", "public/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  {
    // The parser and the lint walk parsed block trees whose nodes are
    // deliberately untyped at the boundary; `any` is the honest type there.
    files: ["src/lib/guide-parser.ts", "src/lib/content-lint.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Fixtures are plain objects cast to the guide's types.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
