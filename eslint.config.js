import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Everything here runs on Node, so console/process/etc exist.
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
