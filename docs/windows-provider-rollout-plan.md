# Windows Provider Rollout Plan

## Purpose

This document is the Windows-first rollout plan for every provider in this fork.

It answers four questions for each provider:

1. What works today on Windows?
2. What is still blocked?
3. What is the next implementation slice?
4. What must be verified before the provider is called "working"?

## Definition Of "Windows Working"

A provider is only "working on Windows" when all of the following are true:

- The provider is surfaced in Settings and can be enabled.
- The provider can complete at least one successful probe on a real Windows machine.
- The provider has a clear setup path in the provider detail view.
- The provider fails with an actionable error when auth/session data is missing or expired.
- The provider has at least one focused automated test for its Windows-specific lookup path or failure mode.
- The provider is included in the backend Windows support list, not just documented.

## Shared Workstreams

These workstreams unblock multiple providers and should happen before broad provider expansion.

### 1. Replace the hardcoded Windows whitelist

Current state:
- Landed on 2026-03-11: Windows support and surfacing now come from `platformSupport.windows` in each `plugin.json`.
- `list_plugins` and Windows probe eligibility both resolve from the same manifest metadata.

Required outcome:
- Move support classification to explicit provider capability metadata.
- Distinguish `supported`, `experimental`, `hidden`, and `blocked`.
- Keep UI surfacing and backend probe eligibility driven by the same source of truth.

Done when:
- No provider support decision is duplicated between Rust and frontend filtering.

### 2. Standardize Windows auth/session discovery

Current state:
- Providers use a mix of file reads, SQLite lookups, keyring services, env vars, and manual cookie storage.
- Upstream issue `robinebers/openusage#71` identifies proper OAuth flow support in the plugin API as a cross-provider unlock.

Required outcome:
- Normalize Windows path resolution for `%APPDATA%`, `%LOCALAPPDATA%`, roaming SQLite stores, and user-home paths.
- Document exact Windows auth sources per provider.
- Add regression tests for each Windows-only lookup path.
- Add shared provider setup/source primitives for `automatic`, `oauth`, `manual cookie`, and `api token` modes where those modes already recur in real providers.

Done when:
- Every Windows-supported provider has one documented primary auth source and one tested fallback path if a fallback exists.

### 3. Add a provider verification harness

Current state:
- Landed on 2026-03-11: the shared checklist now lives in `docs/windows-provider-verification.md`.
- Some providers are still code-complete enough to probe but need real-account evidence against that checklist.

Required outcome:
- Add a simple manual verification checklist for each provider.
- Keep log capture and success/failure examples in one place.

Done when:
- Each Windows-supported provider has a reproducible verification recipe.

### 4. Align docs with fork reality

Current state:
- Several provider docs still describe upstream or macOS-first behavior.

Required outcome:
- Add Windows notes to provider docs as each provider lands.
- Keep README provider claims aligned with actual Windows support state.

Done when:
- A user can tell from docs whether a provider is working, experimental, hidden, or not started on Windows.

## External Reference Inputs

These references should shape implementation choices instead of treating the Windows port as a blank slate.

- `robinebers/openusage#77`: upstream Windows plan suggests OS support metadata in plugin manifests, per-provider porting, Windows taskbar/tray validation, and a new test/gating workflow.
- `robinebers/openusage#71`: upstream wants proper OAuth support in the plugin API because it broadens support across Copilot, Claude, Codex, and similar providers.
- `robinebers/openusage#280`: Copilot already has a concrete multi-account bug. Do not design Windows Copilot around a service-name-only key lookup.
- `ryoppippi/ccusage`: keep local JSONL usage scanning as a first-class fallback and regression harness for Claude/Codex.
- `steipete/CodexBar`: reuse proven provider patterns where they match this fork's simplicity goals:
  - provider source pickers and cookie source helper text
  - manual cookie headers with source/timestamp tracking
  - Chrome-first cookie import for OpenCode
  - device-flow auth for Copilot
  - region-aware routing for MiniMax
  - expanded IDE-path coverage for JetBrains
  - `loadCodeAssist`-aware quota/project handling for Gemini
  - cooldowns and gated retries around Claude OAuth/keychain flows

