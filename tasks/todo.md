# Active Todo

# Symmetrische Frontend-/Rust-Quality-Gates, 2026-07-24

## Acceptance Criteria

- [x] `bun run check` umfasst Frontend- und Rust-Format-/Lint-Gates.
- [x] CI führt Rust-Formatprüfung und Clippy sichtbar mit `-D warnings` aus.
- [x] Coverage dokumentiert und enforced klar das 80%-Changed-File-Ratchet; die globale 90%-Schwelle bleibt bis zur Erreichung bewusst report-only.
- [x] Der bestehende `cargo fmt --check`-Blocker ist an der Ursache behoben.
- [x] Relevante Tests, Checks, Rust-Tests, Build und Diff-Review sind dokumentiert.

## Plan

- [x] Den aktuellen Rust-Formatter-Blocker und Quality-Script-Vertrag reproduzieren.
- [x] Rust-Format-/Lint-Gates in das lokale Sammel-Gate integrieren.
- [x] CI-Rust-Format-Gate und explizites Coverage-Ratchet-Verhalten absichern.
- [x] Verifikation ausführen und verbleibende, unabhängige Arbeitsbaumfehler festhalten.

## Verification Notes

- `bun run check` -> passed: frontend format/ESLint/TypeScript plus `cargo fmt --check` and Clippy `-D warnings`.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` -> 146 passed, 1 ignored.
- `bun run build` -> passed; existing Vite large-chunk warning remains.
- `bun run test:all -- --reporter=dot` -> 1,369 passed, 1 failed across 92 files; the remaining failure is the pre-existing About-dialog assertion expecting a missing `Luis Leineweber` button.
- `bun run test:coverage:report` -> blocked by the same single test failure before `coverage-summary.json` is produced; the global 90% threshold remains report-only and the changed-file ratchet remains the CI gate.
- `bunx prettier --check .github/workflows/ci.yml package.json scripts/run-coverage-report.mjs scripts/coverage-summary.mjs` and `git diff --check` -> passed; only existing LF/CRLF normalization warnings remain.

# Provider settings orchestration seam, 2026-07-24

## Acceptance Criteria

- [x] `App.tsx` and `settings-window-app.tsx` share one provider-config persistence hook.
- [x] Provider config loading, config updates, and secret metadata operations preserve existing behavior.
- [x] Secret failures do not persist metadata and are covered by a focused regression test.
- [x] Focused tests, typecheck, formatting, lint, build, and diff validation are recorded below.

## Plan

- [x] Locate the duplicated provider config and secret persistence lifecycle.
- [x] Integrate the existing `useProviderConfigActions` seam into both app entrypoints.
- [x] Add focused coverage for loading, updates, secret save/delete, and storage failures.
- [x] Run final build and full test suite; record unrelated pre-existing failures.

## Verification Notes

- `bun run test -- src/hooks/app/use-provider-config-actions.test.ts --run` -> 5 passed.
- `bun run typecheck` -> passed.
- Targeted Prettier, ESLint, and `git diff --check` -> passed; only existing LF/CRLF normalization warnings remain.
- `bun run build` -> passed; existing Vite large-chunk warning remains.
- `bun run test:all` -> 1,368 passed, 1 failed across 92 files; the remaining failure is the pre-existing `App > covers about open/close callbacks` assertion expecting a missing `Luis Leineweber` button.

# Verständliche Cookie-Anleitung im Onboarding, 2026-07-24

# Plugin host API readability hardening, 2026-07-24

## Acceptance Criteria

- [x] Language-server discovery lives in a focused Rust module with no IPC or plugin API changes.
- [x] The existing host API tests continue to cover localized Windows process/port parsing.
- [x] ESLint policy remains explicit: intentional logging is documented, and no unrelated rule churn is introduced.
- [x] Rust tests, Clippy, formatting, and diff validation are run and recorded.

## Plan

- [x] Extract language-server discovery from `host_api.rs` behind the existing re-exported functions.
- [x] Add or preserve focused regression coverage at the new module boundary.
- [x] Review the remaining ESLint exceptions and document the chosen policy if it changes.
- [x] Run focused and related verification, then review the diff.

## Verification Notes

- `cargo test --manifest-path src-tauri/Cargo.toml --lib plugin_engine::host_api -- --nocapture` -> 62 tests passed after the extraction.
- `bun run lint` -> passed with `caughtErrors: "all"`; six intentionally unused plugin catch parameters now use `_error`.
- `bun run check` -> frontend formatting, ESLint, TypeScript, and Cargo fmt passed; the Rust Clippy stage stopped at the documented `src/probe_commands.rs` move/borrow errors.
- `rustfmt --edition 2021 --check src-tauri/src/plugin_engine/host_api.rs src-tauri/src/plugin_engine/language_server.rs src-tauri/src/plugin_engine/mod.rs` -> passed.
- `git diff --check` -> passed; existing LF/CRLF normalization warnings only.
- Full `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` remains blocked by unrelated pre-existing move/borrow errors in `src-tauri/src/probe_commands.rs` (`plugin_id`, `plugin_for_worker_error`, and `handle` are moved into `spawn_blocking` and used afterward).

# Legacy openusage.exe-Fallback im Tauri-Wrapper, 2026-07-24

# Probe worker ownership fix, 2026-07-24

## Acceptance Criteria

- [x] `probe_commands.rs` compiles cleanly with Clippy `-D warnings`.
- [x] Probe panic, worker-join, capacity-failure, completion, and event-emission behavior remains unchanged.
- [ ] Focused Rust tests, full Rust checks, frontend checks, and diff validation pass.
- [ ] Only intended files are included in the commit.

## Plan

- [x] Reproduce the move/borrow failures and identify ownership boundaries.
- [x] Clone or borrow values at the async/blocking seam with the smallest behavior-preserving change.
- [ ] Run focused and full verification, review the staged diff, and commit.

## Verification Notes

- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` -> passed using the separate `src-tauri/target-codex-verification` target directory.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` -> 146 passed, 1 ignored.
- `bun run check:frontend` -> passed: formatting, ESLint, and TypeScript.
- `bun run test:all` -> 1,370 passed, 1 failed in the pre-existing `App > covers about open/close callbacks` assertion expecting a `Luis Leineweber` button absent from the current About UI.
- No commit created because the user authorized committing only when all tests pass.

## Acceptance Criteria

- [x] Der Windows-Dev-Cleanup ermittelt ausschließlich den konfigurierten UsageBar-Executable-Namen.
- [x] Bei nicht lesbarer Konfiguration wird kein Legacy-Executable geraten.
- [x] Ein Regressionstest schützt beide Fälle.
- [x] Relevante Tests, Format-/Diff-Prüfung und Code-Review sind dokumentiert.

## Plan

- [x] Den Legacy-Fallback und seine aktuelle Testabdeckung lokalisieren.
- [x] Die Ermittlung in einen testbaren Helper verschieben und den Fallback entfernen.
- [x] Regressionstest und relevante Checks ausführen.
- [x] Diff prüfen und die Erkenntnis in Lessons/Breadcrumbs dokumentieren.

## Verification Notes

- `node --test scripts/tauri/wrapper.test.mjs` -> 9 passed.
- `bunx prettier --check scripts/tauri/wrapper.mjs scripts/tauri/wrapper-lib.mjs scripts/tauri/wrapper.test.mjs tasks/todo.md docs/breadcrumbs.md tasks/lessons.md` -> passed.
- `git diff --check` -> passed; existing line-ending normalization warnings only.

## Acceptance Criteria

- [x] Ollama zeigt zuerst die `ollama signin`-Variante und danach die Browser-Cookie-Variante.
- [x] Die Anleitung besteht aus kurzen, nummerierten Schritten und erklärt klar, wo der Cookie-Header zu finden ist.
- [x] Alle weiteren Cookie-Provider haben eine passende, kompakte Onboarding-Anleitung.
- [x] Lange bestehende Provider-Hinweise werden im Onboarding nicht mehr ungefiltert wiederholt.
- [x] Regressionstests, Typecheck, Build, Formatierung und Diff-Prüfung sind erfolgreich.

## Plan

- [x] Gemeinsames Variantenmodell und providerbezogene Schritte definieren.
- [x] Cookie-Fallback-UI auf die neue Schrittfolge umstellen.
- [x] Tests ergänzen und die relevanten Checks ausführen.

## Verification Notes

- `bun run test -- src/components/onboarding/first-run-onboarding.test.tsx --run` -> 10 passed.
- `bun run check` -> formatting, ESLint, and TypeScript passed.
- `bun run build:frontend` -> passed; existing large-chunk warning only.
- `git diff --check` -> passed; existing LF/CRLF normalization warnings only.

# Inline cookie recovery in onboarding, 2026-07-24

## Acceptance Criteria

- [x] Failed onboarding checks for cookie-backed providers show an inline Cookie-header field.
- [x] The field explains the common DevTools/Network/Request-Headers path and includes provider-specific source guidance.
- [x] Saving uses the existing secure provider-secret path and automatically retries the provider.
- [x] API-key and local-auth-only providers do not receive a cookie field.
- [x] Focused tests, typecheck, build, formatting, lint, and diff checks pass.

## Plan

- [x] Reuse provider definitions to identify cookie-backed providers and their guidance.
- [x] Add the reusable onboarding cookie field and connect it to secure secret persistence.
- [x] Add/update regression coverage and complete verification.

## Verification Notes

- `bun run test -- src/components/onboarding/first-run-onboarding.test.tsx src/hooks/app/use-first-run-onboarding.test.ts src/components/settings/provider-settings-detail.test.tsx --run` -> 48 passed.
- `bun run check` -> formatting, ESLint, and TypeScript passed.
- `bun run build:frontend` -> passed; existing large-chunk warning only.
- `bun run lint:rust` -> Clippy passed with `-D warnings`.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` -> 145 passed, 1 ignored.
- `git diff --check` -> passed; existing LF/CRLF normalization warnings only.

# Split Tauri command adapters from lib.rs, 2026-07-23

## Acceptance Criteria

- [x] Probe batch IPC behavior and emitted event payloads remain unchanged in the extracted implementation.
- [x] Provider secret, browser-cookie, and Codex-account IPC behavior remains unchanged in the extracted implementation.
- [x] `src-tauri/src/lib.rs` contains app wiring and thin command registration rather than the full probe/credential implementations.
- [ ] Rust tests, rustfmt, frontend typecheck, and diff checks pass or pre-existing blockers are recorded.

## Plan

- [x] Inspect the current command dependencies and choose module seams.
- [x] Move probe batch handling and DTOs into a dedicated module.
- [x] Move credential, browser-cookie, and Codex-account handling into a dedicated module.
- [x] Run focused verification and review the final diff.

## Verification Notes

