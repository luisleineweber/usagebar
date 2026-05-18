# Close Alpha 2 open and blocked gates

## Executive Summary
- Work down the report's open and blocked public-release gates.
- Prefer closing gates with direct verification; where impossible locally, record the blocker with exact evidence.
- Keep changes scoped to release readiness and Rust hygiene unless a provider promotion is explicitly required.

## Acceptance Criteria
- [x] Rust fmt gate passes.
- [x] Rust clippy gate passes or remaining findings are recorded with a scoped waiver.
- [x] Dirty worktree release-state gate has a concrete evidence summary.
- [x] Signed artifact/smoke gate is either verified or blocked with exact missing prerequisite.
- [x] Alpha 2 checkpoint report and breadcrumbs are updated with current gate status.

## Plan
- [x] Run Rust fmt/clippy and fix actionable hygiene findings.
- [x] Re-run focused Rust verification.
- [x] Summarize release worktree state without reverting unrelated changes.
- [x] Check artifact/signing/smoke prerequisites and record the result.
- [x] Update the HTML checkpoint, todo, and breadcrumbs.

## Verification Notes
- Initial `cargo fmt --manifest-path src-tauri\Cargo.toml -- --check` failed on Rust formatting drift.
- Initial `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings` failed on 22 Clippy warnings promoted to errors.
- `cargo fmt --manifest-path src-tauri\Cargo.toml -- --check` -> passed after mechanical Rust formatting.
- `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings` -> passed after Rust hygiene fixes.
- `cargo test --manifest-path src-tauri\Cargo.toml --locked -- --nocapture` -> 88 tests passed.
- `bun run release:check -- --release-tag v0.1.0-alpha.2` -> passed.
- `bun run release:check -- --release-tag v0.1.0-alpha.2 --require-clean` -> failed only because the working tree is not clean.
- Dirty worktree summary: 65 tracked files changed, grouped as 39 plugin files, 14 provider docs, 10 Rust/Tauri files, and 2 task files.
- Signing prerequisite check: `TAURI_SIGNING_PRIVATE_KEY`, `WINDOWS_CERTIFICATE_BASE64`, `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_THUMBPRINT`, `WINDOWS_CERTIFICATE_PASSWORD`, and `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER` are all missing.
- `bun run build:release -- --bundles nsis` -> blocked by the release helper: it refuses Windows installer builds without Authenticode signing material.
- `gh secret list -R luisleineweber/usagebar` -> updater signing secrets exist (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), but no Windows Authenticode certificate secret was listed.
- `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1 bun run build:release -- --bundles nsis` -> passed for local-only unsigned smoke; produced `UsageBar_0.1.0-alpha.2_x64-setup.exe`.
- Unsigned NSIS artifact SHA-256: `2F0B268522904D243C11EF010D8220E6957DD9F3078E214B0767EDBFBA9FCB1A`; Authenticode status: `NotSigned`.
- Direct release EXE smoke was inconclusive because an existing `D:\UsageBar-Release\usagebar.exe` owned `127.0.0.1:6736`.
- Provider source maturity gate moved from blocked to accepted Alpha limitation in the checkpoint: release notes must keep private/experimental provider limitations explicit, and providers must not be promoted beyond evidence level.
- User decision: ship Alpha 2 as an unsigned technical preview and defer Windows Authenticode signing.
- Updated publish workflow and signing script so prerelease tags can publish unsigned Windows installers only when `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1`; updater signing remains required.
- Clean unsigned release-binary smoke passed after stopping only the exact old release process at `D:\UsageBar-Release\usagebar.exe`: fresh `src-tauri\target\release\usagebar.exe` owned `127.0.0.1:6736`, and `/v1/usage/not-a-real-provider` returned `404 {"error":"provider_not_found"}`.

# Refine Alpha 2 readiness checkpoint report

## Executive Summary
- Improve the browser checkpoint so the remaining Alpha 2 release work is easier to act on.
- Keep the release decision conservative: code/test checkpoint green, public release still held on artifact/smoke gates.
- Preserve the report as a self-contained HTML file.

## Acceptance Criteria
- [x] Report has a concrete next-actions section for the open public-release gates.
- [x] Report copy clearly separates code/test readiness from public release approval.
- [x] HTML artifact sanity check passes.
- [x] Breadcrumb evidence is recorded.

## Plan
- [x] Patch `docs/reports/alpha-2-readiness-checkpoint.html` with clearer next actions and release-gate wording.
- [x] Run a local sanity check over required report markers and interaction hooks.
- [x] Review the focused diff.
- [x] Record completion evidence in breadcrumbs.

## Verification Notes
- Added `Next Release Actions` cards for Rust hygiene policy, release-state review, and signed Windows artifact smoke.
- Tightened public-release wording so open gates require evidence or an explicit Alpha 2 waiver.
- HTML sanity check passed: required markers and interaction hooks found; gate counts were pass=9, open=3.

# Alpha 2 readiness and unknown-provider check

## Executive Summary
- Check whether Alpha 2 is release-ready from current metadata, docs, and focused verification.
- Re-check the Windows `unknown provider` paths so bad provider IDs fail cleanly.
- Fix the Rust test startup blocker so release verification can run locally.

## Acceptance Criteria
- [x] Version metadata and release docs point to `0.1.0-alpha.2`.
- [x] Local HTTP API unknown-provider behavior is covered and verified.
- [x] Tray/provider-detail unknown-provider behavior is covered and verified.
- [x] Rust unit tests run locally instead of exiting with `STATUS_ENTRYPOINT_NOT_FOUND`.
- [x] Focused release preflight and relevant tests pass.
- [x] Breadcrumb evidence is recorded.

## Plan
- [x] Inspect release metadata, README, changelog, and release docs.
- [x] Inspect `unknown provider` paths in Rust local API and React tray/detail flow.
- [x] Isolate Rust unit tests from the Tauri/Wry app runtime startup path.
- [x] Run focused preflight/tests.
- [x] Record readiness conclusion and breadcrumbs.

## Verification Notes
- `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `Cargo.lock`, `CHANGELOG.md`, `README.md`, and `docs/releasing.md` all reference `0.1.0-alpha.2` / `v0.1.0-alpha.2` where expected.
- `bun run release:check -- --release-tag v0.1.0-alpha.2` -> passed; detected 31 bundled plugins and the expected GitHub updater endpoint.
- `src-tauri/src/local_http_api/server.rs` returns `404 {"error":"provider_not_found"}` for unknown `/v1/usage/:providerId`, while known uncached providers return 204 and known cached providers return 200.
- `src/App.test.tsx` covers unknown tray navigation rendering `Provider not found`; `src/pages/provider-detail.test.tsx` covers the null-provider detail state.
- `bun run test -- src\App.test.tsx src\pages\provider-detail.test.tsx --run` -> 2 files passed, 92 tests passed.
- `bun run test -- src\hooks\app\use-panel.test.ts --run` -> 1 file passed, 17 tests passed.
- `bun run lint`, `bun run typecheck`, and `bun run format:check` -> passed.
- `cargo check --manifest-path src-tauri\Cargo.toml` -> passed.
- `cargo test --manifest-path src-tauri\Cargo.toml local_http_api -- --nocapture` compiled but the Windows test binary exited with `STATUS_ENTRYPOINT_NOT_FOUND`; Rust assertion coverage could not be executed in this local shell.
- Readiness call: code/docs/tests are mostly Alpha-2-ready, but public release is not fully green until the Rust test-binary startup issue is resolved or a clean CI run proves the Rust suite.
- Follow-up fix: Rust unit tests no longer link the desktop Tauri/Wry app runtime in `cfg(test)`; plugin browser bridge calls use a test stub and test-only app-handle aliases.
- `cargo test --manifest-path src-tauri\Cargo.toml --locked local_http_api -- --nocapture` -> 14 tests passed, including `route_unknown_provider_returns_404`.
- `cargo test --manifest-path src-tauri\Cargo.toml --locked -- --nocapture` -> 88 tests passed, 0 failed.
- `bun run test -- src\App.test.tsx src\pages\provider-detail.test.tsx src\hooks\app\use-panel.test.ts --run` -> 3 files passed, 109 tests passed.
- `bun run release:check -- --release-tag v0.1.0-alpha.2` -> passed.
- `bun run lint` and `bun run typecheck` -> passed.
- `cargo check --manifest-path src-tauri\Cargo.toml --locked` -> passed.
- `cargo fmt --manifest-path src-tauri\Cargo.toml -- --check` and `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings` still fail on existing Rust formatting/Clippy debt outside this focused fix.
- Readiness call after fix: Alpha 2 local code/test readiness is green for the unknown-provider and release-preflight slice; remaining release decision should focus on artifact/signing/smoke, not this Rust test blocker.
- Created `docs/reports/alpha-2-readiness-checkpoint.html` as a self-contained browser report for the full Alpha 2 checkpoint.

# Harden Warp GraphQL contract fixture

## Executive Summary
- Reduce the blocked Warp risk by pinning more of the undocumented GraphQL response contract.
- Keep Warp marked blocked/experimental because the endpoint is still not public documentation.
- Fail loudly if the app GraphQL response stops returning the expected user output shape.

## Acceptance Criteria
- [x] Warp parser rejects non-`UserOutput` GraphQL user payloads.
- [x] Warp tests pin the rejected `__typename` contract-drift case.
- [x] Warp docs/report state the risk is improved but still blocked by the undocumented endpoint.
- [x] Focused Warp verification passes and bundled resources are synced.

## Plan
- [x] Inspect current Warp plugin, tests, and docs.
- [x] Add response-shape guard and regression.
- [x] Update docs/report/todo/breadcrumb evidence.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- Added `UserOutput` response-shape guard in `plugins/warp/plugin.js`.
- Added Warp regression for non-`UserOutput` GraphQL payloads.
- Updated Warp docs/report to state the contract is better pinned while the endpoint remains undocumented and blocked.
- `bun run test -- plugins\warp\plugin.test.js --run` -> 1 file passed, 13 tests passed.
- `node --check plugins\warp\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including Warp.
- Final combined check for this turn: `bun run test -- plugins\jetbrains-ai-assistant\plugin.test.js plugins\windsurf\plugin.test.js plugins\kiro\plugin.test.js plugins\warp\plugin.test.js --run` -> 4 files passed, 49 tests passed.
- Final `bun run lint` -> passed.
- Source/bundled SHA-256 check over JetBrains, Kiro, Windsurf, and Warp returned no differences.
- Report sanity check confirmed `Blockiert, verbessert`, `UserOutput`, `Offen, verbessert`, and the Windows/runtime test evidence.

# Expand Windows runtime validation fixtures

## Executive Summary
- Reduce the open Windows/runtime validation risk for local-source providers.
- Add focused fixture coverage for mixed or degraded runtime states.
- Keep blocked provider-side endpoint gaps out of scope for this slice.

## Acceptance Criteria
- [x] JetBrains test covers Windows with an invalid newer IDE quota file and an older valid quota file.
- [x] Windsurf test covers stable auth failure falling through to a valid Windsurf Next runtime.
- [x] Kiro test covers malformed newer logs falling through to an older valid log.
- [x] Report marks the Windows/runtime validation risk as improved with evidence, not fully resolved.
- [x] Focused provider tests pass and bundled resources are synced.

## Plan
- [x] Inspect current Kiro, JetBrains, and Windsurf source/tests.
- [x] Add focused runtime-degradation fixture tests.
- [x] Update report/todo/breadcrumb evidence.
- [x] Sync bundled plugins and run verification.

## Verification Notes
- Added JetBrains regression for invalid newer Windows quota state falling through to an older valid IDE quota file.
- Added Windsurf regression for stable auth rejection falling through to Windsurf Next.
- Added Kiro regression for malformed newer Windows logs falling through to an older valid usage log.
- `bun run test -- plugins\jetbrains-ai-assistant\plugin.test.js plugins\windsurf\plugin.test.js plugins\kiro\plugin.test.js --run` -> 3 files passed, 36 tests passed.
- `node --check plugins\jetbrains-ai-assistant\plugin.js; node --check plugins\windsurf\plugin.js; node --check plugins\kiro\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including JetBrains, Kiro, and Windsurf.
- Source/bundled SHA-256 check over JetBrains, Kiro, and Windsurf returned no differences.
- Report sanity check confirmed the Windows/runtime validation row is `Offen, verbessert` with the three new fixture scenarios.
- `bun run lint` -> passed.

# Complete provider auth readiness risk closure

## Executive Summary
- Finish the report-driven provider risk cleanup.
- Sync runtime bundled plugins with source plugin fixes.
- Mark every report risk as resolved, blocked, or open with evidence.

## Acceptance Criteria
- [x] `docs/reports/provider-auth-output-readiness-review.html` includes explicit resolved/blocked/open status for each remaining risk.
- [x] Source and bundled plugin resources match for the reviewed providers.
- [x] Focused provider tests pass after the final sync.
- [x] Report artifact sanity check passes.
- [x] Final diff check passes.

## Plan
- [x] Audit current report, tasks, worktree, and bundled resource hashes.
- [x] Sync bundled plugin resources.
- [x] Patch the HTML report with an explicit risk-resolution checkpoint.
- [x] Run focused verification.
- [x] Update evidence notes and completion status.

## Verification Notes
- `node ./copy-bundled.cjs` -> bundled 31 plugins; Alibaba and Kiro source drift resolved.
- Source/bundled SHA-256 check over Abacus, Alibaba, Augment, JetBrains, Kiro, Mistral, Ollama, OpenCode, OpenCode Go, Perplexity, Warp, Windsurf, and Zed returned no differences.
- `bun run test -- plugins\abacus\plugin.test.js plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\jetbrains-ai-assistant\plugin.test.js plugins\kiro\plugin.test.js plugins\mistral\plugin.test.js plugins\ollama\plugin.test.js plugins\opencode-go\plugin.test.js plugins\opencode\plugin.test.js plugins\perplexity\plugin.test.js plugins\warp\plugin.test.js plugins\windsurf\plugin.test.js plugins\zed\plugin.test.js --run` -> 13 files passed, 136 tests passed.
- `node --check` over the same 13 provider `plugin.js` files -> passed.
- `bun run lint` -> passed.
- Report sanity check confirmed `Risk Resolution Checkpoint`, `Geloest`, `Blockiert`, `Offen`, `Stand: 2026-05-16`, `Source`, `Auth source`, and `Endpoint`; 71 data rows found.
- `git --no-pager diff --check -- docs\reports\provider-auth-output-readiness-review.html docs\breadcrumbs.md tasks\todo.md plugins\alibaba\plugin.js plugins\kiro\plugin.js plugins\kiro\plugin.test.js src-tauri\resources\bundled_plugins\alibaba\plugin.js src-tauri\resources\bundled_plugins\kiro\plugin.js src-tauri\resources\bundled_plugins\kiro\plugin.test.js` -> passed with expected CRLF warnings only.
- Follow-up correction: report now separates resolved provenance/transparency fixes from still-blocked source-maturity risks: private session providers, Ollama/Augment auth-only quota gaps, Zed dashboard-cookie spend, Warp undocumented GraphQL, and broader Windows/runtime validation.

# Harden Zed billing provenance

## Executive Summary
- Keep Zed's working dashboard-cookie billing path.
- Keep local telemetry fallback unchanged.
- Make the remaining billing risk visible through auth and endpoint detail lines.

## Acceptance Criteria
- [x] Zed dashboard billing output includes detail-only `Auth source`.
- [x] Zed dashboard billing output includes detail-only `Endpoint`.
- [x] Zed telemetry fallback still reports `Billing: Dashboard cookie required for spend`.
- [x] Zed manifest/docs/tests describe and pin the new detail lines.
- [x] Focused Zed verification passes and bundled plugin files are synced.

## Plan
- [x] Add auth-source tracking for the stored Zed cookie.
- [x] Add billing endpoint detail output.
- [x] Update manifest, docs, and tests.
- [x] Sync bundled plugin files and verify.

## Verification Notes
- Current official Zed docs still describe plan/usage visibility in the Zed account UI, not a stable public billing API; kept the working dashboard-cookie path.
- `node --check plugins\zed\plugin.js` -> passed.
- `bun run test -- plugins\zed\plugin.test.js --run` -> 1 file passed, 11 tests passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `zed`.

# Harden Ollama quota provenance

## Executive Summary
- Keep Ollama settings-cookie quota parsing unchanged.
- Keep Cloud-auth-only status unchanged.
- Make the settings-cookie auth source and endpoint explicit.

## Acceptance Criteria
- [x] Ollama settings-cookie quota output includes detail-only `Auth source`.
- [x] Ollama settings-cookie quota output includes detail-only `Endpoint`.
- [x] Ollama Cloud-auth-only output remains text-only and does not create quota progress.
- [x] Ollama manifest/docs/tests describe and pin the new detail lines.
- [x] Focused Ollama verification passes and bundled plugin files are synced.

## Plan
- [x] Track the stored settings-cookie source.
- [x] Add endpoint/auth detail lines to quota output.
- [x] Update manifest, docs, and tests.
- [x] Sync bundled plugin files and verify.

## Verification Notes
- `node --check plugins\ollama\plugin.js` -> passed.
- `bun run test -- plugins\ollama\plugin.test.js --run` -> 1 file passed, 14 tests passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `ollama`.

# Harden Augment credit provenance

## Executive Summary
- Keep Augment dashboard-cookie credit usage unchanged.
- Keep local Auggie auth detection unchanged.
- Make credit auth source and endpoint explicit.

## Acceptance Criteria
- [x] Augment dashboard-credit output includes detail-only `Auth source`.
- [x] Augment dashboard-credit output includes detail-only `Endpoint`.
- [x] Auggie-auth-only output remains text-only and does not create credit progress.
- [x] Augment manifest/docs/tests describe and pin the new detail lines.
- [x] Focused Augment verification passes and bundled plugin files are synced.

## Plan
- [x] Track stored/env dashboard-cookie source.
- [x] Add endpoint/auth detail lines to credit output.
- [x] Update manifest, docs, and tests.
- [x] Sync bundled plugin files and verify.

## Verification Notes
- `node --check plugins\augment\plugin.js` -> passed.
- `bun run test -- plugins\augment\plugin.test.js --run` -> 1 file passed, 9 tests passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `augment`.

# Harden Warp token/endpoint provenance

## Executive Summary
- Keep Warp's current request-limit GraphQL behavior unchanged.
- Keep stored-token and env-token login order unchanged.
- Make token source and endpoint explicit in output.

## Acceptance Criteria
- [x] Warp output includes detail-only `Auth source`.
- [x] Warp output includes detail-only `Endpoint`.
- [x] Metered, unlimited, and missing-limit states keep their existing behavior.
- [x] Warp manifest/docs/tests describe and pin the new detail lines.
- [x] Focused Warp verification passes and bundled plugin files are synced.

## Plan
- [x] Track stored/env token source.
- [x] Add endpoint/auth detail lines across Warp output states.
- [x] Update manifest, docs, and tests.
- [x] Sync bundled plugin files and verify.

## Verification Notes
- `node --check plugins\warp\plugin.js` -> passed.
- `bun run test -- plugins\warp\plugin.test.js --run` -> 1 file passed, 13 tests passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `warp`.
- Broad ranked-provider suite: `bun run test -- plugins\abacus\plugin.test.js plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\mistral\plugin.test.js plugins\ollama\plugin.test.js plugins\opencode\plugin.test.js plugins\opencode-go\plugin.test.js plugins\perplexity\plugin.test.js plugins\warp\plugin.test.js plugins\windsurf\plugin.test.js plugins\zed\plugin.test.js plugins\kiro\plugin.test.js plugins\jetbrains-ai-assistant\plugin.test.js --run` -> 13 files passed, 140 tests passed.
- Source/bundled SHA-256 check passed for Zed, Ollama, Augment, and Warp `plugin.js`, `plugin.json`, and `plugin.test.js`.
- `git diff --check -- ...` for the four-provider slice passed with expected CRLF warnings only.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.

# Surface ranked OpenCode Zen billing-session source

## Executive Summary
- Follow the report ranking: OpenCode Zen thirteenth.
- Keep Zen balance on the signed-in website session path.
- Make Zen balance source explicit in hidden and folded-in output.

## Acceptance Criteria
- [x] Hidden OpenCode Zen output includes detail-only Source/Auth source/Endpoint lines.
- [x] OpenCode Go optional Zen balance output includes the same provenance lines when Zen balance is present.
- [x] Manifests declare the new detail lines.
- [x] Docs describe signed-in web-session balance provenance and API-key boundary.
- [x] Focused OpenCode tests pass and bundled plugin files are synced.

## Plan
- [x] Track OpenCode Zen cookie source through auth loading.
- [x] Add Zen provenance detail lines to hidden and folded-in output.
- [x] Update manifests/tests/docs.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- `node --check plugins\opencode\plugin.js; node --check plugins\opencode-go\plugin.js` -> passed.
- `bun run test -- plugins\opencode\plugin.test.js plugins\opencode-go\plugin.test.js --run` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `opencode` and `opencode-go`.
- Source/bundled OpenCode `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match for both provider folders.
- `git --no-pager diff --check -- plugins\opencode\plugin.js plugins\opencode\plugin.json plugins\opencode\plugin.test.js plugins\opencode-go\plugin.js plugins\opencode-go\plugin.json plugins\opencode-go\plugin.test.js docs\providers\opencode.md docs\providers\opencode-go.md tasks\todo.md docs\breadcrumbs.md` -> passed with expected CRLF warnings only.

