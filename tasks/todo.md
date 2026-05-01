# Deep research hardening roadmap

# Fix review findings: Kimi balance format and updater fallback

## Executive Summary
- Make Moonshot/Kimi balance rows render as normal dollar progress rows.
- Keep stable signed-updater checks from depending on GitHub release API availability.
- Cover the fixes with focused plugin and updater tests.

## Acceptance Criteria
- [x] Kimi optional API balance uses a frontend-supported progress format.
- [x] Moonshot API Balance uses a frontend-supported progress format.
- [x] Stable builds do not show an update-check error when signed updater says no update and GitHub fallback fails.
- [x] Focused plugin/updater regression tests pass.

## Plan
- [x] Patch Kimi and Moonshot progress lines from unsupported `currency` to existing `dollars`.
- [x] Add/adjust focused plugin expectations for dollar format.
- [x] Make GitHub release fallback non-fatal after a successful signed updater no-update result and add coverage.
- [x] Run focused tests and record verification.

## Verification Notes
- Updated `plugins/kimi/plugin.js` and `plugins/kimi-k2/plugin.js` so Moonshot balance progress rows use the existing frontend-supported `dollars` format.
- Added/updated focused plugin expectations in `plugins/kimi/plugin.test.js` and `plugins/kimi-k2/plugin.test.js`.
- Updated `src/hooks/use-app-update.ts` so GitHub release fallback failures are warning-only after the signed Tauri updater path is available and returns no eligible update.
- Added `src/hooks/use-app-update.test.ts` coverage for stable signed-updater no-update behavior when the GitHub fallback is rate-limited/unavailable.
- Verified plugins with `npx bun run test -- plugins/kimi/plugin.test.js plugins/kimi-k2/plugin.test.js --run` -> 2 files passed, 31 tests passed.
- Verified updater with `npx bun run test -- src/hooks/use-app-update.test.ts --run` -> 1 file passed, 23 tests passed.
- Verified TypeScript with `npx tsc --noEmit` -> passed.

# Stabilize tray icon and audit app icon identity

## Executive Summary
- Keep the tray icon as UsageBar identity instead of changing with the selected provider/tab.
- Remove the settings control that implied the tray icon could be provider/progress-driven.
- Check packaged icon assets for inherited OpenUsage branding before release.

## Acceptance Criteria
- [x] Tray icon stays on the stable UsageBar app/tray resource during provider changes.
- [x] Tray tooltip can still reflect usage summary without changing the icon art.
- [x] The visible Settings UI no longer exposes a dead menubar-icon style picker.
- [x] Packaged icon assets are audited for UsageBar vs OpenUsage identity.
- [x] Focused tests, Rust check, and frontend build pass.

## Plan
- [x] Refactor runtime tray updates to set stable icon/title/tooltip only.
- [x] Remove the Menubar Icon selector from General Settings.
- [x] Update focused tests for stable tray icon behavior.
- [x] Inspect icon resources and record findings.
- [x] Run verification.

## Verification Notes
- Updated `src/hooks/app/use-tray-icon.ts` so provider/probe/active-view changes set the stable app/tray resource, template flag, tooltip, and optional native title only; they no longer call `renderTrayBarsIcon` or swap provider/progress art into the native tray.
- Removed the visible `Menubar Icon` selector from `src/components/settings/general-settings-pane.tsx` and its props through `SettingsPage` / `AppContent`.
- Kept old menubar-icon storage/migration paths for compatibility, but they no longer affect tray icon art.
- Audited icon resources: `src-tauri/icons/*.png` are lime UsageBar gauge assets, `src-tauri/icons/icon.ico` loads as `256x256`, `public/favicon.svg` is the gauge mark, and `src-tauri/tauri.conf.json` points at the UsageBar icon set. `tray-icon.png` is the only black asset and is now macOS-template-only.
- Focused tests: `npx bun run test -- src/App.test.tsx src/pages/settings.test.tsx src/components/app/app-content.test.tsx src/lib/tray-bars-icon.test.ts src/hooks/app/use-tray-icon.test.ts -t "tray icon|tray resource|menubar icon|display preference|General|AppContent" --run` -> 5 files passed, 19 tests passed.
- TypeScript check: `npx tsc --noEmit` -> passed.
- Rust check: `cargo check --manifest-path src-tauri\\Cargo.toml` -> passed.
- Frontend build: `npx bun run build` -> passed; existing Tailwind plugin timing and >500 kB chunk warnings remain.

# Fix Windows tray icon template/color behavior

## Executive Summary
- Keep the current macOS template tray PNG because it is already above Windows high-DPI minimum size.
- Use the existing colored app icon for Windows startup/fallback tray state.
- Stop treating Windows tray icons like macOS template icons.
- Make runtime-rendered Windows tray icons use a visible brand-colored foreground.

## Acceptance Criteria
- [x] Rust tray bootstrap uses template mode only on macOS.
- [x] Frontend runtime tray updates use template mode only on macOS.
- [x] Non-mac runtime tray SVGs render with the UsageBar lime foreground instead of black mask pixels.
- [x] Focused icon tests and a Rust compile check pass.

## Plan
- [x] Confirm current tray asset dimensions and code paths.
- [x] Add platform-aware template handling in Rust and frontend tray updates.
- [x] Add configurable foreground color to runtime tray icon rendering.
- [x] Record the choice/breadcrumb and run focused verification.

## Verification Notes
- Measured `src-tauri\\icons\\tray-icon.png` as `44x44` and `src-tauri\\icons\\icon.png` as `512x512` with `System.Drawing`; no static asset resize was needed.
- Updated `src-tauri/src/tray.rs` so the initial tray icon uses template mode and `icons/tray-icon.png` only on macOS; Windows/non-mac uses the existing colored `icons/icon.png`.
- Added `icons/icon.png` to bundled resources for the non-mac tray fallback path.
- Updated `src/hooks/app/use-tray-icon.ts` so runtime tray updates use template mode only on macOS; Windows/non-mac fallback resolves `icons/icon.png` and generated updates render with `#B6F36A`.
- Added focused coverage in `src/hooks/app/use-tray-icon.test.ts`, `src/lib/tray-bars-icon.test.ts`, and the existing tray resource App test.
- Verified with `npx bun run test -- src/lib/tray-bars-icon.test.ts src/hooks/app/use-tray-icon.test.ts src/App.test.tsx -t "tray icon|tray resource|foreground|template" --run` -> 3 files passed, 8 tests passed.
- Verified Rust with `cargo check --manifest-path src-tauri\\Cargo.toml` -> passed.
- Verified frontend build with `npx bun run build` -> passed; existing Tailwind plugin timing and >500 kB chunk warnings remain.

# Keep bar open when opening Settings

## Executive Summary
- Opening Settings should not make the UsageBar tray panel disappear.
- Settings remains a separate window, but the bar stays visible behind or beside it.
- Keep the change narrow to the shared Settings-window backend path.

## Acceptance Criteria
- [x] Opening Settings from the bar does not hide the `main` tray panel.
- [x] Opening Settings from the tray menu does not hide the `main` tray panel.
- [x] Focused verification confirms no remaining forced hide in the Settings open path.

## Plan
- [x] Remove the forced `main` window hide from `settings_window::open`.
- [x] Verify the Settings open path no longer calls `window.hide()` on `main`.
- [x] Record the bug-fix lesson before marking this slice done.

## Verification Notes
- Removed the forced `main` panel hide from `src-tauri/src/settings_window.rs`; this shared backend function is used by both frontend `open_settings_window` and tray-menu `Go to Settings`.
- Verified no `window.hide()` remains in `src-tauri/src/settings_window.rs` with a focused literal search.
- Verified Rust compilation with `cargo check --manifest-path src-tauri\\Cargo.toml` -> passed.


# Classify Z.ai and Warp endpoint provenance

## Executive Summary
- Keep Z.ai and Warp available as experimental providers.
- Make the docs honest that the current usage paths are internal or undocumented, even though the domains are legitimate.
- Separate public API docs from reverse-engineered app/subscription endpoints so users understand the support risk.

## Acceptance Criteria
- [x] Z.ai docs distinguish official public API base URLs from the undocumented subscription/quota endpoints used by the plugin.
- [x] Warp docs distinguish official Oz API endpoints from the undocumented app GraphQL request-limit endpoint used by the plugin.
- [x] Provider source-evaluation notes no longer call these integrations strong/public without naming the endpoint provenance risk.
- [x] Focused docs checks and plugin tests pass.

## Plan
- [x] Verify current plugin endpoints and official docs.
- [x] Patch provider docs, implementation notes, and source-evaluation wording.
- [x] Record the default in choices/breadcrumbs.
- [x] Run focused text checks and Z.ai/Warp plugin tests.

## Verification Notes
- Verified official docs by checking Z.ai's public API reference (`https://api.z.ai/api/paas/v4`, GLM Coding `https://api.z.ai/api/coding/paas/v4`) and Warp's public Oz API docs (`https://app.warp.dev/api/v1/agent/run` examples plus public API rate-limit docs).
- Updated `docs/providers/zai.md`, `docs/providers/warp.md`, `README.md`, `docs/specs/provider-source-evaluation-2026-03-16.md`, `docs/provider-input-simulation.md`, `plugins/warp/IMPLEMENTATION.md`, and Warp setup copy in `src/lib/provider-settings.ts`.
- Text check: `rg -n "undocumented|public API|api/paas/v4|api/coding/paas/v4|GetRequestLimitInfo|graphql/v2|endpoint provenance|documented public" README.md docs/providers/zai.md docs/providers/warp.md docs/specs/provider-source-evaluation-2026-03-16.md docs/provider-input-simulation.md plugins/warp/IMPLEMENTATION.md src/lib/provider-settings.ts docs/choices.md docs/breadcrumbs.md`.
- Plugin tests: `npx bun run test -- plugins/zai/plugin.test.js plugins/warp/plugin.test.js --run` -> 2 files passed, 34 tests passed.
- Settings copy test: `npx bun run test -- src/components/settings/provider-settings-detail.test.tsx --run` -> 1 file passed, 22 tests passed.

# Fix tray display preference sync from Settings

## Executive Summary
- Make display preference changes from Settings reach the existing tray/bar window.
- Preserve the current theme, used/left, reset timer, and menubar icon behavior.
- Fix donut menubar icon style so it renders as one icon instead of two side-by-side symbols.
- Keep the fix narrow: cross-window event sync plus focused tests.

## Acceptance Criteria
- [x] Settings publishes display preference changes across Tauri windows.
- [x] The tray listens for display preference changes and updates visible state without reopening.
- [x] The tray re-reads persisted display preferences on panel focus as a missed-event fallback.
- [x] Donut menubar icon style renders as a single square icon.
- [x] Focused App regression tests pass.

## Plan
- [x] Add a small display-preference event helper matching the existing plugin-settings event pattern.
- [x] Emit the event from the shared display-settings action after local state updates.
- [x] Listen for the event in the tray app and set the tray preference store values.
- [x] Collapse donut icon rendering to one icon with the provider symbol inside the progress ring.
- [x] Run focused Vitest coverage for the Settings-to-tray preference path and tray icon rendering.

## Verification Notes
- Added `src/lib/display-preference-events.ts`, wired `useSettingsDisplayActions` to publish `display-preferences:updated`, and wired `App` to apply theme, display mode, reset timer mode, and menubar icon style updates in the tray.
- Added a panel-focus fallback in `App` that reloads persisted display preferences and reschedules the tray icon.
- Changed donut tray icon rendering in `src/lib/tray-bars-icon.ts` from side-by-side provider plus donut to one square icon with the provider symbol inside the ring.
- Updated `src/components/settings/general-settings-pane.tsx` so the menubar icon selector uses distinct previews plus compact labels; donut is shown as one overlaid ring/icon, and merged includes provider plus compact bars instead of matching bars-only.
- Added `src/App.test.tsx` regressions for Settings publishing display preference changes and the tray applying them.
- Added `src/lib/tray-bars-icon.test.ts` coverage that donut style keeps a square viewBox.
- Captured the cross-window display-preference lesson in `tasks/lessons.md`.
- Verified focused preference coverage with `npx bun run test -- src/App.test.tsx -t "display preference|provider settings" --run` -> 1 file passed, 4 tests passed.
- Verified settings page coverage with `npx bun run test -- src/pages/settings.test.tsx --run` -> 1 file passed, 12 tests passed.
- Verified tray icon rendering coverage with `npx bun run test -- src/lib/tray-bars-icon.test.ts --run` -> 1 file passed, 13 tests passed.
- Verified frontend typecheck/build with `npx bun run build` -> passed; existing Vite chunk-size and Tailwind plugin timing warnings remain.

Source: `../docs/deep-research-report.md`, reviewed 2026-04-28 against the local `usagebar` tree.

# First public alpha readiness gate

## Executive Summary
- Ship the next public milestone as an alpha, not a full release.
- Make the alpha safe to install, easy to understand, and honest about provider limits.
- Prioritize trust, packaging, failure handling, privacy, and feedback over more UI experiments.

## Acceptance Criteria
- [x] README answers the product promise in one glance: what UsageBar does, screenshots, supported providers, install path, privacy model, and current limitations.
- [x] Release docs use a concrete alpha tag example such as `v0.1.0-alpha.1` or explicitly justify staying on the current beta line.
- [x] A Windows installer artifact path is verified locally or from GitHub Releases.
- [x] Install/uninstall/config-location notes are documented for Windows alpha users.
- [x] At least one supported provider can be added by a fresh user path, refreshed manually, and shown with date range plus last-updated state.
- [x] Invalid credentials, offline/network failure, provider API failure, empty data, and refresh-in-progress states are visible and do not crash the app.
- [x] Provider support matrix distinguishes supported vs experimental providers and states when cost/usage is estimated, partial, or provider-reported.
- [x] Privacy copy states local credential/data handling, telemetry behavior, crash-log behavior, and whether anything is sent to UsageBar-owned services.
- [x] Feedback path includes GitHub issue/report action plus sanitized debug information expectations; no API keys or cookies in copied/logged diagnostics.
- [x] `CHANGELOG.md` has a matching alpha section with supported features, known limitations, privacy note, and feedback link before tagging.
- [x] Verification commands and manual checks are recorded before any alpha tag, push, or GitHub release action.

## Plan
- [x] Audit current README/release docs/changelog against the alpha gate and patch only factual gaps first.
- [x] Document Windows install, uninstall, app data, log, settings, provider-secret, and legacy migration paths.
- [x] Audit the Settings/provider setup flow for remove-provider/key, connection test, and error-state visibility.
- [x] Add a repeatable Alpha 1 smoke-test checklist for install, first provider setup, failure states, secret handling, feedback, and release notes.
- [x] Verify one installable Windows artifact path, then document install, uninstall, and config/data locations.
- [x] Run focused provider/setup/update tests plus release preflight; record blockers instead of stretching scope.
- [x] Prepare release notes for the chosen prerelease label, without creating a tag or GitHub release unless explicitly requested.