- `rustfmt --edition 2024 --check src-tauri/src/probe_commands.rs src-tauri/src/credential_commands.rs` -> passed.
- `rustfmt --edition 2024 --config skip_children=true --check src-tauri/src/lib.rs` -> passed; normal Cargo rustfmt is blocked by the pre-existing missing `src-tauri/src/app_nap.rs` module resolution.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `bun run build:frontend` -> passed; existing large-chunk warning only.
- `bun run test -- src/App.test.tsx --run --reporter=dot` -> 86 passed, 2 failed in unrelated existing UI/settings assertions.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` -> exceeded 300 seconds without producing a compiler/test result; exact Rust test verification remains blocked by the local Cargo build environment.
- `git diff --check` -> passed; existing LF/CRLF normalization warnings only.

# README structure refresh, 2026-07-23

## Acceptance Criteria

- [x] README follows the requested reader order from Download through Build from source.
- [x] Install and What It Does are shorter and user-oriented.
- [x] Uninstall, local data, privacy, and security are covered in one section.
- [x] Existing provider, alpha, architecture, fork, contribution, lineage, license, and build details remain accurate.

## Plan

- [x] Reorder and tighten the README sections without changing product behavior.
- [x] Review links, headings, formatting, and the final diff.
- [x] Record exact documentation checks.

## Verification Notes

- README heading order and repeated-topic scan reviewed manually.
- `git diff --check` -> passed; existing line-ending normalization warnings only.

# Hide providers only from navigation, 2026-07-22

## Acceptance Criteria

- [x] Hiding a provider removes it from the sidebar/provider navigation only.
- [x] The shared dashboard and history continue to show the provider when it remains enabled.
- [x] The provider settings window can show a hidden provider again without disabling its probes.
- [x] Existing disabled-provider behavior, context-menu behavior, and persisted settings remain compatible.
- [x] Focused tests, typecheck, formatting, and diff checks pass.

## Plan

- [x] Add a persisted navigation-hidden provider setting with backward-compatible normalization.
- [x] Use it for sidebar/provider navigation while keeping enabled providers in dashboard/history data.
- [x] Expose show-only recovery in provider settings and update context-menu handling.
- [x] Run focused tests and project checks; record exact results.

## Verification Notes

- `bun run test -- src/hooks/app/use-app-plugin-views.test.ts src/hooks/app/use-settings-plugin-actions.test.ts src/App.test.tsx src/pages/settings.test.tsx --run --reporter=dot` -> 4 files, 120 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- Targeted Prettier check and `git diff --check` -> passed; existing CRLF normalization warnings only.

# Faster GitHub Actions builds, 2026-07-22

## Acceptance Criteria

- [ ] CI restores Bun's global package cache on Linux and Windows.
- [ ] The CI check job typechecks once per platform.
- [ ] The frontend/plugin test suite runs once per platform, with coverage generated on Linux in that same run.
- [ ] The existing CLI sidecar preparation remains intact.
- [x] Workflow formatting and relevant local checks pass.

## Plan

- [x] Inspect the current workflow and identify duplicate typecheck/test work.
- [x] Add explicit Bun caching and remove duplicate CI work.
- [x] Verify workflow formatting and local checks.
- [x] Record exact verification results and remaining remote-only checks.

## Verification Notes

- `bunx prettier --check .github/workflows/ci.yml .github/workflows/publish.yml` -> passed.
- `bun run typecheck` -> passed.
- `git diff --check` -> passed; existing line-ending normalization warnings remain.
- `bun run test:all -- --reporter=dot` -> exceeded the local 120-second command limit without producing a test failure; the remote CI run remains the authoritative full-suite verification.
- The existing `prepare:cli-sidecar` step remains in the CI workflow after wrapper tests and before Cargo validation.

# Settings provider presentation order, 2026-07-22

## Acceptance Criteria

- [x] Settings keeps Codex, Claude, Cursor, and OpenCode first, then lists the remainder alphabetically.
- [x] Settings provider rows have no drag handles or reorder interaction.
- [x] Persisted provider order and tray/bar reorder behavior remain unchanged.
- [x] Focused regression tests, typecheck, formatting, and diff checks pass.

## Plan

- [x] Reproduce the Settings dependency on persisted provider order in a focused test.
- [x] Make alphabetical ordering local to Settings and remove its drag-and-drop wiring.
- [x] Verify Settings behavior and confirm the tray/bar ordering path is untouched.

## Verification Notes

- `bun run test -- src/pages/settings.test.tsx src/components/side-nav.test.tsx --run` -> 2 files, 19 tests passed.
- `bun run typecheck` and `bun run lint` -> passed.
- Targeted Prettier check and `git diff --check` -> passed.
- Follow-up regression covers the real visible-provider prefix: `codex`, `claude`, `cursor`, `opencode-go`; legacy `opencode` (OpenCode Zen) remains in the alphabetical remainder.

# Alpha 6 persisted Qwen order repair, 2026-07-22

## Acceptance Criteria

- [x] Persisted Alpha 6 default order moves Qwen between Perplexity and Synthetic.
- [x] Arbitrary saved provider order remains unchanged.
- [x] Regression test, typecheck, and diff check pass.

## Verification Notes

- `bun run test -- src/lib/settings.test.ts --run` -> 58 passed.
- `bun run typecheck` -> passed.
- `git diff --check` -> passed; existing CRLF normalization warnings only.

# Accent-color test mocks, 2026-07-22

### Acceptance Criteria

- [x] Betroffene fünf Tests bestehen.
- [x] Vollständige Frontend-Testsuite besteht.
- [x] Diff und Formatierung geprüft.

### Plan

- [x] Fehler reproduzieren und Mock-Lücken identifizieren.
- [x] Mocks ergänzen und fokussiert verifizieren.
- [x] Vollständige Suite ausführen und Änderungen prüfen.

### Verification Notes

- `bun run test -- src/hooks/app/use-settings-bootstrap.test.ts src/App.test.tsx --run --reporter dot` -> 92 passed.
- `bun run test -- src/lib/settings.test.ts --run` -> 57 passed, including the four-provider prefix regression.
- `bun run test:all -- --reporter=dot` -> 88 files, 1,329 tests passed.
- `bun run typecheck` -> passed.
- Targeted Prettier and `git diff --check` passed; existing CRLF normalization warnings only.

# Local HTTP API CORS backwards compatibility, 2026-07-22

## Acceptance Criteria

- [x] Existing browser clients receive the legacy wildcard CORS response without configuration.
- [x] `USAGEBAR_LOCAL_HTTP_API_ALLOWED_ORIGIN` still restricts responses to the configured origin.
- [x] Focused Rust tests and documentation verify both modes.

## Plan

- [x] Reproduce the default CORS regression in the local HTTP API tests.
- [x] Restore legacy default headers while retaining explicit origin restriction.
- [x] Run focused verification and review the diff.

## Verification Notes

- Default `GET` and `OPTIONS` responses include `Access-Control-Allow-Origin: *`.
- Configured origin mode omits CORS headers for missing or unapproved origins.

# ccusage token mapping for newer providers, 2026-07-22

## Acceptance Criteria

- [x] OpenCode history preserves input, output, cache, reasoning, and total token fields.
- [x] Other ccusage-backed newer providers preserve the same token fields.
- [x] Regression coverage fails before the fix and passes after it.
- [x] Focused tests, bundle synchronization, formatting, and diff review pass.

## Plan

- [x] Reproduce the missing-token symptom through a provider plugin test.
- [x] Update the copied ccusage history mapping in all affected providers.
- [x] Run focused verification and synchronize bundled plugin resources.
- [x] Record choices, breadcrumbs, lessons if needed, and review the diff.

# Accent color setting, 2026-07-22

## Acceptance Criteria

- [x] Settings offers green, blue, red, orange, and pink accent colors.
- [x] Blue `#86c5ff` is the default and the selection persists.
- [x] Main/settings windows and non-template tray branding stay synchronized.
- [x] Focused tests, lint, frontend build, and diff check pass.

## Verification Notes

- `bun eslint` on all touched TypeScript/TSX files passed.
- `bun run test -- src/lib/settings.test.ts --run` passed: 55 tests.
- `bun run build:frontend` passed.
- `git diff --check` passed.
- Full typecheck remains blocked by pre-existing errors in `skeleton-lines.tsx`, `group-lines-by-type.ts`, and `group-metric-lines.ts`.

# Alpha 6 local settings migration, 2026-07-22

## Executive Summary

- Local Alpha 6 inherits user settings from the installed/previous Alpha 5 data directory.
- Development data remains isolated after the first migration.
- Provider credentials and local account data remain available in local Alpha 6.

## Acceptance Criteria

- [x] A deterministic test reproduces missing Alpha 5 settings in a fresh dev data directory.
- [x] Local Alpha 6 imports existing release settings once without changing release data.
- [x] Provider secrets and account data are available after migration.
- [x] Focused Rust tests, formatting, and diff review pass; full cargo fmt remains blocked by the pre-existing missing `src-tauri/src/app_nap.rs`.

## Plan

- [x] Add the red migration test at the filesystem seam.
- [x] Implement one-time dev data migration with release-data isolation.
- [x] Verify settings, secrets, account data, and startup integration.
- [x] Record choice, lesson, breadcrumb, and evidence.

## Verification Notes