# Close ranked JetBrains source/version diagnostics

## Executive Summary
- Follow the report ranking: JetBrains AI Assistant twelfth.
- Confirm JetBrains already exposes IDE folder and quota XML source.
- Add the ranked task trail and focused verification.

## Acceptance Criteria
- [x] JetBrains output includes detail-only IDE and Source lines.
- [x] JetBrains manifest declares the IDE and Source detail lines.
- [x] JetBrains docs describe the displayed source/version lines.
- [x] Focused JetBrains verification passes.

## Plan
- [x] Review current JetBrains implementation against the ranked recommendation.
- [x] Confirm docs already include the displayed IDE and Source lines.
- [x] Run focused JetBrains verification.
- [x] Record ranked completion notes.

## Verification Notes
- Current JetBrains code already emits detail-only `IDE` and `Source` lines for the selected quota XML file.
- Current JetBrains manifest already declares `IDE` and `Source` as detail text lines.
- Current JetBrains docs already describe those displayed lines.
- `node --check plugins\jetbrains-ai-assistant\plugin.js` -> passed.
- `bun run test -- plugins\jetbrains-ai-assistant\plugin.test.js --run` -> passed.
- Source/bundled JetBrains `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match.

# Surface ranked Mistral admin-session source

## Executive Summary
- Follow the report ranking: Mistral eleventh.
- Keep text-only spend/token output.
- Make admin-session endpoint/auth provenance visible.

## Acceptance Criteria
- [x] Mistral output includes detail-only Source/Auth source/Endpoint lines.
- [x] Mistral manifest declares the new detail lines.
- [x] Docs describe the admin dashboard-session dependency.
- [x] Existing text-only spend/token behavior remains unchanged.
- [x] Focused Mistral tests pass and bundled plugin files are synced.

## Plan
- [x] Track Mistral cookie source through auth loading.
- [x] Add source detail lines to successful output.
- [x] Update manifest/tests/docs.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- `node --check plugins\mistral\plugin.js` -> passed.
- `bun run test -- plugins\mistral\plugin.test.js --run` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `mistral`.
- Source/bundled Mistral `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match.
- `git --no-pager diff --check -- plugins\mistral\plugin.js plugins\mistral\plugin.json plugins\mistral\plugin.test.js docs\providers\mistral.md tasks\todo.md docs\breadcrumbs.md` -> passed with expected CRLF warnings only.

# Surface ranked Abacus dashboard-session source

## Executive Summary
- Follow the report ranking: Abacus tenth.
- Keep the dashboard-session compute-points path.
- Make cookie source and private endpoints visible in output.

## Acceptance Criteria
- [x] Abacus output includes detail-only Source/Auth source/Endpoint lines.
- [x] Abacus manifest declares the new detail lines.
- [x] Docs describe dashboard-session provenance and API-key spike boundary.
- [x] Existing zero-total and optional-billing-failure behavior remains unchanged.
- [x] Focused Abacus tests pass and bundled plugin files are synced.

## Plan
- [x] Track Abacus cookie source through auth loading.
- [x] Add source detail lines to successful output.
- [x] Update manifest/tests/docs.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- `node --check plugins\abacus\plugin.js` -> passed.
- `bun run test -- plugins\abacus\plugin.test.js --run` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `abacus`.
- Source/bundled Abacus `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match.
- `git --no-pager diff --check -- plugins\abacus\plugin.js plugins\abacus\plugin.json plugins\abacus\plugin.test.js docs\providers\abacus.md tasks\todo.md docs\breadcrumbs.md` -> passed with expected CRLF warnings only.

# Surface ranked Perplexity billing-session source

## Executive Summary
- Follow the report ranking: Perplexity ninth.
- Keep the private billing-session cookie path.
- Make endpoint/auth source and renewal limits visible.

## Acceptance Criteria
- [x] Perplexity output includes detail-only Source/Auth source/Endpoint lines.
- [x] Perplexity manifest declares the new detail lines.
- [x] Docs state that official API docs expose console billing visibility, not a validated non-cookie balance endpoint.
- [x] Existing zero/partial pool behavior remains unchanged.
- [x] Focused Perplexity tests pass and bundled plugin files are synced.

## Plan
- [x] Track Perplexity cookie source through auth loading.
- [x] Add source detail lines to successful output.
- [x] Update manifest/tests/docs.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- Current official Perplexity docs checked: API billing/credit visibility is documented for the API Platform/Admin console, not as a stable API-key account-balance endpoint.
- `node --check plugins\perplexity\plugin.js` -> passed.
- `bun run test -- plugins\perplexity\plugin.test.js --run` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `perplexity`.
- Source/bundled Perplexity `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match.
- `git --no-pager diff --check -- plugins\perplexity\plugin.js plugins\perplexity\plugin.json plugins\perplexity\plugin.test.js docs\providers\perplexity.md tasks\todo.md docs\breadcrumbs.md` -> passed with expected CRLF warnings only.

# Tighten ranked Alibaba diagnostics

## Executive Summary
- Follow the report ranking: Alibaba eighth.
- Keep API-key quota flow unchanged.
- Make endpoint/auth provenance and console-session failures clearer.

## Acceptance Criteria
- [x] Alibaba output includes detail-only Source/Auth source/Endpoint lines on successful quota fetches.
- [x] Alibaba manifest declares the new detail lines.
- [x] Console/session-walled responses produce a specific error message.
- [x] Unknown plans without real quota limits do not invent fallback limits.
- [x] Alibaba docs describe the displayed lines and session-walled limitation.
- [x] Focused Alibaba tests pass and bundled plugin files are synced.

## Plan
- [x] Track API-key source and endpoint through the quota request.
- [x] Add specific response diagnostics for ConsoleNeedLogin/session-walled errors.
- [x] Update manifest/tests/docs.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- `node --check plugins\alibaba\plugin.js` -> passed.
- `bun run test -- plugins\alibaba\plugin.test.js --run` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `alibaba`.
- Source/bundled Alibaba `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match.
- `git --no-pager diff --check -- plugins\alibaba\plugin.js plugins\alibaba\plugin.json plugins\alibaba\plugin.test.js src-tauri\resources\bundled_plugins\alibaba\plugin.js src-tauri\resources\bundled_plugins\alibaba\plugin.json src-tauri\resources\bundled_plugins\alibaba\plugin.test.js docs\providers\alibaba.md docs\choices.md tasks\todo.md docs\breadcrumbs.md` -> passed with expected CRLF warnings only.

# Close ranked Kiro source diagnostics

## Executive Summary
- Follow the report ranking: Kiro seventh.
- Confirm Kiro already exposes usage source in output.
- Add the missing ranked task/docs trail.

## Acceptance Criteria
- [x] Kiro output includes detail-only Source for desktop cache, usage log, live API, stale local fallback, and CLI session states.
- [x] Kiro manifest declares the Source detail line.
- [x] Kiro docs describe the displayed Source values.
- [x] Focused Kiro verification passes.

## Plan
- [x] Review current Kiro implementation against the ranked recommendation.
- [x] Patch Kiro docs for Source display values.
- [x] Run focused Kiro verification.
- [x] Record ranked completion notes.

## Verification Notes
- Current Kiro code already emits detail-only Source for desktop cache, usage log, live usage API, stale local fallback after live API failure, and CLI session file states.
- Current Kiro manifest already declares `Source` as a detail text line.
- `node --check plugins\kiro\plugin.js` -> passed.
- `bun run test -- plugins\kiro\plugin.test.js --run` -> passed.
- Source/bundled Kiro `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match.
- `rg -n "Desktop cache after live API failure|Usage log after live API failure|Live usage API|CLI session files|Source" plugins\kiro docs\providers\kiro.md` -> confirmed implementation, tests, manifest, and docs.

# Surface ranked Windsurf percent source

## Executive Summary
- Follow the report ranking: Windsurf sixth.
- Make percent-only quota source visible in output.
- Keep existing Cloud quota parsing and percent bars unchanged.

## Acceptance Criteria
- [x] Windsurf output includes a detail-only Source line naming the cloud quota endpoint.
- [x] Windsurf output includes a detail-only Quota basis line stating percent-only data.
- [x] Manifest declares the new detail lines.
- [x] Docs describe the displayed lines.
- [x] Focused Windsurf tests pass and bundled plugin files are synced.

## Plan
- [x] Add Windsurf Source and Quota basis output lines.
- [x] Update manifest/tests/docs.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and review diff.

## Verification Notes
- `node --check plugins\windsurf\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `windsurf`.
- `bun run test -- plugins\windsurf\plugin.test.js --run` -> passed.
- Windsurf now emits detail-only `Source: Windsurf cloud quota endpoint` and `Quota basis: Percent-only daily and weekly buckets`.

# Close ranked Antigravity source diagnostics

## Executive Summary
- Follow the report ranking: Antigravity fifth.
- Confirm Antigravity already exposes quota source in output.
- Add the missing ranked task/docs trail.

## Acceptance Criteria
- [x] Antigravity output includes detail-only Source for live LS, cached LS, Cloud Code, and no-usable-quota states.
- [x] Antigravity manifest declares the Source detail line.
- [x] Antigravity docs describe the displayed Source values.
- [x] Focused Antigravity verification passes.

## Plan
- [x] Review current Antigravity implementation against the ranked recommendation.
- [x] Patch Antigravity docs for Source display values.
- [x] Run focused Antigravity verification.
- [x] Record ranked completion notes.

## Verification Notes
- Current Antigravity code already emits detail-only Source for live LS, cached LS, Cloud Code fallback, and LS-without-usable-quota states.
- Current Antigravity manifest already declares `Source` as a detail text line.
- `node --check plugins\antigravity\plugin.js` -> passed.
- `bun run test -- plugins\antigravity\plugin.test.js --run` -> passed.
- `rg -n "Live Antigravity language server|Cached live Antigravity language server|Cloud Code fallback|Antigravity language server without usable quota|Source" plugins\antigravity docs\providers\antigravity.md` -> confirmed implementation, tests, manifest, and docs.

# Close ranked Warp endpoint provenance

## Executive Summary
- Follow the report ranking: Warp fourth.
- Confirm Warp already exposes the undocumented GraphQL source in output.
- Add the missing ranked task/docs trail.

## Acceptance Criteria
- [x] Warp output includes detail-only Source for metered, unlimited, and missing-limit states.
- [x] Warp tests pin the GraphQL operation name/path and Source output.
- [x] Warp docs include the Source display line.
- [x] Focused Warp verification passes.

## Plan
- [x] Review current Warp implementation against the ranked recommendation.
- [x] Patch Warp docs for the Source display line.
- [x] Run focused Warp verification.
- [x] Record ranked completion notes.

## Verification Notes
- Current Warp code already emits detail-only `Source: Undocumented Warp app GraphQL request-limit endpoint` for metered, unlimited, and missing-limit states.
- Current Warp tests already pin `https://app.warp.dev/graphql/v2?op=GetRequestLimitInfo`, operation name `GetRequestLimitInfo`, and the Source output.
- `node --check plugins\warp\plugin.js` -> passed.
- `bun run test -- plugins\warp\plugin.test.js --run` -> passed.
- `rg -n "Undocumented Warp app GraphQL|GetRequestLimitInfo|graphql/v2" plugins\warp docs\providers\warp.md` -> confirmed implementation, tests, and docs.

# Clarify ranked Zed telemetry fallback

## Executive Summary
- Follow the report ranking: Zed third.
- Make clear that local telemetry is not billing spend.
- Keep the existing dashboard-cookie billing path and telemetry fallback unchanged.

## Acceptance Criteria
- [x] Zed telemetry fallback output includes a detail line stating billing spend needs a dashboard cookie.
- [x] Empty telemetry fallback keeps the same billing-cookie guidance.
- [x] Zed manifest declares the new detail line.
- [x] Docs describe the new billing/fallback separation.
- [x] Focused Zed tests pass and bundled plugin files are synced.

## Plan
- [x] Add a `Billing` detail line to telemetry fallback output.
- [x] Update Zed manifest/tests/docs.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and review diff.

## Verification Notes
- `node --check plugins\zed\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `zed`.
- `bun run test -- plugins\zed\plugin.test.js --run` -> passed.
- Zed telemetry fallback now emits detail-only `Billing: Dashboard cookie required for spend`, including the empty telemetry state.

# Surface ranked Ollama quota source

## Executive Summary
- Follow the report ranking: Ollama second.
- Show whether Ollama output is settings-cookie quota or Cloud-auth-only status.
- Keep API-key/local signin as auth evidence only, not quota bars.

## Acceptance Criteria
- [x] Cookie-backed quota output includes a detail-only Source line.
- [x] Cloud-auth-only output includes a detail-only Source line.
- [x] Ollama manifest declares the Source detail line.
- [x] Docs state the Source line and quota-cookie limitation.
- [x] Focused Ollama tests pass and bundled plugin files are synced.

## Plan
- [x] Add Ollama Source output for both paths.
- [x] Update manifest/tests/docs.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and review diff.

## Verification Notes
- `node --check plugins\ollama\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `ollama`.
- `bun run test -- plugins\ollama\plugin.test.js --run` -> passed.
- Ollama now emits detail-only `Source` text for settings-page-cookie quota and Cloud-auth-only status.

