# Windows Provider Rollout Plan

Canonical execution roadmap for Windows provider work in this fork. This document is about delivery order, validation mode, and what can be proven locally before paid-account entitlement coverage exists.

Use [Windows provider verification](./windows-provider-verification.md) for the repeatable validation checklist. Keep [windows.md](./windows.md) as the short status page.

## Validation model

- **Contract Coverage**: fixtures, focused tests, docs, auth-path discovery, and actionable error mapping.
- **Entitlement Coverage**: real free/trial/paid/team/runtime behavior observed on Windows.
- **Validation Mode** values:
  - `self-testable`
  - `community-needed`
  - `fixture-only until real account`

## Provider Matrix

| Provider | Current Windows State | Primary Windows Evidence Source | Validation Mode | Contract Coverage | Entitlement Coverage | Recommended Next Slice | Why Now / Why Later |
|---|---|---|---|---|---|---|---|
| Copilot | Experimental | `gh auth status`, `gh auth switch`, `hosts.yml`, keychain, `gh auth token` | self-testable | Strong pathing/tests exist; needs multi-account fixture hardening | Real free/paid behavior still partial | Lock active-account flow and add multi-account fixtures | Cheapest official Windows validation path today |
| Gemini | Experimental | `~/.gemini/settings.json`, `oauth_creds.json`, Windows npm global `oauth2.js` | self-testable | Good Windows path coverage exists; needs auth-mode fixture hardening | Real free/workspace/paid evidence still partial | Harden official OAuth/API-key discovery and free-vs-paid response fixtures | Official local auth files and CLI paths are deterministic |
| Claude | Partially working | `~/.claude/.credentials.json`, `~/.claude.json`, local `ccusage` | fixture-only until real account | Good token-source/error coverage; needs more fixture-backed contract regressions | Paid/account-tier variance still incomplete | Add focused contract regressions for OAuth/account fallback and failure wording | Mostly implemented already; expensive entitlement permutations remain |
| Cursor | Partially working | local `state.vscdb`, CLI keychain/session fallbacks | fixture-only until real account | Needs stronger Windows fixture coverage around account-state variants | Free/trial/paid/team variance needs real accounts | Add fixture-backed Windows auth/state regressions before more UI work | Good candidate after the cheapest self-testable slice |
| Codex | Working | local Codex auth files/keychain and `@ccusage/codex` usage data | fixture-only until real account | Needs fixture-backed contract hardening, not a redesign | Broader plan/runtime evidence still desirable | Add focused regressions for auth-source selection and usage-shape parsing | Local sources are stable, but plan diversity is harder to self-test |
| Ollama | Working v1 | manually stored Cookie header for `https://ollama.com/settings` | fixture-only until real account | Parser/setup diagnostics are solid; needs more fixture-backed contract cases | Real signed-in cookie/runtime evidence is still limited | Expand HTML-shape and auth-failure fixtures | Manual-cookie flow is deterministic enough for contract work |
| OpenCode Zen | Experimental | manually stored Cookie header plus workspace id from OpenCode Zen billing flow | fixture-only until real account | Needs broader billing-payload and workspace-selection fixtures | Real pay-as-you-go workspace behavior still gated on signed-in accounts | Add focused workspace/payload contract regressions | Current integration is meaningful, but entitlement proof is expensive |
| JetBrains AI Assistant | Working on Windows | local IDE quota XML under JetBrains/Google config roots | community-needed | Good Windows parser/path tests already exist | More IDE/account/runtime combinations still need real-world confirmation | Collect local validation notes across more IDE/product variants | Stable local source exists, but coverage breadth is community-driven now |
| Antigravity | Working but needs more runtime confidence | local `state.vscdb`, local language server process, Windows-localized netstat parsing | community-needed | LS discovery and mixed-port contract coverage is good | Runtime grouped-quota behavior still needs broader real sessions | Gather real Windows validation notes for quota grouping and startup behavior | Local process path is implemented; broader confidence is the bottleneck |
| Windsurf | Experimental | local `state.vscdb` plus direct cloud quota call | community-needed | Windows state-db/cloud contract is in place | Real-account/runtime coverage still thin | Defer until clearer real-user evidence arrives | More opaque runtime confidence problem than engineering problem |
| Amp | Experimental | `%USERPROFILE%\\.local\\share\\amp\\secrets.json` | community-needed | Windows path contract is covered | Real signed-in Windows usage still unverified | Defer after higher-signal providers | Needs real signed-in evidence more than code churn |
| OpenCode Go | Working on Windows | local `opencode.db` SQLite history plus `auth.json` detection | self-testable | Local DB parsing, current auth/history identifiers, and window math are covered by focused tests plus one real local probe | No remote entitlement contract exists; local-history behavior is the product | Keep the surfaced Windows metadata aligned with future OpenCode local-schema changes | Entirely local provider; the current Windows path is proven locally and cheap to maintain with fixtures |
| Factory / Droid | Experimental | `~/.factory/auth.encrypted`, `~/.factory/auth.json`, optional keychain WorkOS payload | community-needed | Auth-file, keychain, refresh, and usage-shape coverage are already in focused tests | Real auth/session behavior on Windows is still pending | Collect one real Windows validation note once a local `droid` sign-in is available and keep the WorkOS auth contract under test | The plugin already has concrete auth sources; the gap is runtime evidence, not missing integration code |
| Kilo | Experimental | stored provider secret `apiKey` or `KILO_API_KEY` plus direct Kilo tRPC batch endpoint | fixture-only until real account | API-key setup, tRPC batch parsing, and Windows settings copy are covered by focused tests | Real account/runtime behavior on Windows is still unverified; CLI fallback is still deferred | Collect one real Windows API-key validation note and wire the documented CLI-session fallback only if the direct path proves insufficient | Cheap Windows rollout because the core contract is a direct API key, and the deferred CLI path can stay separate |
| Kimi Code | Experimental | `~/.kimi/credentials/kimi-code.json` plus OAuth refresh | community-needed | Credential-file path, token refresh, and quota parsing are covered by focused tests | Real Windows entitlement/runtime behavior is still pending | Collect one real Windows validation note once a local Kimi sign-in is available and keep the auth-file contract under test | The plugin shape is already meaningful; the main gap is local runtime evidence, not missing code |
| Kimi K2 | Experimental | stored provider secret `apiKey` or `KIMI_K2_API_KEY` / `KIMI_API_KEY` / `KIMI_KEY` plus direct credits endpoint | fixture-only until real account | API-key setup, env fallback, header fallback, and usage-shape parsing are covered by focused tests | Real credits/account behavior on Windows is still unverified | Collect one real Windows API-key validation note and keep the credits contract under test | Straightforward direct API provider with a cheap Windows setup path once the key is stored |
| MiniMax | Experimental | user-provided API key / CN key env path | fixture-only until real account | API-key contract and region fallback are covered by focused tests | Real plan/runtime evidence still missing | Collect one real Windows API-key validation note and broaden payload fixtures only when the API changes | Cheap Windows rollout because auth is just persistent env vars plus direct HTTP |
| OpenRouter | Experimental | stored provider secret `apiKey` or `OPENROUTER_API_KEY` plus direct credits and key endpoints | fixture-only until real account | API-key setup, env fallback, key-endpoint degradation, and Windows settings copy are covered by focused tests | Real credits/key-quota behavior on Windows is still unverified | Collect one real Windows API-key validation note and keep the direct API contract under test | Straightforward direct API provider with a cheap Windows setup path once the key is stored |
| Synthetic | Experimental | stored provider secret `apiKey` or `SYNTHETIC_API_KEY` plus direct quotas endpoint | fixture-only until real account | API-key setup, env fallback, quota-shape parsing, and Windows settings copy are covered by focused tests | Real quota/account behavior on Windows is still unverified | Collect one real Windows API-key validation note and keep the direct quota contract under test | Simple direct API provider with no browser/session dependency in v1 |
| Augment | Experimental | stored provider secret `cookieHeader` or `AUGMENT_COOKIE_HEADER` plus signed-in Augment web APIs | fixture-only until real account | Manual-cookie setup, env fallback, credits parsing, subscription metadata, and Windows settings copy are covered by focused tests | Real signed-in Windows web-session behavior is still unverified | Collect one real Windows cookie validation note and add CLI/browser import only when the host has a suitable source | Manual cookie mode removes the placeholder without pretending the missing CLI subprocess/browser import path exists |
| Vertex AI | Experimental | gcloud application-default credentials plus Cloud Monitoring quota time-series | fixture-only until real account | ADC path lookup, OAuth refresh, project fallback, quota matching, setup copy, and env allowlist are covered by focused tests | Real Google Cloud project/IAM behavior on Windows is still unverified | Collect one real Windows ADC validation note and add service-account/local-cost support only when needed | Official Google auth and quota APIs provide a narrow implementation path without browser scraping |
| Warp | Experimental | stored provider secret `token` or `WARP_API_KEY` / `WARP_TOKEN` plus direct GraphQL limits endpoint | fixture-only until real account | Token setup, env fallback, GraphQL parsing, and Windows settings copy are covered by focused tests | Real request-limit/account-plan behavior on Windows is still unverified | Collect one real Windows token validation note and keep the request-limit contract under test | Direct token provider with a narrow GraphQL contract and no browser/session dependency in v1 |
| Z.ai | Experimental | user-provided API key / token | fixture-only until real account | Direct API contract is covered by focused tests and deterministic env-key lookup | Real quota/account behavior still unverified | Collect one real Windows API-key validation note and keep the internal-endpoint contract under test | API provider with a simple Windows setup path once env vars are documented clearly |
| Zed | Experimental | stored dashboard `Cookie` header plus external Windows credential target and local `telemetry.log` fallback | self-testable | Billing-cookie parsing, browser-backed request flow, target-credential lookup, telemetry fallback, and setup copy are covered by focused tests | Automatic session import is still absent and the local Zed client token does not authenticate the billing endpoint directly | Keep the billing-cookie contract under test and add auto-import only if a stable Windows session path appears | Cheap Windows rollout because manual cookie setup unlocks spend now through an embedded browser while local telemetry still covers the no-cookie fallback |
| Perplexity | Not started for Windows | currently macOS app-cache dependent | community-needed | Windows contract is not established | Windows entitlement path is effectively blocked | Defer until a viable Windows auth source exists | Platform-hostile source model for this fork |

