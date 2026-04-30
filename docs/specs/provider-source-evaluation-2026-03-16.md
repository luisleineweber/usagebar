# Provider Source Evaluation

Date: 2026-03-21

Original draft: 2026-03-16

Scope: compare upstream `openusage` and `codexbar` provider source models, then note what the current UsageBar fork has already surfaced or corrected on top of that comparison.

Legend:
- `web` = provider website/dashboard/settings HTML or internal web endpoints
- `cookies` = browser/imported/manual Cookie header or cookie-derived session
- `json/file` = local auth/config/credential JSON or other local files
- `sqlite` = local SQLite cache/state DB
- `keychain` = OS credential store
- `oauth/api` = direct API or OAuth refresh/token exchange
- `local process` = running local app/CLI/language-server probe
- `placeholder` = blocked Windows-visible provider stub in the current UsageBar worktree

## Executive Summary

- The high-level split still holds: upstream `openusage` prefers local auth/state plus direct APIs, while `codexbar` still leans much harder on browser-session and dashboard scraping flows.
- The March 16 "missing provider" gap is now mostly closed in this fork. UsageBar still contains blocked placeholders for `alibaba` and `kiro`; `augment`, `vertex-ai`, `kilo`, `synthetic`, `openrouter`, `kimi-k2`, and `warp` have moved to implemented Windows-experimental providers.
- `OpenCode` doc drift is fixed: `docs/providers/opencode.md` now exists, and `OpenCode Go` is a separate provider with a different source model based on local SQLite spend history.
- Windsurf changed materially after the original draft. The current UsageBar plugin reads the local `state.vscdb` API key and calls Windsurf's cloud quota contract directly; a running local language server is no longer required.
- The hardest remaining Windows ports are still the session-heavy providers (`Alibaba`, `Augment`, `Ollama`, `OpenCode`, `Perplexity`, maybe `MiniMax`/`Factory` if local auth proves insufficient). The cleanest next implementations remain explicit API or local-file providers.

## Windows Opinion

- Do not port the macOS browser-cookie/WebKit-heavy model directly.
- Preferred Windows order:
  1. local app state (`json/file`, `sqlite`, `local process`)
  2. direct `oauth/api`
  3. app-owned WebView2 session/profile
  4. manual cookie header import
  5. external browser-cookie extraction only as an optional import path
