import js from "@eslint/js"
import tseslint from "typescript-eslint"

const browserGlobals = {
  btoa: "readonly",
  document: "readonly",
  HTMLElement: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  window: "readonly",
}

const nodeGlobals = {
  Buffer: "readonly",
  btoa: "readonly",
  console: "readonly",
  __dirname: "readonly",
  require: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  TextDecoder: "readonly",
  URL: "readonly",
}

const pluginHostGlobals = {
  __openusage_plugin: "writable",
  OpenUsagePlugin: "readonly",
}

export default tseslint.config(
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "src-tauri/target/**",
      "src-tauri/resources/bundled_plugins/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
      },
    },
  },
  {
    files: ["plugins/**/*.js"],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...pluginHostGlobals,
      },
    },
  },
  {
    files: ["scripts/**/*.js", "scripts/**/*.mjs", "*.cjs"],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
      "no-empty": "off",
      "no-redeclare": "off",
      "no-useless-escape": "off",
      "no-useless-assignment": "off",
    },
  }
)