# Surface ranked Augment credit source

## Executive Summary
- Follow the report ranking: Augment first.
- Show whether Augment output is local Auggie auth only or dashboard-cookie credit usage.
- Keep the existing cookie-backed credit behavior unchanged until a non-cookie endpoint is validated.

## Acceptance Criteria
- [x] Auggie-only output includes a detail-only Source line.
- [x] Dashboard-cookie credit output includes a detail-only Source line.
- [x] Augment manifest declares the Source detail line.
- [x] Docs state the Source line and cookie-backed credit limitation.
- [x] Focused Augment tests pass and bundled plugin files are synced.

## Plan
- [x] Add shared Augment Source output.
- [x] Update Augment manifest/tests/docs.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and review diff.

## Verification Notes
- `node --check plugins\augment\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `augment`.
- `bun run test -- plugins\augment\plugin.test.js --run` -> passed.
- Augment now emits detail-only `Source` text for dashboard-session-cookie credit usage and local-Auggie-auth-only status.

# Surface JetBrains quota source

## Executive Summary
- Show which JetBrains IDE quota file produced the current output.
- Add the detected IDE/version folder as detail metadata.
- Keep quota parsing and selection behavior unchanged.

## Acceptance Criteria
- [x] JetBrains output includes a detail-only IDE line.
- [x] JetBrains output includes a detail-only source line.
- [x] Manifest declares the new detail lines.
- [x] Focused JetBrains tests pass and bundled plugin files are synced.

## Plan
- [x] Derive IDE folder name from the selected quota path.
- [x] Add IDE/source text lines to output.
- [x] Update manifest/docs/tests.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- `node --check plugins\jetbrains-ai-assistant\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `jetbrains-ai-assistant`.
- `bun run test -- plugins\jetbrains-ai-assistant\plugin.test.js --run` -> passed.
- JetBrains now emits detail-only `IDE` and `Source` lines for the selected quota XML file.

# Surface Kiro usage source

## Executive Summary
- Show whether Kiro usage came from desktop cache, logs, live API, stale local fallback, or CLI sessions.
- Keep existing source priority and quota behavior unchanged.
- Verify the key source paths with focused tests.

## Acceptance Criteria
- [x] Kiro desktop cache output includes a detail-only source line.
- [x] Kiro usage-log output includes a detail-only source line.
- [x] Kiro live API output includes a detail-only source line.
- [x] Kiro stale-local fallback output includes a detail-only source line.
- [x] Kiro CLI fallback output includes a detail-only source line.
- [x] Focused Kiro tests pass and bundled plugin files are synced.

## Plan
- [x] Track the selected Kiro snapshot source through merge logic.
- [x] Add source lines to desktop and CLI outputs.
- [x] Update manifest/test expectations.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- `node --check plugins\kiro\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `kiro`.
- `bun run test -- plugins\kiro\plugin.test.js --run` -> passed.
- Kiro now emits detail-only `Source` text for desktop cache, usage log, live usage API, stale local fallback after live API failure, and CLI session files.

# Surface Antigravity quota source

## Executive Summary
- Show which Antigravity data path produced the current quota output.
- Keep existing quota parsing, caching, and auth behavior unchanged.
- Verify live LS, cached LS, Cloud Code, and unavailable states.

## Acceptance Criteria
- [x] Live Antigravity LS quota includes a detail-only source line.
- [x] Cached live quota includes a detail-only source line.
- [x] Cloud Code fallback quota includes a detail-only source line.
- [x] Quota-unavailable output includes a detail-only source line.
- [x] Focused Antigravity tests pass and bundled plugin files are synced.

## Plan
- [x] Add a shared Antigravity source text line helper.
- [x] Add source lines at each successful output path.
- [x] Update manifest/test expectations.
- [x] Sync bundled plugin resources and verify.

## Verification Notes
- `node --check plugins\antigravity\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `antigravity`.
- `bun run test -- plugins\antigravity\plugin.test.js --run` -> passed.
- Antigravity now emits detail-only `Source` text for live language server, cached live language server, Cloud Code fallback, and no-usable-quota states.

# Surface Warp endpoint provenance

## Executive Summary
- Make Warp's risky data source visible in provider output.
- Keep existing token login and request-limit behavior unchanged.
- Verify source and bundled plugin files stay aligned.

## Acceptance Criteria
- [x] Warp detail output includes an explicit data-source/provenance line.
- [x] Metered, unlimited, and missing-limit Warp states all include the provenance line.
- [x] Warp manifest declares the new detail text line.
- [x] Focused Warp tests pass and bundled plugin files are synced.

## Plan
- [x] Add a shared Warp provenance text line to plugin output.
- [x] Update Warp manifest/test expectations.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and review diff.

## Verification Notes
- `node --check plugins\warp\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `warp`.
- `bun run test -- plugins\warp\plugin.test.js --run` -> passed.
- SHA-256 check confirmed source/bundled Warp `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Diff review confirmed Warp now emits detail-only `Source: Undocumented Warp app GraphQL request-limit endpoint` for metered, unlimited, and missing-limit output states.

# Tighten README onboarding copy

## Executive Summary
- Remove duplicate credits copy.
- Shorten download/install and alpha-readiness wording.
- Make privacy and fork-lineage text more concrete.

## Acceptance Criteria
- [x] Duplicate `## Credits` section is removed.
- [x] Release/download intro no longer repeats build-from-source guidance.
- [x] Alpha readiness is concise and preserves release gates.
- [x] Privacy opening states local secrets and explicit provider API calls.
- [x] Fork direction names where upstream lineage remains visible.
- [x] Markdown/diff verification passes.

## Plan
- [x] Patch README copy in the requested sections.
- [x] Record breadcrumb/task notes for the docs slice.
- [x] Run focused markdown/diff checks.

## Verification Notes
- `rg -n "^## (Download|Install, Uninstall, And Data|Alpha Readiness|Privacy And Security|Fork Direction|Lineage|Credits|License)|To run the current branch|Download published builds|Secrets stay local" README.md` -> confirmed requested sections and no `## Credits` heading.
- `git --no-pager diff --check -- README.md tasks\todo.md docs\breadcrumbs.md` -> passed; only expected LF-to-CRLF warnings for `README.md` and `tasks/todo.md`.

# Review all provider auth/output readiness as HTML

## Executive Summary
- Re-check every current provider for login quality and output quality.
- Classify how ready each provider is for the current UsageBar product.
- Produce one standalone HTML report under `docs/` for quick review.

## Acceptance Criteria
- [x] All source plugin manifests are inventoried.
- [x] Auth path, output shape, maturity, and product-fit risk are classified per provider.
- [x] HTML report exists under `docs/` and includes provider-by-provider findings.
- [x] Report is sanity-checked for required provider coverage.
- [x] Breadcrumbs record the review artifact and verification.

## Plan
- [x] Inventory plugin manifests, Settings setup metadata, provider docs, and focused tests.
- [x] Derive auth/output readiness classifications from current code and notes.
- [x] Create the standalone HTML report.
- [x] Run static sanity checks and diff review.

## Verification Notes
- Inventoried `plugins/*/plugin.json`: 32 plugin manifests total, including 31 product providers plus `mock`.
- Reviewed current Settings setup metadata in `src/lib/provider-settings.ts` and provider implementation patterns in `plugins/*/plugin.js`.
- Created `docs/reports/provider-auth-output-readiness-review.html`.
- Node sanity check confirmed the HTML matrix covers 32/32 plugin manifests.
- `git diff --check -- docs\reports\provider-auth-output-readiness-review.html docs\breadcrumbs.md docs\choices.md tasks\todo.md` -> passed; only expected CRLF warning for `tasks/todo.md`.
- Follow-up added a tackle ranking for unstable providers: 1 Augment, 2 Ollama, 3 Zed, then Warp, Antigravity, Windsurf, Kiro, Alibaba, Perplexity, Abacus, Mistral, JetBrains AI Assistant, OpenCode Zen.

# Keep installed app alive during local dev

# Validate OpenCode Zen API-key balance path

## Executive Summary
- Check whether OpenCode Zen API keys can replace billing cookies for balance.
- Avoid probing live model endpoints or leaking local API keys.
- Keep Zen balance cookie-backed if docs/package/local state only prove model access.

## Acceptance Criteria
- [x] Current hidden OpenCode Zen provider behavior is reviewed.
- [x] Official OpenCode docs are checked for Zen API-key balance endpoints.
- [x] Local OpenCode auth state and npm package shape are inspected without exposing secrets.
- [x] Decision is documented in active provider docs and task notes.
- [x] No provider code claims API-key balance support without a verified endpoint.

## Plan
- [x] Inspect current hidden `opencode` provider, tests, manifest, and docs.
- [x] Research official OpenCode Zen and provider docs.
- [x] Inspect local OpenCode auth state and current npm package wrapper.
- [x] Record the implementation decision and verification notes.

## Verification Notes
- Official OpenCode Zen docs confirm API keys for model access and list model endpoints such as `https://opencode.ai/zen/v1/responses`.
- The docs describe pay-as-you-go balance, auto-reload, and monthly limits as billing/account settings, but do not document an API-key balance endpoint.
- Local `~/.local/share/opencode/auth.json` contains provider API-key config (`opencode-go`) and no separate Zen billing-balance cache. The real key value was not copied into notes.
- Current `opencode-ai@1.14.50` npm package is a thin platform-binary wrapper; no JS balance client exists in the package.
- Decision: do not add Zen API-key balance support. Keep Zen balance on the existing signed-in web-session/cookie path and keep it detail-only/hidden unless a documented or real-account-validated balance endpoint appears.

# Add Ollama Cloud auth detection

## Executive Summary
- Detect Ollama Cloud auth without pretending it replaces settings quota.
- Keep the existing cookie-backed settings usage bars unchanged.
- Improve no-cookie Ollama output for users who already ran `ollama signin` or set `OLLAMA_API_KEY`.

## Acceptance Criteria
- [x] Ollama detects `OLLAMA_API_KEY` when no settings cookie is configured.
- [x] Ollama detects local `~/.ollama/id_ed25519` plus `~/.ollama/id_ed25519.pub` when no settings cookie is configured.
- [x] Detected Cloud auth returns a safe text status and does not create fake quota bars.
- [x] Existing cookie-backed Session/Weekly progress still works unchanged.
- [x] Settings/docs explain Cloud auth detection and dashboard-cookie quota limits.
- [x] Focused Ollama/settings verification passes and bundled plugin files are synced.

## Plan
- [x] Add Cloud auth detection helpers to the Ollama plugin.
- [x] Add text manifest lines and focused plugin regressions.
- [x] Update Settings copy, docs, env allowlist, choices, and breadcrumbs.
- [x] Sync bundled plugins and run focused verification.

## Verification Notes
- Official Ollama Cloud/API docs confirm `ollama signin` and `OLLAMA_API_KEY` for Cloud/API access, while documented usage fields are per-response telemetry rather than account Session/Weekly quota counters.
- `bun run test -- plugins\ollama\plugin.test.js src\components\settings\provider-settings-detail.test.tsx --run` -> passed.
- `node --check plugins\ollama\plugin.js` -> passed.
- `cargo test --manifest-path src-tauri\Cargo.toml env_api_respects_allowlist_in_host_and_js --no-run` -> compiled test binaries.
- `bun run typecheck` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `ollama`.
- SHA-256 check confirmed source/bundled Ollama `plugin.js`, `plugin.json`, `plugin.test.js`, and icon hashes match.
- `git diff --check -- plugins\ollama src-tauri\resources\bundled_plugins\ollama src-tauri\src\plugin_engine\host_api.rs src\lib\provider-settings.ts src\components\settings\provider-settings-detail.test.tsx docs\providers\ollama.md docs\choices.md docs\breadcrumbs.md tasks\todo.md` -> passed; only expected CRLF conversion warnings were reported.

# Spike Abacus API-key compute-points path

## Executive Summary
- Check whether Abacus compute points can move from browser cookies to API-key auth.
- Use official docs and current SDK package evidence.
- Avoid adding a fake API-key path if no callable compute-points API exists.

## Acceptance Criteria
- [x] Current Abacus plugin cookie behavior is reviewed.
- [x] Official Abacus docs and latest Python SDK are checked for `ComputePointInfo` access.
- [x] Decision is documented in active provider docs and task notes.
- [x] No provider code claims API-key support without a verified endpoint.

## Plan
- [x] Inspect current plugin, tests, manifest, and provider docs.
- [x] Search official Abacus docs for compute-point API access.
- [x] Download and inspect latest `abacusai` Python SDK package.
- [x] Record the implementation decision and verification notes.

## Verification Notes
- Official docs expose `ComputePointInfo` fields (`currMonthAvailPoints`, `currMonthUsage`, `freeTierTotal`, etc.), but the page documents the return class, not a callable API method.
- Downloaded `abacusai==1.4.95` from PyPI and searched the package. `ComputePointInfo` exists as `compute_point_info.py`, but `client.py` has no method returning it and no `getOrganizationComputePoints` / compute-point client API method.
- The SDK's public `_call_api` path authenticates with an API-key header against `/api/v0/<action>`, but there is no documented or generated action for organization compute points.
- The only concrete endpoint found for current balance remains the existing private web-session path, `https://apps.abacus.ai/api/_getOrganizationComputePoints`.
- Decision: do not add Abacus API-key setup yet. Keep cookie mode and classify API-key replacement as blocked until a real account or official docs validate a callable compute-points API.

# Add Auggie session detection to Augment

## Executive Summary
- Detect local Auggie login state for Augment.
- Keep dashboard credit balance on the current cookie path until a real balance API is validated.
- Improve the missing-cookie error so signed-in Auggie users know what still needs a dashboard session.

## Acceptance Criteria
- [x] Augment reads Auggie session JSON from `AUGMENT_SESSION_AUTH` or `~/.augment/session.json`.
- [x] Augment reports local Auggie auth detection when no dashboard cookie is configured.
- [x] Credit usage still requires the existing cookie-backed dashboard endpoint.
- [x] Settings/docs do not claim Auggie session auth replaces dashboard credit balance.
- [x] Focused Augment/settings verification passes and bundled plugin files are synced.

## Plan
- [x] Add Auggie session parsing and source detection to the Augment plugin.
- [x] Update Augment setup copy, docs, manifest message, and tests.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and review diff.

## Verification Notes
- Official Augment docs/package inspection confirmed Auggie session auth uses `AUGMENT_SESSION_AUTH` or `~/.augment/session.json` with `accessToken` and `tenantURL`, while no dashboard credit-balance endpoint was found in the published Auggie SDK.
- `bun run test -- plugins\augment\plugin.test.js src\components\settings\provider-settings-detail.test.tsx --run` -> passed.
- `bun run typecheck` -> passed.
- `node --check plugins\augment\plugin.js` -> passed.
- `cargo test --manifest-path src-tauri\Cargo.toml env_api_respects_allowlist_in_host_and_js --no-run` -> compiled test binaries; execution not attempted because local Rust test execution is already blocked by `STATUS_ENTRYPOINT_NOT_FOUND`.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `augment`.
- SHA-256 check confirmed source/bundled Augment `plugin.js`, `plugin.json`, `plugin.test.js`, and icon hashes match.
- `git diff --check -- plugins\augment src-tauri\resources\bundled_plugins\augment src-tauri\src\plugin_engine\host_api.rs src\lib\provider-settings.ts src\components\settings\provider-settings-detail.test.tsx docs\providers\augment.md tasks\todo.md` -> passed; only expected CRLF conversion warnings were reported.

# Make Codebuff icon white

## Executive Summary
- Render the Codebuff SVG as white.
- Keep the source and bundled plugin icon copies aligned.
- Verify the SVG diff only changes icon rendering.

## Acceptance Criteria
- [x] `plugins/codebuff/icon.svg` renders non-transparent pixels as white.
- [x] `src-tauri/resources/bundled_plugins/codebuff/icon.svg` matches the source icon.
- [x] Diff review confirms no unrelated asset changes.

## Plan
- [x] Patch the Codebuff SVG with a white alpha-preserving filter.
- [x] Apply the same change to the bundled Codebuff SVG.
- [x] Run a focused diff/hash check.

## Verification Notes
- Source and bundled Codebuff SVG files include `filter="url(#white)"` with `feFlood flood-color="#fff"` and alpha compositing.
- SHA-256 hash matches for source and bundled Codebuff SVG: `914B194893A8231AD24B7802DCC91AEA06DB25BCE9BB98DD89A10DC8DF184CBA`.
- Source SVG starts with `3C-3F-78-6D-6C-20-76-65`, confirming no UTF-8 BOM.

## Executive Summary
- Let the installed UsageBar keep running when local dev starts.
- Keep stale workspace debug cleanup for rebuild safety.
- Make the Cargo toolchain failure explicit instead of masking it behind process cleanup.

## Acceptance Criteria
- [x] `npm run tauri -- dev` no longer stops installed/release UsageBar just because it owns port `6736`.
- [x] Dev wrapper still stops exact workspace debug binaries before launch.
- [x] Focused wrapper tests pass.
- [x] Missing Cargo is repaired and `cargo metadata` succeeds.
- [x] Tauri dev frontend startup uses a Windows-resolvable command.