## Verification Notes
- Started from the user's release-readiness bar on 2026-04-29: public alpha is the next safer milestone unless installer, updater, provider setup, error handling, docs, privacy, and recovery are already boring.
- Current local metadata still says `0.1.0-beta.7` in `package.json` and `src-tauri/tauri.conf.json`; release-label alignment is a pending decision before tagging.
- Initial repo audit found README already has screenshot, provider table, architecture, privacy/security, releases link, and source-build commands, but not a dedicated known-limitations/alpha gate.
- Existing `docs/releasing.md` still uses beta tag examples and notes prerelease updater limits.
- Added README `Alpha Readiness` and `Current Limitations` sections, and clarified crash-log behavior is not a public guarantee until release notes state the exact behavior.
- Updated `docs/releasing.md` to recommend `v0.1.0-alpha.1`, document the alpha gate, and preserve the beta-line exception path if the version line is intentionally kept.
- Verified the docs slice with `rg -n "Alpha Readiness|Current Limitations|v0\\.1\\.0-alpha\\.1|Alpha Gate|Public-release default|first public alpha gate" README.md docs\\releasing.md docs\\choices.md docs\\breadcrumbs.md tasks\\todo.md`.
- Reviewed the touched-file diff with `git --no-pager diff -- README.md docs/releasing.md tasks/todo.md docs/choices.md docs/breadcrumbs.md`; the diff includes earlier in-flight README/task edits in the dirty worktree, so only the alpha-gate additions are part of this slice.
- Added `README.md` install/uninstall/data notes for Windows alpha users, expanded `docs/releasing.md` with the Alpha 1 release-note template plus Windows data locations, and corrected `docs/bug-reports.md` from the old OpenUsage roaming path to `%APPDATA%\\com.sunstory.usagebar`.
- Audited `src/components/settings/provider-settings-detail.tsx`, `src/components/settings/provider-settings-detail.test.tsx`, `src/hooks/app/use-probe-refresh-actions.test.ts`, and `src/hooks/app/use-probe-state.test.ts`; existing coverage includes setup guidance, loading/runtime status, last success, retry, secret save/clear, retained data during refresh, error display from probe badges, and manual refresh cooldown behavior.
- Added `docs/alpha-smoke-test.md` with a Codex-first provider smoke path, Cursor fallback, failure-state matrix, secret-handling checks, feedback checks, and release-note checks.
- Verified the setup/status/refresh coverage with `npx bun run test -- src/components/settings/provider-settings-detail.test.tsx src/hooks/app/use-probe-refresh-actions.test.ts src/hooks/app/use-probe-state.test.ts --run` -> 3 files passed, 27 tests passed.
- Verified current metadata is still `0.1.0-beta.7` across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`; Alpha 1 version-label alignment remains pending before tagging.
- Ran `npx bun run release:check -- --release-tag v0.1.0-beta.7` -> release preflight passed for the current beta-line version.
- Ran `npx bun run build:release -- --bundles nsis` -> unsigned local Windows NSIS artifact built at `src-tauri\target\release\bundle\nsis\UsageBar_0.1.0-beta.7_x64-setup.exe` (`6,236,103` bytes, 2026-04-29 15:15 local time). The helper reported no `TAURI_SIGNING_PRIVATE_KEY`, added `--no-sign`, and skipped updater signing for this local artifact.
- Added README status meanings for `Supported` vs `Experimental` and source wording for provider-reported, estimated, partial, and telemetry-based usage. Existing OpenCode docs already fold optional Zen balance into the visible OpenCode provider, so the matrix keeps one OpenCode row instead of re-splitting a legacy hidden provider.
- Added README privacy text that provider credentials/raw usage payloads are not sent to UsageBar-owned services, telemetry excludes provider payloads/secrets, and Alpha 1 crash logs remain local support artifacts unless the user attaches sanitized logs.
- Expanded `docs/bug-reports.md` with provider setup source, last-success timestamp, explicit files/secrets not to attach, and safe diagnostic expectations.
- Added draft `CHANGELOG.md` section `0.1.0-alpha.1` with supported features, known limitations, privacy note, and feedback link, without changing package/Tauri/Cargo version metadata.
- Verified the docs slice with `rg -n "Status meanings|Provider-reported|UsageBar does not send provider credentials|Automatic crash upload|Provider setup source used|Do not include:|0\\.1\\.0-alpha\\.1|Feedback: report issues" README.md docs\\bug-reports.md CHANGELOG.md docs\\choices.md docs\\breadcrumbs.md`.
- Reviewed the docs diff with `git --no-pager diff -- README.md docs/bug-reports.md CHANGELOG.md docs/choices.md docs/breadcrumbs.md`.
- Verified focused provider/setup/update behavior with `npx bun run test -- src/components/settings/provider-settings-detail.test.tsx src/hooks/app/use-probe-refresh-actions.test.ts src/hooks/app/use-probe-state.test.ts src/hooks/use-app-update.test.ts src/components/panel-footer.test.tsx --run` -> 5 files passed, 58 tests passed.
- Re-ran current-version release preflight with `npx bun run release:check -- --release-tag v0.1.0-beta.7` -> passed. Alpha tag preflight remains blocked until version metadata is intentionally changed from `0.1.0-beta.7` to the chosen alpha label.
- Added focused provider-card coverage for `Updated 5m ago` last-updated display and retained usage content while refresh is in progress.
- Verified supported-provider/failure-state contracts with `npx bun run test -- src/components/provider-card.test.tsx plugins/codex/plugin.test.js plugins/cursor/plugin.test.js --run` -> 3 files passed, 156 tests passed. Covered Codex/Cursor missing auth, HTTP 500/API failure, offline-style request failure, empty/no usage data, date/reset display, last-updated display, and refresh-in-progress retained data.
- Verified app-level empty/disabled/retry/refresh behavior with `npx bun run test -- src/App.test.tsx -t "empty state|refresh|Retry|disabled|all plugins disabled" --run` -> 1 file passed, 9 tests passed, 77 skipped by filter.
- Added an app-level regression for the terminal-safe part of the fresh-provider path: a disabled provider becomes enabled from Settings state, appears in tray navigation, can be selected, and renders successful usage with reset context after data arrives.
- Verified the expanded app-level alpha slice with `npx bun run test -- src/App.test.tsx -t "provider settings|enables a provider|empty state|refresh|Retry|disabled|all plugins disabled" --run` -> 1 file passed, 12 tests passed, 75 skipped by filter.
- Aligned local release metadata from `0.1.0-beta.7` to `0.1.0-alpha.1` in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`; updated the README local preflight command to `v0.1.0-alpha.1`.
- Verified Alpha 1 release metadata with `npx bun run release:check -- --release-tag v0.1.0-alpha.1` -> passed.
- Verified frontend build after version alignment with `npx bun run build` -> passed; existing Tailwind plugin timing and >500 kB chunk warnings remain.
- Verified Rust metadata after version alignment with `cargo metadata --manifest-path src-tauri\\Cargo.toml --no-deps --format-version 1` -> package/workspace version `0.1.0-alpha.1`.
- Built the unsigned local Alpha 1 Windows NSIS artifact with `npx bun run build:release -- --bundles nsis` -> produced `src-tauri\target\release\bundle\nsis\UsageBar_0.1.0-alpha.1_x64-setup.exe`.
- Verified the Alpha 1 installer file with `Get-Item src-tauri\\target\\release\\bundle\\nsis\\UsageBar_0.1.0-alpha.1_x64-setup.exe` -> size `6,235,347` bytes, last write `2026-04-30` local time.
- Remaining alpha blocker closed with combined installed-artifact smoke plus focused UI wiring tests on 2026-05-01. Installed `src-tauri\target\release\bundle\nsis\UsageBar_0.1.0-alpha.1_x64-setup.exe` silently to `D:\UsageBar-Alpha1`; installer exit code `0`; Windows uninstall metadata now reports `UsageBar 0.1.0-alpha.1` at `D:\UsageBar-Alpha1`.
- Launched `D:\UsageBar-Alpha1\usagebar.exe` and verified a single installed Alpha 1 process started from the installed path: PID `22072`, path `D:\UsageBar-Alpha1\usagebar.exe`. The app launch process query showed no matching `bunx`, `cmd`, or `conhost` child process for the app. App data existed at `%APPDATA%\com.sunstory.usagebar`; `usage-api-cache.json` updated at launch. Log output was verified at `%LOCALAPPDATA%\com.sunstory.usagebar\UsageBar.log`.
- Verified real Codex provider data from the installed Alpha 1 launch: local Codex auth evidence exists, cache entry `codex` refreshed at `2026-05-01T16:56:22.7953981Z`, plan `Plus`, visible lines included `Session`, `Weekly`, `Credits`, `Today`, `Yesterday`, and `Last 30 Days` with reset timestamps where applicable. This proves usage/cost/date-range data reaches the installed app cache on this machine.
- Verified fresh-provider enable, manual Retry refresh tracking, Open-in-tray command wiring, empty/disabled states, and refresh behavior with `npx bun run test -- src/App.test.tsx -t "provider settings|enables a provider|open in tray|manual refresh|tracks manual refresh|empty state|refresh|Retry|disabled|all plugins disabled" --run` -> 1 file passed, 12 tests passed, 75 skipped by filter.
- Re-verified provider rendering/failure contracts with `npx bun run test -- src/components/provider-card.test.tsx plugins/codex/plugin.test.js plugins/cursor/plugin.test.js --run` -> 3 files passed, 156 tests passed. Re-ran Alpha 1 release preflight with `npx bun run release:check -- --release-tag v0.1.0-alpha.1` -> passed.

# Refresh README for current beta/provider surface

## Acceptance Criteria
- [x] README release/build commands match the current `0.1.0-beta.7` package/Tauri version.
- [x] README provider table includes current visible provider docs and status changes from plugin manifests.
- [x] README includes concise architecture, privacy/security, and telemetry notes for new users.
- [x] Docs-only diff is reviewed before marking done.

## Plan
- [x] Compare README against `package.json`, `src-tauri/tauri.conf.json`, provider docs, and plugin manifests.
- [x] Patch README only, keeping provider claims conservative and source-backed.
- [x] Review the README diff and record verification.

## Verification Notes
- Checked `package.json` and `src-tauri/tauri.conf.json` -> current app version is `0.1.0-beta.7`.
- Checked plugin manifests and provider docs -> README was missing `Abacus AI` and `Mistral`; both now have provider-table rows.
- Verified README text with a targeted PowerShell check for `0.1.0-beta.7`, `docs/providers/abacus.md`, `docs/providers/mistral.md`, `Privacy And Security`, and `Architecture`.
- Reviewed the docs-only diff with `git --no-pager diff -- README.md tasks/todo.md`.

# User-controlled GitHub release updater

## Acceptance Criteria
- [x] UsageBar checks GitHub releases for a newer non-draft release, including prereleases such as `0.1.0-beta.7`.
- [x] A found update is shown to the user before download/install starts.
- [x] Signed Tauri updater installs still require an explicit user click before downloading.
- [x] Prerelease builds that cannot use GitHub's stable-only `releases/latest` updater alias open the matching GitHub release page instead of failing silently.
- [x] Focused updater hook and footer tests pass.

## Plan
- [x] Add a GitHub release metadata check and semver comparison to the updater hook.
- [x] Change the Tauri updater path from auto-download to user-confirmed download/install.
- [x] Update footer states/copy for available, downloading, ready, installing, and retry paths.
- [x] Run focused verification and record results.

## Verification Notes
- Verified current GitHub release state with `gh release list --repo Loues000/usagebar --limit 5`: latest release is `v0.1.0-beta.6` as of 2026-04-29 11:55:17Z.
- Verified focused updater/footer coverage with `npx bun run test -- src/hooks/use-app-update.test.ts src/components/panel-footer.test.tsx --run` -> 2 files passed, 30 tests passed.
- Verified TypeScript and production frontend bundle with `npx bun run build` -> passed; existing Vite chunk-size warning remains.

# Local dev and installed release side-by-side

## Acceptance Criteria
- [x] Starting the local Tauri dev app does not acquire the installed release single-instance mutex.
- [x] The installed UsageBar EXE and local dev process can run at the same time on Windows.
- [x] Verification covers the dev launcher environment marker and Rust compile/test path where practical.

## Plan
- [x] Inspect Windows single-instance and dev-launch behavior.
- [x] Add an explicit dev-process marker in the local Tauri wrapper.
- [x] Gate the release single-instance mutex on that marker.
- [x] Run focused verification and record results.

## Verification Notes
- Found the collision path in `src-tauri/src/main.rs`: release builds acquire `Local\com.sunstory.usagebar.release-single-instance` whenever `productName` is `UsageBar`.
- Updated `scripts/tauri/wrapper.mjs` to pass `USAGEBAR_TAURI_DEV=1` only for `tauri dev` launches.
- Updated the Windows release mutex guard to skip release-single-instance acquisition when `USAGEBAR_TAURI_DEV` is present.
- `node --test scripts\tauri\wrapper.test.mjs` -> 3 tests passed.
- `cargo check --manifest-path src-tauri\Cargo.toml` -> passed.

# Beta 6 release readiness

## Acceptance Criteria
- [x] Local branch is not behind `origin/main` and no merge commit is introduced.
- [x] `0.1.0-beta.6` release metadata is consistent across package, Tauri, Cargo, changelog, and release preflight.
- [x] Release-ready verification passes or blockers are recorded with exact commands.
- [x] No release tag, commit, push, or GitHub release is created unless explicitly requested.

## Plan
- [x] Fetch `origin` and verify ahead/behind status.
- [x] Confirm latest GitHub prerelease state with `gh release list`.
- [x] Fill the beta6 changelog and keep Tauri build hooks on the repo-standard Bun path.
- [x] Run release preflight, build/test checks, and a local Windows bundle build if time permits.
- [x] Record final readiness result in this section before ending.

