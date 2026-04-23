import * as eslint from "@eslint/js";
import * as tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// Type annotation works around TS2742 — defineConfig's inferred type
// references a non-portable @types/eslint path.
const config: unknown = defineConfig(
  eslint.configs.recommended,
  tseslint.configs.strict,
  globalIgnores(["dist/**"]),
  {
    rules: {
      "no-console": "error",
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);

export default config;