## Provider Matrix

| Provider | Current Windows State | Priority | Main Blocker |
|---|---|---:|---|
| Antigravity | Working but needs more runtime confidence | P0 | real-world validation of grouped quota behavior |
| Claude | Partially working | P0 | Windows auth/session parity incomplete |
| Codex | Working | P0 | broader runtime validation and doc alignment |
| Cursor | Partially working | P0 | account-state variance across free/trial/paid/team/enterprise |
| Ollama | Working v1 | P0 | only manual cookie mode exists |
| OpenCode | Experimental | P1 | browser import + real-world cookie/workspace validation |
| Amp | Not started for Windows | P2 | Windows auth/source path design |
| Copilot | Not started for Windows | P2 | verify `gh` token and keyring flow on Windows |
| Gemini | Experimental | P2 | real signed-in Windows validation after CLI-path hardening |
| JetBrains AI Assistant | Experimental | P2 | real IDE/account validation beyond XML path coverage |
| Kimi Code | Not started for Windows | P2 | verify Windows credential/file locations |
| MiniMax | Not started for Windows | P2 | verify Windows session source and auth refresh path |
| Factory / Droid | Not started for Windows | P3 | WorkOS auth storage and refresh behavior on Windows |
| Z.ai | Not started for Windows | P3 | Windows credential/session source unknown |
| Windsurf | Not started for Windows | P4 | macOS-oriented local LS/process discovery assumptions |
| Perplexity | Not started for Windows | P4 | macOS app-cache dependency |

## Provider Plans

### Antigravity

Current state:
- Included in the Windows support list.
- Already probes on Windows through the local app/session path.

Next slice:
- Validate grouped quota output against more real accounts.
- Confirm Windows LS and cloud fallback behavior after recent grouped-quota changes.

Verification:
- Real signed-in Windows run.
- One test covering Windows SQLite path selection.
- One test covering unknown-fraction handling so unavailable usage never becomes false exhaustion.

### Claude

Current state:
- Included in the Windows support list.
- Can use local OAuth credentials and `ccusage` fallback.
- Repo notes still say Windows auth/session parity is incomplete.

Next slice:
- Enumerate all Windows Claude credential locations actually seen in the wild.
- Confirm keyring fallback behavior on Windows, not just file-based auth.
- Preserve actionable error messages for expired and unreadable credentials.
- Decide whether Windows should stay OAuth-only or expose an explicit source mode with `OAuth` and `Local usage` semantics. `CodexBar` is a useful reference for guarded source-mode handling and keychain retry cooldowns.

Verification:
- Fresh signed-in Windows machine.
- Expired-token refresh path.
- No-auth path should still show the local `ccusage` fallback when available.

### Codex

Current state:
- Included in the Windows support list.
- Appears to be one of the strongest Windows providers already.

Next slice:
- Validate all supported Codex auth storage modes on Windows.
- Confirm `CODEX_HOME` overrides and keyring-backed auth in real environments.
- Update provider docs to describe Windows behavior, not macOS-only keychain wording.
- Consider whether a later slice should expose explicit source selection only if it materially improves reliability; keep the default path simple until Windows runtime evidence says otherwise.

Verification:
- `auth.json` path under default Windows home.
- `CODEX_HOME` custom path.
- Keyring-backed auth refresh persistence.

### Cursor

Current state:
- Included in the Windows support list.
- Windows roaming SQLite path is implemented.
- Repo notes still flag free/paid/runtime validation as incomplete.

Next slice:
- Validate these account states on Windows: free, trial, paid individual, team, enterprise.
- Confirm fallback behavior when Connect RPC returns no `planUsage`.
- Confirm request-based fallback on accounts that only expose REST usage.
- If Windows auth turns out to need browser/session assistance, copy the smallest viable session-handling pattern rather than inventing a new one.