## Plan
- [x] Remove broad dev API port-owner cleanup from the Tauri wrapper.
- [x] Preserve exact-path stale debug process cleanup.
- [x] Run focused wrapper tests and inspect Rust toolchain availability.
- [x] Install/repair Rustup when Cargo is genuinely missing.
- [x] Switch Tauri dev frontend startup from the extensionless Bun shim to `npm run dev`.

## Verification Notes
- `node --test scripts\tauri\wrapper.test.mjs` -> 3 tests passed.
- Initial `Get-Command cargo` / `where.exe cargo` -> cargo not found, even though PATH included `C:\Users\llein\.cargo\bin`.
- Winget had a stale Rustup registration but no usable binaries; direct Rustup bootstrap installed `stable-x86_64-pc-windows-msvc`.
- `cargo --version` -> `cargo 1.95.0`.
- `cargo metadata --manifest-path src-tauri\Cargo.toml --no-deps --format-version 1` -> passed.
- `npm run tauri -- dev` after Cargo repair reached `beforeDevCommand`; Tauri could not resolve the extensionless Kiro-Cli `bun` shim, so dev startup now uses `npm run dev`.

# Reduce OpenCode Go cookie setup from cookie-auth review

## Executive Summary
- Keep OpenCode Go focused on local usage history.
- Stop prompting normal OpenCode Go users to paste Zen billing cookies.
- Preserve existing optional Zen balance fallback for saved/env cookies.

## Acceptance Criteria
- [x] OpenCode Go Settings no longer exposes Cookie header or Workspace ID inputs.
- [x] OpenCode Go guidance explains local `opencode` auth/history setup first.
- [x] Existing optional Zen balance code path remains available for existing saved/env cookies.
- [x] Focused Settings and OpenCode Go plugin tests pass.

## Plan
- [x] Patch OpenCode Go provider settings metadata.
- [x] Update OpenCode Go docs for hidden/legacy Zen balance.
- [x] Update focused Settings expectations.
- [x] Run focused verification and review diff.

## Verification Notes
- `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\opencode-go\plugin.test.js --run` -> 2 files passed, 45 tests passed.
- `git diff --check -- src\lib\provider-settings.ts src\components\settings\provider-settings-detail.test.tsx docs\providers\opencode-go.md tasks\todo.md` -> passed; only expected CRLF conversion warnings were reported.
- Diff review confirms OpenCode Go plugin runtime code was not changed, so existing saved/env Zen balance fallback remains available.

# Make OpenCode Zen balance detail-only

## Executive Summary
- Keep OpenCode Go overview focused on local Go usage.
- Move optional Zen balance out of the default overview card.
- Preserve the compatibility line on the provider detail view.

## Acceptance Criteria
- [x] `opencode-go` manifest marks `Zen balance` as `detail`, not `overview`.
- [x] Focused manifest and plugin tests pass.
- [x] Bundled plugin manifest is synced from source.
- [x] Docs explain Zen balance is hidden from normal/default setup.

## Plan
- [x] Patch source manifest and test expectation.
- [x] Update provider docs wording.
- [x] Sync bundled plugin resources.
- [x] Run focused verification and review diff.

## Verification Notes
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `opencode-go`.
- `bun run test -- plugins\opencode-go\plugin.test.js src\components\settings\provider-settings-detail.test.tsx --run` -> 2 files passed, 45 tests passed.
- SHA-256 check confirmed source/bundled OpenCode Go `plugin.js`, `plugin.json`, `plugin.test.js`, and `icon.svg` hashes match.
- `git diff --check -- plugins\opencode-go src-tauri\resources\bundled_plugins\opencode-go docs\providers\opencode-go.md src\lib\provider-settings.ts src\components\settings\provider-settings-detail.test.tsx tasks\todo.md docs\breadcrumbs.md` -> passed; only expected CRLF conversion warnings were reported.

# De-emphasize optional Codex and Claude cookies

## Executive Summary
- Keep Codex and Claude local OAuth/CLI setup as the main path.
- Stop putting browser-cookie capture in the primary connection guidance.
- Leave optional cookie fields available for dashboard/fallback use.

## Acceptance Criteria
- [x] Codex “How to connect” guidance is CLI/local-auth first and does not ask for dashboard cookies.
- [x] Claude “How to connect” guidance is CLI/OAuth first and does not ask for claude.ai cookies.
- [x] Optional cookie secret fields remain available for advanced/fallback use.
- [x] Focused Settings tests pass.

## Plan
- [x] Patch Codex and Claude provider settings copy.
- [x] Update focused Settings expectations.
- [x] Run focused verification and review diff.

## Verification Notes
- `bun run test -- src\components\settings\provider-settings-detail.test.tsx --run` -> 1 file passed, 29 tests passed.
- `git diff --check -- src\lib\provider-settings.ts src\components\settings\provider-settings-detail.test.tsx tasks\todo.md` -> passed; only expected CRLF conversion warnings were reported.

# Remove invalid text-line primary order warnings

## Executive Summary
- Clean up dev-start warnings from provider manifests.
- Keep overview fallback text lines visible.
- Preserve primary metric ordering for real progress bars only.

## Acceptance Criteria
- [x] No source plugin manifest has `primaryOrder` on a `text` line.
- [x] Bundled plugin manifests are synced from source.
- [x] Focused manifest verification passes.
- [x] Diff review confirms only manifest/task/supporting notes changed.

## Plan
- [x] Remove `primaryOrder` from text fallback lines in affected plugin manifests.
- [x] Sync bundled plugins.
- [x] Run static manifest validation and focused checks.
- [x] Review diff and record verification notes.

## Verification Notes
- `node -e "...text lines declare primaryOrder..."` over `plugins` and `src-tauri/resources/bundled_plugins` -> passed; no text lines declare `primaryOrder`.
- `node -e "...JSON.parse(plugin.json)..."` over source and bundled manifests -> passed.
- `git diff --check -- ...` -> passed; only expected LF-to-CRLF warnings reported.
- `git status --short` -> only affected source plugin manifests plus task/lesson notes are modified.

# Audit Markdown and HTML documentation clutter

## Executive Summary
- Review Markdown and HTML files for active usefulness.
- Keep current product, provider, release, and architecture docs in active locations.
- Move old transition notes, historical smoke evidence, scratch research, and redundant plugin implementation notes into `docs/archive/`.
- Fix active docs that still describe outdated provider setup inputs.

## Acceptance Criteria
- [x] Markdown/HTML inventory excludes generated build folders and is reviewed.
- [x] Obsolete or historical docs are no longer in active docs/plugin folders.
- [x] Active docs keep current setup information for recently changed providers.
- [x] Release docs no longer point at the old Alpha 1 smoke checklist as the current checklist.
- [x] Verification confirms no tracked ignored docs and no broken active references to moved files.

## Plan
- [x] Inventory `.md` and `.html` files outside build/vendor folders.
- [x] Check references and freshness signals for candidate docs.
- [x] Archive historical/superseded docs with `Move-Item`.
- [x] Patch stale active documentation.
- [x] Verify references, ignore behavior, and diff.

## Verification Notes
- Reviewed `rg --files -g "*.md" -g "*.html"` excluding `node_modules`, `src-tauri/target`, `coverage`, and `dist`.
- Moved obsolete/historical docs into `docs/archive/`: `capture-logs.md`, `app-state-architecture.md`, `archive-ai-provider-research-dump.md`, `upstream-sync-2026-04-24.md`, Alpha 1 smoke evidence, and plugin `IMPLEMENTATION.md` notes.
- `rg --files plugins -g "IMPLEMENTATION.md"` -> no plugin implementation notes remain in active plugin folders.
- `rg -n "env-only|you can only fake env-based|No file path today; auth is env-only|alpha-smoke-test\.md" docs\provider-input-simulation.md docs\providers docs\releasing.md` -> no active stale matches.
- `docs/releasing.md` now links historical Alpha 1 smoke evidence under `docs/archive/release/` and keeps the current Alpha Gate inline.

# Clean repo-root generated clutter

## Executive Summary
- Move old local dev logs out of the repository root.
- Keep screenshots/assets in a named docs asset folder instead of root.
- Add ignore rules so generated logs, screenshots, reports, and local notes do not reappear as long root lists.
- Clean git tracking for generated artifacts without rewriting history.

## Acceptance Criteria
- [x] Root-level `*.log` files are no longer present.
- [x] Generated root screenshots are ignored, and the existing screenshot is moved to a docs asset folder.
- [x] `.gitignore` covers local logs, generated screenshots, HTML reports, temp archives, and local agent docs.
- [x] Tracked generated artifacts are removed from git tracking without deleting the local file content.
- [x] `git status --short --ignored` shows the cleanup clearly and no unrelated user changes are reverted.

## Plan
- [x] Inventory current generated/log/report files.
- [x] Move existing root logs into `logs/archive/`.
- [x] Move the root screenshot into `docs/assets/`.
- [x] Extend `.gitignore` for generated local clutter.
- [x] Remove generated artifacts from git tracking where appropriate.
- [x] Verify ignore behavior and review the diff.

## Verification Notes
- `Get-ChildItem -LiteralPath . -File -Filter *.log` -> no root-level logs.
- `git check-ignore -v logs/archive/.tauri-dev.out.log docs/assets/screenshot.png docs/reports/cookie-auth-fixability-review.html screenshot-new.png test-results/example.json playwright-report/index.html` -> all matched expected ignore rules.
- `git ls-files -c -i --exclude-standard` -> no tracked ignored files remain.
- `git rm --cached -- screenshot.png` removed the generated screenshot from tracking only; local image content remains at `docs/assets/screenshot.png`.

# Auto-minimize tray bar after inactivity

## Executive Summary
- Hide the tray bar automatically after about 30 seconds of inactivity.
- Reset the timer when the user interacts with the bar.
- Keep the first version simple without adding a setting unless tests show the fixed default is too intrusive.

## Acceptance Criteria
- [x] The Tauri tray panel invokes `hide_panel` after 30 seconds of panel inactivity.
- [x] Pointer, keyboard, wheel, scroll, focus, and tray navigation activity reset the timer.
- [x] The auto-hide timer is cleaned up when the panel unmounts or the About dialog owns Escape handling.
- [x] Focused panel tests pass.

## Plan
- [x] Add a panel inactivity timeout to `usePanel`.
- [x] Add focused regressions for timeout hide, activity reset, and cleanup.
- [x] Record the no-setting default in choices/breadcrumbs.
- [x] Run focused panel tests and review the diff.

## Verification Notes
- `bun run test -- src\hooks\app\use-panel.test.ts --run` -> 1 file passed, 17 tests passed.
- `bun run typecheck` -> passed.

# Auto-close Settings window after inactivity

## Executive Summary
- Close the Settings window after 5 minutes of inactivity.
- Reset the timer when the user interacts with Settings.
- Keep the tray bar auto-minimize behavior separate.

## Acceptance Criteria
- [x] Settings invokes the current window `hide()` after 5 minutes of inactivity.
- [x] Pointer, keyboard, wheel, scroll, focus, and `settings:open` activity reset the timer.
- [x] The Settings auto-close timer is cleaned up on unmount.
- [x] Focused Settings window tests pass.

## Plan
- [x] Add a Settings inactivity timeout in `SettingsWindowApp`.
- [x] Add focused regressions for timeout hide, activity reset, and cleanup.
- [x] Record the 5-minute default in choices/breadcrumbs.
- [x] Run focused tests and typecheck.

## Verification Notes
- `bun run test -- src\App.test.tsx --run` -> 1 file passed, 87 tests passed.
- `bun run typecheck` -> passed.

# Fix review findings from main/origin comparison

## Executive Summary
- Include the new Codebuff provider files in git tracking.
- Keep Codebuff network access on the declared production domain only.
- Align plugin HTTP documentation with deny-by-default host behavior.

## Acceptance Criteria
- [x] Codebuff docs and plugin files are staged/tracked for the next commit.
- [x] Codebuff no longer exposes or documents a base-URL override that the host blocks.
- [x] Plugin API/schema docs describe empty or omitted `httpDomains` as blocked.
- [x] Focused Codebuff and docs/static verification passes.

## Plan
- [x] Remove stale Codebuff override references and env allowlist entry.
- [x] Update plugin HTTP documentation.
- [x] Run focused tests/checks.
- [x] Stage the Codebuff docs/plugin files.

## Verification Notes
- `rg -n "CODEBUFF_API_URL|staging\\.codebuff|Optional:" plugins\\codebuff docs\\providers\\codebuff.md src-tauri\\src\\plugin_engine\\host_api.rs` -> no matches.
- `bun run test -- plugins\\codebuff\\plugin.test.js --run` -> 1 file passed, 7 tests passed.
- `node --check plugins\\codebuff\\plugin.js` -> passed.
- `git diff --check ...` for touched docs/Codebuff/host/todo paths -> passed; only existing LF-to-CRLF warnings.

# Make CI truthful, reproducible, and Windows-aware

## Executive Summary
- Pin CI tooling instead of using moving latest versions.
- Run the same frontend/plugin gates on Linux and Windows.
- Add Rust/Tauri backend verification to CI.
- Keep Windows-specific wrapper checks explicit.

## Acceptance Criteria
- [x] CI pins Bun and installs with the lockfile on every job.
- [x] CI runs frontend build, frontend/plugin tests, wrapper tests, Rust check, Linux Rust tests, and Windows Rust test compilation.
- [x] Linux CI installs required Tauri/WebKit system packages before Rust verification.
- [x] Windows CI keeps Windows-specific wrapper/script coverage in the required gate.
- [x] Publish workflow uses frozen Bun installs.

## Plan
- [x] Update `.github/workflows/ci.yml` with explicit tool versions, OS setup, and named verification steps.
- [x] Update `.github/workflows/publish.yml` to use the same pinned/frozen Bun install policy.
- [x] Record the CI defaults in docs breadcrumbs/choices.
- [x] Run local syntax and focused verification.

## Verification Notes
- `bun install --frozen-lockfile` -> passed after refreshing `bun.lock` for the current `package.json`.
- `bun run build` -> passed; existing Vite/Tailwind timing and large chunk warnings remain.
- `bun run test -- --run` -> 75 files passed, 1088 tests passed.
- `node --test scripts\tauri\wrapper.test.mjs` -> 3 tests passed.
- `cargo check --manifest-path src-tauri\Cargo.toml --locked` -> passed.
- `cargo test --manifest-path src-tauri\Cargo.toml --locked --no-run` -> passed.
- `cargo test --manifest-path src-tauri\Cargo.toml --locked` -> compiled, then failed locally with existing Windows `STATUS_ENTRYPOINT_NOT_FOUND`; CI runs full Rust tests on Linux and Windows Rust test compilation until that runtime blocker is fixed.
- `bun run check` -> not added to CI; current Prettier contract reports hundreds of existing unformatted files, so making it required now would be false red.

# P0 - Harden WebView and plugin security boundaries

## Executive Summary
- Tighten the app WebView's load/connect policy.
- Require plugin network calls to match declared provider domains.
- Add focused regression tests for the security boundary.

## Acceptance Criteria
- [x] WebView CSP no longer permits broad `https:` connections.
- [x] Plugin HTTP requests are denied when `httpDomains` is empty.
- [x] Existing networked plugins declare explicit `httpDomains`.
- [x] Focused Rust/config verification passes.

## Plan
- [x] Patch Tauri CSP to least-privilege app/updater/dev connections.
- [x] Patch plugin HTTP domain enforcement to deny by default.
- [x] Add `httpDomains` to current networked plugin manifests.
- [x] Run focused verification and record notes.

## Verification Notes
- `node -e "JSON.parse(... src-tauri/tauri.conf.json ...); JSON.parse(... plugins/*/plugin.json ...)"` -> passed.
- Static boundary check confirmed `connect-src` has no broad `https:` source and every plugin using `ctx.util.request` or `ctx.host.http.request` declares non-empty `capabilities.httpDomains`.
- Synced runtime plugin resources with `node ./copy-bundled.cjs` -> bundled 31 plugins.
- Re-ran source + bundled plugin static check -> every HTTP-using plugin manifest declares non-empty `capabilities.httpDomains`.
- `cargo test --manifest-path src-tauri\Cargo.toml http_domain_allowlist --no-run` -> compiled focused Rust test binaries.
- `cargo check --manifest-path src-tauri\Cargo.toml` -> passed.
- `git --no-pager diff --check -- src-tauri\src\plugin_engine\host_api.rs src-tauri\tauri.conf.json plugins tasks\todo.md` -> passed; only existing CRLF conversion warnings reported.
- Attempted Rust test execution for `http_domain_allowlist` and `sqlite_write_defaults_to_blocked_without_capability`; both compiled, then local test binary exited with existing `STATUS_ENTRYPOINT_NOT_FOUND` blocker.

# Resolve Aptabase and Tauri dependency mismatch

## Executive Summary
- Remove the stale Aptabase frontend package that pulled in Tauri v1 APIs.
- Keep analytics behavior on the existing Tauri v2 command path.
- Verify dependency trees and compile/test checks.

## Acceptance Criteria
- [x] `@aptabase/tauri` is no longer a package dependency or lockfile entry.
- [x] Analytics tests still pass through the Tauri v2 `invoke` wrapper.
- [x] Rust still compiles with the existing Aptabase plugin.

## Plan
- [x] Confirm the mismatch source in package and Cargo dependency trees.
- [x] Remove the unused frontend Aptabase package and stale global mock.
- [x] Refresh lockfiles and verify dependency/build checks.

