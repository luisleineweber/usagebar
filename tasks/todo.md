# Active Todo

Full historical todo log is archived locally at:

- `tasks/archive/todo-history-2026-05-18.md`

Keep this file short. Add only the current slice, acceptance criteria, and verification. Move completed slices to an ignored archive when they stop being useful for active context.

# Alpha 4 competitor plan: upstream reliability ports

## Executive Summary

- Start Alpha 4 from the competitor implementation plan's first ranked work.
- Skip Grok reimplementation because Alpha 3 already added it.
- Port only missing upstream provider reliability fixes with regression tests.

## Acceptance Criteria

- [x] `docs/reports/competitor-implementation-plan.html` is present in this worktree for Alpha 4 context.
- [x] Codex trusts explicit zero-credit usage responses over stale credit headers.
- [x] Claude prefers usable keychain credentials over stale legacy credential files.
- [x] Perplexity upstream group fallback is checked against this fork and documented as superseded.
- [x] ccusage nvm alias/default path resolution is implemented with Rust tests.
- [x] ccusage release-age fallback is explicitly deferred with rationale.
- [x] Focused provider/backend verification passes and bundled plugin files are synced.

## Plan

- [x] Create clean `alpha-4` worktree and import the competitor report.
- [x] Diff upstream OpenUsage v0.6.24 reliability fixes against this fork.
- [x] Patch missing Codex and Claude behavior.
- [x] Evaluate Perplexity group handling against the current fork.
- [x] Port ccusage nvm alias/default path resolution.
- [x] Evaluate ccusage release-age fallback scope.
- [x] Run focused checks and update verification notes.

## Verification Notes