Verification:
- Windows SQLite auth path.
- Keyring fallback path.
- Team/enterprise request-based fallback.
- Clear user-facing error for "no active subscription" vs "not logged in".

### Ollama

Current state:
- Included in the Windows support list.
- Manual cookie setup works as a v1 implementation.

Next slice:
- Keep manual cookie mode stable.
- Add better parse resilience around settings-page HTML changes.
- Consider browser-import or local-runtime metrics only after the current provider backlog is smaller.
- If browser import is added, prefer one browser-first import path and keep manual cookie mode as the deterministic fallback.

Verification:
- Manual cookie save/read/delete on Windows credential store.
- Signed-out, expired-cookie, and changed-HTML failure modes.

### OpenCode

Current state:
- Surfaced again on Windows as an experimental provider.
- Manual cookie setup plus workspace override now match the provider detail flow instead of a hidden/frontend-only contradiction.

Next slice:
- Keep the surfaced provider flow stable.
- Reuse the already-proven combination of workspace override plus browser-cookie import as the pragmatic Windows path.
- Add one browser-import path only after the current manual path has enough Windows runtime evidence.

Verification:
- Surfaced provider flow in Settings and provider detail.
- Manual cookie path.
- Workspace discovery failure with actionable override guidance.

### Amp

Current state:
- Documented, but not Windows-supported in the fork.

Next slice:
- Determine the real Windows auth source used by Amp CLI.
- Add Windows file-path resolution for the secrets file or an alternate Windows credential source.

Verification:
- Signed-in Amp CLI on Windows.
- Missing-file error is actionable.
- Parsed balance output matches real account data.

### Copilot

Current state:
- Documented, but not Windows-supported in the fork.

Next slice:
- Verify `gh auth login` token storage on Windows.
- Confirm OpenUsage keyring cache works with Windows credential storage.
- Confirm API output for both free and paid Copilot accounts on Windows.
- Design account selection around the active `gh` account or an explicit account preference. Do not rely on service-name-only keychain reads.
- Consider device-flow auth as a fallback path if `gh` token discovery is too ambiguous on Windows.

Verification:
- `gh` token on Windows.
- Cached token reuse.
- Free-tier and paid-tier responses.

### Gemini

Current state:
- Surfaced on Windows as an experimental provider.
- Gemini CLI auth files under `~/.gemini/...` are reused on Windows.
- OAuth client discovery now checks the common Windows npm global root under `%AppData%/npm/node_modules` in addition to the existing Bun/npm-global paths.

Next slice:
- Run the provider on a real signed-in Windows Gemini CLI environment.
- Confirm the Windows npm-global path variants are enough for current Gemini CLI installs in the wild.
- Prefer the `loadCodeAssist` project/tier path if it remains the most reliable quota source. `CodexBar` already had to harden this area.

Verification:
- Signed-in Gemini CLI on Windows.
- Expired token refresh through the Windows npm-global `oauth2.js` path.
- Missing-auth and unsupported-auth-mode errors are explicit.

### JetBrains AI Assistant

Current state:
- Surfaced on Windows as an experimental provider.
- Roaming `%APPDATA%/JetBrains/.../AIAssistantQuotaManager2.xml` discovery is implemented and covered by a focused Windows test.
- Android Studio under `%APPDATA%/Google/...` and mixed-case IDE directory names are now covered too.

Next slice:
- Validate actual JetBrains Windows directory layout across current IDEs.
- Confirm which file or state object carries usable quota/session data.
- Run the provider against at least one real JetBrains account and capture the evidence in `docs/windows-provider-verification.md`.

Verification:
- At least one signed-in JetBrains IDE on Windows.
- One focused test for Windows path scanning.

### Kimi Code

Current state:
- Documented, but not Windows-supported in the fork.

Next slice:
- Identify Windows credential or file storage used by Kimi Code.
- Add Windows path resolution and session refresh handling if needed.
- If Windows-native auth is unstable, prefer a manual-cookie or token-backed bridge before building a browser importer.