- Red repro: `cargo test --manifest-path src-tauri/Cargo.toml dev_data_migration --lib` failed at the unimplemented migration seam.
- Fixed repro: the same test passed; it verifies settings merge, provider-secret copy, account-data copy, release-data preservation, and one-time behavior.
- Full Rust lib tests: 144 passed, 1 ignored; `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `rustfmt --edition 2024 --check src-tauri/src/dev_data_migration.rs` and `git diff --check` passed. Full `cargo fmt --check` remains blocked by the pre-existing missing `src-tauri/src/app_nap.rs`.

# Codex history runner regression, 2026-07-22

## Executive Summary

- Restore the Codex usage graph and local token/cost totals.
- Replace the broken pinned history runner with the verified current release.
- Lock the package boundary with focused regression coverage.

## Acceptance Criteria

- [x] The real Codex history command returns daily usage through the production runner.
- [x] Codex output again contains history plus token and cost metrics.
- [x] A regression test fails before and passes after the runner update.
- [x] Focused plugin/Rust tests, scoped formatting, and diff review pass; no plugin bundle content changed.

## Plan

- [x] Reproduce and minimize the missing-history failure at the runner boundary.
- [x] Rank and test root-cause hypotheses against local Codex data.
- [x] Add the red package-contract regression and update the pinned runner.
- [x] Verify the production command and Codex output end to end.
- [x] Record the lesson, choice, breadcrumb, and evidence.

## Verification Notes

- Red repro: `bun x --silent ccusage@20.0.2 codex daily ...` failed before CLI startup with `Cannot find module ...ccusage\\dist\\cli.js`.
- Red regression: focused Rust assertion failed with actual `ccusage@20.0.2`, expected `ccusage@20.0.18`.
- Production command with `ccusage@20.0.18` returned 20 daily rows, non-zero tokens/cost, and latest date `2026-07-22`.
- `cargo test --manifest-path src-tauri/Cargo.toml ccusage --lib` passed: 24 tests.
- `bun run test -- plugins/codex/plugin.test.js --run` passed: 58 tests.
- Task/docs Prettier and `git diff --check` passed. Full `cargo fmt --check` is blocked by the pre-existing missing `src-tauri/src/app_nap.rs`; direct rustfmt also reports unrelated pre-existing formatting in `host_api.rs`.

# Alpha 6 startup regression: provider assets and charts, 2026-07-22

## Executive Summary

- Prevent a local Alpha 6 start from removing provider identity assets.
- Prevent the development build from disrupting chart data used by installed Alpha versions.
- Lock the startup boundary with a focused regression test.

## Acceptance Criteria

- [x] A fast automated repro detects the reported icon/chart startup regression.
- [x] The root cause is isolated without overwriting unrelated Alpha 6 work.
- [x] A regression test fails before and passes after the fix.
- [x] Focused tests, production build, lint, formatting, and diff review pass; pre-existing type errors are recorded.

## Plan

- [x] Build a deterministic startup/persistence feedback loop.
- [x] Rank and test falsifiable root-cause hypotheses.
- [x] Implement the smallest root-cause fix and regression coverage.
- [x] Verify both installed and development data/asset isolation.
- [x] Record the lesson, choice, breadcrumb, and evidence.

## Verification Notes

- Red repro: `node --test scripts/tauri/wrapper.test.mjs` -> 5 passed, 2 failed: missing dev identifier and provider text-fallback icons.
- Fixed repro: 8 tests passed; tracked dev config is applied last after optional local/user config.
- `node copy-bundled.cjs` -> 33 providers bundled; `node scripts/release-preflight.mjs` -> passed.
- `bun run build:frontend`, focused ESLint, focused Prettier, and `git diff --check` -> passed.
- Restored `tsconfig.json`/`tsconfig.node.json` make typecheck execute project code; it reports pre-existing type errors in three restored Alpha 6 UI modules. No startup-regression file has a TypeScript error.

# Local HTTP API hardening, 2026-07-22

## Executive Summary

- Make the local usage API opt-out and optionally protected.
- Stop exposing cached usage to every browser origin by default.
- Preserve the command-line/local-widget workflow unless hardening is enabled.

## Acceptance Criteria

- [x] The API can be disabled before it binds its loopback port.
- [x] An optional bearer token rejects unauthenticated API reads.
- [x] Browser CORS is disabled by default and can be explicitly enabled for one origin.
- [x] Focused Rust tests and documentation verify the configuration contract.

## Plan

- [x] Add and validate runtime API configuration.
- [x] Enforce configuration at startup, request authentication, and CORS response generation.
- [x] Add regression tests and update user-facing documentation.
- [x] Run focused verification and review the diff.

# Commit packaging, 2026-07-15

## Executive Summary

- Split the current Alpha 5 working tree into small, reviewable commits.
- Preserve all existing code and documentation changes without rewriting behavior.
- Verify the final history and clean working tree after committing.

## Acceptance Criteria

- [x] Every current tracked and untracked change belongs to an intentional commit.
- [x] Commit messages use clear Conventional Commit subjects.
- [x] Focused verification and final diff/status review pass.

## Plan

- [x] Group changes by feature boundary.
- [x] Commit each group separately.
- [x] Run verification and review the resulting history.

# Alpha 5 showcase completion, 2026-07-15

## Executive Summary

- Complete the open Alpha 5 showcase slice across tests, Windows packaging, notifications, accounts, Edge import, and reporting.
- Publish-ready documentation and release checks must describe the actual shipped behavior.
- External account-dependent checks remain explicit if this environment cannot perform them.

## Acceptance Criteria

- [x] Frontend/plugin tests finish without unhandled errors; strict coverage result is understood and has an explicit release decision.
- [x] `usagebar-cli` is bundled, installed on PATH, reversible on uninstall, and manually exercised from a packaged Windows build.
- [x] Edge import is registered, policy-scoped, redacted, tested, and manually checked against a live profile.
- [x] Notifications, provider-neutral account surfaces, and report configuration are wired, tested, and documented.
- [x] Alpha 5 README/changelog/release preflight, bundles, production build, Rust checks, and diff review pass.

## Plan

- [x] Fix notification store error handling/mocks and add focused component coverage.
- [x] Verify and harden CLI sidecar and NSIS PATH lifecycle.
- [x] Close remaining Edge/account/notification/reporting behavior gaps.
- [x] Update release docs and generated bundles.
- [x] Run full automated/manual verification and record external blockers.

## Verification Notes

- 1,407 frontend/plugin tests pass across 97 files with no unhandled errors. `bun run check`, `bun run release:check`, Rust tests (136 passed, 1 ignored), production frontend build, NSIS bundle, live Edge metadata smoke, and `git diff --check` pass.
- Strict coverage remains below the unchanged global gate: 86.08% statements, 79.30% branches, 91.41% functions, 89.31% lines. Alpha 5 carries this explicit waiver; the gate was not lowered.
- Packaged Windows install smoke passed CLI version, full PATH registration with a long existing user PATH, and uninstall cleanup. Narrow-layout resize QA remains external because the collaborative preview was unavailable due to authentication; the prior wide settings DOM check passed.

# History chart hover details, 2026-07-14

## Executive Summary

- Make chart points easier to inspect without adding permanent visual noise.
- Show date, tokens, and cost only while a point is hovered or focused.
- Keep the interaction keyboard-accessible and gentle under reduced-motion settings.

## Acceptance Criteria

- [x] Chart points enlarge subtly on hover/focus.
- [x] Hover/focus details show the point date, tokens, and cost.
- [x] Tooltip content is available to keyboard and screen-reader users.
- [x] Focused frontend test, formatting, typecheck, and diff review pass.

## Plan

- [x] Extend daily chart points with token and cost totals.
- [x] Add animated, accessible hover/focus point details.
- [x] Add regression coverage and verify the touched slice.

## Verification Notes

- `bun vitest run src/components/usage-report.test.tsx --reporter=dot` -> passed, 6 tests.
- `bun run typecheck`, targeted ESLint, and `bun run build:frontend` -> passed.
- Targeted Prettier and `git diff --check` -> passed; existing line-ending warnings only.

# OpenCode local usage history, 2026-07-13

## Executive Summary

- Show OpenCode activity already stored on this device in the History page.
- Preserve current OpenCode Zen balance behavior while adding model, token, and cost history where the database provides them.
- Keep unavailable data unavailable instead of guessing values.

## Acceptance Criteria

- [x] OpenCode history emits daily entries from all local OpenCode assistant messages, with model, available token fields, and cost.
- [x] Existing OpenCode balance and cost-window output remains unchanged.
- [x] A focused regression test covers OpenCode’s persisted message shape and missing optional usage fields.
- [x] Plugin tests, bundle sync, format checks, and diff review pass.

## Plan

- [x] Compare ccusage’s OpenCode SQLite parser with the current plugin and history contract.
- [x] Add a failing plugin regression test for rich local OpenCode message data.
- [x] Extend the plugin’s history mapper without changing the billing probe path.
- [x] Verify, sync bundled plugin resources, review the diff, and record breadcrumbs.

## Verification Notes

- `bun vitest run plugins/opencode/plugin.test.js --reporter=dot` -> passed, 14 tests.
- `bun prettier --write plugins/opencode/plugin.js plugins/opencode/plugin.test.js tasks/todo.md docs/choices.md docs/breadcrumbs.md` -> passed.
- `bun run bundle:plugins`, `bun eslint plugins/opencode/plugin.js plugins/opencode/plugin.test.js`, `bun run typecheck`, and `git diff --check` -> passed.

# Hide unsupported usage history, 2026-07-13

## Executive Summary

- Do not show a history section when no provider has history data.

## Acceptance Criteria

- [x] Unsupported provider history does not render an empty-state section.
- [x] Focused report test passes.

## Plan

- [x] Trace history visibility and current regression coverage.
- [x] Return no report section when all histories are absent.
- [x] Verify the focused test and record the decision.

## Verification Notes

- `bun vitest run src/components/usage-report.test.tsx` -> 5 tests passed.
- `bun prettier --check src/components/usage-report.tsx src/components/usage-report.test.tsx tasks/lessons.md tasks/todo.md docs/choices.md docs/breadcrumbs.md` -> passed.
- `bun run typecheck` -> passed.
- `git diff --check` -> passed (only existing CRLF warnings).

# History report accuracy, 2026-07-13

## Executive Summary

- Keep the history view focused on useful multi-day comparisons.
- Show a compact daily activity view when a line chart would contain only one point.
- Preserve provider-reported request counts and apply pricing per recorded model.

## Acceptance Criteria

- [x] History period controls omit Today and Yesterday.
- [x] One active day renders as a daily activity view, not an isolated sparkline point.
- [x] Request totals use available provider counts without presenting missing data as a confirmed zero.
- [x] Cost calculations retain each record's model-specific price.
- [x] Focused regression tests and formatting checks pass.

## Plan

- [x] Trace report controls, chart rendering, history contracts, and provider payload mapping.
- [x] Add focused report/pricing regressions for periods, sparse daily data, requests, and model prices.
- [x] Implement the smallest UI and data-contract corrections.
- [x] Verify, review the diff, and record breadcrumbs.

## Verification Notes

- `bun run test -- src\\components\\usage-report.test.tsx src\\lib\\report-pricing.test.ts --run` -> 2 files passed, 8 tests passed.
- `bun run typecheck` -> passed.
- Targeted Prettier and `git diff --check` -> passed.

# Copilot usage visibility, 2026-07-13

## Executive Summary

- Restore the Copilot card's current quota counters from GitHub's authenticated usage response.
- Preserve legacy, free, and AI-credit response behavior.

## Acceptance Criteria

- [x] A deterministic plugin test reproduces GitHub's current token-based quota response.
- [x] Copilot Chat and Completions usage appears from provider-reported snapshot limits.
- [x] Focused tests, bundled-resource sync, and format checks pass.

## Plan

- [x] Confirm the installed Copilot CLI and trace the current provider implementation.
- [x] Capture the live GitHub usage contract and add a failing regression test.
- [x] Recognize current token-based snapshots without changing credential/API fallback behavior.
- [x] Verify, sync bundled resources, review the diff, and record breadcrumbs.

## Verification Notes

- `gh api /copilot_internal/user` returned authenticated current token-based snapshots for Chat and Completions.
- `bun vitest run plugins/copilot/plugin.test.js --reporter=dot` -> passed, 46 tests.
- `bun eslint plugins/copilot/plugin.js plugins/copilot/plugin.test.js`, Prettier, plugin bundling, and `git diff --check` passed.

# Copilot free-limited snapshot precedence, 2026-07-15

## Executive Summary

- Restore Copilot usage for accounts whose response includes both free-limited plan metadata and current token-based quota snapshots.
- Keep the provider's Chat and Completions counters visible instead of falling back to no usage data.

## Acceptance Criteria

- [x] The exact live response shape reproduces the empty-card symptom before the fix.
- [x] Current Chat and Completions snapshots take precedence over free-tier classification.
- [x] Source plugin tests pass and bundled plugin resources match source after synchronization.

## Verification Notes

- `gh api /copilot_internal/user` returned `access_type_sku: free_limited_copilot`, token-based billing, Chat remaining 200, and Completions remaining 2000.
- Added the combined response fixture; focused tests went red (1 failed, 45 passed), then green (46 passed) after the precedence fix.
- Bundled 33 plugins successfully; Copilot source/bundle hashes match, and targeted format, lint, and diff checks pass.

# Antigravity expired-token refresh, 2026-07-13

## Executive Summary

- Restore Antigravity access after a user re-authenticates.
- Ensure UsageBar refreshes using the renewed local session rather than a stale token.

## Acceptance Criteria

- [ ] The Antigravity plugin has a deterministic regression test for expired-session refresh behavior.
- [ ] A successful re-login is detected without retaining stale authentication state.
- [ ] Focused plugin tests and syntax/format checks pass.

## Plan

- [x] Reproduce the plugin's expired-session path and inspect its credential source.
- [x] Confirm existing refresh handling covers the reported expired-token state; no code change warranted.
- [ ] Complete interactive Antigravity sign-in, then refresh and verify UsageBar.

## Verification Notes

- `bun run test -- plugins/antigravity/plugin.test.js --run` -> passed, 1 file / 34 tests; includes the exact expired-token error and refresh recovery paths.
- The local Antigravity state database exists at the expected Windows path but its last-write time is 2026-05-20, confirming the local sign-in state has not been renewed.
- UsageBar reads the credential database on every probe, so a completed Antigravity re-login is picked up by the next refresh; it does not need an app restart or a code patch.
- Interactive login remains required because it needs the account holder's Google credentials/MFA; Windows UI automation is unavailable in this session.

# Tauri dev binary selection, 2026-07-13

## Executive Summary

- Start the desktop app from `npm run tauri dev` while retaining the installed CLI command.

## Acceptance Criteria

- [x] Cargo defaults to the desktop `usagebar` binary when both binaries exist.
- [x] Cargo metadata reports `usagebar` as the default run target.

## Plan

- [x] Set the package default run target to `usagebar`.
- [x] Verify Cargo's selected binary through package metadata.

# Persistent settings entry point, 2026-07-13

## Executive Summary

- Keep the settings control reachable whenever the tray panel is open.
- Reproduce the missing-control state and protect it with a focused UI test.

## Acceptance Criteria

- [x] A focused UI test covers the state that previously omitted Settings.
- [x] Settings remains reachable independent of provider/card state.
- [x] Focused test, format check, and diff review pass.

## Plan

- [x] Establish and minimize a deterministic repro for the missing settings control.
- [x] Identify the conditional render/layout cause and add the regression test.
- [x] Apply the smallest fix, verify it, and record the outcome.

# Showcase completion, 2026-07-13

## Executive Summary

- Ship the CLI as an installed Windows command and verify PATH behavior.
- Complete the Edge import workflow and Windows-safe diagnostics.
- Add local, deduplicated quota/incident/reset notifications with quiet hours and recent events.
- Replace Codex-only account UI assumptions with provider capabilities.
- Deepen local reporting with grouping, paths, pricing controls, offline behavior, and watch output.
- Add no provider without strong Windows authentication and entitlement evidence.
- Verify packaged Windows behavior, narrow layouts, and the complete automated suite.

## Acceptance Criteria

- [ ] Installed Windows builds include `usagebar-cli`; installer PATH changes are reversible and live command execution is verified.
- [ ] Edge import is command-registered, policy-scoped, secret-redacted, regression-tested, and exercised against a live Windows Edge profile when available.
- [ ] Users can configure quota thresholds, incident/reset notifications, quiet hours, and inspect recent deduplicated events; installed Windows delivery is verified.
- [ ] Account management is provider-neutral and capability-driven while preserving existing Codex profiles and selection.
- [ ] Reports support project grouping, custom paths, pricing overrides/offline prices, and watch-mode CLI output with shared normalized data.
- [ ] Long-tail provider decisions cite current Windows auth and entitlement evidence; plugin/docs/redaction obligations pass for any addition.
- [ ] Production build, focused/full frontend and Rust suites, packaged Windows checks, narrow-layout QA, formatting, and diff review pass.

## Plan

- [ ] Baseline current wiring, tests, packaging, and live Windows prerequisites.
- [ ] Finish CLI/PATH packaging and Edge import verification.
- [ ] Implement notification preferences, event derivation/deduplication, OS delivery, and recent-event UI.
- [ ] Generalize account capabilities and management surfaces beyond Codex.
- [ ] Add report configuration, project grouping, offline pricing, and CLI watch mode.
- [ ] Research long-tail candidates; implement only evidence-backed providers.
- [ ] Run packaged, responsive, full-suite, and final code-review gates; record decisions and breadcrumbs.

# Refresh, credential, and Cursor reliability, 2026-07-13

## Executive Summary

- Prevent duplicate provider probes and preserve results for every refresh caller.
- Surface actionable credential failure categories instead of generic login errors.
- Prefer Cursor's usage-summary data for enterprise/team accounts before request-count fallback.

## Acceptance Criteria

- [x] Concurrent batches probing the same provider execute it once and each batch receives result/completion events.
- [x] Probe outputs carry stable credential error categories and the UI identifies credential failures.
- [x] Cursor distinguishes unavailable credential sources from absent credentials.
- [x] Cursor enterprise/team missing-plan usage prefers `/api/usage-summary`, then degrades to `/api/usage`.
- [x] Focused JS/Rust tests, typecheck, formatting, and diff review pass.

## Plan

- [x] Add failing coordinator and credential-classification tests.
- [x] Implement backend probe coalescing and structured probe errors.
- [x] Add failing Cursor credential and usage-summary tests, then implement fallback ordering.
- [x] Run verification and code review; record lessons and breadcrumbs.

## Verification Notes

- Full frontend/plugin suite: 90 files, 1,381 tests passed.
- Full Rust library suite: 134 tests passed.
- ESLint, TypeScript, Rust formatting, plugin bundling (33 plugins), Node syntax, and `git diff --check` passed.
- Cursor response fields add quota, membership, and billing-cycle data only; existing host redaction covers authentication/session/user/account/name fields.

# Remote branch idea audit, 2026-07-13

## Executive Summary

- Review every upstream remote branch for novel product or reliability ideas.
- Rank findings by usefulness to this Windows fork and avoid touching implementation.

## Acceptance Criteria

- [x] All `upstream/*` branches are enumerated and inspected.
- [x] Unique ideas are grouped, deduplicated, and ranked with branch/commit evidence.
- [x] A concise report is delivered with recommended next slices.

## Plan

- [x] Refresh and inventory remote refs.
- [x] Analyze unique commits and changed files by branch.
- [x] Produce and verify the ranked findings.

# Surface pin completion, 2026-07-13

## Executive Summary

- Finish the saved metric-pin editor and show an immediate tray/widget preview.
- Apply saved pins consistently in the tray panel and standalone settings window.
- Verify persistence, cross-window updates, rendering, and accessibility-oriented controls.

## Acceptance Criteria

- [x] Users can select, replace, remove, and choose bar/text presentation for up to two unique provider metrics.
- [x] The settings preview reflects the selected tray style, live metric values, and saved pin order.
- [x] Stored pins load on startup and settings-window changes propagate to the tray process.
- [x] Focused tests, typecheck, build, formatting, and diff review pass.

## Plan

- [x] Complete the pin editor and compact preview component.
- [x] Connect tray preview state to standalone settings and tray rendering.
- [x] Add regression tests for editing, ordering, presentation, and rendering.
- [x] Run verification; update task notes, choices, and breadcrumbs.

## Verification Notes

- Focused settings/surface suite after review fixes: 9 files, 180 tests passed; production build passed.
- Formatting, ESLint, TypeScript, and `git diff --check` passed.
- Full frontend suite: 88 files and 1,373 tests passed; two unrelated concurrent Cursor plugin tests failed.
- T3 browser confirmed wide settings rendering without horizontal overflow. Resize/snapshot automation timed out; packaged Windows and narrow visual verification remain open.
- Final review added the tray-panel widget, identity-based preview matching, 3px focus treatment, and loud tray-render failure handling.

# Cookie-only provider audit, 2026-07-12

## Executive Summary

- Identify providers whose only remote authentication path is a browser session cookie.
- Find shared reliability, security, and setup improvements.
- Rank evidence-backed changes without modifying provider behavior during the audit.

## Acceptance Criteria

- [x] Cookie-only providers and credential sources are enumerated from code.
- [x] Shared and provider-specific risks cite concrete implementation evidence.
- [x] Recommended changes are ranked by impact, scope, and verification path.

## Plan

- [x] Trace plugin manifests, credential selection, requests, and auth errors.
- [x] Audit vault precedence, browser import, redaction, and tests.
- [x] Run focused static/test checks; record findings and breadcrumb.

## Verification Notes

- Cookie-only: Abacus, Perplexity, Mistral billing, and OpenCode Zen. Stored vault secrets correctly precede environment and legacy keychain fallbacks.
- Mistral now has an official Admin API usage endpoint using a dedicated Admin API key; prefer it over the private cookie endpoint when available.
- Shared guided login is allow-listed only for Zed; Edge cookie import is policy-limited only to Claude.
- Guided capture currently stores every cookie exposed for each approved URL; future provider expansion should add per-provider cookie-name allowlists and deduplicate by cookie name/domain.
- Focused plugin/settings run: 5 files passed, 108 tests; `src/lib/browser-cookie-import.test.ts` failed before collection because its `vi.mock` references a non-hoisted `invokeMock`.
- `cargo test --manifest-path src-tauri/Cargo.toml guided_cookie_capture --lib` passed (1 test). The `browser_cookie_import` filter matched 0 tests because those tests use different names.

# Cookie provider hardening implementation, 2026-07-12

## Executive Summary

- Prefer Mistral's official Admin API key over private browser cookies.
- Add guided login for cookie-only providers while restricting captured cookies.
- Preserve manual cookie and environment fallbacks.

## Acceptance Criteria

- [x] Mistral Admin API key is vault-first and uses the official usage endpoint; cookie fallback remains supported.
- [x] Abacus, Perplexity, and OpenCode Zen guided login requests are backend allow-listed.
- [x] Guided capture stores only approved cookie names and rejects duplicate-name ambiguity.
- [x] Plugin manifests, redaction allowlists, bundled resources, docs, and focused tests pass.

## Plan

- [x] Add failing plugin/frontend/Rust regression tests.
- [x] Implement Mistral official API auth and strict guided-login policies.
- [x] Update settings, docs, manifests, bundles, and redaction tests.
- [x] Run focused JS/Rust checks, formatting, and diff review.

## Verification Notes

- `bun run test -- plugins/abacus/plugin.test.js plugins/perplexity/plugin.test.js plugins/mistral/plugin.test.js plugins/opencode/plugin.test.js src/lib/provider-settings.test.ts src/lib/browser-cookie-import.test.ts src/components/settings/provider-settings-detail.test.tsx --run` -> 7 files, 150 tests passed.
- Guided policy and approved-cookie conflict Rust tests passed; `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- Host environment allowlist test passed with `MISTRAL_ADMIN_API_KEY`; Mistral source/bundled plugin SHA-256 matched; Node syntax, Rust formatting, Prettier, and ESLint passed.
- Repo-wide `bun run check` reaches TypeScript and fails on pre-existing surface-pin work: missing `setSurfacePins` arguments in `src/App.tsx` and `src/settings-window-app.tsx`. These files are outside this slice and were already modified.
- `git diff --check` passed; only expected CRLF conversion warnings were reported.

# Modern Antigravity tracking research, 2026-07-12

## Executive Summary

- Identify why current Antigravity usage frequently stays at 100% or becomes unavailable.
- Compare current Google-owned contracts and maintained implementations.
- Recommend a Windows-compatible tracking strategy with explicit reliability tradeoffs.

## Acceptance Criteria

- [x] Current UsageBar Antigravity paths and failure modes are mapped from code and tests.
- [x] Current tracking alternatives are verified against primary sources or source code.
- [x] Findings include an implementation-ready recommendation and validation plan.

## Plan

- [x] Establish a focused test baseline and inspect current parsing/discovery assumptions.
- [x] Research current Antigravity auth, quota, local-service, and remote API contracts.
- [x] Compare evidence, rank failure hypotheses, and document the recommended architecture.
- [x] Verify research links, diff scope, and task notes.

## Verification Notes

- `bun run test -- plugins\antigravity\plugin.test.js --run` -> passed, 30 tests.
- Current code inspection confirmed `fetchAvailableModels` sends `{}` and uses legacy per-model grouping.
- Official Antigravity plans/changelog/blog confirm five-hour plus weekly limits, shared Gemini quota, and a redesigned usage screen.
- Multiple current implementations agree on `loadCodeAssist` project discovery, project-scoped quota calls, and the emerging grouped summary endpoint.
- Research report: `docs/providers/antigravity-tracking-research-2026-07.md`.

# Modern Antigravity tracking implementation, 2026-07-12

## Executive Summary

- Stop false `100% left` results by resolving the account project before remote quota calls.
- Show Antigravity 2.0 session and weekly quota pools when Google returns them.
- Keep project-scoped model and local language-server fallbacks for compatibility.

## Acceptance Criteria

- [ ] Remote tracking resolves and sends `cloudaicompanionProject`; projectless quota is never accepted.
- [ ] Grouped quota summary renders Gemini and Claude/GPT session and weekly progress when valid.
- [ ] Schema variants and missing fields degrade to project-scoped model quota or explicit unknown state.
- [ ] Three Cloud Code hosts are bounded fallbacks; auth, throttling, and transient failures remain distinct.
- [ ] Manifest, docs, bundled plugin, redaction audit, focused tests, full tests, typecheck, and formatting pass.

## Plan

- [ ] Add red public-probe regression tests for project discovery and grouped summary.
- [ ] Implement project-scoped HTTP acquisition and conservative summary parsing.
- [ ] Add model fallback, host/error coverage, and update manifest/docs.
- [ ] Sync bundles; run focused/full verification and code review.

# OpenCode canceled-subscription detection, 2026-07-12

## Executive Summary

- Stop historical paid OpenCode usage from implying a current Go subscription.
- Require current structured entitlement evidence for paid status.
- Preserve Free usage reporting and lock cancellation behavior with a regression test.

## Acceptance Criteria

- [x] Authenticated accounts with stale paid history but no active entitlement display `Free`.
- [x] Structured active/trialing Go entitlement still displays `GoSubscription`.
- [x] OpenCode plugin tests, formatting, and diff review pass.

## Plan

- [x] Add and run a red regression test for canceled subscription plus stale paid history.
- [x] Remove historical usage as subscription evidence at the provider decision seam.
- [x] Record the lesson and breadcrumb; verify targeted tests and diff.

## Verification Notes

- Red test: expected `Free`, received `GoSubscription` for `status: canceled` plus stale paid history.
- `bun vitest run plugins/opencode-go/plugin.test.js src/components/settings/provider-settings-detail.test.tsx` -> passed, 54 tests.
- `bun prettier --check <touched source/test/docs files>` -> passed.
- `bun run bundle:plugins` -> bundled 33 plugins; OpenCode Go bundled resources synchronized.
- `git diff --check` -> passed; only expected CRLF conversion warnings.
- Host API redaction audit -> no plugin request/response fields changed; no redaction update required.

Full historical todo log is archived locally at:

- `tasks/archive/todo-history-2026-05-18.md`

Keep this file short. Add only the current slice, acceptance criteria, and verification. Move completed slices to an ignored archive when they stop being useful for active context.

# Competitor gap showcase refresh, 2026-07-11

## Executive Summary

- Turn the static competitor audit into a current gap-to-delivery showcase.
- Verify UTF-8 rendering and distinguish implemented foundations from queued work.
- Align the artifact with UsageBar's compact instrument-panel design and verify wide and narrow layouts.

## Acceptance Criteria

- [x] Competitor evidence remains visible and source-backed.
- [x] Current history, CLI, browser-import, and surface-pin work is labeled in progress, not missing or shipped.
- [x] UTF-8 punctuation renders correctly with no mojibake.
- [x] Filters, copy action, keyboard focus, and responsive layouts work without external dependencies.
- [x] Browser verification covers wide and 320px layouts with no overflow or console errors.

## Plan

- [x] Inspect the existing artifact, current implementation state, design context, and task history.
- [x] Refresh information architecture, status language, visuals, and interactions.
- [x] Record the report update in choices and breadcrumbs.
- [x] Validate HTML structure, interactions, wide layout, narrow layout, and diff scope.

## Verification Notes

- `bun prettier --check docs\reports\usagebar-competitor-gap-showcase.html` -> passed.
- Structural assertions -> passed: doctype, UTF-8 charset, eight matrix rows, eight valid delivery states, filter feedback, no mojibake, one inline script, and no external script.
- Playwright wide check at 1440×1000 -> first viewport and matrix visually reviewed; `In progress` filter showed 4 themes; copy action executed.
- Playwright narrow check at 320×900 -> no horizontal overflow (`scrollWidth === clientWidth`); hero, KPI grid, controls, and stacked matrix rows remained readable.
- Browser console after reload -> 0 errors, 0 warnings.
- T3 collaborative preview and in-app browser were unavailable; verified through the permitted local Playwright fallback.

# Competitor gap implementation, 2026-07-10

## Executive Summary

- Add durable provider-agnostic history and reporting, then expose it consistently in the tray, local API, and terminal.
- Restore and extend tray customization with pinned metrics, a provider switcher, incident state, and a compact widget surface.
- Add explicit, provider-scoped browser import, notification preferences/events, and a provider-neutral account-health foundation.
- Expand provider coverage only where a stable Windows source and verifiable entitlement data exist; document evidence-based deferrals for the remainder.

## Acceptance Criteria

- [x] Repeated cache/secret writes replace files safely on Windows without losing the prior file on failure.
- [x] Successful plugins may return validated daily history with source/timezone, cost, request, token, model, project, and account dimensions.
- [x] History persists across restarts, migrates the v1 cache, and is queryable by provider/date/model/project/grouping through the local API.
- [x] Provider detail and a shared history view show Today, Yesterday, 7d, and 30d summaries, an accessible compact trend, model mix, honest empty states, and report filters.
- [ ] A standalone console CLI reads cached state only and supports stable text, JSON, status-line, provider, and history output.
- [ ] Browser import is opt-in, Edge-first, compiled-policy-controlled, imports only approved provider cookies, writes directly to DPAPI storage, and returns redacted diagnostics with manual/guided fallback.
- [x] Menu-bar style selection works again; users can pin up to two provider metrics and see a matching preview/widget surface.
- [ ] Incident, quota-threshold, and reset events are deduplicated; notification preferences, quiet hours, and recent events persist; OS permission failure has an in-app fallback.
- [ ] Account registry contracts are provider-neutral, preserve existing Codex profiles, expose active/health/stale state, and support check/re-auth/remove actions through adapter capabilities.
- [ ] Long-tail provider work includes provenance enforcement, one verified direct-source provider slice where evidence permits, and explicit research/defer decisions for unsupported candidates.
- [ ] README, local API, plugin API, Windows/browser privacy, CLI, and provider docs match shipped behavior.
- [ ] Focused tests, full frontend tests, typecheck, formatting, Rust tests, Clippy, build, and manual browser/Tauri checks pass.

## Plan

- [x] Add shared Windows-safe atomic replacement and regression coverage.
- [x] Add normalized history contract, cache v2 migration, query API, and aggregation tests.
- [x] Emit authoritative history from Claude, Codex, OpenAI API, and OpenCode where source data supports it.
- [x] Build history/reporting UI with filters, summaries, chart, model mix, and empty states.
- [ ] Build standalone cache-only CLI and release packaging/docs.
- [x] Restore tray style wiring, add persisted pins, preview, and compact widget surface.
- [ ] Add notification preferences, transition engine, OS adapter, routing, and recent-events UI.
- [ ] Add compiled cookie policy and Edge import for eligible providers with redacted diagnostics.
- [ ] Generalize account registry contracts and UI, migrate Codex, add health/ping/stale flows.
- [ ] Complete provider provenance/triage and verified provider expansion slice.
- [ ] Run full verification, visual QA, accessibility/responsive checks, and code review.

## Verification Notes, 2026-07-12

- `cargo test --manifest-path src-tauri/Cargo.toml atomic_file --lib` -> 3 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml history --lib` -> 16 passed.
- Provider/history/report set -> 6 files passed, 164 tests.
- Added standalone `usagebar-cli` dispatch and binary; CLI Rust set -> 10 passed; `cargo check --bins` passed.
- Registered Edge browser-import commands with blocking I/O off the UI thread; browser policy Rust set -> 3 passed.
- Browser-import/history/settings frontend set -> 4 files passed, 69 tests; `bun run typecheck` passed.
- CLI installer bundling/PATH integration and live Edge import remain open; neither acceptance criterion is marked complete.

# Competitor idea implementation map

## Executive Summary

- Turn competitor findings into a ranked UsageBar implementation plan.
- Prioritize direct OpenUsage reliability ports before larger provider/account features.
- Produce a browser-readable HTML artifact for review.

## Acceptance Criteria

- [x] Current UsageBar surfaces are checked against the referenced OpenUsage reliability commits.
- [x] Competitor ideas are classified as implement now, adapt later, defer, or reject.
- [x] HTML artifact explains what to implement and how at a non-code and technical level.
- [x] Breadcrumbs and choices record the report path and prioritization default.

## Plan

- [x] Review repo context, current hooks/backend surfaces, and referenced upstream commit diffs.
- [x] Create a single-file HTML implementation map.
- [x] Record choices and breadcrumbs.
- [x] Verify the artifact exists and is self-contained.

## Verification Notes

- Checked current `src-tauri/src/lib.rs`, `src-tauri/src/plugin_engine/runtime.rs`, `src-tauri/src/local_http_api/server.rs`, `src-tauri/src/local_http_api/cache.rs`, `src/hooks/app/*`, `src/hooks/use-now-ticker.ts`, and DeepSeek/Codex/Claude plugin surfaces.
- Referenced local upstream commits: `abc68e8`, `9a9f01d`, `a291696`, `d44008f`, `ce7f682`, `810b122`.
- Output artifact: `docs/reports/usagebar-competitor-implementation-map.html`.

# Copilot AI-credit billing migration

## Executive Summary

- Stop treating paid Copilot usage as legacy Premium Requests for every account.
- Add explicit billing-mode lines so users can distinguish AI-credit migration state from legacy annual request plans.
- Preserve the existing legacy request path for accounts GitHub still bills that way.

## Acceptance Criteria

- [x] Paid usage-based Copilot plans show AI-credit terminology, not `Premium` as the primary line.
- [x] Legacy request snapshots remain visible as legacy request usage.
- [x] Free/limited Copilot quotas keep existing Chat and Completions behavior.
- [x] `billingScope` works as the new config key and `workspaceId` remains an alias.
- [x] Copilot docs and manifest describe the dual-mode behavior.
- [x] Focused Copilot plugin tests pass.

## Plan

- [x] Inspect current Copilot plugin, manifest, docs, and tests.
- [x] Add billing-mode normalization and usage-based AI-credit lines.
- [x] Rename legacy request lines and preserve old billing endpoint fallback.
- [x] Update docs, manifest, tests, bundled resources, choices, and breadcrumbs.
- [x] Run focused verification and review diff.

## Verification Notes

- Skill search: `npx skills find github copilot billing` found Copilot SDK/usage skills, but no install was needed for this repo-specific migration slice.
- `bun run test -- plugins\copilot\plugin.test.js --run` -> passed, 45 tests.
- `node --check plugins\copilot\plugin.js` -> passed.
- `bun prettier --check plugins\copilot\plugin.js plugins\copilot\plugin.json plugins\copilot\plugin.test.js src-tauri\resources\bundled_plugins\copilot\plugin.js src-tauri\resources\bundled_plugins\copilot\plugin.json src-tauri\resources\bundled_plugins\copilot\plugin.test.js docs\providers\copilot.md README.md docs\choices.md docs\breadcrumbs.md tasks\todo.md` -> passed.
- `bun run bundle:plugins` -> bundled 32 plugins; Copilot source and bundled SHA-256 hashes match for `plugin.js`, `plugin.json`, and `plugin.test.js`.
- Diff review completed for Copilot plugin, manifest, tests, bundled resources, docs, README, choices, breadcrumbs, and todo.

# Persist provider bar order

## Executive Summary

- Keep the user-selected provider order in the bar after restart and app update.
- Preserve existing saved order instead of re-sorting it during startup normalization.
- Append newly added providers at the end so updates do not reshuffle current providers.

## Acceptance Criteria

- [x] Saved provider order is preserved during settings normalization.
- [x] New providers are appended after the saved order during updates.
- [x] First-run/default order still keeps Codex, Claude, and Cursor first.
- [x] Focused settings tests pass.

## Plan

- [x] Locate provider order persistence and startup normalization.
- [x] Change normalization to preserve stored order for existing providers.
- [x] Add/update regression tests for restart/update order persistence.
- [x] Run focused verification and review diff.

## Verification Notes

- `bun run test -- src\lib\settings.test.ts src\lib\tray-primary-progress.test.ts src\hooks\app\use-settings-plugin-actions.test.ts --run` -> passed, 3 files, 70 tests.
- `bun prettier --check src\lib\settings.ts src\lib\settings.test.ts` -> passed.
- `bun prettier --check tasks\todo.md` still fails on pre-existing malformed escape sequences in the older OpenCode todo section; this slice did not rework that historical content.
- Diff review completed for `src/lib/settings.ts`, `src/lib/settings.test.ts`, `tasks/todo.md`, and `docs/breadcrumbs.md`.

# Visible manual update-check feedback

## Executive Summary

- Make the version footer visibly acknowledge a manual update check.
- Show a checking state while the request is in flight and an explicit up-to-date state when no release is available.
- Keep the existing update-install and About dialog interactions unchanged.

## Acceptance Criteria

- [x] Right-clicking the version label shows visible checking feedback.
- [x] A completed check with no newer release shows an explicit up-to-date label.
- [x] Existing available, error, and About dialog behavior remains unchanged.
- [x] Focused footer/update tests and formatting pass.

## Plan

- [x] Add failing footer assertions for checking and up-to-date states.
- [x] Render the two existing update states in the footer.
- [x] Run focused tests, formatting, and diff review.

## Verification Notes

- `bun run test -- src/components/panel-footer.test.tsx src/hooks/use-app-update.test.ts --run` -> 38 tests passed.
- `bunx prettier --write src/components/panel-footer.tsx src/components/panel-footer.test.tsx` -> passed.

# Version footer update entry point

## Executive Summary

- Keep the footer version label available when update checks fail.
- Remove the hard-to-open `Updates soon` state from the user-facing footer.
- Preserve real update actions for available, downloading, ready, and installing states.

## Acceptance Criteria

- [x] Failed update checks render the normal version label button.
- [x] Clicking the version label opens the about/version dialog in the failed-update-check state.
- [x] Right-clicking the version label manually checks for updates.
- [x] Available update state still opens the update/release action.
- [x] Focused frontend verification passes.

## Plan

- [x] Locate the footer update/version rendering path.
- [x] Replace the `Updates soon` failed-check label with the version entry point.
- [x] Add or update focused regression coverage.
- [x] Run focused tests and review the diff.

## Verification Notes

- `bun run test -- src\components\panel-footer.test.tsx --run` -> passed, 13 tests.
- `bun prettier --check src\components\panel-footer.tsx src\components\panel-footer.test.tsx tasks\todo.md docs\breadcrumbs.md` -> passed.
- Diff review completed for `PanelFooter`, focused tests, todo, and breadcrumbs.

# Publish Alpha 4 release

## Executive Summary

- Publish the current `main` state as Alpha 4.
- Include the provider reliability, Zed login, and OpenCode Free overview fixes already in `HEAD`.
- Keep generated/untracked local files out of the release unless already tracked.

## Acceptance Criteria

- [x] `CHANGELOG.md` describes all Alpha 4 user-facing/provider changes.
- [x] Release verification passes or exact blockers are documented.
- [ ] Git tag `v0.1.0-alpha.4` points at the release commit.
- [ ] `main` and the release tag are pushed.
- [ ] GitHub prerelease `v0.1.0-alpha.4` is created with the previous release body structure.

## Plan

- [x] Mirror the Alpha 3 release body structure.
- [x] Update Alpha 4 release notes and breadcrumbs.
- [x] Run release preflight and relevant checks.
- [ ] Commit release-note updates with a conventional commit.
- [ ] Create/push the Alpha 4 tag and GitHub prerelease.

## Verification Notes

- Previous release body fetched with `gh release view v0.1.0-alpha.3 --json body,tagName,name,isPrerelease,isDraft`.
- Release commits since Alpha 3: `befa0c8`, `1477eeb`, `5c9e71a`, `e5bd292`, `67b5e57`.
- Local untracked file `docs/feature-roadmap-plan.html` is left out of release prep unless explicitly added later.
- `bun run release:check` -> passed, release version `0.1.0-alpha.4`, 32 bundled plugins.
- `bun run check` -> passed after formatting `package.json`; accidental package diff was reverted because it had no semantic release change.
- `bun run format:rust:check` -> passed.
- `git --no-pager diff --check` -> passed; only expected CRLF conversion warnings were reported.
- `bun run test:coverage` -> 84 files passed, 1323 tests passed, but strict global gate failed: statements 86.64%, branches 80.24%, lines 89.95%; functions 93.29% passed. Alpha 4 continues the Alpha 3 coverage waiver pattern.

# Zed guided dashboard login

## Executive Summary

- Replace manual-only Zed cookie capture with a guided login window.
- Store only the captured dashboard cookie header, never email/password/form data.
- Keep the login flow generic so other cookie providers can adopt it later.

## Acceptance Criteria

- [x] Zed settings expose a guided dashboard login action.
- [x] Captured cookies are stored via the existing provider secret path as `cookieHeader`.
- [x] The guided login model is provider-configurable for later providers.
- [x] Tests cover Zed guided-login UI and settings configuration.
- [x] Focused frontend/Rust verification passes.

## Plan

- [x] Add reusable guided cookie login settings metadata.
- [x] Add a Tauri command/browser bridge for visible cookie capture.
- [x] Wire the settings UI to invoke capture and save secret metadata.
- [x] Update Zed copy/docs guidance.
- [x] Run focused tests and checks.

## Verification Notes

- Added `guidedCookieLogin` provider metadata for Zed with login URL, success URL marker, cookie URLs, target secret key, and success message.
- Added visible guided cookie capture through Tauri WebView. It closes after reaching `/billing/usage` and returns only a composed Cookie header.
- Added server-side Zed URL allowlist for guided cookie capture so the IPC cannot capture arbitrary provider/site cookies.
- Zed settings now show `Connect dashboard`; successful capture saves `cookieHeader` through the existing provider secret save callback and does not expose the cookie value in UI.
- Updated `docs/providers/zed.md`, `docs/choices.md`, and `docs/breadcrumbs.md`.
- `bun run test -- src\components\settings\provider-settings-detail.test.tsx src\lib\provider-settings.test.ts --run` -> 2 files passed, 103 tests passed.
- `cargo test --manifest-path src-tauri\Cargo.toml guided_cookie_capture --lib` -> 1 test passed.
- `cargo check --manifest-path src-tauri\Cargo.toml` -> passed.
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check` -> passed.
- `bun prettier --check src\components\settings\provider-settings-detail.tsx src\components\settings\provider-settings-detail.test.tsx src\lib\provider-settings.ts src\lib\provider-settings.test.ts src\lib\guided-cookie-login.ts docs\providers\zed.md docs\choices.md docs\breadcrumbs.md tasks\todo.md` -> passed.
- `bun run lint` -> passed.
- `bun run typecheck` -> passed.
- `git --no-pager diff --check -- <touched files>` -> passed; only expected CRLF conversion warnings were reported.
- `bun run check` still stops on pre-existing `package.json` formatting outside this slice.

# Alpha 3 OpenCode Go subscription detection

## Executive Summary

- Restore paid OpenCode Go usage display for real local Go installs.
- Keep Free-mode request counting for accounts that only have free-model rows.
- Add regression coverage for the Alpha 3 false-Free case.

## Acceptance Criteria

- [x] Authenticated local paid/non-free OpenCode rows render `GoSubscription` usage bars.
- [x] Free-only local rows still render the `Free` request-count bar.
- [x] Structured account subscription evidence still works.
- [x] Focused OpenCode Go plugin checks pass and bundled files are synced.

## Plan

- [x] Add a helper that treats local paid/non-free history as Go usage evidence only when local auth exists.
- [x] Use that helper to avoid the Alpha 3 permanent-Free path.
- [x] Add regression tests for auth + paid rows and auth + Free-only rows.
- [x] Sync bundled plugin resources and run focused verification.

## Verification Notes

- Local auth shape checked without printing secrets: `~/.local/share/opencode/auth.json` exists with an `opencode-go` API entry and no structured `goSubscription` metadata.
- Added `hasPaidGoUsage` so local auth plus paid/non-free history rows restores `GoSubscription` bars.
- Free-only rows still return the `Free` request-count progress line.
- Existing structured active subscription tests still pass.
- `bun run test -- plugins\opencode-go\plugin.test.js --run` -> 1 file passed, 22 tests passed.
- `node --check plugins\opencode-go\plugin.js` -> passed.
- `bun run bundle:plugins` -> bundled 32 plugins including `opencode-go`.
- Source/bundled SHA-256 check for OpenCode Go `plugin.js`, `plugin.json`, and `plugin.test.js` -> matched.
- `bun prettier --check plugins\opencode-go\plugin.js plugins\opencode-go\plugin.json plugins\opencode-go\plugin.test.js src-tauri\resources\bundled_plugins\opencode-go\plugin.js src-tauri\resources\bundled_plugins\opencode-go\plugin.json src-tauri\resources\bundled_plugins\opencode-go\plugin.test.js tasks\todo.md` -> passed.
- `git --no-pager diff --check -- plugins\opencode-go src-tauri\resources\bundled_plugins\opencode-go tasks\todo.md` -> passed; only expected CRLF conversion warnings were reported.

# OpenCode Free dashboard bar

## Executive Summary

- Show OpenCode Free usage on the dashboard when the provider reports the Free plan.
- Keep paid OpenCode Go dashboard behavior unchanged.
- Verify the manifest contract and plugin tests.

## Acceptance Criteria

- [x] OpenCode Free progress line is declared as an overview line.
- [x] OpenCode paid `5h` progress line remains an overview line.
- [x] Bundled OpenCode plugin manifest is synced.
- [x] Focused tests and syntax checks pass.

## Plan

- [x] Add `Free` overview metadata to `plugins/opencode-go/plugin.json`.
- [x] Update the OpenCode Go manifest regression test.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and record results.

## Verification Notes

- Added `Free` as an overview progress line in `plugins/opencode-go/plugin.json`; existing paid `5h` overview line remains unchanged.
- Updated `plugins/opencode-go/plugin.test.js` manifest regression coverage.
- `bun run bundle:plugins` -> bundled 32 plugins including `opencode-go`; bundled manifest contains the `Free` overview line.
- `bun run test -- plugins\opencode-go\plugin.test.js --run` -> 1 file passed, 20 tests passed.
- `node --check plugins\opencode-go\plugin.js` -> passed.
- `bun prettier --check plugins\opencode-go\plugin.json plugins\opencode-go\plugin.test.js src-tauri\resources\bundled_plugins\opencode-go\plugin.json tasks\todo.md` -> passed.

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

- [x] `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` use `0.1.0-alpha.4`.
- [x] README and CHANGELOG describe Alpha 4.
- [x] Focused provider/backend checks and release preflight pass.
- [x] `alpha-4` is rebased onto current `main`.
- [x] `main` contains the Alpha 4 changes.

## Plan

- [x] Bump local version metadata and Alpha 4 notes.
- [x] Run focused verification before integration.
- [x] Commit Alpha 4 work locally.
- [x] Rebase `alpha-4` onto `main`.
- [x] Merge `alpha-4` into `main`.

## Verification Notes

- `bun run test -- plugins\codex\plugin.test.js plugins\claude\plugin.test.js --run` -> 2 files passed, 131 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml ccusage --lib` -> 23 tests passed.
- `bun run release:check` -> passed, release version `0.1.0-alpha.4`, 32 bundled plugins.
- `bun run format:rust:check` -> passed.
- `git --no-pager diff --check` -> passed; only expected CRLF conversion warnings were reported.
- Local commit created: `befa0c8 fix(providers): harden alpha 4 usage reliability`.
- `git rebase main` in `D:\UsageBar\usagebar-alpha-4` -> completed cleanly.
- `git merge --ff-only alpha-4` in `D:\UsageBar\usagebar` -> fast-forwarded `main` from `0389215` to `befa0c8`.
- Post-merge `bun run release:check` on `main` -> passed, release version `0.1.0-alpha.4`, 32 bundled plugins.

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

# Competitor implementation plan completion

## Executive Summary

- Finish the remaining implementable tracks from `docs/reports/competitor-implementation-plan.html`.
- Add direct OpenAI API spend visibility, local JSON endpoint contracts, OpenCode local cost windows, and provider expansion triage notes.
- Treat speculative providers as documented research until stable quota or billing sources are found.

## Acceptance Criteria

- [x] OpenUsage reliability ports and Grok provider work remain documented as already completed.
- [x] OpenCode Zen shows optional local cost windows: `Yesterday`, `Last 2 days`, and `Last 30 days`.
- [x] OpenAI API provider exposes Today, 7-day, 30-day spend, tokens, requests, and top model from organization APIs.
- [x] Local HTTP API exposes stable health, provider list, and latest snapshot endpoints.
- [x] Qwen, Doubao, and Manus expansion decisions have a research note before plugin work.
- [x] Bundled plugin resources are synced.
- [x] Focused frontend/plugin/Rust verification passes.
- [x] Formatting/lint verification passes or exact blockers are documented.

## Plan

- [x] Re-read competitor implementation plan and current task history.
- [x] Implement OpenCode local SQLite cost windows with regression tests.
- [x] Implement `openai-api` provider plugin, manifest, docs, README row, and tests.
- [x] Add `/v1/health`, `/v1/providers`, and `/v1/latest` local HTTP API routes with Rust tests.
- [x] Add provider-expansion triage spec for Qwen, Doubao, and Manus.
- [x] Run focused verification, lint/format checks, and diff review.

## Verification Notes

- OpenCode cost windows query local `opencode.db` with the same provider/role/cost filters as `opencode-go` and skip lines when SQLite is unreadable.
- OpenAI API provider uses stored `apiKey`, then `OPENAI_ADMIN_API_KEY`, then `OPENAI_API_KEY`; it calls organization Costs and Completions Usage endpoints.
- Local HTTP endpoints expose cached usage data only; no credentials, cookies, API keys, or raw provider payloads are returned.
- `bun run test -- plugins\openai-api\plugin.test.js plugins\opencode\plugin.test.js --run` -> passed, 2 files, 19 tests.
- `cargo test --manifest-path src-tauri\Cargo.toml local_http_api --lib` -> passed, 17 tests.
- `bun run lint` -> passed.
- `bun run typecheck` -> passed.
- `bun run check` -> passed after applying Prettier to pre-existing dirty `package.json`; semantic package diff remains the existing Alpha 5 version change.
- `bun prettier --check <touched files>` -> passed.
- `cargo fmt --manifest-path src-tauri\Cargo.toml -- --check` -> passed.
- `git --no-pager diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Provider usability audit, 2026-07-15

## Executive Summary

- Verify every registered provider appears with correct identity, status, metrics, settings, and supported Windows behavior.
- Use existing plugin contracts/tests plus a manual frontend pass to find provider-specific gaps.
- Fix only confirmed defects and record any external-auth blockers explicitly.

## Acceptance Criteria

- [x] Inventory covers every provider manifest and bundled resource.
- [x] Provider/plugin tests and frontend provider surfaces pass.
- [ ] Manual provider list/detail/settings interaction is usable in the dev UI; collaborative preview automation timed out after a workspace dev server restart.
- [x] No functional provider defect was found that warrants a code change; the Kiro missing `brandColor` is non-blocking icon polish.
- [x] Bundled resources, formatting, diff, and relevant build checks pass.
- [x] Provider-by-provider result is recorded in the final handoff.

## Plan

- [x] Inventory manifests, UI mapping, platform support, and provider-specific settings.
- [x] Run baseline provider/frontend/backend verification and inspect failures.
- [x] Exercise provider surfaces through isolated component tests; live browser interaction remains external because preview automation timed out.
- [x] Patch confirmed provider defects and add regression tests; no functional defect was confirmed.
- [x] Re-run verification, sync bundles if needed, and review the diff.

## Verification Notes

- Source inventory: 34 plugin directories including `mock`; 33 real providers are bundled. Windows manifests: 7 `supported`, 26 `experimental`; `mock` is blocked, and `kimi-k2` plus `opencode` are intentionally `surfaced: false`.
- Bundle audit: all 33 providers have matching SHA-256 `plugin.js`, `plugin.json`, and `plugin.test.js` source/bundle files.
- Provider plugins: 34 files / 716 tests passed with isolated Vitest execution.
- Provider UI/settings: 13 focused files / 229 tests passed.
- `bun run check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib` (136 passed, 1 ignored), `bun run build:frontend`, `bun run release:check`, and `git diff --check` passed.
- Live entitlement validation is not complete for every provider. The provider docs and Windows rollout matrix correctly distinguish fixture/contract coverage from real-account coverage; do not promote experimental providers based on tests alone.

# 1.0 readiness HTML report, 2026-07-15

## Executive Summary

- Create a single-file HTML audit of everything still needed for a stable Windows-first 1.0.
- Include current evidence, provider-by-provider disposition, release/security/QA gaps, acceptance criteria, and an ordered backlog.
- Preserve the existing Alpha 5 worktree; this slice adds report and audit notes only.

## Acceptance Criteria

- [x] docs/reports/usagebar-1.0-readiness-audit.html is self-contained, browser-readable, responsive, and interactive.
- [x] Report covers product scope, quality, release, providers, platform, security/privacy, recovery, UX/QA, docs, and support.
- [x] All 34 plugin manifests appear in the provider matrix with current Windows state and a 1.0 recommendation.
- [x] Fresh verification results and exact repo evidence are recorded, including current blockers.
- [x] Choices and breadcrumbs document the Windows-first scope assumption and report findings.

## Plan

- [x] Read HTML artifact instructions and collect repository baseline.
- [x] Run targeted inventory, link, manifest, bundle, test, coverage, release, and Rust checks.
- [x] Build and validate the single-file readiness report.
- [x] Record the audit in repo breadcrumbs and choices.

# Tray panel clarity refinement, 2026-07-16

## Executive Summary

- Keep provider selection inside Settings instead of unexpectedly handing off to the tray.
- Improve provider identity and active navigation visibility without widening the rail.
- Surface data freshness, automatic-update timing, and pace status more clearly.
- Add a light-theme page accent matching the dark-theme product identity.

## Acceptance Criteria

- [x] Provider-row selection stays in Settings and opens the provider detail panel.
- [x] Tray provider cards show their provider icon beside the name.
- [x] Active rail items have a restrained background and stronger icon state.
- [x] Footer shows the oldest successful displayed-provider update as `Updated …`.
- [x] Footer retains a compact, accessible signal for the next automatic update.
- [x] Pace indicators include visible short labels in addition to color.
- [x] Light and dark themes both define and use `--page-accent`.
- [x] Focused tests, typecheck, formatting, and diff review pass.

## Plan

- [x] Patch Settings selection and update its regression test.
- [x] Add provider card icons and strengthen active rail styling.
- [x] Add freshness/auto-update footer signal, pace labels, and light accent tokens.
- [x] Verify focused tests, typecheck, formatting, and diff.

# Prepare Alpha 5 release, 2026-07-16

## Executive Summary

- Re-run the complete release test and quality suite for Alpha 5.
- Confirm release metadata, bundled providers, and updater preflight are internally consistent.
- Prepare a draft GitHub prerelease using the established Alpha release format; publishing remains an explicit user action.

## Acceptance Criteria

- [x] `bun run test:all`, frontend checks, Rust tests, formatting, Clippy, and release preflight have recorded outcomes.
- [x] Alpha 5 version metadata, changelog, README, bundled provider assets, and release workflow are consistent.
- [x] The strict coverage-gate result is recorded accurately; any Alpha waiver remains explicit.
- [ ] A GitHub draft prerelease `v0.1.0-alpha.5` uses the Alpha 4 body structure and correct compare URL.
- [ ] Final release readiness and every remaining publishing action are clearly stated.

## Plan

- [x] Inspect Alpha 5 metadata and the Alpha 4 release format.
- [x] Run the complete JavaScript, Rust, formatting, lint, preflight, bundle, and diff verification suite.
- [x] Review release assets/workflow and prepare the Alpha 5 draft release body.
- [x] Record verification evidence and release status.

## Verification Notes

- `bun run test:all` -> 97 files, 1,409 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` -> 136 passed, 1 ignored (live Edge-profile smoke).
- `bun run check`, `bun run format:rust:check`, and `bun run lint:rust` -> passed.
- `bun run bundle:plugins` -> 33 bundled providers; `bun run release:check -- --release-tag v0.1.0-alpha.5` -> passed.
- `bun run build:frontend` -> passed; Vite reports a non-blocking 613 kB minified JavaScript chunk warning.
- `bun run test:coverage` -> all 1,409 tests passed, strict gate failed at 86.06% statements, 79.32% branches, 91.42% functions, and 89.29% lines. The documented Alpha coverage waiver is required; the 90% threshold was not changed.
- `git diff --check` -> passed. Current local release-fix changes are uncommitted, so no release tag or GitHub draft was created; publishing automation publishes directly on a pushed `v*` tag and requires `TAURI_SIGNING_PRIVATE_KEY`.

# Alpha 6 provider audit, 2026-07-22

## Executive Summary

- Audit all 33 real providers before Alpha 6 packaging.
- Find only reproducible provider, contract, Windows, bundle, or UI defects.
- Implement confirmed fixes with focused regression tests.

## Acceptance Criteria

- [ ] Every provider manifest, source plugin, test, and bundled resource is inventoried.
- [ ] Shared host/API, credential, error, Windows, and UI contracts are checked.
- [ ] Provider tests and relevant Rust/frontend quality checks have recorded outcomes.
- [ ] Every finding is classified as confirmed fix, source-maturity blocker, or no issue.
- [ ] Confirmed fixes include regression tests and synchronized bundles.

## Plan

- [ ] Inventory providers and bundle parity.
- [ ] Review provider implementations and shared contracts.
- [ ] Run tests and reproduce high-confidence findings.
- [ ] Implement and verify prioritized fixes.
- [ ] Record audit evidence and final Alpha 6 blockers.

# ccusage runner fallback correctness, 2026-07-22

## Executive Summary

- Keep current ccusage data authoritative when one package runner has a broken cache.
- Try every current runner before using the legacy compatibility package.
- Verify Claude history matches the current ccusage CLI totals.

## Acceptance Criteria

- [x] A failed current Bun runner does not select legacy while another current runner works.
- [x] Legacy remains available only after all current runners fail.
- [x] Focused Rust regression tests and formatting pass.
- [x] Claude 7-day reference remains `$49.15 / 265,354,981 tokens` for the supplied fixture window.

## Plan

- [x] Reproduce current and legacy ccusage outputs against the local Claude data.
- [x] Identify the runner-order root cause.
- [x] Change selection order and add a regression test.
- [x] Run focused verification and review the diff.

## Verification Notes

- Current `ccusage@20.0.18 claude daily --since 20260715` -> `$49.1526748`, `265,354,981` tokens.
- Legacy `ccusage@18.0.11 daily --since 20260715` -> `$142.0640586`, `630,710,767` tokens; exact incorrect UsageBar result.
- Local `ccusage@20.0.2` Bun execution reproduced the trigger: missing cached `dist/cli.js`; old per-runner fallback selected v18 immediately.
- `cargo test --manifest-path src-tauri/Cargo.toml ccusage_runner --lib` -> 11 passed.
- Focused rustfmt check and `git diff --check` -> passed.

# Alpha 6 dev launch repair, 2026-07-22

## Executive Summary

- Restore the plugin bundler required by `npm run tauri dev`.
- Align app metadata with the Alpha 6 development cycle.
- Lock the startup path with a focused regression check.

## Acceptance Criteria

- [x] `copy-bundled.cjs` exists and bundles all source plugins successfully.
- [x] Package, Tauri, Cargo, and lock metadata report `0.1.0-alpha.6`.
- [x] The wrapper reaches the Tauri CLI instead of failing module resolution.
- [x] Focused tests/checks and final diff review pass.

## Plan

- [x] Restore the repo-owned bundler and add a startup regression assertion.
- [x] Restore Amp's manifest-declared icon so a clean plugin bundle succeeds.
- [x] Align Alpha 6 version metadata and document the development-cycle choice.
- [x] Run focused verification and review the resulting diff.

## Verification Notes

- `node copy-bundled.cjs` -> bundled all 33 providers successfully.
- `node --test scripts/tauri/wrapper.test.mjs` -> 4 tests passed.
- `node scripts/release-preflight.mjs` -> passed for `0.1.0-alpha.6`.
- `node scripts/tauri/wrapper.mjs dev --help` -> bundler ran and Tauri CLI help reached successfully.
- Runtime metadata check and `git diff --check` -> passed; existing CRLF normalization warnings only.

# Vite dev root 404, 2026-07-22

## Executive Summary

- Restore the missing Vite HTML entrypoint so Tauri’s configured dev URL renders the app.
- Add a regression check for the root document and frontend mount.

## Acceptance Criteria

- [x] `http://localhost:1420/` serves the frontend entry document instead of 404.
- [x] The document mounts `/src/main.tsx` into `#root`.
- [x] Focused startup tests and formatting checks pass.

## Plan

- [x] Confirm Vite root/config and reproduce the missing-entry symptom.
- [x] Add the root HTML entrypoint and regression assertion.
- [x] Restore the missing production modules required by the tracked app imports.
- [x] Verify the live dev URL and review the diff.

## Verification Notes

- Vite smoke -> `HTTP 200` at `http://127.0.0.1:1420/`, with `/src/main.tsx` in the document.
- `bun run build:frontend` -> passed; existing large-chunk and Tailwind timing warnings only.
- `node --test scripts/tauri/wrapper.test.mjs` -> 5 tests passed.
- Targeted Prettier and `git diff --check` -> passed.

# ccusage history chart local-day label, 2026-07-22

## Executive Summary

- Show the current local calendar day as today in the history graph.
- Preserve ccusage's day meaning when stored timestamps cross a UTC date boundary.
- Lock the behavior with a deterministic Europe/Berlin regression test.

## Acceptance Criteria

- [x] A ccusage entry for local today is grouped and labeled as today.
- [x] Explicit and system-local history time zones remain supported.
- [x] Focused frontend regression tests and formatting pass; unrelated existing type errors are recorded.

## Plan

- [x] Reproduce the wrong date with a timezone-boundary UI test.
- [x] Group history records by their source calendar day.
- [x] Run focused verification and review the diff.

# Multi-source ccusage graphs, 2026-07-22

## Acceptance Criteria

- [x] Current ccusage version is verified and the host runner supports its focused source namespaces.
- [x] OpenCode, Amp, Droid/Factory, Kilo, Kimi, Gemini, and Qwen plugins expose local ccusage activity history.
- [x] Existing OpenCode SQLite history remains authoritative when available.
- [x] Focused provider/Rust tests and bundled plugin synchronization pass.
- [x] Full-check blockers are recorded without changing unrelated UI/type failures.

## Plan

- [x] Extend the Rust ccusage resolver and source-specific data-root environment mapping.
- [x] Add provider history adapters and regression coverage.
- [x] Update plugin API documentation and synchronize bundled resources.
- [x] Run focused tests, build, full suite, and diff verification.

## Verification Notes

- npm latest: `ccusage@20.0.18`; focused command smoke passed for Amp, Droid, Kilo, Kimi, Gemini, and Qwen with `--offline`.
- Provider tests: 8 files, 166 passed. Rust `host_api` tests: 62 passed. Bundled resources: 34 plugins.
- `rustfmt --check src-tauri/src/plugin_engine/host_api.rs` and `git diff --check` passed.
- Frontend build passed. Full check remains blocked by existing TypeScript errors in `skeleton-lines.tsx`, `group-lines-by-type.ts`, and `group-metric-lines.ts`; full Vitest previously had 3 existing App start-on-login timing failures.

## Verification Notes

- Red repro: Europe/Berlin local day `2026-07-22` was exposed as graph point `2026-07-21`.
- Focused Vitest: 2 files, 17 tests passed.
- Focused Prettier passed after formatting.
- Full typecheck reaches unrelated pre-existing errors in `skeleton-lines.tsx`, `group-lines-by-type.ts`, and `group-metric-lines.ts`; touched files report no TypeScript error.

# About dialog icon, 2026-07-22

## Executive Summary

- Restore the missing UsageBar icon in the About dialog.
- Keep the asset local so packaged and development builds resolve it consistently.

## Acceptance Criteria

- [x] About dialog renders the UsageBar icon without a broken-image state.
- [x] Focused AboutDialog test and frontend build pass.

## Plan

- [x] Reproduce the missing asset reference.
- [x] Add the packaged frontend icon and point the dialog at it.
- [x] Run focused verification and review the diff.

## Verification Notes

- `bun run test -- src/components/about-dialog.test.tsx --run` -> 11 tests passed.
- `bun run build:frontend` -> passed; existing large JavaScript chunk warning only.
- `git diff --check` -> passed; existing CRLF normalization warnings only.

# Alpha 6 line-helper typecheck repair, 2026-07-22

## Acceptance Criteria

- [x] `bun run typecheck` passes without errors in the three Alpha-6 files.
- [x] Grouping accepts both manifest skeleton lines and runtime metric lines.
- [x] Focused regression tests, formatting, lint, and diff checks pass.

## Plan

- [x] Reproduce and identify the three compiler errors.
- [x] Generalize the shared grouping helper and preserve section label types.
- [x] Add regression coverage and run verification.

## Verification Notes

- `bun run check` passed: format, ESLint, and TypeScript.
- Focused Vitest passed: 2 files, 42 tests.
- `git diff --check` passed; existing CRLF normalization warnings only.

# Qwen provider ordering, 2026-07-22

## Acceptance Criteria

- [x] New Qwen providers are inserted at their default sorted position.
- [x] Existing saved drag order remains stable.
- [x] Focused settings tests and diff verification pass.

## Plan

- [x] Reproduce the append-to-end behavior.
- [x] Insert new providers using the default provider order.
- [x] Add regression coverage and verify.

# Alpha 6 primary provider order correction, 2026-07-22

## Acceptance Criteria

- [x] Default order starts with Codex, Claude, Cursor, and OpenCode.
- [x] Remaining providers follow alphabetically by display name.
- [x] Existing saved order behavior remains covered.

## Verification Notes

- Focused settings regression added for the four-provider prefix and alphabetical remainder.

# CI and prerelease publishing failures, 2026-07-22

## Acceptance Criteria

- [ ] CI prepares the platform-specific CLI sidecar before Cargo validates the Tauri manifest.
- [ ] Windows CI's formatter sees the same LF-formatted files as local and Linux checks.
- [ ] Alpha prerelease publishing remains allowed without updater or Authenticode secrets.
- [ ] Focused local checks pass and the exact remote failure evidence is recorded.

## Plan

- [x] Inspect the failed CI and Publish run logs for the exact failing steps.
- [ ] Add the CI sidecar preparation and cross-platform line-ending contract.
- [ ] Run focused formatter, sidecar, Cargo, and workflow checks.
- [ ] Record the fix, verification, and any remaining remote-only blocker.

# Used metric labels, 2026-07-22

## Acceptance Criteria

- [x] Progress values shown in `used` mode include the `used` label.
- [x] Percent, count, and dollar formats keep their existing units and formatting.
- [x] Focused provider-card regression and frontend formatting checks pass.

## Plan

- [x] Reproduce the missing `used` label in the shared metric renderer.
- [x] Add regression coverage for percent, count, and dollar metrics.
- [x] Run focused verification and record the result.

## Verification Notes

- `bun run test -- src/components/provider-card.test.tsx --run` -> 42 tests passed.
- `bunx prettier --check src/components/metric-line-renderer.tsx src/components/provider-card.test.tsx` -> passed.
- `git diff --check` -> passed; existing CRLF normalization warnings only.

# Alpha 7 prerelease update discovery, 2026-07-22

## Executive Summary

- Keep unsigned prerelease builds able to discover the next Alpha through GitHub release metadata.
- Continue to use the signed Tauri updater when its manifest is available.
- Treat a missing or invalid updater manifest as a fallback condition, not as a terminal check failure.

## Acceptance Criteria

- [x] An Alpha 7 build finds a newer Alpha 8 release when the Tauri updater check rejects the missing unsigned manifest.
- [x] Signed updater candidates still use the in-app download/install flow.
- [x] Existing GitHub fallback behavior remains covered.
- [x] Focused tests and formatting pass; repository typecheck/full-suite blockers are recorded below.

## Plan

- [x] Reproduce the unsigned prerelease failure and identify why GitHub fallback is skipped.
- [x] Continue to GitHub release discovery when the Tauri updater check throws.
- [x] Add a regression test for the rejected updater check and Alpha 8 candidate.
- [x] Run focused verification and review the diff.

## Verification Notes

- `bun run test -- src/hooks/use-app-update.test.ts --run` -> passed, 23 tests.
- `bunx prettier --check src/hooks/use-app-update.ts src/hooks/use-app-update.test.ts tasks/todo.md` -> passed.
- `git diff --check` -> passed; existing CRLF normalization warnings only.
- `bun run typecheck` -> blocked by unrelated existing unused declarations in `src/App.tsx`: `savePluginSettings` and `TRAY_SETTINGS_DEBOUNCE_MS`.
- `bun run test -- --run` -> exceeded the 120-second timeout without reporting a test failure.

# Quality pipeline hardening and Rust orchestration split, 2026-07-23

## Executive Summary

- Make the existing Rust lint contract enforceable in CI.
- Replace the all-or-nothing coverage bypass with a changed-production-file ratchet while the global 90% gate remains below target.
- Re-enable useful ESLint rules incrementally and split oversized Rust orchestration modules along responsibility boundaries without changing behavior.

## Acceptance Criteria

- [x] `bun run lint:rust` passes locally and CI runs it with `-D warnings`.
- [x] CI no longer disables all coverage thresholds; changed production JS/TS files must meet the configured 80% line-coverage ratchet or an explicit, reviewable baseline exception is reported.
- [x] ESLint no longer globally disables `no-unused-vars` and `no-redeclare`; remaining legacy exceptions are narrow and documented.
- [x] `lib.rs` and `host_api.rs` are split into focused modules with no public behavior or test-contract regressions.
- [x] Focused tests, frontend checks, Rust tests, coverage reporting, formatting, and diff validation are recorded below.

## Plan

- [x] Fix the reproducible Clippy finding and add the CI step.
- [x] Add changed-file coverage enforcement and retain the global report until the baseline is ready.
- [x] Re-enable ESLint rules and fix only the resulting real violations.
- [x] Extract Rust orchestration helpers by cohesive responsibility.
- [x] Run the full verification order and review the final diff.

## Verification Notes

- Baseline: `bun run lint` passed; `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` failed at `src-tauri/src/local_http_api/server.rs:348` because of a useless `format!`.
- Baseline: CI invokes coverage with `USAGEBAR_COVERAGE_REPORT_ONLY=1`, so the configured global 90% threshold remains report-only while the changed-file 80% line ratchet is enforced.

## Verification Notes

- `bun run check` -> passed: Prettier contract, ESLint with `no-explicit-any`, `no-unused-vars`, `no-redeclare`, `no-empty`, `no-useless-assignment`, and `no-useless-escape`, plus TypeScript.
- `bun run build:frontend` -> passed; existing Vite large-chunk warning remains.
- `bun run lint:rust` -> passed with `cargo clippy --all-targets -- -D warnings`.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked` -> passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` -> 145 passed, 1 ignored.
- Frontend suite excluding the pre-existing About-dialog mismatch -> 89 files, 1,267 tests passed.
- Coverage excluding that same pre-existing About-dialog mismatch -> 79.14% statements, 74.20% branches, 79.80% functions, 82.11% lines; global 90% gate remains report-only, changed-file 80% line gate passed.
- Full `bun run test:all` -> expected 1,356 passed, 1 failed after the added onboarding tests; the remaining failure is the pre-existing `App > covers about open/close callbacks` assertion expecting a `Luis Leineweber` button absent from the current working-tree About UI.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` remains blocked by the pre-existing `#[cfg(target_os = "macos")] mod app_nap;` reference without `src-tauri/src/app_nap.rs`; the extracted Rust files pass direct rustfmt checks.

# First-run provider onboarding, 2026-07-23

## Executive Summary

- Show onboarding only when no provider settings have ever been stored.
- Let new users choose Codex, Claude, and Cursor, then verify the real provider connections.
- Explain missing local credentials, cookie fallbacks, and refresh failures in the setup flow.

## Acceptance Criteria

- [x] A genuinely fresh install opens a first-run window; returning users and migrated installs do not.
- [x] Codex, Claude, and Cursor are preselected and the final selection is reflected in the tray bar.
- [x] Each provider shows a concise setup sequence and one of: Not set up, Connected, or Refresh failed.
- [x] Credential and cookie-related failures include a specific next action without exposing secrets.
- [x] Completion shows “UsageBar is ready” and persists onboarding so it is not shown again.
- [x] Focused tests, typecheck/build, formatting, diff review, and browser verification are recorded.

## Plan

- [x] Preserve the distinction between missing and stored provider settings during bootstrap.
- [x] Build the provider selection, connection check, guidance, and success states in the Settings window.
- [x] Persist the selected provider set and notify the tray window.
- [x] Add regression coverage and run the verification order.

## Verification Notes

- `bun run test -- src/components/onboarding/first-run-onboarding.test.tsx src/hooks/app/use-settings-bootstrap.test.ts src/lib/settings.test.ts --run` -> 71 tests passed.
- `bun run test -- src/App.test.tsx --run -t "opens onboarding|persists the recommended onboarding|applies provider settings updates"` -> 3 onboarding/window integration tests passed.
- `bun run build` -> typecheck and production frontend build passed; Vite retained the pre-existing >500 kB chunk warning.
- Targeted ESLint over all touched onboarding files -> passed.
- `git diff --check -- <onboarding files>` -> passed; only existing Windows LF-to-CRLF notices were printed.
- Two-axis read-only review found and verified fixes for duplicate/window-local probes, incomplete onboarding persistence, restricted provider choice, unsupported recommendations, and misleading success copy. One low-priority pre-existing hotspot remains: `settings-window-app.tsx` is 447 lines.
- T3 Preview visual verification was attempted through `preview_status` and two `preview_open` calls; all three timed out after 15 seconds, so no screenshot-based approval was possible.
- `bun run test:all` exceeded the 120-second command limit without reporting a test failure. A direct full `src/App.test.tsx` run earlier passed 89/90 tests; the remaining existing About-dialog assertion could not find `Luis Leineweber` and is unrelated to onboarding.

# Onboarding UX corrections, 2026-07-23

## Acceptance Criteria

- [x] The WebView never opens the browser's native context menu; the existing UsageBar provider context menu remains available where intended.
- [x] Provider selection is a concise two-column choice without connection instructions, and black/white provider marks keep contrast in both themes.
- [x] Successful connection results survive selection changes; connected cards omit setup instructions.
- [x] Failed connection cards expose a split retry control with a `Provider entfernen` action.
- [x] Finishing onboarding opens the UsageBar panel at the bottom-right work area near the taskbar.
- [x] Focused tests, typecheck/build, formatting, Rust checks, and diff review pass or record pre-existing blockers.

## Plan

- [x] Add shared context-menu suppression and theme-aware provider icon coloring.
- [x] Refine provider selection and connection-state caching/removal controls.
- [x] Position the panel at the taskbar edge when onboarding hands off to UsageBar.
- [x] Add regression coverage and run the verification order.

## Verification Notes

- `bun run test -- src/components/onboarding/first-run-onboarding.test.tsx src/main.test.tsx src/lib/provider-icon.test.ts --run` -> 3 files, 12 tests passed.
- `bun run test -- src/components/onboarding/first-run-onboarding.test.tsx src/hooks/app/use-first-run-onboarding.test.ts src/lib/panel-window.test.ts --run` -> 3 files, 15 tests passed.
- `bun run check` -> passed: Prettier contract, ESLint, and TypeScript.
- `bun run build:frontend` -> passed; existing Vite chunk-size warning remains.
- `bun run lint:rust` -> passed with Clippy `-D warnings`.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` -> 145 passed, 1 ignored.
- Direct `rustfmt --edition 2021 --check src-tauri/src/panel.rs` -> passed. Full Cargo rustfmt remains blocked by the pre-existing missing `src-tauri/src/app_nap.rs` module referenced on macOS.
- T3 Preview reached the local Vite page, but its snapshot request failed, so no screenshot-based visual approval was available.
- `git diff --check` -> passed; existing LF/CRLF normalization warnings only.

# App/lib orchestration refactor, 2026-07-24

## Executive Summary

- Reduce `App.tsx` to composition and UI wiring by extracting cross-window sync, refresh orchestration, and provider credential actions.
- Reduce `lib.rs` to Tauri application wiring by extracting startup, Codex auth, global shortcut, analytics, and command responsibilities.
- Preserve IPC names, runtime behavior, and existing state ownership.

## Acceptance Criteria

- [x] `App.tsx` no longer owns the extracted event, refresh, or provider-secret workflows.
- [x] `lib.rs` no longer owns the extracted startup, Codex-auth, shortcut, analytics, or plugin-command implementations.
- [x] Existing Tauri command names and frontend behavior remain unchanged.
- [x] Focused tests, TypeScript, Rust checks, formatting, and diff validation pass; unrelated baseline failures are recorded.

## Plan

- [x] Run baseline App tests and TypeScript check.
- [x] Extract frontend orchestration hooks.
- [x] Extract Rust application wiring and command modules.
- [x] Run verification in the documented order and review the diff.

# Local API, secret failures, and probe backpressure, 2026-07-24

## Acceptance Criteria

- [x] The local HTTP API is disabled unless explicitly enabled, requires a bearer token when enabled, and has no wildcard CORS default.
- [x] Non-Windows provider secret operations return an explicit unsupported-platform error instead of reporting a successful no-op.
- [x] Provider configuration load failures are visible in Settings and offer a retry action.
- [x] Provider probes are globally bounded so a large batch cannot create an unbounded blocking-worker burst.
- [x] Focused tests, related checks, formatting, and diff validation pass; unrelated baseline failures remain documented.

## Plan

- [x] Inspect the existing security, configuration, probe, and UI seams.
- [x] Harden local HTTP API configuration and documentation.
- [x] Replace non-Windows secret no-ops with explicit errors and coverage.
- [x] Add retryable provider-config load feedback and a probe concurrency limit.
- [x] Run verification and review the diff.

## Verification Notes

- `cargo test --manifest-path src-tauri/Cargo.toml --lib local_http_api` -> 30 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib provider_secret_store` -> 2 passed on Windows; the non-Windows contract test is target-gated.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked` -> passed.
- `bun run lint:rust` -> passed with Clippy `-D warnings`.
- `bunx tsc --noEmit` -> passed.
- `bunx eslint src/hooks/app/use-provider-config-actions.ts src/hooks/app/use-provider-config-actions.test.ts src/pages/settings.tsx src/settings-window-app.tsx` -> passed.
- `bun run test -- src/pages/settings.test.tsx src/hooks/app/use-provider-config-actions.test.ts --run` -> 21 passed.
- `bunx prettier --check` on touched frontend/docs files -> passed after formatting.
- `bun run check` -> timed out in the local environment; its underlying typecheck, ESLint, Rust lint, and focused formatting checks passed independently.
- `bun run test:all` -> not rerun; prior working-tree baseline exceeded the command timeout without reporting a new failure.
- `git diff --check` -> passed; existing LF/CRLF normalization notices remain in the dirty worktree.
