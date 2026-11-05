import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/dev-dist/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "packages/ui/src/components/**",
      "packages/ui/src/hooks/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Secrets and identity must never come from a browser-visible source.
      "no-restricted-globals": ["error", { name: "event", message: "Use the handler parameter." }],
    },
  },
  {
    files: ["infra/**/*.mjs", "**/public/**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        performance: "readonly",
        setTimeout: "readonly",
        localStorage: "readonly",
        document: "readonly",
        matchMedia: "readonly",
      },
    },
  },
);