Verification:
- Signed-in Kimi Code on Windows.
- Missing-session error and successful usage probe.

### MiniMax

Current state:
- Documented, but not Windows-supported in the fork.

Next slice:
- Verify how MiniMax auth is stored on Windows.
- Confirm whether the current plugin assumptions about local API/cookie sources hold on Windows.
- Keep region selection explicit from the first Windows slice so China-mainland routing does not become a later migration bug.

Verification:
- Signed-in MiniMax Windows environment.
- Region handling still works when auth is sourced from Windows storage.

### Factory / Droid

Current state:
- Documented, but not Windows-supported in the fork.

Next slice:
- Verify file vs keyring auth behavior on Windows.
- Confirm WorkOS refresh writes can be persisted safely on Windows.
- If local auth proves inconsistent, use a constrained manual-cookie bridge as a temporary Windows path instead of blocking the provider entirely.

Verification:
- Legacy file-backed auth.
- Current encrypted auth path if present on Windows.
- Keyring-backed auth refresh path.

### Z.ai

Current state:
- Documented, but not Windows-supported in the fork.

Next slice:
- Identify the actual Windows auth/session source before enabling probing.
- Add setup guidance only after a stable Windows source exists.

Verification:
- Signed-in Windows source confirmed.
- Probe can distinguish not-logged-in from provider/API failure.

### Windsurf

Current state:
- Documented with macOS-first local process and app-support assumptions.
- Not Windows-supported in this fork.

Next slice:
- Port process discovery, LS probing, and SQLite auth lookup to Windows.
- Validate Windows process naming, flags, port discovery, and app data locations.
- Reuse Antigravity learnings where the shared language-server family allows it.

Verification:
- Running Windsurf on Windows with LS path active.
- Cloud fallback without local LS.
- Prompt and flex credit output on real Windows accounts.

### Perplexity

Current state:
- Documented as macOS-app-cache based.
- Not Windows-supported in this fork.

Next slice:
- Decide whether Windows support should use desktop-app cache, browser session import, or a different local source.
- Do not enable until a stable Windows auth source exists.

Verification:
- Real Windows session source confirmed.
- Cache/session format resilient enough for one regression test.

## Recommended Rollout Order

### Phase 1: Stabilize already-supported providers

- Codex
- Cursor
- Claude
- Antigravity
- Ollama

Goal:
- Turn current "supported but uneven" providers into fully verified Windows providers.

### Phase 2: Resolve product/UI contradictions

- OpenCode

Goal:
- Stop advertising or bundling a provider in a half-hidden state.

### Phase 3: Land lower-risk Windows ports

- Copilot
- Gemini
- Amp
- JetBrains AI Assistant
- Kimi Code
- MiniMax

Goal:
- Expand Windows coverage where auth discovery is likely file/keyring based and does not require deep platform-specific process work.

### Phase 4: Land medium-complexity auth providers

- Factory / Droid
- Z.ai

Goal:
- Finish providers that need more provider-specific auth and refresh validation.

### Phase 5: Tackle platform-heavy ports

- Windsurf
- Perplexity

Goal:
- Port providers whose current implementation is tightly coupled to macOS runtime assumptions.

## Exit Criteria

The Windows provider rollout is complete when:

- Every documented provider is either working on Windows or explicitly marked blocked with a reason.
- README claims match the actual provider support state.
- Each Windows-working provider has:
  - a real setup path
  - a tested Windows lookup path
  - a documented verification recipe
  - a clear user-facing failure message

## Reference Links

- Upstream Windows roadmap: https://github.com/robinebers/openusage/issues/77
- Upstream OAuth API issue: https://github.com/robinebers/openusage/issues/71
- First Linux Solution-Try: https://github.com/robinebers/openusage/pull/273
- First Linux Solution-Try: https://github.com/robinebers/openusage/pull/137
- Copilot multi-account issue: https://github.com/robinebers/openusage/issues/280
- `ccusage`: https://github.com/ryoppippi/ccusage
- `CodexBar`: https://github.com/steipete/CodexBar