## Verification Notes
- `git fetch origin --prune` completed successfully.
- `git rev-list --left-right --count HEAD...origin/main` -> `8 0`, so local `main` is 8 commits ahead and 0 behind; no merge or rebase was needed.
- `gh release list --repo Loues000/usagebar --limit 10` shows latest published prerelease is `v0.1.0-beta.5`; no beta6 GitHub release exists yet.
- Initial `npx bun run release:check -- --release-tag v0.1.0-beta.6` passed: package, Tauri, Cargo, updater endpoint, changelog section, and bundled plugin count are valid.
- Updated `CHANGELOG.md` beta6 highlights from `Unreleased` to concrete release notes.
- Updated `src-tauri/tauri.conf.json` build hooks to `bun run bundle:plugins && bun run dev/build`.
- Re-ran `npx bun run release:check -- --release-tag v0.1.0-beta.6` after edits -> passed.
- `npx bun install --frozen-lockfile` -> checked 190 installs across 264 packages, no changes.
- `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri.conf.json valid JSON')"` -> valid JSON.
- `npx bun run build` -> TypeScript and Vite production build passed; Vite emitted the existing >500 kB chunk warning.
- `npx bun run test -- --run` -> 71 files passed, 1040 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --no-run` -> Rust tests compiled successfully.
- `node ./scripts/build-release.mjs --bundles nsis` -> produced unsigned local installer `src-tauri/target/release/bundle/nsis/UsageBar_0.1.0-beta.6_x64-setup.exe`.
- `npx bun run test:coverage` -> all 71 files / 1040 tests passed, but global 90% thresholds still fail: statements 83.17%, branches 75.12%, functions 88.58%, lines 86.38%. This remains the known coverage-threshold blocker for PR policy, not a failing test.
- Final readiness result: beta6 has a locally verified unsigned Windows artifact and is not behind `origin/main`; publishing still needs an explicit commit/tag/push/release action.

## Acceptance Criteria
- [ ] The highest-risk findings from the deep research report are represented as small, reviewable todo slices in priority order.
- [ ] Each slice has concrete acceptance criteria and verification commands before implementation starts.
- [ ] Existing in-flight provider/security work in the dirty worktree is not reverted or mixed into these planning changes.

## Priority Order
1. [x] Stabilize the JavaScript toolchain and package-manager path.
2. [ ] Harden the WebView and plugin security boundaries.
3. [ ] Make CI truthful, reproducible, and Windows-aware.
4. [ ] Resolve the Aptabase/Tauri dependency mismatch.
5. [ ] Add an enforceable lint/format contract.
6. [ ] Finish UsageBar branding metadata cleanup.
7. [ ] Improve keyboard accessibility for menu/reorder flows.
8. [ ] Modularize the largest app/plugin-host hotspots.
9. [ ] Expand contributor-facing architecture/security docs.

## Verification Notes
- Checked current repo state with `git status --short`; there is unrelated in-flight provider/security work in plugin and host files, so roadmap planning is intentionally isolated to this task file.
- Confirmed `src-tauri/tauri.conf.json` still has `beforeDevCommand` / `beforeBuildCommand` using `npm run ...` and `security.csp` set to `null`.
- Confirmed `.github/workflows/ci.yml` still runs only on `ubuntu-latest`, uses plain `bun install`, and does not run a lint or coverage command.
- Confirmed the initial state had `vite@^8.0.0`, `vitest@^4.0.18`, `@tailwindcss/vite@^4.1.18`, and `@aptabase/tauri@^0.4.1`.
- Completed the first P0 slice by keeping Vite 8 and updating Vite-facing Tailwind/Vitest packages to compatible versions; `@aptabase/tauri` remains the separate P1 dependency-mismatch slice.

# P0 - Stabilize JavaScript toolchain and package manager

## Acceptance Criteria
- [x] Vite, Vitest, `@vitejs/plugin-react`, and `@tailwindcss/vite` are pinned to a mutually supported matrix.
- [x] The lockfile is regenerated with Bun and installs reproducibly with `bun install --frozen-lockfile`.
- [x] Tauri dev/build hooks use the repo-standard Bun commands instead of `npm run`.
- [x] Frontend build and focused dependency verification pass before this slice is marked done.

## Plan
- [x] Decide the least-risk matrix: downgrade Vite to the latest supported Vite 7 line, unless official package metadata now proves every current Vite-facing dependency supports Vite 8.
- [x] Update `package.json`, `bun.lock`, and Tauri `beforeDevCommand` / `beforeBuildCommand` together.
- [x] Run `bun install --frozen-lockfile`, `bun run build`, and `bun run test -- --run` or the repo's current non-watch equivalent.
- [x] Record the exact toolchain versions and commands in this section after verification.

## Verification Notes
- Verified current npm package metadata before editing: `@tailwindcss/vite@4.2.4` peers on `vite ^5.2.0 || ^6 || ^7 || ^8`; `vitest@4.1.5` peers on `vite ^6.0.0 || ^7.0.0 || ^8.0.0`; `@vitejs/plugin-react@6.0.1` peers on `vite ^8.0.0`.
- Updated `package.json` / `bun.lock` to `@tailwindcss/vite@^4.2.4`, `tailwindcss@^4.2.4`, `vitest@^4.1.5`, and `@vitest/coverage-v8@^4.1.5` while keeping `vite@^8.0.0` and `@vitejs/plugin-react@^6.0.1`.
- Removed the nested `vitest/vite@7.3.1` resolution from `bun.lock` by regenerating with Bun 1.3.13 via `npx bun install`.
- Switched Tauri `beforeDevCommand` and `beforeBuildCommand` from `npm run ...` to `bun run ...`.
- Verified reproducible install with `npx bun install --frozen-lockfile` -> checked 190 installs across 264 packages, no changes.
- Verified production frontend build with `npx bun run build` -> `tsc` passed and Vite 8 production build completed.
- Verified full non-watch frontend/plugin test suite with `npx bun run test -- --run` -> 71 files passed, 1037 tests passed.
- Fixed one stale settings-layout test assertion during verification: the component no longer renders `.md:flex-row`, so the test now checks the responsive grid classes that still exist.

# P0 - Harden WebView and plugin security boundaries

## Acceptance Criteria
- [x] `src-tauri/tauri.conf.json` no longer uses `security.csp: null`; it has a restrictive starter CSP validated against the app's real asset and IPC needs.
- [ ] Plugin manifests or host policy support explicit HTTP domain allowlists before arbitrary network access is treated as normal.
- [ ] Dangerous host APIs such as write-capable `sqlite.exec` are gated by explicit plugin capability metadata.
- [ ] `ccusage` execution avoids dynamic registry fallback in packaged builds, or the remaining dynamic path is explicitly documented and guarded.
- [ ] Focused Rust/JS tests cover at least one denied HTTP target and one denied write-capability path.

## Plan
- [x] Start with the smallest safe CSP change and run the app/build to catch broken local asset, IPC, font, image, and style paths.
- [ ] Extend plugin schema/manifest parsing with optional `permissions.httpDomains` and `permissions.sqliteWrite` fields, preserving current bundled plugins through explicit declarations where needed.
- [ ] Enforce the policy in `src-tauri/src/plugin_engine/host_api.rs` and add regression tests around allow/deny decisions.
- [ ] Update `docs/plugins/api.md`, `docs/plugins/schema.md`, and `SECURITY.md` so plugin authors understand the new defaults.

## Verification Notes
- Added a restrictive starter CSP in `src-tauri/tauri.conf.json` using the object form from Tauri v2 CSP docs.
- Verified config syntax with `node -e "JSON.parse(...)"` -> `tauri.conf.json valid JSON`.
- Verified frontend compatibility with `npx bun run build` -> `tsc` passed and Vite 8 production build completed.
- Verified Tauri accepts and reports the policy with `npx bun run tauri -- info` -> App CSP reported as `default-src 'self' customprotocol: asset:; connect-src 'self' ipc: http://ipc.localhost https:; img-src 'self' asset: http://asset.localhost blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`.
- Did not edit the broader plugin capability implementation because the dirty worktree already contains changes in `docs/plugins/api.md`, `docs/plugins/schema.md`, `SECURITY.md`, `src-tauri/src/plugin_engine/host_api.rs`, `manifest.rs`, and `runtime.rs`.
- Attempted focused Rust verification with `cargo test --manifest-path src-tauri/Cargo.toml capability -- --nocapture`; the crate compiled, then the local test binary exited with `STATUS_ENTRYPOINT_NOT_FOUND`, matching the existing Rust-test blocker noted elsewhere in this task file.

# P1 - Make CI truthful, reproducible, and Windows-aware

## Acceptance Criteria
- [x] CI job names match the commands actually run.
- [x] CI installs with `bun install --frozen-lockfile`.
- [ ] CI runs typecheck/build, tests, and coverage in non-watch mode.
- [x] CI includes `windows-latest` because UsageBar is Windows-first.
- [ ] CI includes lint once the lint/format contract slice lands.

## Plan
- [x] Add a matrix over `ubuntu-latest` and `windows-latest` with `fail-fast: false`.
- [ ] Split build/typecheck/test/coverage into clearly named steps.
- [ ] Upload coverage artifacts from one OS only to keep workflow output compact.
- [ ] After the lint slice lands, add `bun run lint` as a required CI step.

## Verification Notes
- Updated `.github/workflows/ci.yml` to run on `push` to `main` and `pull_request` to `main`.
- Replaced the misleading `Lint, Type-check, Build, Test` job name with `Build and Test (${{ matrix.os }})`.
- Added a `ubuntu-latest` / `windows-latest` matrix with `fail-fast: false`.
- Switched CI install to `bun install --frozen-lockfile`.
- Split CI into named `Type-check and build frontend` and `Run frontend and plugin tests` steps, using `bun run test -- --run` so CI does not enter watch mode.
- Coverage enforcement is not wired into CI yet: `npx bun run test:coverage` passes all 71 test files / 1037 tests, but fails configured 90% global thresholds with statements 83.15%, branches 75.13%, functions 88.56%, and lines 86.34%.
- Lint remains pending until the lint/format contract slice adds a `bun run lint` script.

# P1 - Resolve Aptabase and Tauri dependency mismatch

## Acceptance Criteria
- [ ] `@aptabase/tauri` no longer pulls an incompatible Tauri v1 API surface into the frontend dependency graph, or the risk is explicitly accepted with documented isolation.
- [ ] Rust analytics dependency is either a release-based crate, a reviewed pinned revision with rationale, or replaced by a local adapter.
- [ ] Analytics initialization and opt-in/opt-out behavior still pass focused tests after the change.

## Plan
- [ ] Audit current frontend and Rust Aptabase usage sites.
- [ ] Prefer a Tauri v2-compatible analytics package if available and healthy; otherwise isolate calls behind an internal analytics adapter.
- [ ] Update tests around `src/lib/analytics.ts` and any Rust plugin initialization path affected.
- [ ] Document the chosen analytics dependency strategy in repo notes if it is a deliberate exception.

## Verification Notes
- Pending.

# P2 - Add enforceable lint and formatting contract

## Acceptance Criteria
- [ ] The repo has a single documented lint/format command for TS/JS/JSON files.
- [ ] The initial config excludes generated/build output and avoids repo-wide churn.
- [ ] CI can run the lint command without formatting files.
- [ ] Existing plugin JavaScript is either covered directly or tracked as a follow-up if the initial rule set is too noisy.

## Plan
- [ ] Add the smallest lint/format toolchain that fits the repo; Biome is the preferred default unless existing project constraints argue for ESLint.
- [ ] Configure ignores for `dist`, `src-tauri/target`, bundled/generated plugin copies, and coverage output.
- [ ] Run lint once, fix only high-signal issues needed to pass, and defer style churn to separate tasks.
- [ ] Add `lint` and `format` scripts to `package.json`.

## Verification Notes
- Pending.

# P2 - Finish UsageBar branding metadata cleanup

## Acceptance Criteria
- [ ] User-facing bundle metadata consistently uses UsageBar.
- [ ] Internal identifiers, executable names, updater metadata, keychain/secret namespaces, and support URLs are intentionally named and documented.
- [ ] Any remaining `openusage` identifiers are deliberate compatibility shims with a short comment or migration note.
- [ ] A local Windows build verifies the resulting artifact names.

## Plan
- [ ] Inventory `openusage`, `com.sunstory.openusage`, executable names, keychain targets, and docs/support links.
- [ ] Separate safe user-facing renames from risky migration-sensitive identifiers.
- [ ] Implement renames with migration tests where credential or data paths are affected.
- [ ] Verify with `bun run build` and a local Windows bundle command.

## Verification Notes
- Pending. Some branding has already moved to UsageBar locally, but Tauri hooks still invoke npm and the binary may still be `openusage.exe`.

# P2 - Improve keyboard accessibility for menu and reorder flows

## Acceptance Criteria
- [ ] Context menus move focus on open, support `Escape`, `ArrowUp`, `ArrowDown`, `Home`, and `End`, and return focus to the opener when closed.
- [ ] Provider/sidebar reordering has a keyboard-accessible path or an explicit arrange mode with screenreader labels.
- [ ] Focused React tests cover the keyboard behavior.

## Plan
- [ ] Patch `src/components/app/app-shell.tsx` context-menu focus handling first because it is the smallest user-visible gap.
- [ ] Audit current dnd-kit usage and add keyboard sensor support or a non-drag keyboard reorder mode.
- [ ] Add focused `@testing-library/user-event` regressions for menu navigation and reorder actions.

## Verification Notes
- Pending.

# P3 - Modularize large app and plugin-host hotspots

## Acceptance Criteria
- [ ] `App.tsx`, `AppShell`, and the Rust plugin host have clearer ownership boundaries without behavior changes.
- [ ] Each extraction is covered by existing or focused tests before further refactors build on it.
- [ ] No broad style-only rewrites are mixed with behavior extraction.

## Plan
- [ ] Identify the next largest orchestration block that can be extracted behind an existing hook/store boundary.
- [ ] Extract one concern per PR-sized slice, starting with code that already has test coverage.
- [ ] After each extraction, run the nearest focused tests plus `bun run build`.

## Verification Notes
- Pending.

# P3 - Expand architecture, security, and contributor docs

## Acceptance Criteria
- [ ] README includes a short architecture section, support matrix, security model, and telemetry/privacy summary.
- [ ] CONTRIBUTING explains local prerequisites, expected test commands by change type, dependency policy, and plugin security review questions.
- [ ] Provider/plugin docs reflect the hardened permission model once implemented.

## Plan
- [ ] Add docs only after the underlying security/toolchain decisions are settled, so the docs do not describe planned-but-missing behavior.
- [ ] Keep README concise and move detailed plugin/security policy into docs pages.
- [ ] Cross-link release, security, plugin API, and provider setup docs.

## Verification Notes
- Pending.

# Remove false provider subscription labels

## Acceptance Criteria
- [x] Providers do not show invented subscription names when an API only returns usage quantities.
- [x] README/provider docs describe tracked usage surfaces instead of unverified plan possibilities.
- [x] Focused Factory, MiniMax, and Perplexity plugin tests pass, and bundled plugin output is refreshed.

## Plan
- [x] Audit provider showcase copy and plan inference paths for hard-coded subscription claims.
- [x] Remove Factory, MiniMax, and Perplexity plan inference that was based only on allowances/credit totals.
- [x] Run focused verification and sync bundled plugin copies.

## Verification Notes
- Verified focused provider regressions with `npx vitest run plugins/factory/plugin.test.js plugins/minimax/plugin.test.js plugins/perplexity/plugin.test.js` -> 3 files passed, 88 tests passed.
- Synced desktop bundled plugins with `node ./copy-bundled.cjs` -> bundled 29 plugins.

# Replace remaining placeholder providers

## Acceptance Criteria
- [x] `Augment` no longer throws as a Windows placeholder and can probe Augment usage from a stored/manual Cookie header.
- [x] `Vertex AI` no longer throws as a Windows placeholder and can read gcloud ADC credentials, refresh OAuth, and query Cloud Monitoring quota usage.
- [x] README, provider setup copy, provider docs, Windows rollout/status docs, and bundled plugin output reflect the new experimental implementations.
- [ ] Focused plugin tests, provider-settings detail tests, and the host env allowlist test pass before the slice is marked done.

## Plan
- [x] Replace `plugins/augment` and `plugins/vertex-ai` placeholder probes with concrete Windows-experimental probes.
- [x] Add focused tests for missing auth, parsing, auth failures, and core quota/cookie response mapping.
- [x] Update setup/docs/status metadata and sync `src-tauri/resources/bundled_plugins`.
- [ ] Run focused verification and record results.

## Verification Notes
- Verified provider contracts with `npx vitest run plugins/augment/plugin.test.js plugins/vertex-ai/plugin.test.js src/components/settings/provider-settings-detail.test.tsx` -> 3 files passed, 31 tests passed.
- Verified frontend types with `npx tsc --noEmit`.
- Synced bundled provider output with `node ./copy-bundled.cjs` -> bundled 28 plugins including `augment` and `vertex-ai`.
- Checked local entitlement inputs: `AUGMENT_COOKIE_HEADER=missing`, Google Cloud project env missing, and both default gcloud ADC paths returned `False`, so both providers remain experimental pending real-account validation.
- Rust env allowlist verification is blocked locally: `cargo test --manifest-path src-tauri/Cargo.toml env_api_respects_allowlist_in_host_and_js` compiled but the test binary exited before running with `STATUS_ENTRYPOINT_NOT_FOUND`; retrying with `CARGO_TARGET_DIR=src-tauri/target-test-temp-env` timed out during Tauri stack compilation.

# Sync Settings provider selection into the tray target live

## Acceptance Criteria
- [x] Selecting a provider row in `Settings > Providers` updates the tray target without forcing the Settings window to close.
- [x] The selected provider still has an explicit tray-reveal action for users who want the hard handoff immediately.
- [x] A focused frontend regression covers the live selection sync and the explicit tray-reveal path.

## Plan
- [x] Add a small cross-window sync command so Settings can update the pending tray target without hiding itself.
- [x] Update the Providers pane and provider detail UI so row clicks stay local while an explicit tray button remains available.
- [x] Run focused frontend verification, then record the lesson, choices, and breadcrumbs before marking the slice done.

