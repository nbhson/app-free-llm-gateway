import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "apps/web/dist", "apps/gateway/dist", "coverage", "apps/gateway/coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-empty": "error",
      "prefer-const": "error",
      "no-useless-escape": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-eval": "error",
      "no-implied-eval": "error",
      // react-hooks plugin not installed — reference to its rule fails
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // Scripts are CLI tools — console output is their interface
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Tests: mocks/stubs legitimately use `any` — keep the gate for shipped code
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