- Imported local report from `D:\UsageBar\usagebar\docs\reports\competitor-implementation-plan.html` into ignored worktree path `docs/reports/competitor-implementation-plan.html`.
- Upstream checked: OpenUsage `v0.6.24` commits `7c83829` (Codex zero credits), `eb7eaf7` (Claude keychain preference), `f847b24` (Perplexity missing group), `41c2d79` (ccusage nvm alias path), and `38786d0` (ccusage release-age fallback).
- Perplexity group fallback is superseded in this fork: current `plugins/perplexity/plugin.js` uses `https://www.perplexity.ai/rest/billing/credits` with stored/env cookie auth and has no groups REST path.
- ccusage release-age fallback deferred: upstream changes ccusage from provider-specific `ccusage@18.0.11` / `@ccusage/codex@18.0.11` to unified `ccusage@20.0.2` plus legacy fallback. That is a shared command-family migration, not a narrow reliability patch; keep it as its own Alpha 4 backend slice with full Claude/Codex ccusage contract tests.
- `bun install` -> installed this worktree's JS dependencies.
- `bun run test -- plugins\codex\plugin.test.js plugins\claude\plugin.test.js --run` -> 2 files passed, 131 tests passed.
- `node --check plugins\codex\plugin.js; node --check plugins\claude\plugin.js` -> passed.
- `bun run bundle:plugins` -> bundled 32 plugins including `claude` and `codex`.
- `cargo test --manifest-path src-tauri/Cargo.toml nvm_default_bin_path --lib` -> 3 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml ccusage_path_entries_with_includes_nvm_default_version --lib` -> 1 test passed.
- `bun prettier --check docs\providers\claude.md plugins\claude\plugin.js plugins\claude\plugin.test.js plugins\codex\plugin.js plugins\codex\plugin.test.js tasks\todo.md docs\reports\competitor-implementation-plan.html` -> passed.
- `bun run format:rust:check` -> passed.
- Source/bundled SHA-256 check for Claude and Codex `plugin.js` / `plugin.test.js` -> passed.
- `git --no-pager diff --check` -> passed; only expected CRLF conversion warnings were reported.
- Repo-wide `bun run format:check` still fails on pre-existing untouched files: `.github/workflows/ci.yml`, `.prettierrc.json`, `eslint.config.js`, `package.json`, and `scripts/check-format.mjs`.

# Alpha 4 ccusage release-age fallback

## Executive Summary

- Move local usage queries to the current unified `ccusage` command.
- Keep the older Claude/Codex package commands as a fallback when the current release is blocked.
- Preserve local-only usage behavior and avoid UI changes.

## Acceptance Criteria

- [x] Claude ccusage runs `ccusage@20.0.2 claude daily` first.
- [x] Codex ccusage runs `ccusage@20.0.2 codex daily` first.
- [x] Legacy fallback retries `ccusage@18.0.11 daily` for Claude and `@ccusage/codex@18.0.11 daily` for Codex after current command failure.
- [x] API docs describe the current command and legacy fallback.
- [x] ccusage bump script updates the current ccusage version docs without touching legacy pins.
- [x] Focused Rust tests pass.

## Plan

- [x] Compare this fork's ccusage backend against upstream OpenUsage `38786d0`.
- [x] Patch ccusage command flavor and runner args.
- [x] Update docs and bump script.
- [x] Run focused Rust tests and formatting checks.

## Verification Notes

- `cargo test --manifest-path src-tauri/Cargo.toml ccusage_runner_args --lib` -> 3 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml ccusage_runner_retries_legacy_package_when_current_package_fails --lib` -> 1 test passed.
- `cargo test --manifest-path src-tauri/Cargo.toml ccusage --lib` -> 23 tests passed.
- `node --check scripts\bump-ccusage-version.mjs` -> passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml` -> applied formatting.
- `bun prettier --write docs\plugins\api.md scripts\bump-ccusage-version.mjs tasks\todo.md` -> applied formatting.

# Alpha 4 local version and main integration

## Executive Summary

- Set local app metadata to Alpha 4.
- Rebase Alpha 4 work onto current `main`.
- Merge the rebased branch back into `main`.

## Acceptance Criteria

- [ ] `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` use `0.1.0-alpha.4`.
- [ ] README and CHANGELOG describe Alpha 4.
- [ ] Focused provider/backend checks and release preflight pass.
- [ ] `alpha-4` is rebased onto current `main`.
- [ ] `main` contains the Alpha 4 changes.

## Plan

- [x] Bump local version metadata and Alpha 4 notes.
- [x] Run focused verification before integration.
- [ ] Commit Alpha 4 work locally.
- [ ] Rebase `alpha-4` onto `main`.
- [ ] Merge `alpha-4` into `main`.

## Verification Notes

- `bun run test -- plugins\codex\plugin.test.js plugins\claude\plugin.test.js --run` -> 2 files passed, 131 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml ccusage --lib` -> 23 tests passed.
- `bun run release:check` -> passed, release version `0.1.0-alpha.4`, 32 bundled plugins.
- `bun run format:rust:check` -> passed.
- `git --no-pager diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Prepare Alpha 3 release

## Executive Summary

- Alpha 3 should ship only intentional user-facing/provider changes.
- Local generated files should stay ignored and out of the release.
- Release docs, provider matrix, redaction review, and tests must pass before tagging.

## Acceptance Criteria

- [x] `.gitignore` covers only generated/local agent artifacts and does not hide tracked docs.
- [x] Alpha 3 README/provider matrix documents changed provider support.
- [x] `CHANGELOG.md` has a `0.1.0-alpha.3` section.
- [x] Plugin redaction/env/capability audit is complete for changed providers.
- [x] Bundled plugin resources are synced.
- [x] Release verification passes or exact blockers are documented.

## Plan

- [x] Inspect dirty tree and classify intentional vs generated changes.
- [x] Tighten `.gitignore` if needed.
- [x] Update Alpha 3 release docs.
- [x] Audit changed plugin fields against host redaction/allowlists.
- [x] Sync bundled resources.
- [x] Run targeted tests, then coverage if feasible.

## Verification Notes

- `.gitignore`: current additions ignore only `docs/archive/agent-history/`, `tasks/archive/`, and generated local report `docs/competitor-implementation-plan.html`; existing tracked `docs/archive/**` files remain tracked. Generated local outputs already ignored include `coverage/`, `dist/`, `logs/`, `node_modules/`, `src-tauri/target/`, `src-tauri/resources/`, `src-tauri/tauri.conf.local.json`, and `package-lock.json`.
- Release docs: `README.md` now says Alpha 3, documents Grok in the provider matrix, and keeps unsigned Authenticode limitation aligned to Alpha 3. `docs/providers/grok.md` added.
- Changelog: `CHANGELOG.md` now includes `0.1.0-alpha.3` highlights and notes.
- Redaction/capability audit: Grok uses no env vars or stored provider secrets, declares `cli-chat-proxy.grok.com` in `httpDomains`, and sends bearer auth only as request headers. Host HTTP logs method, URL, status, and redacted response previews, not request headers. Existing response-body redaction covers token, email, name, user/account ID, login, auth, and API key patterns. Kiro uses SQLite/fs/http with existing manifest capabilities and no new env vars. Ollama uses existing `OLLAMA_API_KEY` allowlist. OpenCode uses existing `OPENCODE_*` allowlist and provider secret aliases.
- Bundled resources synced with `bun run bundle:plugins`; output reported 32 plugins including `grok`.
- Focused verification: `bun run test -- plugins\grok\plugin.test.js plugins\kiro\plugin.test.js plugins\ollama\plugin.test.js plugins\copilot\plugin.test.js plugins\opencode-go\plugin.test.js src\hooks\use-app-update.test.ts src\lib\reset-tooltip.test.ts src\components\settings\provider-settings-detail.test.tsx src\hooks\app\use-settings-bootstrap.test.ts src\hooks\app\use-settings-display-actions.test.ts --run` -> 10 files passed, 175 tests passed.
- Coverage verification: `bun run test:coverage` -> 77 files passed, 1162 tests passed, but coverage gate failed: statements 85.3%, branches 78.67%, functions 90.96%, lines 88.65%. Global threshold is 90% for statements/branches/functions/lines, so Alpha 3 is not release-ready until coverage is raised or the gate is intentionally changed.
- `bun run check` initially failed because `src/App.tsx` selected `timeFormatMode` without reading it. Removed the unused selector entry. Final `bun run check` passed: format, ESLint, and TypeScript.
- `bun run release:check` passed: release version `0.1.0-alpha.3`, 32 bundled plugins, updater endpoint `https://github.com/luisleineweber/usagebar/releases/latest/download/latest.json`.
- Rust verification passed: `bun run format:rust:check`; `bun run lint:rust`.

# Coverage result tooling

## Executive Summary

- Keep strict release coverage unchanged.
- Add report-only coverage commands that show the next files to test.
- Generate JSON coverage so scripts and CI can read coverage without parsing terminal tables.

## Acceptance Criteria

- [x] Vitest emits `coverage/coverage-summary.json`.
- [x] `bun run test:coverage` remains the strict 90% release gate.
- [x] `bun run test:coverage:report` runs coverage in report-only mode and prints a compact summary.
- [x] `bun run test:coverage:summary` prints a compact summary from an existing coverage run.
- [x] Summary output includes global deltas, lowest coverage files, and changed-file coverage.
- [x] Formatting/lint-relevant checks pass for touched files.

## Plan

- [x] Add `json-summary` reporter to Vitest coverage config.
- [x] Add `scripts/coverage-summary.mjs`.
- [x] Add `scripts/run-coverage-report.mjs`.
- [x] Add package scripts for report and summary commands.
- [x] Run report command and verify generated summary output.
- [x] Run format/check commands for touched files.

## Verification Notes

- `bun run test:coverage:report` passed: 77 files / 1162 tests, report-only coverage completed, compact summary printed global deltas, lowest line/branch coverage, and changed-file coverage. No child-process warning after switching the runner to `bun vitest ...` without shell mode.
- `coverage/coverage-summary.json` is generated by Vitest after adding the `json-summary` reporter.
- `bun run test:coverage:summary` passed from the generated JSON summary.
- `bun run test:coverage` still failed strictly as expected: statements 85.3%, branches 78.67%, lines 88.65% are below 90%; functions 90.96% passes.
- `bun run lint` passed.
- `bun prettier --check package.json vite.config.ts scripts/coverage-summary.mjs scripts/run-coverage-report.mjs tasks/todo.md docs/test-results-improvement-report.md` passed.
- Re-check on 2026-05-25 after added tests: `bun run test:coverage:report` passed with 84 files / 1317 tests. Strict `bun run test:coverage` still failed: statements 86.69%, branches 80.20%, lines 89.99%, functions 93.40%. `bun run check` passed. Corrected `docs/test-results-improvement-report.md` to stop claiming lines coverage passed.
- Alpha 3 local build smoke on 2026-05-25: `bun run build:release` compiled the release binary but failed at MSI bundling because WiX rejects prerelease version `0.1.0-alpha.3`. Retried as `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1 bun run build:release -- --bundles nsis`; NSIS build passed and produced `src-tauri/target/release/bundle/nsis/UsageBar_0.1.0-alpha.3_x64-setup.exe`. Updater signing and Authenticode signing were skipped locally because signing material was not present.