## Verification Notes
- Verified the settings/provider sync path with `npx vitest run src/App.test.tsx src/pages/settings.test.tsx` -> 2 files passed, 93 tests passed.
- Verified the frontend type surface with `npx tsc --noEmit`.
- Verified the Rust bridge command with `cargo test --manifest-path src-tauri/Cargo.toml pending_panel_view_is_consumed_once` -> 1 Rust test passed; crate compiled successfully with the new `sync_panel_view` command.

# Land Zed as a Windows-experimental billing provider

## Acceptance Criteria
- [x] `Zed` is surfaced as a Windows-experimental provider instead of staying absent from the provider list.
- [x] The provider shows dashboard billing spend when a signed-in dashboard Cookie header is configured.
- [x] The plugin uses the local Zed credential target only for the telemetry fallback path and fails clearly when that fallback sign-in state is missing or malformed.
- [x] The provider falls back to local Zed agent token totals from telemetry when no billing cookie is configured.
- [x] Focused Zed plugin tests, provider-settings detail tests, and host keychain API tests pass before the slice is marked done.

## Plan
- [x] Add the smallest host keychain extension needed to read an external Windows credential target directly.
- [x] Implement `plugins/zed` plus the bundled mirror around manual dashboard-cookie billing plus telemetry fallback.
- [x] Update provider settings/docs/README/input-simulation notes, then run focused verification and record repo notes.

## Verification Notes
- Verified the Zed plugin contract with `npx vitest run plugins/zed/plugin.test.js` -> 1 file passed, 10 tests passed.
- Verified the settings-detail copy with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 18 tests passed.
- Verified the host keychain API surface with `cargo test --manifest-path src-tauri/Cargo.toml keychain_api_exposes_target_and_account_reads` -> 1 Rust test passed.
- Verified the Windows credential-blob decoding helper with `cargo test --manifest-path src-tauri/Cargo.toml decode_windows_generic_password_blob_accepts_utf8_and_utf16` -> 1 Rust test passed.
- Synced the bundled plugin mirror with `node ./copy-bundled.cjs` -> bundled plugin count increased to 27 and now includes `zed`.

# Clarify Antigravity offline mode

## Acceptance Criteria
- [x] Antigravity settings copy stops implying the IDE must stay open after a one-time sign-in.
- [x] Provider docs and replay docs state that stored SQLite/OAuth credentials keep working after the IDE closes.
- [x] Focused settings and plugin verification passes.

## Plan
- [x] Update the Antigravity provider metadata and docs to describe LS-only vs offline Cloud Code behavior.
- [x] Add a focused provider-detail regression for the new Antigravity guidance.
- [x] Run focused verification, then record the lesson and breadcrumbs before marking the slice done.

# Fix Cursor missing-limit regression

## Acceptance Criteria
- [x] Cursor no longer shows `Total usage limit missing from API response.` when the current API returns a usable individual-plan usage payload without a numeric `planUsage.limit`.
- [x] A focused Cursor plugin regression test covers the response shape that previously failed.
- [x] Focused verification passes, and bundled plugin output matches the source plugin.

## Plan
- [x] Reproduce the live Cursor usage payload shape and identify why the plugin classifies it as missing-limit.
- [x] Patch `plugins/cursor` to accept the live payload shape without weakening team-plan validation, and add/update focused tests.
- [x] Run focused verification, sync the bundled plugin copy, then record the lesson, choices, and breadcrumbs before marking done.

## Verification Notes
- Verified the live Cursor response shape with a local sanitized repro against `GetCurrentPeriodUsage` and `GetPlanInfo`: the current individual account payload omits `planUsage.limit`, includes `totalPercentUsed: 21.5`, and sets `spendLimitUsage.limitType: "user"` with `pooledLimit: 0`; that zero-valued pooled field was the misclassification trigger.
- Verified the Cursor plugin regression suite with `bun run test -- plugins/cursor/plugin.test.js` -> 1 file passed, 59 tests passed.
- Synced bundled plugin output with `node ./copy-bundled.cjs` so `src-tauri/resources/bundled_plugins/cursor` now matches the patched source plugin.

# Move issue button into Settings

## Acceptance Criteria
- [x] The tray sidebar no longer shows a separate issue/help button.
- [x] `Settings > General` exposes a visible issue-report action that opens the repo issue tracker.
- [x] Focused frontend verification covers the moved action before the slice is marked done.

## Plan
- [x] Remove the issue button from the tray side nav.
- [x] Add the issue action to the General settings pane and update focused tests.
- [x] Run focused verification, then record notes/lessons/choices/breadcrumbs.

## Verification Notes
- Verified the move with `npx vitest run src/components/side-nav.test.tsx src/pages/settings.test.tsx` -> 2 files passed, 16 tests passed.

# Fix instant tray handoff from Settings provider selection

## Acceptance Criteria
- [x] Clicking a provider row in `Settings > Providers` hides the settings window and reveals the tray on that provider in one step.
- [x] The settings detail pane still updates to the clicked provider before the tray handoff.
- [x] Focused frontend verification covers the settings-window hide + tray-reveal path before the slice is marked done.

## Plan
- [x] Patch the settings-window provider-selection callback to hide Settings before revealing the tray provider view.
- [x] Add/update focused Vitest coverage for the settings handoff path and row intent.
- [x] Run focused verification, record notes/lesson/choices/breadcrumbs, then mark the slice done.

## Verification Notes
- Verified the settings-to-tray handoff with `npx vitest run src/App.test.tsx src/pages/settings.test.tsx` -> 2 files passed, 90 tests passed.
- Verified the frontend build with `bun run build` -> `tsc` passed and Vite production build completed successfully.

# Implement Warp as a Windows-experimental token provider

## Acceptance Criteria
- [x] `Warp` no longer throws as a Windows placeholder and instead probes the request-limit GraphQL endpoint from a stored token or supported env var.
- [x] The provider is surfaced as Windows-experimental with setup copy that explains the app-secret and env-var path on Windows.
- [x] The provider docs, rollout/status docs, and input-simulation matrix all match the new implementation state.
- [x] Focused Warp plugin tests, provider-settings detail tests, and the env allowlist Rust test pass before the slice is marked done.

## Plan
- [x] Replace the placeholder `plugins/warp` implementation with a direct token probe plus focused regressions.
- [x] Update `provider-settings.ts`, README/provider docs, Windows rollout docs, and simulation docs to reflect the real Windows setup path and experimental state.
- [x] Run focused JS/Vitest/Rust verification, then record notes plus repo-note updates.

## Verification Notes
- Verified the Warp plugin contract with `bun run test -- plugins/warp/plugin.test.js` -> 1 file passed, 10 tests passed.
- Verified the settings-detail copy and placeholder coverage with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 15 tests passed.
- Verified the plugin-host env exposure with `cargo test --manifest-path src-tauri/Cargo.toml env_api_respects_allowlist_in_host_and_js` -> 1 Rust test passed.
- Checked local live-token evidence with `if ($env:WARP_API_KEY -or $env:WARP_TOKEN) { 'WARP_TOKEN=set' } else { 'WARP_TOKEN=missing' }` -> `WARP_TOKEN=missing` on this machine, so the provider remains explicitly `experimental` pending real Windows token validation.

# Implement Kimi K2 as a Windows-experimental API-key provider

## Acceptance Criteria
- [x] `Kimi K2` no longer throws as a Windows placeholder and instead probes the real credits endpoint from a stored API key or supported env var.
- [x] The provider is surfaced as Windows-experimental with setup copy that explains the app-secret and env-var path on Windows.
- [x] The provider docs, rollout/status docs, and input-simulation matrix all match the new implementation state.
- [x] Focused Kimi K2 plugin tests, provider-settings detail tests, and the env allowlist Rust test pass before the slice is marked done.

## Plan
- [x] Replace the placeholder `plugins/kimi-k2` implementation with a direct API-key probe plus focused regressions.
- [x] Update `provider-settings.ts`, README/provider docs, Windows rollout docs, and simulation docs to reflect the real Windows setup path and experimental state.
- [x] Run focused JS/Vitest/Rust verification, then record notes plus repo-note updates.

## Verification Notes
- Verified the Kimi K2 plugin contract with `bun run test -- plugins/kimi-k2/plugin.test.js` -> 1 file passed, 10 tests passed.
- Verified the settings-detail copy and placeholder coverage with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 14 tests passed.
- Verified the plugin-host env exposure with `cargo test --manifest-path src-tauri/Cargo.toml env_api_respects_allowlist_in_host_and_js` -> 1 Rust test passed.
- Checked local live-key evidence with `if ($env:KIMI_K2_API_KEY -or $env:KIMI_API_KEY -or $env:KIMI_KEY) { 'KIMI_K2_KEY=set' } else { 'KIMI_K2_KEY=missing' }` -> `KIMI_K2_KEY=missing` on this machine, so the provider remains explicitly `experimental` pending real Windows API-key validation.

# Implement OpenRouter as a Windows-experimental API-key provider

## Acceptance Criteria
- [x] `OpenRouter` no longer throws as a Windows placeholder and instead probes the real credits and key-info endpoints from a stored API key or `OPENROUTER_API_KEY`.
- [x] The provider is surfaced as Windows-experimental with setup copy that explains the app-secret and env-var path on Windows.
- [x] The provider docs, rollout/status docs, and input-simulation matrix all match the new implementation state.
- [x] Focused OpenRouter plugin tests, provider-settings detail tests, and the env allowlist Rust test pass before the slice is marked done.

## Plan
- [x] Replace the placeholder `plugins/openrouter` implementation with a direct API-key probe plus focused regressions.
- [x] Update `provider-settings.ts`, README/provider docs, Windows rollout docs, and simulation docs to reflect the real Windows setup path and experimental state.
- [x] Run focused JS/Vitest/Rust verification, then record notes plus any lessons/choices/breadcrumbs updates.

## Verification Notes
- Verified the OpenRouter plugin contract with `bun run test -- plugins/openrouter/plugin.test.js` -> 1 file passed, 11 tests passed.
- Verified the settings-detail copy and placeholder coverage with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 13 tests passed.
- Verified the plugin-host env exposure with `cargo test --manifest-path src-tauri/Cargo.toml env_api_respects_allowlist_in_host_and_js` -> 1 Rust test passed.
- Checked local live-key evidence with `if ($env:OPENROUTER_API_KEY) { 'OPENROUTER_API_KEY=set' } else { 'OPENROUTER_API_KEY=missing' }` -> `OPENROUTER_API_KEY=missing` on this machine, so the provider remains explicitly `experimental` pending real Windows API-key validation.

# Surface OpenCode Go on Windows with current local schema

## Acceptance Criteria
- [x] `OpenCode Go` is surfaced on Windows with manifest metadata instead of staying hidden for lack of `platformSupport.windows`.
- [x] The plugin detects the current local OpenCode auth/history shape on this machine instead of only the older `opencode-go` identifiers.
- [x] The provider doc and setup copy explain the current Windows-local auth/history paths and the fact that the source is local observed spend, not web subscription usage.
- [x] Focused OpenCode Go contract tests and one real local probe pass before the slice is marked done.

## Plan
- [x] Patch `plugins/opencode-go` to accept the current local auth/history identifiers while preserving the legacy `opencode-go` path.
- [x] Add Windows support metadata plus settings/doc copy so the provider can actually surface in the app.
- [x] Run focused plugin/settings verification and a one-off local probe harness against the real `auth.json` and `opencode.db`, then record notes.

## Verification Notes
- Verified the updated contract with `bun run test -- plugins/opencode-go/plugin.test.js` -> 1 file passed, 13 tests passed.
- Verified the settings-detail copy with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 12 tests passed.
- Verified a real local Windows probe with a one-off Node harness against `%USERPROFILE%\\.local\\share\\opencode\\auth.json` and `%USERPROFILE%\\.local\\share\\opencode\\opencode.db` -> returned `plan: "Go"` plus `5h`, `Weekly`, and `Monthly` progress lines after accepting the current `opencode` auth/history identifiers.

# Land Factory / Droid as a Windows-experimental provider

## Acceptance Criteria
- [x] `Factory / Droid` is surfaced as a Windows-experimental provider instead of blocked.
- [x] The provider doc and setup copy describe the current Windows path around `droid` login plus the `~/.factory/auth.encrypted` / `~/.factory/auth.json` auth stores.
- [x] The Windows rollout/status docs reflect the experimental state and explicitly call out that real signed-in Windows runtime evidence is still pending.
- [x] Focused Factory plugin verification passes before the slice is marked done.

## Plan
- [x] Audit the current Factory plugin/docs state and capture any local auth-file evidence available on this machine.
- [x] Flip the manifest to Windows-experimental and update the provider/setup/rollout docs with the current Windows-first auth path.
- [x] Run focused Factory verification, then record verification notes and the related repo notes updates.

## Verification Notes
- Checked local auth-file evidence with `Test-Path "$HOME\\.factory\\auth.encrypted"; Test-Path "$HOME\\.factory\\auth.json"` -> both returned `False` on this machine, so the slice remains explicitly experimental pending real signed-in Windows validation.
- Verified the Factory plugin with `bun run test -- plugins/factory/plugin.test.js` -> 1 file passed, 32 tests passed.
- Verified the provider-settings detail surface still renders after the Factory setup-copy changes with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 11 tests passed.

# Land Kimi Code as a Windows-experimental provider

## Acceptance Criteria
- [x] `Kimi Code` is surfaced as a Windows-experimental provider instead of blocked.
- [x] The provider doc and setup copy describe the Windows path around `~/.kimi/credentials/kimi-code.json` and `kimi login`.
- [x] The Windows rollout/status docs reflect the experimental state and explicitly note that broader real-account validation is still pending.
- [x] Focused Kimi plugin verification passes before the slice is marked done.

## Plan
- [x] Audit the current Kimi plugin/docs state and capture any local path evidence available on this machine.
- [x] Flip the manifest to Windows-experimental and update the provider/setup/rollout docs with the current Windows-first setup path.
- [x] Run focused Kimi verification, then record verification notes and the related repo notes updates.

## Verification Notes
- Checked local path evidence with `Test-Path "$HOME\\.kimi\\credentials\\kimi-code.json"` -> `False` on this machine, so the slice remains explicitly experimental pending real signed-in Windows validation.
- Verified the Kimi plugin with `bun run test -- plugins/kimi/plugin.test.js` -> 1 file passed, 21 tests passed.
- Verified the provider-settings detail surface still renders after the Kimi setup-copy changes with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 11 tests passed.

# Land MiniMax and Z.ai as Windows-experimental providers

## Acceptance Criteria
- [x] `MiniMax` and `Z.ai` are surfaced as Windows-experimental providers instead of blocked placeholders.
- [x] Their provider docs describe Windows-usable setup paths for this fork without macOS-only launcher instructions.
- [x] The Windows rollout/status docs reflect the new experimental state and keep the remaining gap limited to real-account entitlement validation.
- [x] Focused `MiniMax` and `Z.ai` plugin verification passes before the slice is marked done.

## Plan
- [x] Audit the current `MiniMax` and `Z.ai` plugin/docs state against the rollout plan and README status matrix.
- [x] Flip both manifests to Windows-experimental and update the provider/rollout docs with Windows-first setup wording.
- [x] Run focused plugin tests, then record verification notes plus the related choices/breadcrumbs updates.

## Verification Notes
- Verified the MiniMax plugin with `bun run test -- plugins/minimax/plugin.test.js` -> 1 file passed, 42 tests passed.
- Verified the Z.ai plugin with `bun run test -- plugins/zai/plugin.test.js` -> 1 file passed, 24 tests passed.
- Verified the provider-settings detail surface still renders after the setup-copy changes with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 11 tests passed.

# Fix Antigravity offline fallback when the IDE is not running

