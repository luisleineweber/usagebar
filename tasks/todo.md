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
