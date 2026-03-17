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

# Switch Windows provider secrets to explicit targets

## Acceptance Criteria
- [ ] Windows provider-secret writes use an explicit Credential Manager target name instead of the implicit `username.service` mapping.
- [ ] Provider-secret reads/deletes still fall back to the old Windows mapping so existing saved secrets keep working.
- [ ] Focused Rust coverage locks in the Windows provider-secret target spec.
- [ ] Verification captures the focused Rust command/result before the task is marked done.

## Plan
- [ ] Add a shared Windows provider-secret target spec/helper in the Tauri backend.
- [ ] Rewire provider-secret save/read/delete paths to prefer the explicit-target entry and fall back to the old mapping on Windows.
- [ ] Add focused Rust coverage for the Windows target spec and legacy fallback behavior.
- [ ] Run targeted cargo verification, then update lessons/breadcrumbs and mark the slice complete.

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
- [ ] The next provider order is optimized for providers you can validate with free/trial access or deterministic fixtures instead of paid subscriptions.
- [ ] The roadmap explicitly separates contract coverage (fixtures/tests/docs) from entitlement coverage (real paid account behavior).
- [ ] The first three execution slices are concrete, small, and independently verifiable on Windows.

## Plan
- [ ] Add a provider evidence matrix to `docs/windows-provider-rollout-plan.md` with one validation mode per provider: `self-testable`, `community-needed`, or `fixture-only until real account`.
- [ ] Land the Windows Copilot slice around official `gh` account state (`gh auth status` / `gh auth switch`), plus multi-account fixture coverage before any UI expansion.
- [ ] Land the Windows Gemini slice around official OAuth/API-key flows, Windows config-path discovery, and focused fixture tests for free-tier and paid-tier response shapes.
- [ ] Harden the already-supported providers by capturing fixture-backed contract tests for Claude, Cursor, Codex, Ollama, and OpenCode, then use community verification only for paid-plan-specific states you cannot self-test.
- [ ] Defer opaque Windows ports (Factory, Kimi, MiniMax, Z.ai, Windsurf, Perplexity, and likely Amp) until a concrete Windows auth source is documented or a community tester can supply logs.

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