## Acceptance Criteria
- [x] Antigravity still prefers the live LS path when the IDE is running and quota data is usable.
- [x] When the IDE is not running, the plugin prefers fresh cached/refreshed Cloud Code access over stale stored bearer tokens.
- [x] A valid refresh token can recover offline Antigravity usage even when the stored access token and `apiKey` both return `401`.
- [x] Offline hard-fail paths log which auth stage failed before surfacing `Start Antigravity and try again.`
- [x] Focused Antigravity plugin verification covers cached-token reuse, refresh recovery, cache-write failure tolerance, and offline hard-fail behavior before the slice is marked done.

## Plan
- [x] Rework `plugins/antigravity/plugin.js` Cloud Code auth selection around cached-token freshness, protobuf expiry, explicit refresh recovery, and last-resort `apiKey` fallback.
- [x] Add focused regressions in `plugins/antigravity/plugin.test.js` for the offline no-LS sequences seen on this Windows machine.
- [x] Run focused verification, then record lessons/choices/breadcrumbs and mark the slice done.

## Verification Notes
- Verified focused regressions with `bun run test -- plugins/antigravity/plugin.test.js` -> 1 file passed, 19 tests passed.
- Verified bundled plugin sync with `bun run bundle:plugins` -> copied the updated Antigravity plugin into `src-tauri/resources/bundled_plugins`.
- Verified the real no-LS offline recovery path on this machine with a one-off Node smoke harness against `%APPDATA%\\Antigravity\\User\\globalStorage\\state.vscdb` -> logs showed `proto access token expired`, `attempting Antigravity refresh-token recovery`, and grouped quota lines returned without the IDE running.

# Strict bottom-pinned tray bounds during provider height changes

## Acceptance Criteria
- [x] Bottom-edge screen-space Y stays unchanged through provider switches on bottom-taskbar setups.
- [x] Height changes continue to move only the popup top edge, with no visible bottom wobble from native bounds updates.
- [x] Windows bounds application uses one final outer-bounds path for anchored tray updates instead of exposing split position/size drift.
- [x] Focused Rust and frontend verification covers the strict bottom-pin slice before the task is marked done.

## Plan
- [x] Patch the Windows native panel-bounds application to use one atomic outer-bounds update from the final target size/position.
- [x] Add a rounding regression for bottom-anchor physical bounds so DPI-scaled transitions keep the bottom edge fixed.
- [x] Run focused `cargo test`, `vitest`, and build verification, then record lessons/choices/breadcrumbs.

## Verification Notes
- Verified the strict bottom-pin backend path with `cargo test --manifest-path src-tauri/Cargo.toml panel -- --nocapture` -> 7 tests passed, including the new DPI rounding regressions.
- Verified tray frontend regressions with `npx vitest run src/hooks/app/use-panel.test.ts src/App.test.tsx` -> 2 files passed, 95 tests passed.
- Verified compile/build with `bun run build` -> `tsc` passed and the Vite production build completed successfully.

# Smooth bottom-anchored provider switching in the tray popup

## Acceptance Criteria
- [x] Bottom anchoring remains correct: the edge near the taskbar stays fixed during provider switching.
- [x] The popup top edge no longer teleports between noticeably different provider heights.
- [x] Switching between a short provider and a tall provider feels materially smoother than the current build.
- [x] The shell does not fully resize for every small content difference; more variance is absorbed by the inner scroll region.
- [x] Sidebar remains stable and is not the main source of perceived motion.
- [x] Reduced-motion users do not get forced shell/content animation.
- [x] Focused verification covers height tweening, retargeting, reduced motion, and provider-switch smoothness before the slice is marked done.

## Plan
- [x] Add stronger home/detail height-band normalization and tweened displayed height updates in `src/hooks/app/use-panel.ts`.
- [x] Add a more stable detail content region plus subtle content transitions in the tray shell/content components without remounting shell chrome.
- [x] Add/update focused tests, run verification, then record lessons/choices/breadcrumbs for the smoothing slice.

## Verification Notes
- Verified smoothing and reduced-motion coverage with `npx vitest run src/hooks/app/use-panel.test.ts src/App.test.tsx` -> 2 files passed, 95 tests passed.
- Verified compile/build with `bun run build` -> `tsc` passed and the Vite production build completed successfully.

# Stabilize tray shell during provider switching and refresh

## Acceptance Criteria
- [x] Provider switching does not visibly remove or flash the sidebar.
- [x] Provider refresh on an already-loaded provider keeps the existing provider card frame/content visible while showing a localized loading state.
- [x] Tray height changes settle once per real content change and no longer show the panel dropping downward during ordinary provider switching/refresh.
- [x] `"Provider not found"` does not appear during normal switching/loading of a valid enabled provider.
- [x] Focused verification covers retained-content loading, stable nav rendering, stable selected-provider resolution, and panel resize coalescing before the slice is marked done.

## Plan
- [x] Add retained provider-state handling in the probe/view layer so refreshes keep renderable content and stable nav/selection data.
- [x] Refactor tray content rendering to keep shell chrome mounted and localize loading to provider card content.
- [x] Tighten panel resize observation/scheduling to measure settled intrinsic content only, then add focused tests and verification notes.

## Verification Notes
- Verified focused regressions with `npx vitest run src/hooks/app/use-probe-state.test.ts src/hooks/app/use-app-plugin-views.test.ts src/hooks/app/use-panel.test.ts src/App.test.tsx` -> 4 files passed, 102 tests passed.
- Verified compile/build with `bun run build` -> `tsc` passed and Vite production build completed successfully.
- Verified the bottom-anchor bounds fix with `npx vitest run src/hooks/app/use-panel.test.ts src/App.test.tsx` -> 2 files passed, 92 tests passed.
- Verified the Rust anchor math and command path with `cargo test --manifest-path src-tauri/Cargo.toml panel -- --nocapture` -> 5 tests passed.

# Fix settings-to-tray provider sync reliability

## Acceptance Criteria
- [x] Selecting a provider in the standalone Settings window reliably switches the tray bar to that provider without needing a second manual reopen.
- [x] If the first live tray-navigation event is missed, reopening or refocusing the tray still applies the last explicit provider target from Settings.
- [x] Bringing the tray forward after a Settings-driven provider switch refreshes that explicit provider instead of leaving stale detail data onscreen.
- [x] Focused backend/frontend verification covers the pending-target replay and tray refresh behavior before the task is marked done.

## Plan
- [x] Add a backend-owned pending tray target view and expose a small consume-once command for the main tray window.
- [x] Update the tray frontend panel hook to replay pending targets on mount/focus and route explicit provider focus into the refresh path.
- [x] Add/update focused Rust and Vitest regressions, run targeted verification, then record notes.

## Verification Notes
- Verified the tray/main-window bridge with `npx vitest run src/hooks/app/use-panel.test.ts src/App.test.tsx` -> 2 files passed, 88 tests passed.
- Verified the backend pending-target store with `cargo test --manifest-path src-tauri/Cargo.toml pending_panel_view_is_consumed_once` -> 1 Rust test passed.

# Document provider input simulation paths

## Acceptance Criteria
- [x] Add a repo doc that explains, for every provider in `plugins/`, whether UsageBar can be tested by faking a local file/DB/env/secret input.
- [x] Each provider entry names the concrete local inputs UsageBar reads today and clearly says when local-file faking is insufficient because remote HTTP/account entitlements still control the output.
- [x] Placeholder/blocked providers are explicitly called out as not yet having a real input path in this repo.
- [x] Verification records the local audit commands used to derive the provider matrix before the task is marked done.

## Plan
- [x] Audit each provider plugin for current local input sources and classify the simulation path.
- [x] Write one provider-by-provider simulation guide under `docs/` with exact paths, caveats, and safe-testing notes.
- [x] Review the new doc text against the plugin code/search results and record verification notes.

## Verification Notes
- Verified the source audit with `rg -n "ctx\\.host\\.(fs|sqlite|keychain|providerSecrets|env|gh|ls|ccusage)\\.|AppData|~\\/|process\\.env|OPENCODE_COOKIE_HEADER|API_KEY|auth\\.json|state\\.vscdb|secrets\\.json|oauth_creds|hosts\\.yml" plugins -S`.
- Verified every provider has a detail section in `docs/provider-input-simulation.md` with `Get-ChildItem plugins -Directory | Select-Object -ExpandProperty Name` plus a PowerShell coverage check against `### \`<provider>\`` headings.
- Verified the final doc text with `Get-Content docs\\provider-input-simulation.md`.

# Improve settings responsiveness for smaller window sizes

## Acceptance Criteria
- [x] The Settings header and tab switcher reflow cleanly on narrow widths without hard minimum-width squeeze.
- [x] General settings segmented controls stack or wrap on smaller widths instead of collapsing into cramped horizontal rows.
- [x] Provider settings rows and summary badges remain readable on narrow widths.
- [x] Focused frontend verification covers the responsive layout hooks before the task is marked done.

## Plan
- [x] Patch the settings page header and tab shell to allow earlier stacking and wrapping.
- [x] Update the general settings option groups to use responsive grid/wrap layouts.
- [x] Tighten the providers pane row/header layout for narrow widths and add a focused test, then run targeted verification.

## Verification Notes
- Verified the responsive settings slice with `npx vitest run src/pages/settings.test.tsx` -> 1 file passed, 10 tests passed.

# Add current provider status matrix to README

## Acceptance Criteria
- [x] `README.md` shows the current Windows status for every provider in the repo.
- [x] The status labels match the current plugin manifest state (`supported`, `experimental`, `blocked`) or clearly call out providers without Windows metadata.
- [x] Providers with docs keep README links to their docs; placeholders without docs point at their plugin folders.
- [x] Verification records the diff/text checks used before the task is marked done.

## Plan
- [x] Audit the current plugin manifests to extract the provider list and Windows state.
- [x] Replace the old README provider buckets with a provider-by-provider Windows status matrix.
- [x] Record the documentation default in `docs/choices.md`, leave a breadcrumb in `docs/breadcrumbs.md`, and verify the final diff/text.

## Verification Notes
- Verified the README table text with `Get-Content README.md`.
- Verified the manifest state source with a PowerShell manifest audit over `plugins/*/plugin.json`.
- Verified the final documentation diff with `git --no-pager diff -- README.md tasks/todo.md docs/choices.md docs/breadcrumbs.md`.

# Improve AGENTS.md repo playbook

## Acceptance Criteria
- [x] `AGENTS.md` has no broken encoding, blank placeholders, or self-contradictory workflow rules.
- [x] `AGENTS.md` reflects the current repo reality: UsageBar Windows-first positioning, current stack, current default commands, and current planning/docs workflow.
- [x] The rewrite preserves the important local guardrails for plugins, Git/GitHub, lessons, choices, and breadcrumbs.
- [x] Verification captures the `AGENTS.md` diff review before the task is marked done.

## Plan
- [x] Audit the current `AGENTS.md` against the live repo docs/scripts and note the concrete fixes needed.
- [x] Rewrite `AGENTS.md` into a cleaner repo-specific operating guide with corrected wording and current commands.
- [x] Record the rewrite default in `docs/choices.md`, leave a breadcrumb in `docs/breadcrumbs.md`, and review the final diff before marking done.

## Verification Notes
- Verified the rewrite with `git --no-pager diff -- AGENTS.md tasks/todo.md tasks/lessons.md docs/choices.md docs/breadcrumbs.md`.
- Verified the final file content with `Get-Content AGENTS.md`.

# Fix settings provider selection isolation

## Acceptance Criteria
- [x] Selecting a provider inside the Settings window updates only the settings detail pane and does not switch/open the tray bar provider view.
- [x] The selected provider row keeps its enabled checkbox visually distinct against the light selected background.
- [x] Focused frontend tests cover the settings-only provider selection behavior.
- [x] Verification captures the focused test command/result before the task is marked done.

## Plan
- [x] Patch the settings provider row interaction so selection stays local to the Settings window.
- [x] Adjust the selected-row checkbox styling so it does not disappear into the selected card background.
- [x] Add/update focused React tests for the selection behavior, then run targeted verification.

## Verification Notes
- Verified the settings slice with `npx vitest run src/pages/settings.test.tsx` -> 1 file passed, 8 tests passed.

# Surface missing provider placeholders from the source-evaluation spec

## Acceptance Criteria
- [x] Every provider listed as missing from `docs/specs/provider-source-evaluation-2026-03-16.md` appears in Settings on Windows.
- [x] Each new provider is surfaced as a blocked placeholder, so it stays visible in Settings but cannot be enabled or probed yet.
- [x] Each placeholder provider folder includes a short implementation-plan file describing the intended future source/auth path.
- [x] Focused frontend verification covers the placeholder provider detail/status behavior before the task is marked done.

## Plan
- [x] Add placeholder plugin folders/manifests/icons for the missing providers from the spec.
- [x] Add provider-settings copy so each placeholder detail view explains the planned Windows implementation path.
- [x] Add/update focused tests for blocked placeholder rendering, then run targeted verification.

## Verification Notes
- Verified bundled plugin sync with `node ./copy-bundled.cjs` -> bundled plugin count increased to 25 and now includes `augment`, `kilo`, `kimi-k2`, `kiro`, `openrouter`, `synthetic`, `vertex-ai`, and `warp`.
- Verified placeholder settings/detail behavior with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 11 tests passed.

# Enable Windsurf experimental support on Windows

## Acceptance Criteria
- [x] Windsurf reads auth state from the Windows `~/AppData/Roaming/.../state.vscdb` path instead of only the macOS app-support path.
- [x] Windsurf uses Windows-aware LS discovery metadata (`language_server_windows*`, `os: "windows"`) when probing the local language server.
- [x] Cloud fallback reads Windows install metadata from `resources/app/product.json` and prefers `windsurfVersion` plus `codeiumVersion`.
- [x] Focused Windsurf plugin coverage includes Windows LS and Windows cloud-fallback regressions.
- [x] Verification captures the focused test command/result before the task is marked done.

## Plan
- [x] Patch the Windsurf plugin for Windows SQLite, LS process, and installed-version metadata.
- [x] Add focused Windsurf tests for Windows LS probing and Windows cloud metadata.
- [x] Update provider docs/notes and mark Windsurf as Windows-experimental.
- [x] Run targeted verification, then review the diff and commit only the Windsurf slice.

## Verification Notes
- Confirmed locally that this Windows machine has `C:\Users\llein\AppData\Roaming\Windsurf\User\globalStorage\state.vscdb`, `D:\Windsurf\resources\app\product.json`, and `D:\Windsurf\resources\app\extensions\windsurf\bin\language_server_windows_x64.exe`; the old plugin still only targeted macOS paths and `language_server_macos`.
- Verified the Windsurf slice with `npx vitest run plugins/windsurf/plugin.test.js` -> 1 file passed, 35 tests passed.

# Fix Claude signed-in fallback on Windows

## Acceptance Criteria
- [x] Claude treats `~/.claude.json` as a valid signed-in account source when the legacy `~/.claude/.credentials.json` file is missing on Windows.
- [x] The plugin does not treat `primaryApiKey` as a replacement for OAuth usage tokens; usage stays sourced from OAuth or local ccusage only.
- [x] When only account metadata is available, the provider no longer throws a false `Not logged in` error and instead returns an account-present fallback state.
- [x] Focused Claude plugin coverage includes the `~/.claude.json` account-file fallback path.
- [x] Verification captures the focused test command/result before the task is marked done.

## Plan
- [x] Add a minimal Claude account-file reader for `~/.claude.json`.
- [x] Reuse account-file metadata as a signed-in fallback without pretending it can fetch OAuth usage.
- [x] Add focused plugin tests for the account-file fallback path.
- [x] Update notes/docs, run focused verification, then mark the slice complete.

## Verification Notes
- Confirmed locally that this Windows machine has `C:\Users\llein\.claude.json` with `oauthAccount` plus `primaryApiKey`, while `C:\Users\llein\.claude\.credentials.json` is absent; the existing plugin would have treated that as logged out unless local ccusage happened to mask it.
- Verified the Claude slice with `npx vitest run plugins/claude/plugin.test.js` -> 1 file passed, 69 tests passed.

