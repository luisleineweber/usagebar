# AGENTS.md

## Project

- UsageBar is a Windows-first Tauri menu-bar/tray app for tracking AI coding subscription usage.
- Stack: Tauri v2, Rust, React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, and Vitest.
- Providers are implemented as plugins. Follow the plugin API in `docs/plugins/api.md`.
- Follow the architecture documented in `docs/architecture.md`.

## Codebase conventions

- Use TypeScript and React for frontend code in `src/`.
- Use Rust for backend code in `src-tauri/`.
- Follow the UI rules in `DESIGN.md`.
- Use explicit result types for expected domain failures.
- Surface unexpected failures with an error or user-facing toast.
- Do not silently turn missing or failed data into successful data.
- Tauri IPC uses camelCase in JavaScript, such as `{ batchId, pluginIds }`.
- Tauri converts these names to Rust snake_case. Never send snake_case from JavaScript.

## Commit messages

- Use the commit format `type(scope): short imperative description` for project commits.

## Usage data

- Keep authoritative zero, unknown, missing, retained, unsupported, error, and inactive states distinct.
- Do not infer zero, Free, quota, limits, subscription state, or metric labels from missing, local, stale, or ambiguous data.

## Provider plugins

- Plugin SVG logos must use `currentColor`.
- `plugin.json` `brandColor` must use the provider’s real brand color.
- Check provider logo visibility in light and dark mode.
- Audit plugin request and response fields against the redaction lists in `src-tauri/src/plugin_engine/host_api.rs`.
- Keep plugin source, runtime mappings, TypeScript boundaries, fixtures, tests, manifests, bundled resources, and provider documentation synchronized.
- After plugin changes, run `bun run bundle:plugins` and verify the source and bundled files.