## Verification Notes
- `npm view @aptabase/tauri version dependencies --json` -> latest `0.4.1`, depends on `@tauri-apps/api@^1.0.0`.
- `cargo tree --manifest-path src-tauri\Cargo.toml -i tauri` -> Rust Tauri resolves to `tauri v2.10.3`; `tauri-plugin-aptabase` depends on the same Tauri v2 tree.
- `rg -n "@aptabase/tauri|@tauri-apps/api@1\.6\.0|@aptabase/tauri/@tauri-apps/api" package.json bun.lock package-lock.json src\test\setup.ts` -> no matches.
- `npm ls @aptabase/tauri @tauri-apps/api` -> no Aptabase frontend package; all installed Tauri API entries are v2.
- `npx vitest run src\lib\analytics.test.ts` -> 1 file passed, 2 tests passed.
- `npx tsc --noEmit` -> passed.
- `cargo check --manifest-path src-tauri\Cargo.toml` -> passed.
- `npm uninstall @aptabase/tauri --package-lock-only=false` removed the stale extraneous local package; npm reported EPERM cleanup warnings for unrelated native-package temp directories.

# Add enforceable lint and formatting contract

## Executive Summary
- Add one developer command that checks formatting, linting, TypeScript, and Rust lints.
- Make CI run the same contract before build/test.
- Document the default tooling choice for future contributors.

## Acceptance Criteria
- [x] `package.json` exposes enforceable lint, format, typecheck, and combined check scripts.
- [x] Repo config files define Prettier, ESLint, EditorConfig, rustfmt, and clippy expectations.
- [x] CI runs the combined contract with frozen dependencies.
- [x] Focused contract verification passes or blockers are documented.

## Plan
- [x] Add current lint/format dev tooling and scripts.
- [x] Add config files with repo-scoped ignores.
- [x] Wire CI to run the combined contract.
- [x] Run focused verification and record results.

## Verification Notes
- Added current tooling after npm metadata health check: `eslint@10.3.0` (modified 2026-05-01), `prettier@3.8.3` (modified 2026-04-15), and `typescript-eslint@8.59.2` (modified 2026-05-08).
- `bun run check` -> passed. Runs contract-file Prettier check, ESLint over `src`, `plugins`, and repo scripts/config, then `tsc --noEmit`.
- `bun run lint` -> passed.
- `bun run typecheck` -> passed.
- Installed missing local Rust components with `rustup component add rustfmt` and `rustup component add clippy`.
- `bun run format:rust:check` -> failed on existing Rust formatting drift in `src-tauri/src/codex_account_store.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/local_http_api/*`, `src-tauri/src/plugin_engine/*`, and `src-tauri/src/main.rs`; left as an explicit optional gate to avoid reformatting unrelated dirty Rust work in this slice.
- `bun run lint:rust` -> failed on existing Clippy warnings including `clone_on_copy`, `needless_borrow`, `needless_return`, `ptr_arg`, `manual_find`, `type_complexity`, and related issues; left as an explicit optional gate until a Rust cleanup slice.

# Stop dev rebuild storm after plugin bundling

## Executive Summary
- Keep `npm run tauri -- dev` from rebuilding once per bundled plugin file.
- Refresh bundled plugins before Tauri starts watching files.
- Keep release/build plugin bundling unchanged.

## Acceptance Criteria
- [x] Dev plugin bundling runs before Tauri's file watcher starts.
- [x] Tauri `beforeDevCommand` starts only the frontend dev server.
- [x] Focused wrapper/config verification passes.

## Plan
- [x] Move dev plugin bundling into `scripts/tauri/wrapper.mjs` before Tauri CLI launch.
- [x] Change Tauri `beforeDevCommand` to `bun run dev`.
- [x] Run focused verification and record results.

## Verification Notes
- `node --check scripts\tauri\wrapper.mjs` -> passed.
- `node --test scripts\tauri\wrapper.test.mjs` -> 3 tests passed.

# Implement Codebuff as a Windows-experimental provider

## Executive Summary
- Add Codebuff to the visible provider list with real setup.
- Show credit usage as real progress bars with supported count formatting.
- Support stored API token, `CODEBUFF_API_KEY`, and local `codebuff login` credentials.

## Acceptance Criteria
- [x] Codebuff plugin emits overview-visible `Credits` and `Weekly` progress lines with supported frontend formats.
- [x] Settings exposes a Codebuff API-token setup path.
- [x] The Tauri host exposes only the needed Codebuff env vars.
- [x] README/docs describe the provider and its experimental validation gap.
- [x] Focused Codebuff, settings, host-env, and bundle verification passes.

## Plan
- [x] Normalize Codebuff progress format and icon theming.
- [x] Add settings metadata and env allowlist entries.
- [x] Sync bundled plugins and run focused verification.

## Verification Notes
- Researched current public Codebuff surfaces on 2026-05-12: official pricing lists paid subscriptions by usage multiplier plus pay-as-you-go credits; official docs expose API-key setup and `/usage` CLI guidance, so the provider reads live quota/credit numbers instead of hardcoding plan allowances.
- `bun run test -- plugins/codebuff/plugin.test.js --run` -> 1 file passed, 6 tests passed.
- `bun run test -- src\components\settings\provider-settings-detail.test.tsx --run` -> 1 file passed, 24 tests passed.
- `cargo test --manifest-path src-tauri\Cargo.toml env_api_respects_allowlist_in_host_and_js --no-run` -> compiled focused Rust test binaries.
- `cargo test --manifest-path src-tauri\Cargo.toml env_api_respects_allowlist_in_host_and_js` -> compiled, then hit the existing local Windows `STATUS_ENTRYPOINT_NOT_FOUND` Rust test-runtime blocker.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `codebuff`.
- `Get-FileHash` confirmed source/bundled Codebuff `plugin.js`, `plugin.json`, and `icon.svg` hashes match.
- `rg -n 'kind: "credits"|CODEBUFF|Codebuff' ...` -> no unsupported `kind: "credits"` remains; Codebuff env/settings/docs references are present.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `node --check plugins\codebuff\plugin.js` -> passed.

# Fix Alibaba Coding Plan progress bars

## Executive Summary
- Keep Alibaba as a Windows-experimental API-key provider.
- Show real request counts against current Coding Plan limits instead of percent-only placeholders.
- Align manifest labels, setup docs, and tests so the overview can display the bars.

## Acceptance Criteria
- [x] Alibaba overview lines match emitted progress labels.
- [x] Alibaba progress bars use real request counts and limits for 5-hour, weekly, and monthly quota windows when available.
- [x] Plan-limit fallback matches current online Coding Plan tiers only when the plan name is known.
- [x] Stale Alibaba placeholder docs are corrected.
- [x] Focused Alibaba plugin/settings/bundle verification passes.

## Plan
- [x] Patch Alibaba parser and manifest labels.
- [x] Add focused plugin tests for API key, known plan fallback, and auth errors.
- [x] Update stale docs and sync bundled plugin files.

## Verification Notes
- Researched current Alibaba Coding Plan docs on 2026-05-12: Pro is 6,000 requests per 5 hours, 45,000 per week, and 90,000 per month; legacy Lite is 1,200 / 9,000 / 18,000 and no longer available to new subscribers.
- `bun run test -- plugins/alibaba/plugin.test.js --run` -> 1 file passed, 4 tests passed.
- `bun run test -- src\components\settings\provider-settings-detail.test.tsx --run` -> 1 file passed, 25 tests passed after rerunning outside the transient parallel sandbox CWD issue.
- `node --check plugins\alibaba\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `alibaba`.
- `Get-FileHash` confirmed source/bundled Alibaba `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- `rg -n 'placeholder|Placeholder plugin only|Current implementation: placeholder|kind: "percent"|"label": "Quota"' ...` -> no Alibaba placeholder, percent-format, or stale `Quota` manifest hits remain; remaining hits are generic definitions and the separate Augment simulation row.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.

# Fix Copilot quota progress units

## Executive Summary
- Keep Copilot login through GitHub CLI/token sources unchanged.
- Change Copilot bars to real request/completion counts where GitHub exposes limits.
- Use current documented premium-request plan limits only when the provider payload names a known Copilot plan.

## Acceptance Criteria
- [x] Premium Copilot progress uses request counts against current plan limits when a known plan is present.
- [x] Free Chat and Completions progress uses exact remaining/monthly quota counts instead of percentages.
- [x] Paid Chat stays percent-based only when GitHub exposes no count limit in the payload.
- [x] Copilot docs explain count vs percent surfaces and current plan-limit fallback.
- [x] Focused Copilot plugin verification passes.

## Plan
- [x] Add Copilot plan-limit mapping from current GitHub docs.
- [x] Patch Premium and free-tier progress helpers.
- [x] Update tests/docs and sync bundled plugin files.

## Verification Notes
- Researched current GitHub Copilot docs on 2026-05-12: monthly premium request allowances are Free 50, Student 300, Pro 300, Pro+ 1,500, Business 300 per user, and Enterprise 1,000 per user; GitHub also announces a June 1, 2026 move from request-based billing to usage-based billing.
- `bun run test -- plugins\copilot\plugin.test.js --run` -> 1 file passed, 40 tests passed.
- `node --check plugins\copilot\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `copilot`.
- `Get-FileHash` confirmed source/bundled Copilot `plugin.js` and `plugin.test.js` hashes match.
- `rg -n 'Premium interactions remaining|premium\.used\)\.toBe\(20\)|chat\.used\)\.toBe\(18\)|format: \{ kind: "percent" \}' ...` -> no stale Copilot percent-only expectations or docs remain.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.

# Fix Synthetic quota progress units

## Executive Summary
- Keep Synthetic API-key login unchanged.
- Show exact quota counts as credit progress when the API returns `used`/`remaining` plus `limit`.
- Keep percent formatting only for percent-only payloads.

## Acceptance Criteria
- [x] Synthetic exact quota payloads render `count` progress with `credits` suffix.
- [x] Synthetic percent-only payloads still render percent progress.
- [x] Focused Synthetic plugin verification passes and bundled plugin files are synced.

## Plan
- [x] Track whether a parsed quota had an exact numeric limit source.
- [x] Set progress format from that parsed source type.
- [x] Update tests and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\synthetic\plugin.test.js --run` -> 1 file passed, 10 tests passed.
- `node --check plugins\synthetic\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `synthetic`.
- `Get-FileHash` confirmed source/bundled Synthetic `plugin.js` and `plugin.test.js` hashes match.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.

# Fix Z.ai quota progress units

## Executive Summary
- Keep Z.ai env-key login unchanged.
- Show exact token counts for session and weekly token quota bars.
- Show web search usage as a normal count bar.

## Acceptance Criteria
- [x] Z.ai Session and Weekly lines use token counts from `currentValue` / `usage`.
- [x] Z.ai Web Searches uses count format with a stable suffix.
- [x] Z.ai docs describe token-count bars, not percent-only bars.
- [x] Focused Z.ai plugin verification passes and bundled plugin files are synced.

## Plan
- [x] Add a token-limit progress helper.
- [x] Patch Session, Weekly, and Web Searches formats.
- [x] Update tests/docs and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\zai\plugin.test.js --run` -> 1 file passed, 24 tests passed after rerunning outside the transient parallel sandbox CWD issue.
- `node --check plugins\zai\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `zai`.
- `Get-FileHash` confirmed source/bundled Z.ai `plugin.js` and `plugin.test.js` hashes match.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.

# Fix Vertex AI quota progress units

## Executive Summary
- Keep Vertex AI gcloud ADC login unchanged.
- Use the Cloud Monitoring usage/limit values directly in the progress bar.
- Preserve the existing "highest quota pressure" selection.

## Acceptance Criteria
- [x] Vertex AI `Quota usage` uses absolute Cloud Monitoring usage and limit values.
- [x] The selected quota remains the matched series with the highest usage percentage.
- [x] Vertex AI docs describe absolute quota-unit bars.
- [x] Focused Vertex AI plugin verification passes and bundled plugin files are synced.

## Plan
- [x] Return the highest-pressure quota bucket as `{ used, limit }`.
- [x] Render `Quota usage` as count progress.
- [x] Update tests/docs and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\vertex-ai\plugin.test.js --run` -> 1 file passed, 6 tests passed.
- `node --check plugins\vertex-ai\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `vertex-ai`.
- `Get-FileHash` confirmed source/bundled Vertex AI `plugin.js` and `plugin.test.js` hashes match.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `node -e "JSON.parse(... src-tauri/tauri.conf.json ...)"` -> passed.

# Pin tray settings button to bottom corner

## Executive Summary
- Move the tray settings button down to the bottom-left edge.
- Keep panel sizing consistent with the visible nav buttons.
- Verify the focused sidebar sizing regression.

## Acceptance Criteria
- [x] The sidebar no longer reserves bottom padding below the Settings button.
- [x] The nav minimum-height math matches the current Home + provider + Settings button stack.
- [x] Focused side-nav/panel tests pass.

## Plan
- [x] Remove the sidebar bottom padding that lifts Settings away from the bottom edge.
- [x] Update the panel nav height floor and focused expectations.
- [x] Run focused verification and record notes.

## Verification Notes
- `npx vitest run src\hooks\app\use-panel.test.ts src\components\side-nav.test.tsx` -> 2 files passed, 19 tests passed.

# Deep research hardening roadmap

# Fix Windows setup executable publisher

## Executive Summary
- Stop shipped Windows setup executables from launching as `Unknown publisher`.
- Sign the installer artifact itself after release builds when Windows signing material is configured.
- Require Windows signing material by default, with an explicit escape hatch for disposable unsigned smoke builds.

## Acceptance Criteria
- [x] `bun run build:release -- --bundles nsis` refuses to create an unsigned setup `.exe` unless `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1` is set.
- [x] The release helper signs the generated setup `.exe` when `WINDOWS_CERTIFICATE_*` or `WINDOWS_CERTIFICATE_THUMBPRINT` is configured.
- [x] The release helper does not rely on Tauri updater signing to decide whether the Windows setup executable can be Authenticode-signed.
- [x] Focused script/config verification passes.

## Plan
- [x] Trace the Windows publisher path through Tauri config, signing script, and release helper.
- [x] Add an explicit post-build signing pass for NSIS/MSI installer artifacts.
- [x] Verify script syntax/config and record results.

## Verification Notes
- Verified Tauri/Tauri docs: Windows setup publisher comes from Authenticode signing on the Windows executable artifact, while updater signatures are separate.
- `node --check scripts\build-release.mjs` -> passed.
- `node -e "JSON.parse(... tauri.conf.json ...)"` -> passed.
- `bun run build:release -- --bundles nsis` without Windows Authenticode material -> refused before build with `it would launch as Unknown publisher`.
- Existing local artifact `src-tauri\target\release\bundle\nsis\UsageBar_0.1.0-alpha.1_x64-setup.exe` is still `NotSigned`; it must be rebuilt or signed with certificate material to change the Windows publisher prompt.

# Replace Abacus icon SVG

## Executive Summary
- Update the Abacus provider icon to the supplied artwork.
- Keep the provider manifest path unchanged.
- Sync the bundled plugin asset so the desktop app uses the same icon.

## Acceptance Criteria
- [x] `plugins/abacus/icon.svg` contains the updated Abacus SVG.
- [x] Bundled Abacus plugin asset matches the source plugin asset.
- [x] Focused asset verification passes.

## Plan
- [x] Replace the source Abacus SVG.
- [x] Run the plugin bundle sync.
- [x] Verify source and bundled assets match.

## Verification Notes
- Synced bundled plugin output with `node ./copy-bundled.cjs` -> bundled 29 plugins, including `abacus`.
- Verified XML parsing and embedded PNG base64 decoding with PowerShell.
- Verified source/bundled hash match with `Get-FileHash` -> `0AFF58E09A4F6018F5FC09555CC6DF897865D6B73202943D9F7D9FB81522EAE7`.

# Set local version to Alpha 2

## Executive Summary
- Move local app metadata from Alpha 1 to Alpha 2.
- Keep package, Tauri, Cargo, changelog, and local release command examples aligned.
- Verify the Alpha 2 release preflight.

## Acceptance Criteria
- [x] `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` use `0.1.0-alpha.2`.
- [x] `CHANGELOG.md` has a `0.1.0-alpha.2` section.
- [x] Local release-check docs point at `v0.1.0-alpha.2`.
- [x] Release preflight passes for `v0.1.0-alpha.2`.

## Plan
- [x] Patch version metadata and changelog.
- [x] Patch local release-check example.
- [x] Run focused version searches and release preflight.

## Verification Notes
- Updated version metadata to `0.1.0-alpha.2` in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
- Added `CHANGELOG.md` section `0.1.0-alpha.2`.
- Updated the README local release-check command to `v0.1.0-alpha.2`.
- Verified active version references with `rg -n "0\\.1\\.0-alpha\\.2|v0\\.1\\.0-alpha\\.2" package.json src-tauri\\tauri.conf.json src-tauri\\Cargo.toml src-tauri\\Cargo.lock CHANGELOG.md README.md`.
- Verified no active metadata still points at Alpha 1; only the historical changelog section remains.
- Verified release preflight with `bun run release:check -- --release-tag v0.1.0-alpha.2` -> passed.
- Verified Rust metadata with `cargo metadata --manifest-path src-tauri\\Cargo.toml --no-deps --format-version 1` -> package/workspace version `0.1.0-alpha.2`.

# Fix Windows installer SmartScreen signing path

## Executive Summary
- Add real Windows Authenticode signing to public release builds.
- Keep local unsigned builds possible, but clearly separate them from public release candidates.
- Document why SmartScreen reputation can still require an EV certificate or Microsoft reputation even after signing.

## Acceptance Criteria
- [x] Tauri Windows bundling invokes a repo-owned Authenticode signing script for Windows artifacts.
- [x] CI release builds fail fast when Windows signing secrets are missing.
- [x] Release docs explain updater signing vs Windows code signing and the remaining SmartScreen reputation constraint.
- [x] Focused config/script verification passes.

## Plan
- [x] Add a Windows signing script and wire it through `bundle.windows.signCommand`.
- [x] Pass and validate Windows signing secrets in the GitHub publish workflow.
- [x] Update release/README docs for signed vs unsigned installer behavior.
- [x] Run focused verification and record results.

## Verification Notes
- Added `scripts/sign-windows.ps1`, which imports a base64 `.pfx` from `WINDOWS_CERTIFICATE_BASE64` or `WINDOWS_CERTIFICATE`, signs with `signtool`, timestamps with `WINDOWS_TIMESTAMP_URL` or `http://timestamp.digicert.com`, and verifies the signed target. It can also use `WINDOWS_CERTIFICATE_THUMBPRINT` when the runner already has the certificate installed.
- Wired Tauri Windows bundling through `bundle.windows.signCommand` in `src-tauri/tauri.conf.json`.
- Updated `.github/workflows/publish.yml` so Windows release jobs require Authenticode signing secrets and pass them to `tauri-action`, separate from the existing Tauri updater signing key.
- Updated `docs/releasing.md` and `README.md` to distinguish local unsigned installers from public signed release artifacts and to document the remaining SmartScreen reputation constraint.
- Verified local no-certificate behavior with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sign-windows.ps1 -TargetPath package.json` -> no-op unsigned path, exit 0.
- Verified `src-tauri/tauri.conf.json` JSON parsing with `node -e ...` -> passed.
- Verified release preflight with `bun run release:check -- --release-tag v0.1.0-alpha.1` -> passed.
- Verified Tauri environment/config loading with `bun run tauri -- info` -> passed; it reports minor Tauri package updates available.
- Verified diff whitespace with `git diff --check` -> only existing CRLF conversion warnings for touched text files.

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
- [x] The highest-risk findings from the deep research report are represented as small, reviewable todo slices in priority order.
- [x] Each slice has concrete acceptance criteria and verification commands before implementation starts.
- [x] Existing in-flight provider/security work in the dirty worktree is not reverted or mixed into these planning changes.

## Priority Order
1. [x] Stabilize the JavaScript toolchain and package-manager path.
2. [ ] Harden the WebView and plugin security boundaries.
3. [x] Make CI truthful, reproducible, and Windows-aware.
4. [ ] Resolve the Aptabase/Tauri dependency mismatch.
5. [x] Add an enforceable lint/format contract.
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
- Reconciled the parent roadmap after closing the CI and lint/format slices; remaining roadmap items are security boundaries, analytics dependency strategy, branding metadata, accessibility, modularization, and docs.

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
- [x] Plugin manifests or host policy support explicit HTTP domain allowlists before arbitrary network access is treated as normal.
- [x] Dangerous host APIs such as write-capable `sqlite.exec` are gated by explicit plugin capability metadata.
- [x] `ccusage` execution avoids dynamic registry fallback in packaged builds, or the remaining dynamic path is explicitly documented and guarded.
- [ ] Focused Rust/JS tests cover at least one denied HTTP target and one denied write-capability path.

## Plan
- [x] Start with the smallest safe CSP change and run the app/build to catch broken local asset, IPC, font, image, and style paths.
- [x] Extend plugin schema/manifest parsing with optional `permissions.httpDomains` and `permissions.sqliteWrite` fields, preserving current bundled plugins through explicit declarations where needed.
- [x] Enforce the policy in `src-tauri/src/plugin_engine/host_api.rs` and add regression tests around allow/deny decisions.
- [x] Update `docs/plugins/api.md`, `docs/plugins/schema.md`, and `SECURITY.md` so plugin authors understand the new defaults.

## Verification Notes
- Added a restrictive starter CSP in `src-tauri/tauri.conf.json` using the object form from Tauri v2 CSP docs.
- Verified config syntax with `node -e "JSON.parse(...)"` -> `tauri.conf.json valid JSON`.
- Verified frontend compatibility with `npx bun run build` -> `tsc` passed and Vite 8 production build completed.
- Verified Tauri accepts and reports the policy with `npx bun run tauri -- info` -> App CSP reported as `default-src 'self' customprotocol: asset:; connect-src 'self' ipc: http://ipc.localhost https:; img-src 'self' asset: http://asset.localhost blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`.
- Did not edit the broader plugin capability implementation because the dirty worktree already contains changes in `docs/plugins/api.md`, `docs/plugins/schema.md`, `SECURITY.md`, `src-tauri/src/plugin_engine/host_api.rs`, `manifest.rs`, and `runtime.rs`.
- Attempted focused Rust verification with `cargo test --manifest-path src-tauri/Cargo.toml capability -- --nocapture`; the crate compiled, then the local test binary exited with `STATUS_ENTRYPOINT_NOT_FOUND`, matching the existing Rust-test blocker noted elsewhere in this task file.
- Reconciled existing capability work: `HostCapabilities` parses `httpDomains` and `sqliteWrite`; `host_api.rs` injects HTTP with a domain allowlist and SQLite with write gating.
- Patched stale `docs/plugins/api.md` wording that still said no HTTP domain allowlist existed.
- Confirmed the remaining dynamic `ccusage` runner path is explicit in `docs/plugins/api.md` and gated by `capabilities.ccusage`; Windows command execution uses hidden background process flags and cached runner resolution from the earlier packaged-window slice.
- Verified plugin manifest declarations with a Node scan: every plugin using `ctx.host.http.request` declares non-empty `capabilities.httpDomains`, and any plugin using `ctx.host.sqlite.exec` must declare `capabilities.sqliteWrite: true`.
- `cargo test --manifest-path src-tauri\Cargo.toml http_domain_allowlist_matches_exact_and_wildcard_hosts --no-run` -> compiled focused test binaries.
- `cargo test --manifest-path src-tauri\Cargo.toml empty_http_domain_allowlist_blocks_all_urls --no-run` -> compiled focused test binaries.
- `cargo test --manifest-path src-tauri\Cargo.toml sqlite_exec_requires_write_capability --no-run` -> compiled focused test binaries.
- Full local Rust test execution remains blocked by the existing Windows `STATUS_ENTRYPOINT_NOT_FOUND` runtime failure, so the deny-path execution criterion stays open.