# Move Windows provider secrets to DPAPI-backed local storage

## Acceptance Criteria
- [x] Windows provider-secret saves no longer depend on Credential Manager persistence.
- [x] Windows provider-secret reads prefer the DPAPI-backed local store and fall back to older keyring entries for migration.
- [x] Windows provider-secret deletes remove both the local store entry and any legacy keyring entries.
- [x] Focused Rust verification covers the new provider-secret store slice.

## Plan
- [x] Add a Windows-only provider-secret store backed by DPAPI-encrypted local app data.
- [x] Rewire the Tauri save/delete commands and plugin host read path to use the new store on Windows.
- [x] Keep old keyring reads/deletes as fallback cleanup during migration.
- [x] Run focused cargo verification and update the repo notes.

## Verification Notes
- Verified the Windows provider-secret storage slice with `cargo test --manifest-path src-tauri/Cargo.toml provider_secret_` -> 5 Rust tests passed.

# Switch Windows provider secrets to explicit targets

## Acceptance Criteria
- [x] Windows provider-secret writes use an explicit Credential Manager target name instead of the implicit `username.service` mapping.
- [x] Provider-secret reads/deletes still fall back to the old Windows mapping so existing saved secrets keep working.
- [x] Focused Rust coverage locks in the Windows provider-secret target spec.
- [x] Verification captures the focused Rust command/result before the task is marked done.

## Plan
- [x] Add a shared Windows provider-secret target spec/helper in the Tauri backend.
- [x] Rewire provider-secret save/read/delete paths to prefer the explicit-target entry and fall back to the old mapping on Windows.
- [x] Add focused Rust coverage for the Windows target spec and legacy fallback behavior.
- [x] Run targeted cargo verification, then update lessons/breadcrumbs and mark the slice complete.

## Verification Notes
- Verified the Windows provider-secret target/spec slice with `cargo test --manifest-path src-tauri/Cargo.toml provider_secret_` -> 4 Rust tests passed.

# Clarify provider-secret save errors

## Acceptance Criteria
- [x] Saving a provider secret surfaces a precise stage-specific message for vault access, write failure, fresh read-after-write failure, or value mismatch.
- [x] The settings UI preserves string-shaped Tauri errors instead of collapsing them to `Failed to save secret.`
- [x] Focused frontend and Rust tests cover the new save-error wording path.
- [x] Verification captures the focused test commands/results before the task is marked done.

## Plan
- [x] Add provider-secret save error formatters in Tauri with stage-specific wording.
- [x] Add frontend error extraction so Tauri string rejections render exactly in settings.
- [x] Add focused Rust and Vitest coverage for the new messages.
- [x] Run targeted verification, then update lessons/breadcrumbs and mark the slice complete.

## Verification Notes
- Verified backend save-error wording with `cargo test --manifest-path src-tauri/Cargo.toml provider_secret_write_verification` -> 2 Rust tests passed.
- Verified settings rendering with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 9 tests passed.

# Fix Ollama fresh-vault verification

## Acceptance Criteria
- [x] Saving an Ollama cookie verifies the credential through a fresh vault lookup, not the same in-memory keyring entry handle.
- [x] A focused Rust regression test covers the fresh-lookup verification helper behavior.
- [x] Notes capture why CodexBar was useful as a functional Ollama reference but not as a vault-storage reference.
- [x] Verification captures the focused Rust command/result before the task is marked done.

## Plan
- [x] Patch provider-secret save verification to reopen the credential entry before read-back.
- [x] Add focused Rust coverage for the fresh-lookup verification helper.
- [x] Update lessons/choices/breadcrumbs with the root cause and CodexBar comparison.
- [x] Run targeted Rust verification, then mark the slice complete.

## Verification Notes
- Compared against `D:/usagebar/codexbar` and confirmed CodexBar's Ollama manual mode stores `ollamaCookieHeader` in config (`docs/configuration.md`, `Sources/CodexBar/Providers/Ollama/OllamaSettingsStore.swift`) while only using its fetcher for header normalization/session-cookie validation, so it does not exercise this Windows vault path.
- Verified the fresh-lookup helper with `cargo test --manifest-path src-tauri/Cargo.toml provider_secret_write_verification` -> 2 Rust tests passed.

# Fix Copilot gh-auth fallback on Windows

## Acceptance Criteria
- [x] Copilot can acquire a GitHub token from the active `gh` login even when the keychain lookup path misses.
- [x] The plugin prefers existing cached/keychain paths first and only falls back to `gh auth token` when needed.
- [x] Focused Copilot coverage includes the `gh auth token` fallback path.
- [x] Verification captures the focused test command/result before the task is marked done.

## Plan
- [x] Add a small host API helper for `gh auth token`.
- [x] Use that helper as a Copilot fallback after the keychain paths.
- [x] Add focused plugin coverage for the direct `gh` fallback path.
- [x] Run targeted verification, then update lessons/breadcrumbs and mark the slice complete.

## Verification Notes
- Confirmed locally that `gh auth status --json hosts` reports the active account `Loues000`, `gh auth token` returns a token successfully, and Windows Credential Manager contains `gh:github.com:Loues000`; the break was in OpenUsage's narrower token-read path, not in the user's GH login state.
- Verified the Copilot plugin slice with `npx vitest run plugins/copilot/plugin.test.js` -> 1 file passed, 36 tests passed.
- Verified the host API surface with `cargo test --manifest-path src-tauri/Cargo.toml keychain_api_exposes_account_read_and_write` -> 1 Rust test passed.

# Harden Antigravity mixed-port LS selection

## Acceptance Criteria
- [x] Antigravity keeps trying discovered LS port/scheme candidates until one returns usable usage data instead of committing to the first non-throwing probe.
- [x] A dead or non-LS extension port no longer blocks a valid direct LS port on Windows.
- [x] Focused Antigravity plugin coverage includes a mixed-port regression where the first candidate fails and a later candidate succeeds.

## Plan
- [x] Replace the one-shot probe-port selection with candidate iteration over discovered ports/schemes plus extension-port fallback.
- [x] Add a focused Antigravity regression test for mixed usable/unusable LS candidates.
- [x] Run targeted verification and capture the result before marking the slice done.

## Verification Notes
- Confirmed on this Windows machine that the live Antigravity LS currently exposes mixed candidates at once: `54226` serves the LS over `https`, `54227` serves the LS over `http`, `54234` is unusable, and the extension port `54628` returns `404` for `GetUserStatus`/`GetCommandModelConfigs`; the old plugin could still commit too early to a bad candidate.
- Verified the hardened Antigravity LS selection with `bun run test -- plugins/antigravity/plugin.test.js` -> 1 file passed, 14 tests passed.

# Fix Antigravity quota source and tray first-open sizing

## Acceptance Criteria
- [x] Antigravity on localized Windows still discovers real LS listening ports instead of falling back to stale cloud quota data.
- [x] A focused Rust regression test covers non-English `netstat` listening-state output.
- [x] The tray popup remeasures itself when it gains focus so first open does not stay at the hidden-startup height.
- [x] A focused frontend regression test covers the focus-time resize path.
- [x] Verification captures the focused Rust and Vitest commands/results before the task is marked done.

## Plan
- [x] Patch Windows LS port parsing to stop depending on the English `LISTENING` token.
- [x] Add a focused Rust test for localized Windows `netstat` output.
- [x] Trigger a panel resize pass on popup focus and cover it with a focused app test.
- [x] Run the targeted verification commands, then update lessons/breadcrumbs and mark the slice complete.

## Verification Notes
- Confirmed on this Windows machine that Antigravity's live LS process exposes the real quota fractions on localhost (`Gemini 3.1 Pro (High/Low) = 0.6`, `Gemini 3 Flash = 1.0`, `Claude/GPT-OSS = 0.2`) while the stale fallback path was showing the incorrect `100%`/`6d 23h` data.
- Verified the localized Windows LS parser with `cargo test --manifest-path src-tauri/Cargo.toml ls_parse_netstat_ports_accepts_localized_windows_listen_rows` -> 1 Rust test passed.
- Verified the tray sizing slice with `npx vitest run src/App.test.tsx -t "remeasures the panel when the popup gains focus|passes the target panel height when repositioning after resize"` -> 1 file passed, 2 tests passed.

# Sync non-colliding upstream changes

## Acceptance Criteria
- [x] Latest refs from `upstream` are fetched locally.
- [x] Upstream-only changes are reviewed against current branch and uncommitted work.
- [x] Non-colliding upstream changes are applied to `feat/windows-app`.
- [x] Colliding upstream changes are left unapplied and listed with reasons.
- [x] Final verification captures resulting git status/log/diff state.

## Plan
- [x] Fetch `upstream` and inspect the divergence from the current branch.
- [x] Classify upstream commits into safe-to-apply vs colliding with local work.
- [x] Replay the safe upstream changes onto the current branch.
- [x] Verify the resulting worktree and summarize applied vs skipped changes.

