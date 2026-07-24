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
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Console output is part of the desktop error bridge and CLI diagnostics.
      // Prefer the structured Rust logger for plugin code; keep this rule off
      // until the frontend logger migration is complete.
      "no-console": "off",
      "no-empty": "error",
      "no-redeclare": "error",
      "no-useless-assignment": "error",
      "no-useless-escape": "error",
    },
  }
)