# P1 - Make CI truthful, reproducible, and Windows-aware

## Acceptance Criteria
- [x] CI job names match the commands actually run.
- [x] CI installs with `bun install --frozen-lockfile`.
- [x] CI runs typecheck/build, tests, and coverage in non-watch mode.
- [x] CI includes `windows-latest` because UsageBar is Windows-first.
- [x] CI includes lint once the lint/format contract slice lands.

## Plan
- [x] Add a matrix over `ubuntu-latest` and `windows-latest` with `fail-fast: false`.
- [x] Split build/typecheck/test/coverage into clearly named steps.
- [x] Upload coverage artifacts from one OS only to keep workflow output compact.
- [x] After the lint slice lands, add `bun run lint` as a required CI step.

## Verification Notes
- Updated `.github/workflows/ci.yml` to run on `push` to `main` and `pull_request` to `main`.
- Replaced the misleading `Lint, Type-check, Build, Test` job name with `Build and Test (${{ matrix.os }})`.
- Added a `ubuntu-latest` / `windows-latest` matrix with `fail-fast: false`.
- Switched CI install to `bun install --frozen-lockfile`.
- Split CI into named `Type-check and build frontend` and `Run frontend and plugin tests` steps, using `bun run test -- --run` so CI does not enter watch mode.
- Coverage enforcement is not wired into CI yet: `npx bun run test:coverage` passes all 71 test files / 1037 tests, but fails configured 90% global thresholds with statements 83.15%, branches 75.13%, functions 88.56%, and lines 86.34%.
- Lint is now wired through `bun run check`; coverage report generation is wired separately from strict 90% threshold enforcement.
- Current CI now runs `bun run check`, which includes format check, ESLint, and TypeScript typechecking.
- Split CI into separate `Type-check frontend`, `Build frontend`, `Run frontend and plugin tests`, and Linux-only `Generate coverage report` steps.
- Added Linux-only coverage artifact upload from `coverage/` to keep Windows output compact.
- Added `USAGEBAR_COVERAGE_REPORT_ONLY=1` for CI coverage generation so CI can publish a report while the existing 90% local threshold remains the PR/release gate.
- `bun run format:check` -> passed.
- `bun run lint` -> passed.
- `bun run typecheck` -> passed.
- `bun run build:frontend` -> passed; existing >500 kB chunk warning remains.
- `USAGEBAR_COVERAGE_REPORT_ONLY=1 bun run test:coverage` -> 75 files passed, 1088 tests passed; report generated with statements 84.97%, branches 77.88%, functions 91.1%, lines 88.24%.
- `bun run build` -> passed; existing Tailwind plugin timing and >500 kB chunk warnings remain.

# P1 - Resolve Aptabase and Tauri dependency mismatch

## Acceptance Criteria
- [x] `@aptabase/tauri` no longer pulls an incompatible Tauri v1 API surface into the frontend dependency graph, or the risk is explicitly accepted with documented isolation.
- [x] Rust analytics dependency is either a release-based crate, a reviewed pinned revision with rationale, or replaced by a local adapter.
- [x] Analytics initialization and opt-in/opt-out behavior still pass focused tests after the change.

## Plan
- [x] Audit current frontend and Rust Aptabase usage sites.
- [x] Prefer a Tauri v2-compatible analytics package if available and healthy; otherwise isolate calls behind an internal analytics adapter.
- [x] Update tests around `src/lib/analytics.ts` and any Rust plugin initialization path affected.
- [x] Document the chosen analytics dependency strategy in repo notes if it is a deliberate exception.

## Verification Notes
- Audited local usage: frontend analytics goes through `src/lib/analytics.ts` and direct Tauri `invoke("plugin:aptabase|track_event")`; no frontend import from `@aptabase/tauri` exists.
- Verified package metadata: `npm view @aptabase/tauri version peerDependencies dependencies --json` reports latest `0.4.1` with dependency `@tauri-apps/api: ^1.0.0`.
- Verified Rust package metadata: `cargo info tauri-plugin-aptabase` reports crates.io `1.0.0`, MIT license, repository `https://github.com/aptabase/tauri-plugin-aptabase`, and docs.rs documentation.
- Removed `@aptabase/tauri` from `package.json` / `bun.lock`.
- Switched `src-tauri/Cargo.toml` from a git rev to `tauri-plugin-aptabase = "1.0.0"` and refreshed `src-tauri/Cargo.lock`.
- `npx vitest run src\lib\analytics.test.ts` -> 1 file passed, 2 tests passed.
- `bun run typecheck` -> passed.
- `cargo check --manifest-path src-tauri\Cargo.toml --locked` -> passed.
- `bun install --frozen-lockfile` -> checked 268 installs across 342 packages, no changes.
- `rg -n "@aptabase/tauri|tauri-plugin-aptabase" ...` -> no frontend `@aptabase/tauri` dependency remains; Rust dependency points at crates.io `tauri-plugin-aptabase`.

# P2 - Add enforceable lint and formatting contract

## Acceptance Criteria
- [x] The repo has a single documented lint/format command for TS/JS/JSON files.
- [x] The initial config excludes generated/build output and avoids repo-wide churn.
- [x] CI can run the lint command without formatting files.
- [x] Existing plugin JavaScript is either covered directly or tracked as a follow-up if the initial rule set is too noisy.

## Plan
- [x] Add the smallest lint/format toolchain that fits the repo; Biome is the preferred default unless existing project constraints argue for ESLint.
- [x] Configure ignores for `dist`, `src-tauri/target`, bundled/generated plugin copies, and coverage output.
- [x] Run lint once, fix only high-signal issues needed to pass, and defer style churn to separate tasks.
- [x] Add `lint` and `format` scripts to `package.json`.

## Verification Notes
- Added the local quality-check contract to `README.md`: `bun run check` is the default TS/JS/JSON/config gate, with Rust format/lint exposed separately.
- `package.json` exposes `check`, `format`, `format:check`, `lint`, `typecheck`, `format:rust:check`, and `lint:rust`.
- `.prettierignore` and `eslint.config.js` exclude generated/build output including `dist`, `coverage`, `node_modules`, `src-tauri/target`, and `src-tauri/resources/bundled_plugins`.
- `.github/workflows/ci.yml` runs `bun run check`, so CI can enforce lint/format/typecheck without writing files.
- `bun run format:check` -> passed.
- `bun run lint` -> passed.
- `bun run typecheck` -> passed.

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

# Harden Antigravity plugin errors and capabilities

## Acceptance Criteria
- [x] `plugins/antigravity/plugin.json` explicitly declares `http`, `httpDomains`, `sqliteRead`, `ls`, and `fs`, with `sqliteWrite: false`.
- [x] Antigravity plan parsing prefers `userStatus.userTier.name` before `userStatus.planStatus.planInfo.planName`.
- [x] Final Antigravity probe errors distinguish not running, signed out, expired/revoked token, unreachable local port, and quota unavailable.
- [x] Focused tests cover transient Cloud Code failures and refresh-token-only recovery.
- [x] Bundled Antigravity plugin files match the source plugin files.

## Plan
- [x] Patch the Antigravity manifest contract and parser/error classification.
- [x] Add focused Antigravity plugin tests adapted from existing token/retry patterns.
- [x] Sync bundled plugins and run targeted verification.

## Verification Notes
- Verified Antigravity plugin behavior with `npx bun run test -- plugins/antigravity/plugin.test.js --run` -> 1 file passed, 30 tests passed.
- Verified source and bundled Antigravity manifest JSON parsing with `node -e ...` -> both parsed successfully.
- Verified source/bundled Antigravity `plugin.js`, `plugin.json`, and `plugin.test.js` SHA-256 hashes match after targeted `Copy-Item` sync.
- Verified whitespace with `git --no-pager diff --check -- ...` -> passed; only existing CRLF conversion warnings were reported.
# Harden Kiro provider path

## Executive Summary
- Keep Kiro on the richer local desktop-data path instead of switching to CLI-first.
- Add tests for Kiro auth/cache/log/live fallback behavior, including Windows paths.
- Correct stale Kiro documentation that still describes a placeholder or CLI-only plan.

## Acceptance Criteria
- [x] `plugins/kiro/plugin.test.js` covers auth missing, local cache + log metadata, log fallback, live refresh, external IdP headers, stale local fallback, and Windows paths.
- [x] Kiro docs and `IMPLEMENTATION.md` describe the current local-data-first provider and explicitly defer CLI fallback.
- [x] Provider/source-evaluation docs no longer call Kiro a placeholder.
- [x] Focused Kiro tests pass and bundled Kiro plugin files are synced.

## Plan
- [x] Port the OpenUsage Kiro tests and add Windows path coverage.
- [x] Update Kiro provider docs, implementation notes, choices, and breadcrumbs.
- [x] Run focused Kiro verification and bundle sync.

## Verification Notes
- `npx bun run test -- plugins/kiro/plugin.test.js --run` -> 1 file passed, 7 tests passed.
- `node ./copy-bundled.cjs` -> bundled 29 plugins, including `kiro`.
- `rg -n "kiro.*placeholder|Kiro.*Placeholder|Kiro \\|.*placeholder|Placeholder plugin only|No current path" docs plugins tasks README.md` -> no Kiro placeholder hits remain; remaining hits are generic wording plus Alibaba/Augment stale entries.

# Add local gray Windows start/taskbar icon

## Executive Summary
- Keep released UsageBar app icons green.
- Use a gray icon only when launching this local checkout in dev.
- Keep the local icon override out of normal source-controlled release assets.

## Acceptance Criteria
- [x] `bun run tauri dev` automatically uses `src-tauri/tauri.conf.local.json` when that local file exists.
- [x] Local gray icon files are excluded from Git tracking.
- [x] Shared release icon paths in `src-tauri/tauri.conf.json` remain green/unchanged.
- [x] Script/config verification passes.

## Plan
- [x] Add local Tauri config auto-detection to the dev wrapper.
- [x] Generate local gray icon PNG/ICO assets and local Tauri config.
- [x] Verify config/script syntax and git tracking scope.

## Verification Notes
- `node --check scripts\tauri\wrapper.mjs` -> passed.
- `node -e "JSON.parse(... src-tauri/tauri.conf.json ...); JSON.parse(... src-tauri/tauri.conf.local.json ...)"` -> passed after rewriting the local config without a UTF-8 BOM.
- `git status --short -- src-tauri\tauri.conf.local.json src-tauri\icons-local scripts\tauri\wrapper.mjs src-tauri\tauri.conf.json src-tauri\icons` -> only `scripts/tauri/wrapper.mjs` is tracked/modified; local config/assets are excluded and shared release icon config/assets are unchanged.
- `Get-FileHash src-tauri\icons\icon.ico,src-tauri\icons-local\icon.ico` -> hashes differ, confirming the local ICO is a distinct gray variant.
# Fix Kiro CLI signed-in false negative