## Verification Notes
- Fetched `upstream/main` to `459647c`.
- Imported non-colliding upstream files for `opencode-go`, Windsurf credits API versioning, and reset-tooltip behavior/tests.
- Revisited provider-path collisions and safely ported the upstream Claude Max-tier label logic, Cursor percent-only free-plan handling, and `CCUSAGE_VERSION` bump without taking the wider colliding side-nav/backend slices.
- Left the remaining colliding upstream work unapplied where this branch already diverged in the same paths: side-nav drag reorder (`src/App.tsx`, `src/components/app/app-shell.tsx`, `src/components/side-nav.tsx`, `src/hooks/app/use-settings-plugin-actions.ts`), package/dependency bumps (`package.json`, `bun.lock`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`), Rust/Tauri backend changes (`src-tauri/src/lib.rs`, `src-tauri/src/plugin_engine/host_api.rs`, `src-tauri/tauri.conf.json`), and the non-imported portions of upstream Claude/Cursor plugin changes.
- Verified imported slice with `bun run test -- plugins/opencode-go/plugin.test.js plugins/windsurf/plugin.test.js src/lib/reset-tooltip.test.ts src/lib/reset-tooltip.mocked.test.ts src/components/provider-card.test.tsx src/components/global-shortcut-section.test.tsx` -> 6 files passed, 101 tests passed.
- Verified the provider hunk import with `bun run test -- plugins/claude/plugin.test.js plugins/cursor/plugin.test.js plugins/windsurf/plugin.test.js` -> 3 files passed, 158 tests passed.
- Verified the backend constant change with `cargo test --manifest-path src-tauri/Cargo.toml --lib plugin_engine::host_api` -> 34 tests passed.

# Ignore temporary Rust test targets

## Acceptance Criteria
- [x] `src-tauri/target-test-temp*` build folders no longer appear as untracked files in `git status`.
- [x] Real Tauri source/config under `src-tauri` remains tracked.
- [x] The change is limited to ignore rules and verification notes.

## Plan
- [x] Inspect current ignore coverage for Rust/Tauri build outputs.
- [x] Add the minimal ignore rule for temporary test target folders.
- [x] Verify `git status` no longer lists the temp target folders and capture the result.

# Remove redundant settings provider setup

## Acceptance Criteria
- [x] Settings no longer renders a separate `Provider Setup` section.
- [x] Provider setup remains available on the main provider detail view.
- [x] Redundant provider-setup props/data flow for settings is removed.
- [x] Relevant tests for settings/provider detail pass.

## Plan
- [x] Inspect settings/provider-detail/provider-setup wiring and identify redundant props.
- [x] Remove the settings-only provider setup section and dead prop plumbing.
- [x] Update targeted tests and verify the affected UI path.

# Stabilize provider switch panel anchor

## Acceptance Criteria
- [x] Switching providers does not move the window under the Windows taskbar.
- [x] Window position keeps the lower edge anchored while provider content height changes.
- [x] Relevant verification for the affected code path has been run.

## Plan
- [x] Inspect provider switch and window sizing/positioning flow.
- [x] Implement a minimal fix for stable position/clamping.
- [x] Verify behavior and update notes.

# Prevent setup panel first-render jolt

## Acceptance Criteria
- [x] Provider setup does not auto-expand while the provider probe is still loading.
- [x] Disconnected providers still show setup guidance once loading has settled with no successful probe.
- [x] Relevant provider-setup tests cover the loading transition and pass.

## Plan
- [x] Inspect provider setup initial expansion state against probe loading transitions.
- [x] Implement the smallest fix that suppresses load-time auto-expansion without removing disconnected guidance.
- [x] Verify targeted tests and capture the regression lesson if the fix lands.

# Temporarily hide provider setup for jitter isolation

## Acceptance Criteria
- [x] Provider detail no longer renders the setup section during this diagnostic pass.
- [x] Relevant detail-page test reflects the temporary hidden state and passes.

## Plan
- [x] Remove the provider setup render path from provider detail without deleting the underlying component.
- [x] Update targeted tests and verification notes for the temporary diagnostic state.

# Stabilize upward growth and minimum empty-state height

## Acceptance Criteria
- [x] Panel content no longer animates downward inside the window while the native panel is resizing.
- [x] Empty / low-content states still keep enough height for `Home + enabled providers + Help + Settings`.
- [x] Relevant sizing tests cover the minimum-height rule and pass.
- [x] Upward panel growth repositions before native resize so the window reads as rising instead of falling.

## Plan
- [x] Inspect shell-level height animation and nav-driven height floor in the panel sizing flow.
- [x] Remove inner height animation and add a nav-based minimum logical panel height.
- [x] Verify targeted sizing tests and record the sizing default.

# Add Ollama cloud usage provider

## Acceptance Criteria
- [x] `Ollama` appears as a supported Windows provider and can be enabled.
- [x] Provider detail exposes manual cookie setup for Ollama.
- [x] Ollama probe returns `plan`, `Session`, and optional `Weekly` from `https://ollama.com/settings`.
- [x] Missing/expired/signed-out cookies fail with explicit auth/setup errors.
- [x] Targeted plugin/UI tests pass and docs/README mention Ollama.

## Plan
- [x] Add the Ollama plugin bundle, parser, and plugin tests.
- [x] Restore provider-detail setup rendering and wire Ollama setup metadata.
- [x] Update Windows support/docs notes and verify targeted tests.
- [x] Change grow updates to `reposition -> resize` and verify the call order with a focused app test.

# Audit provider/docs mismatch in Windows fork

## Acceptance Criteria
- [x] Provider/docs mismatches in the current Windows fork are identified with concrete file references.
- [x] Findings distinguish between unsupported-on-Windows, hidden-in-UI, and supported-but-incomplete providers.
- [x] The user gets a short root-cause summary for why documented providers can still fail in this fork.

## Plan
- [x] Compare README/provider docs against Windows support gating and surfaced-provider filtering.
- [x] Inspect supported provider implementations for known Windows-only gaps that can still cause runtime failure.
- [x] Summarize findings with evidence and recommended next fix order.

# Save Windows provider rollout plan to docs

## Acceptance Criteria
- [x] A Windows rollout plan exists in `docs` and covers every documented provider.
- [x] The plan distinguishes between already-working, hidden, blocked, and not-started providers.
- [x] The plan includes cross-cutting work, provider-specific next steps, and verification criteria.
- [x] Existing Windows docs link to the new plan or clearly reference it.

# Clarify OpenCode provider setup and naming

## Acceptance Criteria
- [x] `OpenCode` has a provider doc that explains the current web/cookie flow and links from `README.md`.
- [x] The docs explain why `OpenCode` and `OpenCode Go` both exist and what each one tracks.
- [x] OpenCode setup copy tells users where usage is visible on the website today and how to capture the full `Cookie` request header.
- [x] Focused verification covers the affected provider-settings path before the task is marked done.

## Plan
- [x] Add the OpenCode clarification slice to the docs with current plugin behavior and setup steps.
- [x] Update README/setup copy to point at the new doc and explain the provider split.
- [x] Run focused verification, review the diff, then capture the result in notes.

## Verification Notes
- Verified the OpenCode setup copy slice with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 10 tests passed.

# Improve OpenCode usage diagnostics

## Acceptance Criteria
- [x] OpenCode distinguishes "no subscription data" from "response shape missing expected usage windows" with actionable wording.
- [x] The actionable error tells the user to verify the workspace ID from the billing URL or `/_server` payload when applicable.
- [x] Focused OpenCode plugin tests cover the improved diagnostic path.

## Plan
- [x] Tighten the OpenCode plugin parse error handling around missing rolling/weekly fields.
- [x] Add focused plugin coverage for the clearer diagnostics.
- [x] Run targeted verification and capture the result.

## Verification Notes
- Verified the OpenCode diagnostics slice with `npx vitest run plugins/opencode/plugin.test.js` -> 1 file passed, 4 tests passed.

## Plan
- [x] Consolidate current Windows support notes and provider audit findings into one rollout outline.
- [x] Write the provider-by-provider Windows plan in a new docs file.
- [x] Link the new plan from the existing Windows status doc and record breadcrumbs/choices.

# Execute Windows rollout phases 1-3

## Acceptance Criteria
- [x] Windows provider support/surfacing no longer depends on a duplicated Rust allowlist plus frontend-only hide list.
- [x] `OpenCode` is either surfaced or explicitly blocked by shared plugin metadata; the UI no longer special-cases it.
- [x] `JetBrains AI Assistant` is enabled as the first low-risk Windows rollout candidate and can be toggled from Settings.
- [x] Plugin manifest docs and Windows status docs reflect the new support model.
- [x] Targeted Rust + Vitest coverage passes for the new manifest/support behavior.

## Plan
- [x] Add manifest-level Windows support metadata and wire it through `list_plugins`/probe eligibility.
- [x] Replace frontend-only provider surfacing rules with manifest-driven metadata and remove the `OpenCode` contradiction.
- [x] Mark `JetBrains AI Assistant` as Windows-experimental, update docs, and verify with targeted tests.

# Harden JetBrains Windows rollout

## Acceptance Criteria
- [x] JetBrains provider also detects Android Studio config roots under vendor-specific base paths where applicable.
- [x] IDE directory matching is case-insensitive so Windows directory-name casing does not break discovery.
- [x] A reusable Windows provider verification checklist exists in `docs` and JetBrains docs point to it.
- [x] Targeted JetBrains plugin tests pass after the Windows path hardening.

## Plan
- [x] Extend JetBrains path discovery for vendor-specific base paths and case-insensitive IDE matching.
- [x] Add focused plugin coverage for the new Windows detection paths.
- [x] Add the Windows verification harness doc, update JetBrains/provider rollout docs, and verify the slice.

# Plan subscription-light provider rollout

## Acceptance Criteria
- [x] `docs/windows-provider-rollout-plan.md` exists and becomes the canonical Windows provider execution roadmap for this fork.
- [x] The roadmap optimizes the next provider order for free/trial access, official local auth flows, or deterministic fixtures before paid opaque providers.
- [x] Every provider in the current Windows rollout scope has exactly one validation mode: `self-testable`, `community-needed`, or `fixture-only until real account`.
- [x] The roadmap separates `Contract Coverage` from `Entitlement Coverage` as distinct columns instead of collapsing them into prose.
- [x] The first three execution slices are concrete, small, and independently verifiable on Windows.

## Plan
- [x] Create `docs/windows-provider-rollout-plan.md` with a provider matrix covering current Windows state, primary evidence source, validation mode, contract coverage, entitlement coverage, next slice, and rationale.
- [x] Rewrite the rollout order around subscription-light validation: `Copilot`, `Gemini`, `Claude` first; then `Cursor`, `Codex`, `Ollama`, `OpenCode`; then `JetBrains AI Assistant`, `Antigravity`; defer the remaining opaque providers.
- [x] Make the first three execution slices explicit and testable: Copilot `gh` account-state hardening, Gemini official OAuth/API-key path hardening, and fixture-backed contract coverage for the already-supported providers.
- [x] Update `docs/windows.md` to keep the status/checklist material but point its rollout-order guidance at `docs/windows-provider-rollout-plan.md`.

## Verification Notes
- [x] Verified the roadmap schema and provider rows with `rg -n "Validation Mode|Contract Coverage|Entitlement Coverage|Copilot|Gemini|Claude|Cursor|Codex|Ollama|OpenCode|JetBrains AI Assistant|Antigravity" docs/windows-provider-rollout-plan.md`.
- [x] Reviewed the docs diff with `git --no-pager diff --color=never -- tasks/todo.md docs/windows.md docs/windows-provider-rollout-plan.md`.

# Stabilize settings and tray popup window behavior

## Acceptance Criteria
- [x] The standalone Settings window opens at a fixed size instead of resizing with content changes.
- [x] The tray bar window no longer visibly jumps around while opening, resizing, or switching content.
- [x] The tray popup no longer starts at an undersized height before correcting itself on first open.
- [x] Opening the popup from Windows `Ausgeblendete Symbole` overflow via the multi-menu path still yields the correct size and position.
- [x] Antigravity usage/loading works even when its view has not been opened yet in the current app session.

## Plan
- [x] Fix `src-tauri/src/settings_window.rs` to keep the standalone settings window at a fixed `960x720` size.
- [x] Add backend-owned panel geometry memory in `src-tauri/src/panel.rs` plus a new `sync_panel_geometry` Tauri command so the tray popup can reuse the last measured logical height.
- [x] Simplify `src/hooks/app/use-panel.ts` to one resize pass per settled height, sync the measured height back to Rust, and keep focus-time remeasure as fallback only.
- [x] Fix tray menu opens in `src-tauri/src/tray.rs` so `Show Stats` positions the panel near the current cursor/work area and `Go to Settings` opens the standalone settings window instead of stale tray navigation.
- [x] Add a generic enabled-provider catch-up probe path so providers like Antigravity do not depend on being the active view before they load.

## Verification Notes
- [x] Verified the focused frontend regressions with `npx vitest run src/hooks/app/use-panel.test.ts src/App.test.tsx` -> 2 files passed, 86 tests passed.
- [x] Verified the focused Rust panel tests with `cargo test --manifest-path src-tauri/Cargo.toml panel::` -> 3 Rust tests passed.
- [x] Reviewed the final slice with `git --no-pager diff --color=never -- tasks/todo.md docs/windows.md docs/windows-provider-rollout-plan.md src-tauri/src/settings_window.rs src-tauri/src/panel.rs src-tauri/src/tray.rs src-tauri/src/lib.rs src/hooks/app/use-panel.ts src/hooks/app/use-panel.test.ts src/App.tsx src/App.test.tsx docs/choices.md docs/breadcrumbs.md tasks/lessons.md`.

# Auto-pop tray panel on provider selection from settings

## Acceptance Criteria
- [x] Clicking a provider in the standalone `Settings > Providers` pane selects it there and also reveals the tray panel on that provider.
- [x] The initial fallback selection in settings does not auto-pop the tray panel without an explicit user click.
- [x] A focused regression test covers the new selection-to-tray bridge.
- [x] Targeted verification for the affected frontend flow passes.

## Plan
- [x] Add a narrow Tauri command that shows the main tray panel and emits navigation for a requested provider view.
- [x] Wire explicit provider-row selection in the settings window to call the new bridge without changing passive default selection behavior.
- [x] Add/update a focused test and verify the affected suite.

# Add Providers settings pane

## Acceptance Criteria
- [x] Settings renders `General` and `Providers` tabs while keeping the current OpenUsage visual language.
- [x] The `Providers` tab becomes the single editable surface for provider config, source, and stored-secret flows.
- [x] Provider detail no longer renders inline setup fields and instead links to `Settings > Providers` for the current provider.
- [x] Existing provider config persistence remains compatible and targeted tests plus a build pass.

## Plan
- [x] Add the new Settings tab/selection UI state and split the Settings route into `General` and `Providers`.
- [x] Build the Providers list/detail pane, move reorder/toggle controls there, and reuse the current provider config/secret handlers.
- [x] Replace detail-page setup with a manage-provider CTA, update focused tests, and verify with `vitest` plus `bun run build`.

# Rewire local clone to personal fork

## Acceptance Criteria
- [x] A GitHub fork of `robinebers/openusage` exists under the authenticated personal account.
- [x] Local `origin` points to the personal fork and local `upstream` points to `robinebers/openusage`.
- [x] Current branch and uncommitted work remain intact after the remote changes.
- [x] Remote configuration is verified with `git remote -v` and `gh repo view`.

## Plan
- [x] Create the fork with GitHub CLI from the current upstream clone.
- [x] Update local remotes so `origin` is the fork and `upstream` is the official repo.
- [x] Verify the new wiring and record the remote model in repo notes.

# Reposition fork and clean copied branches

## Acceptance Criteria
- [x] README and GitHub repo metadata describe this repo as a Windows-first fork/product rather than the upstream project.
- [x] Upstream lineage remains visible in the repo copy.
- [x] Copied GitHub branches in the fork are removed, keeping `main` intact.
- [x] Local working tree and current branch remain unchanged apart from the intended doc edits.

## Plan
- [x] Rewrite the top-level README framing for the fork direction.
- [x] Update GitHub repo metadata to match the fork positioning.
- [x] Delete copied GitHub branches from the fork except `main` and verify the remaining branch set.

# Extract settings into standalone window

## Acceptance Criteria
- [x] The tray popup no longer renders a Settings view.
- [x] Clicking settings-related entry points opens or focuses a separate settings window instead of changing the tray content.
- [x] The standalone settings window supports both general settings and provider settings.
- [x] Provider detail can open the standalone settings window with the relevant provider selected.
- [x] Focused tests/build verification cover the new window-only settings flow.

## Plan
- [x] Reuse the current settings panes in a dedicated settings-window app surface.
- [x] Add a Tauri open/focus command for the settings window and wire frontend entry points to it.
- [x] Remove in-panel settings navigation/state from the tray popup and verify the resulting flow.

# Evaluate provider data sources across openusage and CodexBar

## Acceptance Criteria
- [x] A local-only evaluation note exists under a gitignored path.
- [x] The note covers every current provider in `openusage` and `codexbar`.
- [x] Each provider entry states where usage/auth data comes from in each repo: web, cookies, local files, sqlite, keychain, JSON, OAuth/API, or local process.
- [x] The note calls out provider overlap, repo-only providers, and any clear source mismatches or doc/code drift.

## Plan
- [x] Inventory provider lists in both repos and collect source evidence from plugin code/docs.
- [x] Write a provider matrix and concise findings in a gitignored note.
- [x] Verify the note path is ignored by git and review the resulting worktree scope.

# Land Gemini as a Windows-experimental provider

## Acceptance Criteria
- [x] Gemini refresh can locate `oauth2.js` from the common Windows npm global install root (`%AppData%/npm/node_modules`) instead of only Unix-oriented paths.
- [x] Focused Gemini tests cover the Windows OAuth-client lookup path and still pass existing refresh behavior.
- [x] `plugins/gemini/plugin.json` marks Gemini as `experimental` on Windows so it can be surfaced and probed.
- [x] Gemini rollout/status/provider docs reflect the Windows-experimental state and note the remaining real-account verification gap.
- [x] Verification captures the focused test command/result before the task is marked done.

## Plan
- [x] Add the smallest Windows-specific Gemini OAuth client lookup paths without changing the broader auth model.
- [x] Add focused plugin coverage for the Windows npm global path and keep existing token-refresh behavior green.
- [x] Flip Gemini to Windows-experimental in the manifest and update the rollout/status/provider docs plus breadcrumbs/choices.
- [x] Run focused verification, capture the result, and only then mark the slice done.

## Verification Notes
- Confirmed the common Windows npm global root locally with `npm prefix -g` -> `C:\Users\llein\AppData\Roaming\npm`.
- Verified the Gemini slice with `bun run test -- plugins/gemini/plugin.test.js` -> 1 file passed, 27 tests passed.

# Land Copilot as a Windows-experimental provider

## Acceptance Criteria
- [x] The plugin host exposes one account-aware external keychain read so plugins can target credentials like `gh:github.com:<login>` without changing OpenUsage-scoped writes.
- [x] Copilot resolves the active GitHub CLI login from `hosts.yml` and prefers that account-specific credential before the old ambiguous service-only fallback.
- [x] Focused Copilot tests cover the active-account path, and focused host-api coverage verifies the new method is injected.
- [x] `plugins/copilot/plugin.json` marks Copilot as `experimental` on Windows so it can be surfaced and probed.
- [x] Copilot rollout/provider docs reflect the Windows-experimental state and narrow the remaining gaps to real free/paid validation plus broader multi-account/runtime evidence.

## Plan
- [x] Add the smallest host-api extension needed for account-aware external keychain reads and document it.
- [x] Teach the Copilot plugin to parse the active `gh` login from `hosts.yml` and use the account-aware keychain read first.
- [x] Add focused Rust + Vitest coverage for the new host/plugin behavior and flip the manifest to Windows-experimental.
- [x] Update the rollout/status/provider docs plus breadcrumbs/choices/lessons, then verify with focused test commands before marking done.

## Verification Notes
- Verified the active `gh` account shape locally with `gh auth status --json hosts` plus `%AppData%\\GitHub CLI\\hosts.yml`.
- Verified the Copilot plugin slice with `bun run test -- plugins/copilot/plugin.test.js` -> 1 file passed, 35 tests passed.
- Verified the injected host keychain API surface with `cargo test keychain_api_exposes_account_read_and_write --manifest-path src-tauri/Cargo.toml` -> 1 Rust test passed.

# Land Amp as a Windows-experimental provider

## Acceptance Criteria
- [x] Amp explicitly stays on the existing home-relative secrets path because the official Windows path `%USERPROFILE%\\.local\\share\\amp\\secrets.json` matches the current plugin lookup.
- [x] Focused Amp tests include a Windows-specific secrets-file path regression.
- [x] `plugins/amp/plugin.json` marks Amp as `experimental` on Windows so it can be surfaced and probed.
- [x] Amp rollout/provider docs reflect the Windows-experimental state and narrow the remaining gap to real signed-in Windows validation.

## Plan
- [x] Record the Amp Windows path default in `docs/choices.md` and note the task slice.
- [x] Add a focused Windows-path Amp test without changing the underlying auth model.
- [x] Flip Amp to Windows-experimental in the manifest and update the rollout/status/provider docs plus lessons/breadcrumbs.
- [x] Verify with the focused Amp test command before marking the slice done.

## Verification Notes
- Verified the Amp slice with `bun run test -- plugins/amp/plugin.test.js` -> 1 file passed, 29 tests passed.

# Guard Windows tauri dev against stale openusage.exe locks

## Acceptance Criteria
- [x] `bun run tauri dev` on Windows preflights and terminates only stale local `src-tauri\\target\\debug\\openusage.exe` processes from this workspace before launching the Tauri CLI.
- [x] Non-`dev` Tauri commands keep working through the same wrapper without changing their arguments.
- [x] Verification captures a Windows run showing the stale-process guard and successful Tauri CLI handoff.

## Plan
- [x] Add a small Node wrapper for the local Tauri CLI and keep it as the package entry point.
- [x] On Windows `dev`, match running `openusage.exe` processes by exact executable path and stop only those stale local dev instances.
- [x] Verify the wrapper on this machine, then update lessons/choices/breadcrumbs and mark the slice done.

## Verification Notes
- Confirmed a stale local debug process was present at `D:\UsageBar\openusage\src-tauri\target\debug\openusage.exe` (PID `22612`) before the fix.
- Verified `bun run tauri dev` now prints `Stopped stale OpenUsage dev process PID 22612`, starts Vite, recompiles Rust, and reaches `Running target\\debug\\openusage.exe` instead of failing with `failed to remove ... openusage.exe` / `os error 5`.
- Verified non-dev passthrough with `bun run tauri --version` -> `tauri-cli 2.10.1`.

# Refresh provider source evaluation spec

## Acceptance Criteria
- [x] `docs/specs/provider-source-evaluation-2026-03-16.md` reflects the current repo state instead of the older March 16 assumptions.
- [x] The spec no longer claims that already-surfaced placeholder providers or `docs/providers/opencode.md` are missing.
- [x] The spec adds `OpenCode Go` and updates Windsurf to the current cloud-quota/state-DB model.
- [x] Verification records the diff/text checks used to confirm the refresh before the task is marked done.

## Plan
- [x] Re-audit the current provider/docs surface in this repo and the sibling `codexbar` source references used by the spec.
- [x] Update the source-evaluation spec with the corrected provider matrix, findings, and Windows rollout notes.
- [x] Record the spec-refresh default in `docs/choices.md`, leave a breadcrumb in `docs/breadcrumbs.md`, and verify the resulting diff.

## Verification Notes
- Verified the refresh diff with `git --no-pager diff -- tasks/todo.md docs/choices.md docs/breadcrumbs.md docs/specs/provider-source-evaluation-2026-03-16.md`.
- Verified the updated spec text with `rg -n "OpenCode Go|docs/providers/opencode.md|placeholder|Windsurf|missing provider" docs/specs/provider-source-evaluation-2026-03-16.md`.

# Guard Windows tauri dev against moved-repo Cargo/Tauri metadata

## Acceptance Criteria
- [x] `npm run tauri dev` on Windows detects copied `src-tauri\\target\\debug\\build\\*\\root-output` metadata that still points at another repo path and clears the stale debug metadata before launching Tauri.
- [x] Current-repo `root-output` metadata stays untouched.
- [x] Focused regression coverage exists for stale-path detection/cleanup behavior.
- [x] Verification captures both the focused test command/result and a real `tauri dev` retry passing the previous permission-generation failure point.

## Plan
- [x] Extract a small wrapper helper that scans `target\\debug\\build` `root-output` files for paths outside this repo's target root.
- [x] On Windows `dev`, clear only regenerable debug metadata (`target\\debug\\build` and `.fingerprint`) when stale moved-repo paths are found.
- [x] Add a focused Node regression test for current-path vs stale-path handling.
- [x] Retry `npm run tauri dev`, confirm the old `failed to read plugin permissions` error is gone, then record the result.

## Verification Notes
- Verified the wrapper helper with `node --test scripts/tauri/wrapper.test.mjs` -> 2 tests passed.
- Verified `npm run tauri dev` now prints `Removed stale Cargo/Tauri debug metadata copied from another repo path (D:\UsageBar\openusage\src-tauri\target\debug\build\anyhow-11ad8ede9f4b8b45\out).`, then reaches `Running DevCommand (cargo run --no-default-features --color always --)` and starts recompiling crates instead of failing immediately in the `openusage` custom build step with missing autogenerated permission files.
# First beta Windows release

## Acceptance Criteria
- [ ] GitHub publish workflow can create a Windows prerelease from a tag like `v0.1.0-beta.3` and upload a setup `.exe`.
- [x] App release metadata points to this fork (`UsageBar` branding in bundle UI, fork updater URL, repo issue links).
- [x] Local Windows release command works from this repo without relying on the old macOS-only shell script.
- [x] A local Windows release build is attempted and its resulting artifact path or blocker is recorded before the slice is marked done.

## Plan
- [x] Patch release workflow/config/docs for the first Windows beta flow.
- [x] Replace the local release helper with a Windows-safe cross-platform script.
- [x] Run a local Windows release build, then record verification notes and breadcrumbs.

## Verification Notes
- Verified the local Windows beta build with `node ./scripts/build-release.mjs --bundles nsis` -> exit code `0`, unsigned local build path auto-added `--no-sign`, and produced `src-tauri/target/release/bundle/nsis/UsageBar_0.1.0-beta.3_x64-setup.exe`.
- Verified the release candidate checks for `v0.1.0-beta.3` with `node ./scripts/release-preflight.mjs --release-tag v0.1.0-beta.3`, `npm run build`, `npx vitest run`, and `cargo test --manifest-path src-tauri/Cargo.toml` -> all passed locally before tagging.
- First tagged publish attempt on `v0.1.0-beta.1` failed in GitHub Actions because the repo had no `TAURI_SIGNING_PRIVATE_KEY` secret and the Windows Tauri wrapper spawned the local `.cmd` entrypoint incompatibly on the runner. The follow-up release was moved to `v0.1.0-beta.2` per the release failure rule.
- The `v0.1.0-beta.2` publish retry failed after that secret fix because the GitHub Actions Bun install did not expose a local `tauri.cmd`, which forced the wrapper onto an `npx` fallback that could not resolve the executable on `windows-latest`. The follow-up release was moved to `v0.1.0-beta.3`.
- Verified the native release binary build path with `Get-Item src-tauri/target/release/openusage.exe` -> built `src-tauri/target/release/openusage.exe` before NSIS packaging.
- Verified the Tauri CLI supports local unsigned bundling with `node ./scripts/tauri/wrapper.mjs build --help` -> documents `--no-sign`.
- Verified the official NSIS bundle download host is reachable from this machine with `curl.exe -L --head https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip` -> final `200 OK`; the initial DNS error was transient, not a repo config issue.
- Live GitHub prerelease publishing is still pending an actual tag push; the workflow changes were diff-reviewed but not executed from Actions in this local session.
# Hide startup CLI windows in packaged Windows app

## Acceptance Criteria
- [ ] UsageBar no longer flashes `bunx.exe` or similar command windows during normal packaged-app startup on Windows.
- [x] The Windows host API runs `ccusage` runner detection/execution without creating visible console windows.
- [x] Focused Rust verification and one packaged Windows release build pass after the change.

## Plan
- [x] Patch the Windows subprocess path in `src-tauri/src/plugin_engine/host_api.rs` to set hidden background process flags for `ccusage` and related shell-outs.
- [x] Rebuild/test the Rust backend and the NSIS package path.
- [x] Record the verification result plus the prevention note in repo notes.

## Verification Notes
- Verified focused Rust coverage with `cargo test --manifest-path src-tauri/Cargo.toml configure_ccusage_command` -> 2 tests passed.
- Verified the packaged Windows release path with `node ./scripts/build-release.mjs --bundles nsis` -> exit code `0` and produced `src-tauri/target/release/bundle/nsis/UsageBar_0.1.0-beta.3_x64-setup.exe`.
- Follow-up: the packaged refresh path still surfaced the Bun shim itself (`bunx.exe`) above other apps. Switched the Windows Bun-backed `ccusage` path to `bun.exe x ...`, cached resolved runners for the session, and re-verified with `cargo test --manifest-path src-tauri/Cargo.toml ccusage -- --nocapture` plus `node ./scripts/build-release.mjs --bundles nsis`.
- The visual “no command window flash” outcome is not fully terminal-verifiable here; it still needs a manual launch check against the newly installed build on this Windows machine.

# Implement Synthetic as a Windows-experimental API-key provider

## Acceptance Criteria
- [x] `Synthetic` no longer throws as a Windows placeholder and instead probes a real quota or credits endpoint from a stored API key or supported env var.
- [x] The provider is surfaced as Windows-experimental with setup copy that explains the app-secret and env-var path on Windows.
- [x] The provider docs, rollout/status docs, and input-simulation matrix all match the new implementation state.
- [x] Focused Synthetic plugin tests, provider-settings detail tests, and the env allowlist Rust test pass before the slice is marked done.

## Plan
- [x] Replace the placeholder `plugins/synthetic` implementation with a direct API-key probe plus focused regressions.
- [x] Update `provider-settings.ts`, README/provider docs, Windows rollout docs, and simulation docs to reflect the real Windows setup path and experimental state.
- [x] Run focused JS/Vitest/Rust verification, then record notes plus any lessons/choices/breadcrumbs updates.

## Verification Notes
- Verified the Synthetic plugin contract with `bun run test -- plugins/synthetic/plugin.test.js` -> 1 file passed, 10 tests passed.
- Verified the settings-detail copy with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 15 tests passed.
- Verified the plugin-host env exposure with `cargo test --manifest-path src-tauri/Cargo.toml env_api_respects_allowlist_in_host_and_js` -> 1 Rust test passed.
- Synced bundled plugin output with `node ./copy-bundled.cjs` so `src-tauri/resources/bundled_plugins/synthetic` now matches the implemented source plugin instead of the old placeholder copy.
- Checked local live-key evidence with `if ($env:SYNTHETIC_API_KEY) { 'SYNTHETIC_API_KEY=set' } else { 'SYNTHETIC_API_KEY=missing' }` -> `SYNTHETIC_API_KEY=missing` on this machine, so the provider remains explicitly `experimental` pending real Windows API-key validation.

# Implement Kilo as a Windows-experimental API-key provider

## Acceptance Criteria
- [x] `Kilo` no longer throws as a Windows placeholder and instead probes a real usage endpoint from a stored API key or `KILO_API_KEY`.
- [x] The provider is surfaced as Windows-experimental with setup copy that explains the app-secret and env-var path on Windows.
- [x] The provider docs, rollout/status docs, and input-simulation matrix all match the new implementation state and explicitly note that CLI fallback is deferred.
- [x] Focused Kilo plugin tests, provider-settings detail tests, and the env allowlist Rust test pass before the slice is marked done.

## Plan
- [x] Replace the placeholder `plugins/kilo` implementation with a direct API-key probe plus focused regressions.
- [x] Update `provider-settings.ts`, README/provider docs, Windows rollout docs, and simulation docs to reflect the real Windows setup path and the deferred CLI fallback.
- [x] Run focused JS/Vitest/Rust verification, sync the bundled plugin copy, then record notes plus any lessons/choices/breadcrumbs updates.

## Verification Notes
- Verified the Kilo plugin contract with `bun run test -- plugins/kilo/plugin.test.js` -> 1 file passed, 9 tests passed.
- Verified the settings-detail copy with `npx vitest run src/components/settings/provider-settings-detail.test.tsx` -> 1 file passed, 16 tests passed.
- Verified the plugin-host env exposure with `cargo test --manifest-path src-tauri/Cargo.toml env_api_respects_allowlist_in_host_and_js` -> 1 Rust test passed.
- Synced bundled plugin output with `node ./copy-bundled.cjs` so `src-tauri/resources/bundled_plugins/kilo` now matches the implemented source plugin instead of the old placeholder copy.
- Checked local live-key evidence with `if ($env:KILO_API_KEY) { 'KILO_API_KEY=set' } else { 'KILO_API_KEY=missing' }` -> `KILO_API_KEY=missing` on this machine, so the provider remains explicitly `experimental` pending real Windows API-key validation.

# Swap in delivered SVG plugin icons

## Acceptance Criteria
- [x] Plugins with new vector assets use the new SVG paths instead of the generic `icon.svg` placeholders.
- [x] The old placeholder SVGs are removed where a replacement now exists.
- [x] The About dialog no longer depends on the old PNG placeholder.
- [x] A quick verification pass confirms the updated asset paths bundle cleanly.

## Plan
- [x] Update the relevant plugin manifests to point at the new SVG assets.
- [x] Remove the unneeded placeholder SVGs and the old About-dialog PNG reference.
- [x] Rebundle the plugins and verify the resulting asset set and diff.

## Verification Notes
- Verified the asset sync with `node ./copy-bundled.cjs` -> bundled 26 plugins, including the updated icon paths for `alibaba`, `augment`, `openrouter`, `synthetic`, `vertex-ai`, and `warp`.
- Verified the app build with `npm run build` -> `tsc` passed and Vite production build completed successfully.

# Disable broken updater checks in dev and prerelease builds

## Acceptance Criteria
- [x] `npm run tauri dev` no longer triggers the updater check path on startup.
- [x] Current prerelease app versions like `0.1.0-beta.3` also skip the updater check instead of hitting GitHub's stable-only `releases/latest` alias.
- [x] Stable non-prerelease versions still keep the existing updater path.
- [x] Focused updater-hook verification passes before the slice is marked done.

## Plan
- [x] Add an updater-eligibility gate in `src/hooks/use-app-update.ts` for local dev and prerelease versions.
- [x] Add focused hook coverage for the disabled paths in `src/hooks/use-app-update.test.ts`.
- [x] Record the updater-channel default in repo notes and verify with a focused Vitest run.

## Verification Notes
- Verified the updater hook with `npx vitest run src/hooks/use-app-update.test.ts` -> 1 file passed, 16 tests passed.
- Verified the live startup path with a one-off PowerShell `Start-Process npm.cmd run tauri dev` smoke capture -> reached `OpenUsage v0.1.0-beta.3 starting` and no longer logged `update endpoint did not respond with a successful status code`.

# Fix first-open tray nav clipping

## Acceptance Criteria
- [x] Opening the bar on a cold/first bootstrap does not leave the bottom `Settings` action clipped off-screen.
- [x] Plugin/nav state becomes available before slower preference/system bootstrap calls finish.
- [x] Focused regression coverage proves the early plugin-settings bootstrap ordering.

## Plan
- [x] Move normalized `pluginSettings` publication earlier in `useSettingsBootstrap`.
- [x] Add a focused hook regression test for the early publication path under slow later loads.
- [x] Run focused verification, then record notes/breadcrumbs/lesson before marking done.

## Verification Notes
- Verified bootstrap ordering with `npx vitest run src/hooks/app/use-settings-bootstrap.test.ts src/hooks/app/use-panel.test.ts` -> 2 files passed, 17 tests passed.
- Verified the cold-start tray-height regression with `npx vitest run src/App.test.tsx -t "raises the cold-start panel height for the full nav stack before slower bootstrap finishes"` -> 1 test passed.

# Fix review findings for Copilot billing and Cursor sqlite capability

## Acceptance Criteria
- [x] Copilot premium-request billing requests use a supported GitHub REST API version.
- [x] Copilot billing scope env vars are exposed by the real Tauri host env allowlist and covered by the focused host test.
- [x] Cursor explicitly opts into `sqliteWrite` because it persists refreshed SQLite-sourced auth tokens.
- [ ] Focused Copilot, Cursor, manifest, and host env verification passes.

## Plan
- [x] Replace the Copilot billing API version header with the supported compatibility version.
- [x] Add `COPILOT_BILLING_SCOPE`, `COPILOT_BILLING_ENTERPRISE`, and `COPILOT_BILLING_ORG` to the host env allowlist and regression expectations.
- [x] Add `capabilities.sqliteWrite: true` to Cursor's manifest and cover manifest parsing.
- [x] Run focused JS/Rust tests and record results.

## Verification Notes
- Verified Copilot/Cursor plugin coverage with `npx vitest run plugins/copilot/plugin.test.js plugins/cursor/plugin.test.js` -> 2 files passed, 101 tests passed.
- Verified Rust host/manifest test compilation with `cargo test --manifest-path src-tauri/Cargo.toml env_api_respects_allowlist_in_host_and_js --no-run` and `cargo test --manifest-path src-tauri/Cargo.toml capabilities_and_source_provenance_are_parsed_when_present --no-run` -> both compiled successfully.
- Attempted full Rust test execution for both focused tests; both compiled, then the local test binary exited with `STATUS_ENTRYPOINT_NOT_FOUND`, matching the existing local Rust-test blocker recorded in this task file.
- Synced bundled plugin output with `node ./copy-bundled.cjs` -> bundled 29 plugins.