- Reason:
  - Tauri on Windows uses WebView2: [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
  - WebView2 supports app-owned user-data folders/profiles and cookie management: [user data folder](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder), [cookie manager](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2cookiemanager)
  - This fork already chose an app-owned DPAPI-backed local secret store for provider secrets on Windows instead of depending on ongoing browser-cookie extraction
- Practical rule:
  - Reuse `openusage` local-auth implementations where they already fit Windows.
  - Borrow `codexbar` mostly for source-mode ideas and provider UX, not for the macOS-specific browser-cookie implementation details.
  - For dashboard-only providers, prefer a dedicated WebView2 login/session per provider/account over continuous scraping of Chrome/Edge cookies.

## Provider Matrix

| Provider | Upstream `openusage` / current UsageBar status | `codexbar` | Evaluation | Windows recommendation |
| --- | --- | --- | --- | --- |
| Alibaba Coding Plan | Upstream: not present. Current UsageBar worktree: `placeholder` via `plugins/alibaba/plugin.json`. | `web` + `cookies` primary, `api` secondary: Model Studio/Bailian console session baseline with region-aware API fallback. Evidence: `D:/usagebar/codexbar/docs/alibaba-coding-plan.md`. | New CodexBar-only provider. Current UsageBar placeholder intentionally does not copy the macOS browser-first implementation yet. | On Windows, start with app-owned WebView2 session or explicit API-key mode behind region-aware settings. Keep external browser import optional. |
| Amp | `json/file` + `oauth/api`: reads `~/.local/share/amp/secrets.json`, uses API key against Amp API/internal usage endpoints. Current UsageBar keeps this path and marks Windows experimental. Evidence: `plugins/amp/plugin.js`, `docs/providers/amp.md`, `plugins/amp/plugin.json`. | `web` + `cookies`: settings page scrape at `https://ampcode.com/settings`, automatic/manual cookie source. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same product, different trust boundary. Upstream/fork still prefers CLI-secret/API auth; CodexBar prefers browser session. | Keep the API/CLI-secret route on Windows. Add WebView2 login only if Amp stops exposing stable local/API-backed auth artifacts. |
| Antigravity | `sqlite` + `json/file` + `oauth/api` + `local process`: reads `state.vscdb`, cached `pluginDataDir/auth.json`, refreshes Google OAuth token, probes the local language server, falls back to Cloud Code HTTP. Current UsageBar also hardened localized Windows LS discovery and mixed-port candidate selection. Evidence: `plugins/antigravity/plugin.js`, `docs/providers/antigravity.md`. | `local process`: local Antigravity language-server probe with Cloud Code-style fallback. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same core strategy. The current fork is more explicit about SQLite token extraction and now has stronger Windows probe hardening than the original draft. | Keep local SQLite plus LS probe first, with Cloud Code fallback. No browser integration needed. |
| Augment | Upstream: not present. Current UsageBar: `web` + `cookies` via stored `cookieHeader` or `AUGMENT_COOKIE_HEADER`; Windows experimental. Evidence: `plugins/augment/plugin.js`, `docs/providers/augment.md`. | `web` + `cookies` + keepalive: Augment session cookies, auto/manual import, provider-specific keepalive. Evidence: `D:/usagebar/codexbar/docs/augment.md`. | The fork now ships the narrow manual-cookie web path but has not wired browser auto-import or Auggie CLI execution into the JS plugin host. | Keep manual cookie as the pragmatic Windows v1. Add app-owned WebView2 session or CLI probing only when the host exposes those primitives cleanly. |
| Claude | `json/file` + `keychain` + `oauth/api` + local usage logs: reads `~/.claude/.credentials.json` or keychain, refreshes OAuth, calls Anthropic usage API, adds `ccusage` local JSONL cost usage. Current UsageBar also treats `~/.claude.json` account metadata as a signed-in fallback. Evidence: `plugins/claude/plugin.js`, `docs/providers/claude.md`. | `oauth/api` + `cli` + `web` + local usage logs: OAuth API, Claude CLI PTY, then Claude web API/cookies. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar has broader fallback coverage. Upstream/fork remains cleaner and more Windows-friendly for OAuth plus local logs. | Use local Claude auth files, OAuth refresh, and local logs on Windows. Add optional WebView2-based web/session extras later, not as the default path. |
| Codex | `json/file` + `keychain` + `oauth/api` + local usage logs: reads `CODEX_HOME/auth.json` / `~/.config/codex/auth.json` / `~/.codex/auth.json` or keychain, refreshes OpenAI OAuth, calls `chatgpt.com/backend-api/wham/usage`, adds `ccusage`. Evidence: `plugins/codex/plugin.js`, `docs/providers/codex.md`. | `web` + `cookies` + `cli`: OpenAI/Codex dashboard web scrape plus Codex CLI JSON-RPC/PTY and local session JSONL scanning. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Different emphasis: upstream/fork trusts auth JSON/keychain plus usage endpoint; CodexBar mixes CLI and dashboard extras. | Keep auth JSON plus local logs as primary on Windows. If dashboard extras matter, use an app-owned WebView2 profile for OpenAI rather than importing Chrome/Edge cookies. |
| Copilot | `keychain` + `json/file` + `oauth/api`: reads OpenUsage keychain, GitHub CLI keychain/state, fallback `auth.json`; calls GitHub Copilot API. Current UsageBar also falls back to `gh auth token` and follows the active `hosts.yml` account on Windows. Evidence: `plugins/copilot/plugin.js`, `docs/providers/copilot.md`. | `oauth/api`: GitHub device flow token plus `copilot_internal` API. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same provider family. Current fork now handles Windows `gh` state more directly than the original draft. | Integrate with `gh auth` or direct device flow and store the token in the app-owned secret store. No browser/session work needed. |
| Cursor | `sqlite` + `keychain` + `oauth/api` + `cookies`: reads desktop `state.vscdb` first, keychain fallback, refreshes OAuth, then uses bearer APIs and cookie-backed web endpoints like Stripe/enterprise usage. Evidence: `plugins/cursor/plugin.js`, `docs/providers/cursor.md`. | `web` + `cookies`: browser cookies then stored WebKit session for Cursor web APIs. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Strong divergence. Upstream/fork is desktop-auth/state driven; CodexBar is browser-session driven. | Windows should follow the desktop SQLite/auth model first. Add WebView2 session fallback only for fields that are genuinely web-only. |
| Factory | `json/file` + `keychain` + `oauth/api`: reads `~/.factory/auth.encrypted` / `auth.json` or keychain, refreshes via WorkOS, calls Factory subscription usage API. Evidence: `plugins/factory/plugin.js`, `docs/providers/factory.md`. | `web` + `cookies` + `json/file` + local storage + stored tokens: cookies, stored tokens, local storage, WorkOS cookies. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same auth ecosystem, but CodexBar layers browser/local-storage import on top. | Start with local auth files plus token refresh on Windows. If Factory later requires browser-only state, use an app-owned WebView2 provider session instead of browser scraping. |
| Gemini | `json/file` + `oauth/api`: reads `~/.gemini/settings.json`, `~/.gemini/oauth_creds.json`, Gemini CLI OAuth client info; calls Cloud Code/Google quota APIs. Current UsageBar marks Windows experimental and now checks common Windows npm global paths for `oauth2.js`. Evidence: `plugins/gemini/plugin.js`, `docs/providers/gemini.md`, `plugins/gemini/plugin.json`. | `oauth/api`: Gemini CLI credentials with quota API and OAuth refresh. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Near-aligned. | Keep CLI credential files plus OAuth refresh on Windows. This is already a good Windows-native architecture. |
| JetBrains AI Assistant | `json/file` only: reads local `AIAssistantQuotaManager2.xml` under IDE config roots. Current UsageBar marks Windows supported. Evidence: `plugins/jetbrains-ai-assistant/plugin.js`, `docs/providers/jetbrains-ai-assistant.md`, `plugins/jetbrains-ai-assistant/plugin.json`. | `json/file` only: reads local XML quota file from JetBrains config dirs. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Fully aligned. | Use local config/XML discovery only. This remains one of the cleanest Windows ports. |
| Kilo | Upstream: not present. Current UsageBar: implemented Windows-`experimental` API-key provider via `plugins/kilo/plugin.json`, `plugins/kilo/plugin.js`, and `docs/providers/kilo.md`. | `json/file` + `oauth/api` + `cli`: config/API key first, local CLI auth/session fallback. Evidence: `D:/usagebar/codexbar/docs/providers.md`, `D:/usagebar/codexbar/docs/kilo.md`. | Low-risk CodexBar-only provider. The fork now uses the app-owned secret store or `KILO_API_KEY` and calls the documented Kilo tRPC batch endpoint, while leaving CLI fallback for a later slice. | Keep the direct API-key path on Windows first; add the documented `auth.json` CLI fallback only if real usage shows the direct path is insufficient. |
| Kimi | `json/file` + `oauth/api`: reads `~/.kimi/credentials/kimi-code.json`, refreshes at `auth.kimi.com`, calls Kimi usage API. Evidence: `plugins/kimi/plugin.js`, `docs/providers/kimi.md`. | `api`: token from `kimi-auth` cookie/manual entry or env, then Kimi billing API. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Different auth source: upstream reuses local credential JSON; CodexBar expects cookie-derived token/API style. | Prefer the local credential JSON plus OAuth-refresh model on Windows if the Kimi app/CLI writes usable files. Manual cookie mode should stay fallback-only. |
| Moonshot API Balance | Upstream: not present. Current UsageBar: `api` via `plugins/kimi-k2/plugin.js`, stored provider secret `apiKey`, and `MOONSHOT_API_KEY` / `KIMI_API_KEY` / `KIMI_KEY`. | `api`: API key from settings/env to the official Moonshot balance endpoint. Evidence: `plugins/kimi-k2/plugin.js`, `docs/providers/kimi-k2.md`. | Strong API-key Windows provider for official Kimi Open Platform balance. The remaining gap is live-account validation, not missing integration code. | Keep the direct balance contract under test and collect real Windows API-key validation notes before promotion. |
| Kiro | Upstream: not present. Current UsageBar: `placeholder` via `plugins/kiro/plugin.json`. | `cli`: runs `kiro-cli chat --no-interactive "/usage"` and parses output. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar-only and CLI-shaped. | Use CLI execution/parsing only on Windows. Avoid browser work unless Kiro removes the CLI path. |
| MiniMax | `env` + `oauth/api`: reads `MINIMAX_*` env vars only, calls coding-plan remains API. Evidence: `plugins/minimax/plugin.js`, `docs/providers/minimax.md`. | `cookies` + `web` + local storage, with manual cookie/API hybrids: manual cookie header or browser cookies, local storage access token, coding-plan/remains web flow. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Large divergence. Upstream is API-key/env only; CodexBar is browser/manual-cookie centric. | Use API-key/env if the provider still supports it. If not, move to an app-owned WebView2 login session, not external browser scraping as the primary design. |
| Ollama | `web` + `cookies`: manual cookie header from provider secrets, scrapes `https://ollama.com/settings`. Evidence: `plugins/ollama/plugin.js`, `docs/providers/ollama.md`. | `web` + `cookies`: browser-cookie settings-page scrape, automatic/manual cookie source. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Similar target data, different setup UX. CodexBar has stronger cookie-import UX; UsageBar is still manual-secret only. | Best Windows design: provider-specific WebView2 login/session for Ollama, with manual cookie-header fallback/import. |
| OpenCode Zen | `web` + `cookies`: manual cookie header from env/provider secret/app-owned secret store, calls `https://opencode.ai/_server`, resolves workspace ID, reads pay-as-you-go billing usage. Provider docs now exist. Evidence: `plugins/opencode/plugin.js`, `docs/providers/opencode.md`. | `web` + `cookies`: dashboard cookies from `opencode.ai` with automatic/manual import. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same web source. The earlier claim that docs were missing is no longer true; the remaining gap is automatic browser/session UX. | Use an app-owned WebView2 login/session profile for OpenCode Zen. Keep manual cookie fallback; external browser import should stay optional. |
| OpenCode Go | `json/file` + `sqlite`: reads local `~/.local/share/opencode/auth.json` and `opencode.db`, then derives 5h/weekly/monthly usage from local assistant-history cost rows. Evidence: `plugins/opencode-go/plugin.js`, `docs/providers/opencode-go.md`. | not present | Separate provider and trust boundary from OpenCode Zen pay-as-you-go billing usage. The current source is local-history based, not account-truth web usage. | If brought to Windows, port the local data paths first. No browser/session work needed. |
| OpenRouter | Upstream: not present. Current UsageBar: `api` via `plugins/openrouter/plugin.js`, stored provider secret `apiKey`, and `OPENROUTER_API_KEY` / `OPENROUTER_API_URL`. | `api`: API key to credits plus key-info endpoints. Evidence: `plugins/openrouter/plugin.js`, `docs/providers/openrouter.md`, `D:/usagebar/CodexBar/docs/openrouter.md`. | Excellent low-risk Windows provider. The remaining gap is live-account validation, not missing local integration code. | Keep the direct API contract under test and collect real Windows API-key validation notes before promotion. |
| Perplexity | `sqlite` + `web/api`: mines the Perplexity macOS app cache DB for bearer token, user-agent, and device ID, then calls private REST APIs for groups, usage analytics, and rate limits. Evidence: `plugins/perplexity/plugin.js`, `docs/providers/perplexity.md`. | not present | Upstream-only, but still heavily macOS-app dependent. This remains the least Windows-ready source model in the matrix. | Prefer an app-owned WebView2 login/session on Windows and then call the same web APIs from that session. Do not try to port the macOS cache-DB assumption directly. |
| Synthetic | Upstream: not present. Current UsageBar: implemented Windows-`experimental` API-key provider via `plugins/synthetic/plugin.json`, `plugins/synthetic/plugin.js`, and `docs/providers/synthetic.md`. | `api`: API key from config/env. Evidence: `D:/usagebar/codexbar/docs/providers.md`, `D:/usagebar/codexbar/Sources/CodexBarCore/Providers/Synthetic/*`. | Simple API-key provider. The fork now uses the app-owned secret store or `SYNTHETIC_API_KEY` and probes the direct quotas endpoint. | Keep the direct API-key path on Windows and collect real-account validation before promoting beyond `experimental`. |
| Vertex AI | Upstream: not present. Current UsageBar: `oauth/api` via gcloud ADC, OAuth refresh, project config/env fallback, and Cloud Monitoring quota metrics; Windows experimental. Evidence: `plugins/vertex-ai/plugin.js`, `docs/providers/vertex-ai.md`. | `oauth/api` + local usage logs: Google ADC OAuth plus Cloud Monitoring quota metrics, with local Claude-log cost scanning. Evidence: `D:/usagebar/codexbar/docs/providers.md`, `D:/usagebar/codexbar/docs/vertexai.md`. | Good Windows candidate because the core auth path is explicit, not browser-bound. The fork now implements the quota path; local Claude-log cost enrichment remains deferred. | Keep ADC plus API calls as the Windows default. Add service-account ADC and local-cost enrichment only when a real validation case needs them. |
| Warp | Upstream: not present. Current UsageBar: `api` via `plugins/warp/plugin.js`, stored provider secret `token`, and `WARP_API_KEY` / `WARP_TOKEN`. | `api`: API token from settings/env to Warp app GraphQL limits. Evidence: `plugins/warp/plugin.js`, `docs/providers/warp.md`, `D:/usagebar/CodexBar/docs/warp.md`. | Experimental token-based Windows provider. `app.warp.dev` is the right host, but `graphql/v2?op=GetRequestLimitInfo` is not documented in Warp's public Oz API docs. | Keep the direct GraphQL contract under test, document the endpoint provenance risk, collect real Windows token validation notes, and migrate if Warp documents an official usage endpoint. |
| Windsurf | `sqlite` + `oauth/api`: reads the local `state.vscdb` API key and calls Windsurf's cloud `GetUserStatus` contract directly. Current UsageBar uses Windows-aware `state.vscdb` paths and no longer requires a running local language server. Evidence: `plugins/windsurf/plugin.js`, `docs/providers/windsurf.md`, `plugins/windsurf/plugin.json`. | not present | The March 16 LS-heavy description is stale. The current path is cleaner and more Windows-appropriate than before. | Keep the state-DB plus direct cloud-quota path. Reintroduce LS probing only if the cloud endpoint stops exposing the needed quota fields. |
| Z.ai | `env` + undocumented app/subscription API: API key from env, then quota/limit endpoints. Evidence: `plugins/zai/plugin.js`, `docs/providers/zai.md`. | `api`: API token from keychain or env to quota API. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Experimental direct-key provider. `api.z.ai` is the right host, but public docs name `/api/paas/v4` and `/api/coding/paas/v4`, not `/api/biz/subscription/list` or `/api/monitor/usage/quota/limit`. | Keep the direct quota contract under test, document the endpoint provenance risk, and move to a public usage endpoint if Z.ai publishes one. |

## Current UsageBar Status vs March 16 Draft

- The old "missing provider" list is no longer accurate in this fork. `alibaba` and `kiro` remain blocked placeholders, while `augment`, `vertex-ai`, `kilo`, `synthetic`, `openrouter`, `kimi-k2`, and `warp` are now implemented as Windows-experimental providers.
- Upstream `openusage` still does not ship the CodexBar-only provider set.
- `docs/providers/opencode.md` now exists, so the earlier OpenCode doc-gap note is resolved.
- `OpenCode Go` now exists as a distinct provider/plugin/doc trio and should not be collapsed into the OpenCode web row.
- Windsurf is no longer accurately described as an LS-first provider in this fork; the state-DB plus cloud-quota path is the current implementation.

## Findings

1. `codexbar` is still much more invested in browser-session and dashboard-scraping flows.
   - This is most visible for Alibaba, Augment, Cursor, Factory, MiniMax, Ollama, OpenCode, and Codex dashboard extras.

2. Upstream `openusage` and this fork are stronger where local desktop/client auth already exists.
   - Claude, Codex, Cursor, Gemini, JetBrains AI Assistant, Kimi, Windsurf, and Antigravity all benefit from local files, SQLite, keychain, or local-process evidence.

3. Several March 16 "missing provider" gaps are now product-surface gaps, not discovery gaps.
   - UsageBar already exposes placeholders for many CodexBar-only providers.
   - The remaining work is the actual Windows auth/session implementation, tests, and docs.

4. `OpenCode Zen` and `OpenCode Go` must be treated as separate providers.
   - `OpenCode Zen` is signed-in website pay-as-you-go billing usage.
   - `OpenCode Go` is subscription-limit usage derived from local SQLite history.

5. Windsurf moved in the right direction for Windows.
   - The current state-DB plus cloud-quota contract is substantially easier to support on Windows than the old LS-heavy model.

6. Perplexity remains the clearest platform-hostile outlier.
   - Its current source assumes a macOS app cache DB and private web API replay, which does not translate cleanly to Windows without a different session strategy.

## Practical Takeaways For UsageBar

- If the goal is Windows-first parity, the fastest reusable `codexbar` ideas are still the provider source models, not the implementation details.
- The highest-confidence next implementations remain explicit API or local-file providers: `vertex-ai`; `kilo`, `synthetic`, `openrouter`, `kimi-k2`, and `warp` have already moved into the implemented experimental bucket.
- The harder ports remain session-heavy providers: `alibaba`, `augment`, `ollama`, `opencode`, and `perplexity`, plus `factory`/`minimax` if their local auth paths are insufficient.
- For overlapping providers, keep the local-auth implementations where they already work on Windows. Borrow `codexbar` browser/manual-cookie UX only when local auth is unavailable.

## Windows Rollout Order

1. Keep finishing local-state providers first.
   - Claude
   - Codex
   - Cursor
   - Gemini
   - JetBrains AI Assistant
   - Windsurf
   - Antigravity

2. Implement direct API/token providers next.
   - Copilot
   - Z.ai
   - OpenRouter
   - Warp
   - Kimi K2
   - Vertex AI
   - Synthetic
   - Kilo

3. Then build one reusable WebView2 session framework for dashboard/session-heavy providers.
   - Alibaba Coding Plan
   - Augment
   - Ollama
   - OpenCode
   - Perplexity
   - Factory if local auth proves insufficient
   - MiniMax if API-key flow proves insufficient
   - Amp only if the CLI/API path breaks

4. Keep manual cookie import as fallback UX.
   - good for debugging
   - good for providers with unstable login flows
   - should not be the main Windows architecture

## Evidence Files Used

- `plugins/*/plugin.js`
- `plugins/*/plugin.json`
- `docs/providers/*.md`
- `docs/windows.md`
- `README.md`
- `D:/usagebar/codexbar/docs/providers.md`
- `D:/usagebar/codexbar/docs/augment.md`
- `D:/usagebar/codexbar/docs/alibaba-coding-plan.md`
- `D:/usagebar/codexbar/docs/vertexai.md`
- `D:/usagebar/codexbar/docs/warp.md`
- `D:/usagebar/codexbar/Sources/CodexBarCore/Providers/*`