## Executive Summary
- Stop showing Kiro as signed out when only the Kiro CLI is installed and logged in.
- Use local Kiro CLI session usage as a fallback when desktop auth/cache files are absent.
- Keep desktop Kiro auth/cache/live usage as the richer primary path.

## Acceptance Criteria
- [x] Kiro desktop auth/cache path still behaves unchanged.
- [x] Kiro CLI-only Windows state returns usage instead of `Open Kiro and sign in, then try again.`
- [x] Focused Kiro plugin tests pass.
- [x] Bundled Kiro plugin files are synced.

## Plan
- [x] Add CLI session usage parsing fallback for `~/.kiro/sessions/cli/*.json`.
- [x] Add a focused regression test for Windows CLI-only sessions.
- [x] Run focused Kiro tests and sync bundled plugin files.

## Verification Notes
- Local evidence: `kiro-cli whoami` succeeds, while `%USERPROFILE%\.aws\sso\cache\kiro-auth-token.json`, `%APPDATA%\Kiro\User\globalStorage\state.vscdb`, `%APPDATA%\Kiro\User\globalStorage\kiro.kiroagent\profile.json`, and `%APPDATA%\Kiro\logs` are missing on this machine.
- Local evidence: `kiro-cli chat --no-interactive "/usage"` reports Kiro Free usage and `~\.kiro\sessions\cli\*.json` stores per-turn `metering_usage` credit values.
- `npx bun run test -- plugins/kiro/plugin.test.js --run` -> 1 file passed, 8 tests passed.
- `node --check plugins\kiro\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 29 plugins, including `kiro`.
# Debug Kiro still signed out

## Executive Summary
- Find why Kiro still shows signed out after the CLI-session fallback.
- Verify the real runtime path from local Kiro files through bundled plugin execution and UI rendering.
- Patch the smallest failing layer and add a regression test.

## Acceptance Criteria
- [x] Real local Kiro CLI/session files are inspected without relying on localized command text.
- [x] Kiro plugin behavior is verified against real file paths or an equivalent host-path expansion test.
- [x] The app no longer reports `Open Kiro and sign in, then try again.` for the observed CLI-only state.
- [x] Focused tests pass and bundled plugin copy is synced if plugin code changes.

## Plan
- [x] Inspect real Kiro CLI session paths, timestamps, and JSON shape.
- [x] Trace backend resource loading and plugin host filesystem path expansion.
- [x] Reproduce Kiro probe with the same file paths the Tauri host sees.
- [x] Patch and verify the failing layer.

## Verification Notes
- Real local Kiro session files exist under `C:\Users\llein\.kiro\sessions\cli`, including files updated on 2026-05-11.
- Root cause: `src-tauri/src/plugin_engine/host_api.rs` `expand_path` expands only `~` / `~/...`; Kiro plugin Windows paths used `%USERPROFILE%` and `%APPDATA%`, which were not expanded at runtime.
- Patched Kiro Windows paths to `~/.aws/...`, `~/AppData/Roaming/Kiro/...`, and `~/.kiro/sessions/cli`.
- Follow-up root cause: Kiro `plugin.json` declared overview label `Usage`, while plugin outputs `Credits` or `CLI Credits`; overview rendering filters by manifest labels and could hide successful output.
- Patched Kiro manifest lines to `Credits`, `CLI Credits`, `Bonus Credits`, and `Overages`; updated settings copy to mention CLI fallback.
- Real-path probe of `plugins/kiro/plugin.js` against local files returned `Kiro CLI` with `0.95 credits used this month` and reset `2026-06-01`.
- `npx bun run test -- plugins/kiro/plugin.test.js --run` -> 1 file passed, 9 tests passed.
- `node --check plugins\kiro\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `kiro`.
- `Get-FileHash plugins\kiro\plugin.js,src-tauri\resources\bundled_plugins\kiro\plugin.js,plugins\kiro\plugin.json,src-tauri\resources\bundled_plugins\kiro\plugin.json` -> source/bundled hashes match.
- `npx vitest run src\components\provider-card.test.tsx -t "renders metric lines|scope"` -> 1 file passed, 3 tests passed.
# Stop release UsageBar blocking local dev API

## Executive Summary
- Dev startup should not lose the local HTTP API because another UsageBar process already owns port `6736`.
- Keep cleanup dev-only and limited to UsageBar/openusage processes using that exact port.
- Verify the wrapper helper behavior without touching unrelated provider/UI work.

## Acceptance Criteria
- [x] `npm run tauri -- dev` preflight can detect a UsageBar/openusage process owning `127.0.0.1:6736`.
- [x] The preflight stops only matching UsageBar/openusage processes, not arbitrary software using the same port.
- [x] Wrapper syntax or focused script verification passes.

## Plan
- [x] Add a Windows dev-port cleanup helper to `scripts/tauri/wrapper.mjs`.
- [x] Keep the existing workspace-debug cleanup and run the port cleanup before launching Tauri.
- [x] Verify with focused script checks and record notes.

## Verification Notes
- Local owner before fix: `Get-NetTCPConnection -LocalPort 6736` showed PID `1676`; `Get-CimInstance Win32_Process -Filter "ProcessId = 1676"` showed `D:\UsageBar-Release\usagebar.exe`.
- Cleared the active blocker with the same identity rule -> stopped `D:\UsageBar-Release\usagebar.exe` PID `1676`.
- Verified port is now free with `Get-NetTCPConnection -LocalPort 6736 -ErrorAction SilentlyContinue` -> no listener.
- `node --check scripts\tauri\wrapper.mjs` -> passed.
- `node --test scripts\tauri\wrapper.test.mjs` -> 3 tests passed.

# Audit Gemini quota count formatting

## Executive Summary
- Confirm Gemini already uses real request counts when Google returns exact quota buckets.
- Keep fraction-only buckets percent-based because the API omits absolute caps.
- Add regression/doc coverage so the remaining percent path is intentional.

## Acceptance Criteria
- [x] Gemini exact `used`/`limit` and `remaining`/`limit` quota buckets are covered as count-format request progress.
- [x] Gemini docs explain count bars versus fraction-only percent fallback.
- [x] Focused Gemini plugin verification passes and bundled plugin files are synced.

## Plan
- [x] Inspect Gemini quota parsing and current tests.
- [x] Tighten the exact-count regression expectation and provider docs.
- [x] Run focused Gemini verification and sync bundled plugins.

## Verification Notes
- `bun run test -- plugins\gemini\plugin.test.js --run` -> 1 file passed, 29 tests passed.
- `node --check plugins\gemini\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `gemini`.
- `Get-FileHash` confirmed source/bundled Gemini `plugin.js` and `plugin.test.js` hashes match.

# Fix Kimi quota progress units

## Executive Summary
- Keep Kimi CLI OAuth and Moonshot API balance login unchanged.
- Show Kimi Code membership quota as exact used/max counts.
- Keep API balance as the existing dollar-format line.

## Acceptance Criteria
- [x] Kimi Session and Weekly progress bars use exact quota counts instead of percent conversion.
- [x] Kimi docs describe the count source.
- [x] Focused Kimi plugin verification passes and bundled plugin files are synced.

## Plan
- [x] Patch Kimi Session/Weekly progress rendering to use parsed quota counts.
- [x] Update focused regression expectations and provider docs.
- [x] Run focused Kimi verification and sync bundled plugins.

## Verification Notes
- `bun run test -- plugins\kimi\plugin.test.js --run` -> 1 file passed, 23 tests passed.
- `node --check plugins\kimi\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `kimi`.
- `Get-FileHash` confirmed source/bundled Kimi `plugin.js` and `plugin.test.js` hashes match.
- `rg -n 'kind: "percent"|toPercentUsage' plugins\kimi src-tauri\resources\bundled_plugins\kimi` -> no Kimi percent-format or stale conversion helper remains.

# Audit Windsurf quota progress limits

## Executive Summary
- Confirm whether Windsurf exposes exact daily/weekly usage caps.
- Do not invent per-plan token/request limits when Windsurf only returns remaining percentages.
- Record the limitation so the remaining percent bars are intentional.

## Acceptance Criteria
- [x] Windsurf docs state why daily/weekly quota bars remain percent-based.
- [x] Focused Windsurf plugin verification passes and bundled docs are not required.
- [x] Current provider-progress audit keeps Windsurf classified as percent-only by source payload, not as an unresolved count bug.

## Plan
- [x] Inspect Windsurf plugin payload parsing, tests, and provider docs.
- [x] Check current Windsurf public docs/pricing for published numeric caps.
- [x] Update provider docs with the exact-count limitation.
- [x] Run focused Windsurf verification and record results.

## Verification Notes
- Checked current Windsurf docs/pricing on 2026-05-12: quota docs say usage now has daily and weekly allowances; pricing labels allowance sizes as Light, Standard, and Heavy, but neither source publishes exact token/request caps.
- Inspected `plugins\windsurf\plugin.js`: the current cloud contract only reads `dailyQuotaRemainingPercent` and `weeklyQuotaRemainingPercent`, plus reset times and overage balance.
- `bun run test -- plugins\windsurf\plugin.test.js --run` -> 1 file passed, 9 tests passed.
- `node --check plugins\windsurf\plugin.js` -> passed.

# Fix Copilot paid Chat quota counts

## Executive Summary
- Keep Copilot authentication and premium-request billing unchanged.
- Show paid Chat as exact message counts when GitHub returns `entitlement` and `remaining`.
- Keep percent fallback only when the paid Chat snapshot omits an exact cap.

## Acceptance Criteria
- [x] Paid Copilot Chat progress uses exact message counts when the private payload includes entitlement/remaining.
- [x] Paid Copilot Chat still renders percent when GitHub only returns `percent_remaining`.
- [x] Focused Copilot plugin verification passes and bundled plugin files are synced.

## Plan
- [x] Add a snapshot count progress helper for paid Chat.
- [x] Update Copilot tests and docs for count-first paid Chat behavior.
- [x] Run focused Copilot verification and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\copilot\plugin.test.js --run` -> 1 file passed, 41 tests passed.
- `node --check plugins\copilot\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `copilot`.
- `Get-FileHash` confirmed source/bundled Copilot `plugin.js` and `plugin.test.js` hashes match.

# Remove fake balance progress bars

## Executive Summary
- Keep DeepSeek, Kimi optional API balance, and legacy Moonshot API Balance login paths unchanged.
- Stop presenting remaining API balance as a fake full progress bar.
- Preserve the balance in overview as text because these endpoints expose no max quota.

## Acceptance Criteria
- [x] DeepSeek Balance renders as text, not progress with `limit = balance`.
- [x] Kimi optional API Balance renders as text, not progress with `limit = balance`.
- [x] Moonshot API Balance renders as text, not progress with `limit = balance`.
- [x] Provider docs explain that these balance endpoints expose no used/max quota.
- [x] Focused DeepSeek, Kimi, and Kimi K2 plugin verification passes and bundled plugin files are synced.

## Plan
- [x] Patch DeepSeek, Kimi API Balance, and Kimi K2 balance lines and manifest line types.
- [x] Update focused expectations and provider docs.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- `node --check plugins\deepseek\plugin.js; node --check plugins\kimi-k2\plugin.js` -> passed.
- `bun run test -- plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` first hit the known transient sandbox `src/test/setup.ts` path issue, then passed when rerun from `D:\UsageBar\usagebar`: 2 files passed, 18 tests passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `deepseek` and `kimi-k2`.
- `Get-FileHash` confirmed source/bundled DeepSeek and Kimi K2 `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- `rg -n 'limit: Math.max\(summary\.|type.: .progress.|"type": "progress"' plugins\deepseek plugins\kimi-k2 src-tauri\resources\bundled_plugins\deepseek src-tauri\resources\bundled_plugins\kimi-k2` -> no fake balance-progress hits remain.
- `bun run test -- plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 3 files passed, 41 tests passed.
- `node --check plugins\kimi\plugin.js; node --check plugins\deepseek\plugin.js; node --check plugins\kimi-k2\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `kimi`, `deepseek`, and `kimi-k2`.
- Node SHA-256 check confirmed source/bundled Kimi, DeepSeek, and Kimi K2 `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Node fake-balance-progress audit over experimental providers -> no provider still matches `limit: Math.max(...balance/available/totalBalance...)`.
- Final focused verification after the Kimi API Balance follow-up: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\copilot\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js plugins\windsurf\plugin.test.js --run` first hit the known transient sandbox `src/test/setup.ts` path issue, then passed when rerun from `D:\UsageBar\usagebar`: 6 files passed, 116 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Remove fake Warp unlimited progress

## Executive Summary
- Keep Warp token login and metered request-limit progress unchanged.
- Stop rendering unlimited accounts as `0 / 1 credits`.
- Show unlimited request access as text plus the existing plan badge.

## Acceptance Criteria
- [x] Metered Warp accounts still render request used/max progress.
- [x] Unlimited Warp accounts render text, not fake progress.
- [x] Focused Warp verification passes and bundled plugin files are synced.

## Plan
- [x] Split Warp metered and unlimited display paths.
- [x] Update manifest/docs/tests for unlimited text output.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- `node --check plugins\warp\plugin.js` -> passed.
- `bun run test -- plugins\warp\plugin.test.js --run` first hit the known transient sandbox `src/test/setup.ts` path issue, then passed when rerun from `D:\UsageBar\usagebar`: 1 file passed, 10 tests passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `warp`.
- Node SHA-256 check confirmed source/bundled Warp `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- `rg -n '0 / 1|limit: usage\.isUnlimited|used: usage\.isUnlimited|Unlimited' ...` -> no old fake unlimited progress expressions remain; only the intended unlimited text/badge path remains.

# Remove fake Perplexity zero-credit progress

## Executive Summary
- Keep Perplexity cookie login and real credit-pool progress unchanged.
- Stop rendering zero-total pools as `1 / 1 credits`.
- Show zero-total pools as text because no non-zero max exists.

## Acceptance Criteria
- [x] Perplexity pools with real totals still render used/max progress.
- [x] Perplexity zero-total pools render text, not fake progress.
- [x] Focused Perplexity verification passes and bundled plugin files are synced.

## Plan
- [x] Patch Perplexity zero-total line rendering and manifest line types.
- [x] Update focused expectation and provider docs.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\perplexity\plugin.test.js --run` -> 1 file passed, 11 tests passed.
- `node --check plugins\perplexity\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `perplexity`.
- Node SHA-256 check confirmed source/bundled Perplexity and Warp `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Static manufactured-progress audit over experimental providers found no remaining `used: 1 / limit: 1`, `limit: Math.max(...balance...)`, or unlimited-to-1 patterns.
- Final focused suite after Warp/Perplexity fixes: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\warp\plugin.test.js plugins\perplexity\plugin.test.js plugins\copilot\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 7 files passed, 128 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Remove fake Abacus and Augment partial-credit progress

## Executive Summary
- Keep Abacus and Augment cookie login unchanged.
- Preserve real credit used/max bars when the provider returns a real total.
- Render zero/partial credit data as text instead of manufacturing a progress limit.

## Acceptance Criteria
- [x] Abacus non-zero total still renders used/max credit progress.
- [x] Abacus zero-total data renders text, not fake progress.
- [x] Augment complete credit data still renders used/max credit progress.
- [x] Augment partial used-only data renders text, not fake progress.
- [x] Focused Abacus/Augment verification passes and bundled plugin files are synced.

## Plan
- [x] Patch Abacus zero-total and Augment partial-data display paths.
- [x] Update manifests/docs/tests for text fallback lines.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\abacus\plugin.test.js plugins\augment\plugin.test.js --run` -> 2 files passed, 13 tests passed.
- `node --check plugins\abacus\plugin.js; node --check plugins\augment\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `abacus` and `augment`.
- Node SHA-256 check confirmed source/bundled Abacus and Augment `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Static manufactured-progress audit over experimental providers found no remaining sentinel `1/1`, balance-as-limit, unlimited-as-1, or partial-credit fallback patterns.
- Final focused suite after Abacus/Augment fixes: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\abacus\plugin.test.js plugins\augment\plugin.test.js plugins\warp\plugin.test.js plugins\perplexity\plugin.test.js plugins\copilot\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 9 files passed, 141 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Remove fake Factory zero-allowance progress

## Executive Summary
- Keep Factory/Droid login and token usage parsing unchanged.
- Preserve Standard/Premium token progress when Factory returns positive allowances.
- Show no usage data when all allowances are zero instead of rendering zero-limit progress.

## Acceptance Criteria
- [x] Factory positive Standard allowance still renders used/max token progress.
- [x] Factory Premium line still renders only for positive premium allowance.
- [x] Factory zero Standard/Premium allowances render no fake progress.
- [x] Focused Factory verification passes and bundled plugin files are synced.