## Rollout Order

### Phase 1: subscription-light, self-testable first

1. Copilot
2. Gemini
3. Claude

### Phase 2: contract hardening on already-meaningful providers

1. Cursor
2. Codex
3. Ollama
4. OpenCode

### Phase 3: low-code, confidence-gathering follow-ups

1. JetBrains AI Assistant
2. Antigravity

### Deferred until clearer Windows evidence exists

- Windsurf
- Perplexity
- Amp

## First Three Execution Slices

### Slice 1: Copilot account-state hardening

- Scope:
  - keep the Windows flow centered on `gh auth status`, `gh auth switch`, active-account resolution, and the existing `gh auth token` fallback
  - add multi-account fixtures for `hosts.yml`, active-login mismatch, and direct `gh auth token` recovery
- Success evidence:
  - `bun run test -- plugins/copilot/plugin.test.js`
  - `cargo test --manifest-path src-tauri/Cargo.toml keychain_api_exposes_account_read_and_write`
  - one short Windows validation note that records the active `gh` account shape actually used

### Slice 2: Gemini official-auth hardening

- Scope:
  - lock the official OAuth file path and Windows npm global `oauth2.js` lookup
  - add explicit fixture coverage for supported vs unsupported auth modes and free-tier vs paid-tier response shapes
- Success evidence:
  - `bun run test -- plugins/gemini/plugin.test.js`
  - updated provider doc notes for supported and unsupported modes

### Slice 3: supported-provider contract coverage

- Scope:
  - add or expand fixture-backed contract tests for `Claude`, `Cursor`, `Codex`, `Ollama`, and `OpenCode`
  - keep real paid/trial/team behavior called out as entitlement work, not as a blocker for parser/auth-path correctness
- Success evidence:
  - one focused regression per provider
  - provider docs updated where error wording or setup expectations changed

## Defaults

- Prefer providers with official local auth/session files, CLI account state, or deterministic fixtures before providers that require paid opaque browser sessions.
- Keep contract work moving even when entitlement validation requires community testers or paid plans.
- Do not promote a provider from experimental/partial to fully working on Windows without at least one real Windows entitlement check, even if the fixture contract looks complete.