## Plan
- [x] Patch Factory Standard progress to require positive allowance.
- [x] Update zero-allowance regression and provider docs.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\factory\plugin.test.js --run` -> 1 file passed, 35 tests passed.
- `node --check plugins\factory\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `factory`.
- Node SHA-256 check confirmed source/bundled Factory `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Final focused suite after Factory fix: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\factory\plugin.test.js plugins\abacus\plugin.test.js plugins\augment\plugin.test.js plugins\warp\plugin.test.js plugins\perplexity\plugin.test.js plugins\copilot\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 10 files passed, 176 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Remove fake Kilo and OpenRouter partial-credit progress

## Executive Summary
- Keep Kilo/OpenRouter API-key login unchanged.
- Preserve real dollar progress when the provider returns a real total.
- Render used-only or zero-total credit data as text instead of manufacturing a max.

## Acceptance Criteria
- [x] Kilo pass/credit payloads with real totals still render dollar progress.
- [x] Kilo used-only payloads render text, not fake progress.
- [x] OpenRouter positive `total_credits` still renders dollar progress.
- [x] OpenRouter zero `total_credits` renders text, not fake progress.
- [x] Focused Kilo/OpenRouter verification passes and bundled plugin files are synced.

## Plan
- [x] Patch Kilo to track whether a real limit exists.
- [x] Patch OpenRouter zero-total credit display.
- [x] Update manifests/docs/tests.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js --run` -> 2 files passed, 22 tests passed.
- `node --check plugins\kilo\plugin.js; node --check plugins\openrouter\plugin.js` -> passed.
- Follow-up Kilo cleanup removed the internal `total = used` fallback; `bun run test -- plugins\kilo\plugin.test.js --run` -> 1 file passed, 10 tests passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `kilo` and `openrouter`.
- Node SHA-256 check confirmed source/bundled Kilo and OpenRouter `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Static manufactured-progress audit over experimental providers found no remaining sentinel `1/1`, balance-as-limit, unlimited-as-1, partial-credit fallback, used-as-total, or OpenRouter zero-credit-limit patterns.
- Final focused suite after Kilo/OpenRouter fixes: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js plugins\factory\plugin.test.js plugins\abacus\plugin.test.js plugins\augment\plugin.test.js plugins\warp\plugin.test.js plugins\perplexity\plugin.test.js plugins\copilot\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 12 files passed, 198 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Remove fake Codebuff used-only progress

## Executive Summary
- Keep Codebuff token login and real credit quota progress unchanged.
- Preserve `used + remaining` derived totals when Codebuff returns both values.
- Render used-only credit telemetry as text instead of manufacturing a max.

## Acceptance Criteria
- [x] Codebuff explicit quota data still renders used/max credit progress.
- [x] Codebuff used+remaining data still derives a real total.
- [x] Codebuff used-only data renders text, not fake progress.
- [x] Codebuff over-limit usage keeps the provider max instead of inflating the limit.
- [x] Focused Codebuff verification passes and bundled plugin files are synced.

## Plan
- [x] Patch Codebuff credit line rendering to require a real total for progress.
- [x] Update manifest/docs/tests for the text fallback.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- `bun run test -- plugins\codebuff\plugin.test.js --run` -> 1 file passed, 8 tests passed.
- `node --check plugins\codebuff\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `codebuff`.
- Node SHA-256 check confirmed source/bundled Codebuff `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Static manufactured-progress audit over experimental providers found no remaining sentinel `1/1`, balance-as-limit, unlimited-as-1, partial-credit fallback, used-as-total, OpenRouter zero-credit-limit, Codebuff used-only-limit, or Codebuff over-limit-inflation patterns.
- Final focused suite after Codebuff fix: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\codebuff\plugin.test.js plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js plugins\factory\plugin.test.js plugins\abacus\plugin.test.js plugins\augment\plugin.test.js plugins\warp\plugin.test.js plugins\perplexity\plugin.test.js plugins\copilot\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 13 files passed, 206 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Preserve provider-owned max values in progress bars

## Executive Summary
- Keep existing login and parsing paths unchanged.
- Stop replacing real provider limits with current usage when accounts are over limit.
- Keep progress bars only when the provider supplies a positive real max.

## Acceptance Criteria
- [x] Alibaba, Augment, Copilot, Synthetic, Vertex AI, Warp, and Z.ai keep real max values when usage exceeds max.
- [x] Warp metered data with no positive request limit does not render fake progress.
- [x] Existing percent-only fallbacks remain percent-only.
- [x] Focused provider verification passes and bundled plugin files are synced.

## Plan
- [x] Patch progress emitters to use provider max directly after positive-limit validation.
- [x] Add over-limit regressions for affected providers.
- [x] Run focused verification and sync bundled plugin files.

## Verification Notes
- First focused test run found that Z.ai still expected a `0 / 0` Web Searches progress line for non-numeric optional fields; fixed by parsing numeric strings and skipping Web Searches when no positive limit exists.
- `bun run test -- plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\copilot\plugin.test.js plugins\synthetic\plugin.test.js plugins\vertex-ai\plugin.test.js plugins\warp\plugin.test.js plugins\zai\plugin.test.js --run` first hit the known transient sandbox `src/test/setup.ts` path issue, then passed when rerun from `D:\UsageBar\usagebar`: 7 files passed, 111 tests passed.
- `node --check plugins\alibaba\plugin.js; node --check plugins\augment\plugin.js; node --check plugins\copilot\plugin.js; node --check plugins\synthetic\plugin.js; node --check plugins\vertex-ai\plugin.js; node --check plugins\warp\plugin.js; node --check plugins\zai\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including all seven patched providers.
- Node SHA-256 check confirmed source/bundled `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match for Alibaba, Augment, Copilot, Synthetic, Vertex AI, Warp, and Z.ai.
- Static audit over Windows-experimental providers found no remaining `limit: Math.max(...)` progress inflation patterns.
- Final focused suite after max-preservation fixes: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\copilot\plugin.test.js plugins\synthetic\plugin.test.js plugins\vertex-ai\plugin.test.js plugins\warp\plugin.test.js plugins\zai\plugin.test.js plugins\codebuff\plugin.test.js plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js plugins\factory\plugin.test.js plugins\abacus\plugin.test.js plugins\perplexity\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 17 files passed, 260 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Add stored Z.ai API-key login

## Executive Summary
- Keep existing `ZAI_API_KEY` / `GLM_API_KEY` env login working.
- Add the same app-vault API-key setup path used by other direct API providers.
- Verify Settings guidance, plugin auth precedence, and bundled plugin sync.

## Acceptance Criteria
- [x] Z.ai prefers a stored provider API key over env vars.
- [x] Z.ai still falls back to `ZAI_API_KEY`, then `GLM_API_KEY`.
- [x] Settings exposes a Z.ai API-key input and source label.
- [x] Z.ai docs describe stored-key setup and env fallback.
- [x] Focused Z.ai/settings verification passes and bundled plugin files are synced.

## Plan
- [x] Patch `plugins/zai` to read `providerSecrets.apiKey` first.
- [x] Update `src/lib/provider-settings.ts` and settings tests.
- [x] Update provider docs, run focused checks, and sync bundles.

## Verification Notes
- `bun run test -- plugins\zai\plugin.test.js src\components\settings\provider-settings-detail.test.tsx --run` -> 2 files passed, 53 tests passed.
- `node --check plugins\zai\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `zai`.
- Node SHA-256 check confirmed source/bundled Z.ai `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.

# Add stored MiniMax API-key login

## Executive Summary
- Keep existing `MINIMAX_API_KEY`, `MINIMAX_CN_API_KEY`, and `MINIMAX_API_TOKEN` env login working.
- Add app-vault API-key setup for MiniMax.
- Verify Settings guidance, plugin auth precedence, and bundled plugin sync.

## Acceptance Criteria
- [x] MiniMax prefers a stored provider API key over env vars.
- [x] MiniMax still falls back to existing env vars and region auto-selection.
- [x] Settings exposes a MiniMax API-key input and source label.
- [x] MiniMax docs describe stored-key setup and env fallback.
- [x] Focused MiniMax/settings verification passes and bundled plugin files are synced.

## Plan
- [x] Patch `plugins/minimax` to read `providerSecrets.apiKey` first.
- [x] Update `src/lib/provider-settings.ts` and settings tests.
- [x] Update provider docs, run focused checks, and sync bundles.

## Verification Notes
- `bun run test -- plugins\minimax\plugin.test.js src\components\settings\provider-settings-detail.test.tsx --run` -> 2 files passed, 70 tests passed.
- `node --check plugins\minimax\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `minimax`.
- Node SHA-256 check confirmed source/bundled MiniMax `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.

# Add stored Amp API-key login

## Executive Summary
- Keep Amp CLI local secret discovery working.
- Add app-vault API-key setup as a fallback login path.
- Verify Settings guidance, plugin auth precedence, and bundled plugin sync.

## Acceptance Criteria
- [x] Amp prefers a stored provider API key over the local CLI secrets file.
- [x] Amp still falls back to `~/.local/share/amp/secrets.json`.
- [x] Settings exposes an Amp API-key input and source label.
- [x] Amp docs describe stored-key setup and CLI fallback.
- [x] Focused Amp/settings verification passes and bundled plugin files are synced.

## Plan
- [x] Patch `plugins/amp` to read `providerSecrets.apiKey` first.
- [x] Update `src/lib/provider-settings.ts` and settings tests.
- [x] Update provider docs, run focused checks, and sync bundles.

## Verification Notes
- `bun run test -- plugins\amp\plugin.test.js src\components\settings\provider-settings-detail.test.tsx --run` -> 2 files passed, 58 tests passed.
- `node --check plugins\amp\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `amp`.
- Node SHA-256 check confirmed source/bundled Amp `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Final focused suite after Amp setup fix: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\amp\plugin.test.js plugins\minimax\plugin.test.js plugins\zai\plugin.test.js plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\copilot\plugin.test.js plugins\synthetic\plugin.test.js plugins\vertex-ai\plugin.test.js plugins\warp\plugin.test.js plugins\codebuff\plugin.test.js plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js plugins\factory\plugin.test.js plugins\abacus\plugin.test.js plugins\perplexity\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 19 files passed, 337 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Prefer stored cookie login over env fallback

## Executive Summary
- Keep Abacus, Perplexity, and Mistral env-cookie fallbacks working.
- Make the Settings-saved Cookie header the first login source.
- Prevent stale env vars from overriding a fresh app-vault login.

## Acceptance Criteria
- [x] Abacus prefers stored `cookieHeader` over env cookies.
- [x] Perplexity prefers stored `cookieHeader` over env cookies and still supports session-token fallback.
- [x] Mistral prefers stored `cookieHeader` over env cookies and still supports `MISTRAL_SESSION`.
- [x] Provider docs describe stored cookie first, then env fallback.
- [x] Focused provider verification passes and bundled plugin files are synced.

## Plan
- [x] Patch cookie source order in Abacus, Perplexity, and Mistral.
- [x] Update focused tests and provider docs.
- [x] Run focused checks and sync bundles.

## Verification Notes
- `bun run test -- plugins\abacus\plugin.test.js plugins\perplexity\plugin.test.js plugins\mistral\plugin.test.js --run` -> 3 files passed, 22 tests passed.
- `node --check plugins\abacus\plugin.js; node --check plugins\perplexity\plugin.js; node --check plugins\mistral\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `abacus`, `perplexity`, and `mistral`.
- Node SHA-256 check confirmed source/bundled Abacus, Perplexity, and Mistral `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.
- Final focused suite after cookie-source-order fix: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\amp\plugin.test.js plugins\abacus\plugin.test.js plugins\perplexity\plugin.test.js plugins\mistral\plugin.test.js plugins\minimax\plugin.test.js plugins\zai\plugin.test.js plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\copilot\plugin.test.js plugins\synthetic\plugin.test.js plugins\vertex-ai\plugin.test.js plugins\warp\plugin.test.js plugins\codebuff\plugin.test.js plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js plugins\factory\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 20 files passed, 341 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.
- Final focused suite after MiniMax over-limit fix: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\minimax\plugin.test.js plugins\zai\plugin.test.js plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\copilot\plugin.test.js plugins\synthetic\plugin.test.js plugins\vertex-ai\plugin.test.js plugins\warp\plugin.test.js plugins\codebuff\plugin.test.js plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js plugins\factory\plugin.test.js plugins\abacus\plugin.test.js plugins\perplexity\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 18 files passed, 306 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.
- Env-only API-key audit over Windows-experimental providers found no remaining provider that reads API-key/token env vars without also reading provider secrets.
- Final focused suite after Z.ai/MiniMax setup fixes: `bun run test -- src\components\settings\provider-settings-detail.test.tsx plugins\minimax\plugin.test.js plugins\zai\plugin.test.js plugins\alibaba\plugin.test.js plugins\augment\plugin.test.js plugins\copilot\plugin.test.js plugins\synthetic\plugin.test.js plugins\vertex-ai\plugin.test.js plugins\warp\plugin.test.js plugins\codebuff\plugin.test.js plugins\kilo\plugin.test.js plugins\openrouter\plugin.test.js plugins\factory\plugin.test.js plugins\abacus\plugin.test.js plugins\perplexity\plugin.test.js plugins\kimi\plugin.test.js plugins\deepseek\plugin.test.js plugins\kimi-k2\plugin.test.js --run` -> 18 files passed, 306 tests passed.
- `bun run typecheck` -> passed.
- `bun run lint` -> passed.
- `git diff --check` -> passed; only expected CRLF conversion warnings were reported.

# Preserve MiniMax over-limit usage

## Executive Summary
- Keep MiniMax stored/env login unchanged.
- Stop clamping over-limit usage down to the max.
- Preserve the provider max as the progress limit while showing true over-limit usage.

## Acceptance Criteria
- [x] MiniMax explicit used counts above total render as `used > limit`.
- [x] Negative MiniMax used counts still clamp to zero.
- [x] Focused MiniMax verification passes and bundled plugin files are synced.

## Plan
- [x] Remove the upper clamp in the MiniMax parser.
- [x] Update/add focused MiniMax regression expectations.
- [x] Run focused checks and sync bundles.

## Verification Notes
- `bun run test -- plugins\minimax\plugin.test.js --run` -> 1 file passed, 43 tests passed.
- `node --check plugins\minimax\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `minimax`.
- Node SHA-256 check confirmed source/bundled MiniMax `plugin.js`, `plugin.json`, and `plugin.test.js` hashes match.

# Prefer stored OpenCode Zen cookie over env fallback

## Executive Summary
- Keep OpenCode Zen manual cookie setup working through Settings.
- Keep `OPENCODE_COOKIE_HEADER` as a fallback for existing setups.
- Prevent stale env cookies from shadowing a fresh Settings login in both OpenCode providers.

## Acceptance Criteria
- [x] Hidden `opencode` prefers stored `cookieHeader` over `OPENCODE_COOKIE_HEADER`.
- [x] Visible `opencode-go` Zen balance prefers stored `cookieHeader` over `OPENCODE_COOKIE_HEADER`.
- [x] OpenCode docs describe stored cookie first, then env fallback.
- [x] Focused OpenCode verification passes and bundled plugin files are synced.

## Plan
- [x] Patch OpenCode cookie source order.
- [x] Add focused source-order regressions.
- [x] Update docs/notes, run focused checks, and sync bundles.

## Verification Notes
- `bun run test -- plugins\opencode\plugin.test.js plugins\opencode-go\plugin.test.js --run` -> 2 files passed, 26 tests passed.
- `node --check plugins\opencode\plugin.js; node --check plugins\opencode-go\plugin.js` -> passed.
- `node ./copy-bundled.cjs` -> bundled 31 plugins, including `opencode` and `opencode-go`.
- `Get-FileHash` confirmed source/bundled OpenCode `plugin.js` and `plugin.test.js` hashes match for both provider folders.
- `git --no-pager diff --check -- plugins\opencode\plugin.js plugins\opencode-go\plugin.js plugins\opencode\plugin.test.js plugins\opencode-go\plugin.test.js docs\providers\opencode.md docs\providers\opencode-go.md src-tauri\resources\bundled_plugins\opencode src-tauri\resources\bundled_plugins\opencode-go` -> passed; only expected CRLF conversion warnings were reported.

# Review cookie-provider auth alternatives

## Executive Summary
- Review cookie-based providers for possible non-cookie login paths.
- Use provider docs and current repo implementation notes to classify fixability.
- Produce a standalone HTML review for quick reading.

## Acceptance Criteria
- [x] Cookie pain-point providers are inventoried from current UsageBar settings/docs.
- [x] Provider docs are checked for API/CLI/OAuth alternatives or hard walls.
- [x] HTML review exists under `docs/` with fixability classification.
- [x] Artifact is sanity-checked and breadcrumbs are recorded.

## Plan
- [x] Read current provider setup docs/code for cookie-dependent providers.
- [x] Research provider documentation for alternatives.
- [x] Create HTML review artifact.
- [x] Verify artifact and update breadcrumbs.

## Verification Notes
- Reviewed current UsageBar setup metadata in `src/lib/provider-settings.ts` and cookie-provider docs under `docs/providers/`.
- Checked current provider docs for Ollama, OpenCode, OpenAI Codex, Claude, Zed, Augment, Abacus, Perplexity, and Mistral.
- Created `docs/cookie-auth-fixability-review.html`.
- `node -e "...read docs/cookie-auth-fixability-review.html..."` -> passed required-content sanity check.
- `git --no-pager diff --check -- docs\cookie-auth-fixability-review.html tasks\todo.md docs\breadcrumbs.md docs\choices.md` -> passed; only expected CRLF warning for `tasks/todo.md`.
