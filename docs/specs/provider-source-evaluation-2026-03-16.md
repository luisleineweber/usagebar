# Provider Source Evaluation

Date: 2026-03-16

Scope: compare where `openusage` and `codexbar` get provider usage data today, plus what should be done on Windows.

Legend:
- `web` = provider website/dashboard/settings HTML or internal web endpoints
- `cookies` = browser/imported/manual Cookie header or cookie-derived session
- `json/file` = local auth/config/credential JSON or other local files
- `sqlite` = local SQLite cache/state DB
- `keychain` = OS credential store
- `oauth/api` = direct API or OAuth refresh/token exchange
- `local process` = running local app/CLI/language-server probe

## Executive Summary

- `openusage` is mostly direct provider plugins: local auth material + provider HTTP APIs. Browser-cookie automation is limited.
- `codexbar` is broader and more web-heavy: many providers use automatic browser-cookie import plus provider-specific web/dashboard scraping.
- Major divergence: `codexbar` supports more provider-specific source modes (`auto`, `manual`, `oauth`, `api`, `cli`, `local`), while `openusage` usually hardcodes one primary path per plugin.
- Biggest gaps in `openusage` vs `codexbar`: no shipped `kilo`, `kiro`, `vertexai`, `augment`, `kimik2`, `warp`, `openrouter`, `synthetic`; weaker browser-cookie import coverage; several providers still env/manual-only.

## Windows Opinion

- Do not port the macOS browser-cookie/WebKit-heavy model directly.
- Preferred Windows order:
  1. local app state (`json/file`, `sqlite`, `local process`)
  2. direct `oauth/api`
  3. app-owned WebView2 session/profile
  4. manual cookie header import
  5. browser-cookie extraction only as optional import, not core architecture
- Reason:
  - Tauri on Windows uses WebView2: [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
  - WebView2 supports app-owned user-data folders/profiles and cookie management: [user data folder](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder), [cookie manager](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2cookiemanager)
  - Windows has native protected secret storage: [Credential management](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management), [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
- Practical rule:
  - Reuse `openusage` local-auth implementations where they already fit Windows.
  - Borrow `codexbar` mostly for source-mode UX.
  - For dashboard-only providers, use a dedicated WebView2 login/session per provider/account instead of scraping Chrome/Edge cookies continuously.

## Provider Matrix

| Provider | `openusage` | `codexbar` | Evaluation | Windows recommendation |
| --- | --- | --- | --- | --- |
| Amp | `json/file` + `oauth/api`: reads `~/.local/share/amp/secrets.json`, uses API key against Amp API/internal usage endpoints. Evidence: `plugins/amp/plugin.js`, `docs/providers/amp.md`. | `web` + `cookies`: settings page scrape at `https://ampcode.com/settings`, automatic/manual cookie source. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Different strategy. `openusage` uses CLI secrets/API; `codexbar` uses web cookies/settings HTML. | Prefer API/CLI-secret route on Windows. Add WebView2 login only if Amp stops exposing stable API-backed auth artifacts. Do not start with browser-cookie extraction. |
| Antigravity | `sqlite` + `json/file` + `oauth/api` + `local process`: reads `state.vscdb`, cached `pluginDataDir/auth.json`, refreshes Google OAuth token, probes local language server, falls back to Cloud Code HTTP. Evidence: `plugins/antigravity/plugin.js`, `docs/providers/antigravity.md`. | `local process`: local Antigravity language server primary, Cloud Code-style local probe. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same core idea, but `openusage` implementation is more explicit about SQLite token extraction and local cache file. | Best Windows path: keep local SQLite + running language-server probe. Store refreshed tokens in Credential Manager/DPAPI-backed cache if needed. No browser integration needed. |
| Augment | not present | `local process`: local probe / session keepalive / Auggie CLI fallback. Evidence: `D:/usagebar/codexbar/docs/providers.md`, `Sources/CodexBarCore/Providers/Augment/*`. | CodexBar-only. | If added on Windows, start with local process/CLI detection only. Avoid web/session work until a Windows-native auth source is missing. |
| Claude | `json/file` + `keychain` + `oauth/api` + local usage logs: reads `~/.claude/.credentials.json` or keychain, refreshes OAuth, calls Anthropic usage API, adds `ccusage` local JSONL cost usage. Evidence: `plugins/claude/plugin.js`, `docs/providers/claude.md`. | `oauth/api` + `cli` + `web` + local usage logs: auto chain is OAuth API, Claude CLI PTY, then Claude web API/cookies. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar has broader fallback stack. OpenUsage is cleaner/direct for OAuth + ccusage. | Use local Claude auth files + OAuth refresh + local logs on Windows. Add optional WebView2-based Claude web extras later, but not as the default path. |
| Codex | `json/file` + `keychain` + `oauth/api` + local usage logs: reads `CODEX_HOME/auth.json` / `~/.config/codex/auth.json` / `~/.codex/auth.json` or keychain, refreshes OpenAI OAuth, calls `chatgpt.com/backend-api/wham/usage`, adds `ccusage`. Evidence: `plugins/codex/plugin.js`, `docs/providers/codex.md`. | `web` + `cookies` + `cli`: OpenAI/Codex dashboard web scrape plus Codex CLI JSON-RPC/PTy, also local session JSONL cost scanning. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Different emphasis: OpenUsage trusts Codex auth JSON/keychain + official-ish usage endpoint; CodexBar mixes CLI and dashboard extras. | On Windows, keep auth.json/keychain-equivalent + local logs as primary. If dashboard extras matter, use an app-owned WebView2 profile for OpenAI rather than importing Edge/Chrome cookies. |
| Copilot | `keychain` + `json/file` + `oauth/api`: reads OpenUsage keychain, `gh` keychain, fallback `auth.json`; calls GitHub Copilot API. Evidence: `plugins/copilot/plugin.js`, `docs/providers/copilot.md`. | `oauth/api`: GitHub device flow token + `copilot_internal` API. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same family. OpenUsage leans on existing `gh auth` state; CodexBar models explicit device-flow/API mode. | Best Windows path: integrate with `gh auth` or direct device flow and store token in Credential Manager. Pure API provider; no web/session work needed. |
| Cursor | `sqlite` + `keychain` + `oauth/api` + `cookies`: reads desktop `state.vscdb` first, keychain fallback, refreshes OAuth, uses bearer APIs and cookie-backed web endpoints like Stripe/enterprise usage. Evidence: `plugins/cursor/plugin.js`, `docs/providers/cursor.md`. | `web` + `cookies`: browser cookies then stored WebKit session for Cursor web API. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Strong divergence. OpenUsage is desktop-auth/state driven; CodexBar is browser-cookie/web-session driven. | Windows should follow the OpenUsage model first: read Cursor local state DB + refresh token. Add WebView2 session fallback only for missing web-only fields. Do not depend on browser-cookie import. |
| Factory | `json/file` + `keychain` + `oauth/api`: reads `~/.factory/auth.encrypted` / `auth.json` or keychain, refreshes via WorkOS, calls Factory subscription usage API. Evidence: `plugins/factory/plugin.js`, `docs/providers/factory.md`. | `web` + `cookies` + `json/file` + local storage + stored tokens: cookies, stored tokens, local storage, WorkOS cookies. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same auth ecosystem, but CodexBar layers browser/local-storage import on top. | Start with local auth files + token refresh on Windows. If Factory later requires browser-only state, use WebView2 provider session and import localStorage/cookies from your own profile, not from external browsers. |
| Gemini | `json/file` + `oauth/api`: reads `~/.gemini/settings.json`, `~/.gemini/oauth_creds.json`, Gemini CLI OAuth client info; calls Cloud Code/Google quota APIs. Evidence: `docs/providers/gemini.md`, `plugins/gemini/plugin.js`. | `oauth/api`: Gemini CLI credentials with quota API and OAuth refresh. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Near-aligned. | Keep CLI credential files + OAuth refresh on Windows. This is already a good Windows-native architecture. |
| JetBrains AI Assistant | `file` only: reads local `AIAssistantQuotaManager2.xml` under IDE config roots. Evidence: `plugins/jetbrains-ai-assistant/plugin.js`, `docs/providers/jetbrains-ai-assistant.md`. | `file` only: reads local XML quota file from JetBrains config dirs. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Fully aligned. | Use local config/XML discovery only. This is one of the cleanest Windows ports. |
| Kilo | not present | `json/file` + `oauth/api` + `cli`: config/API key first, falls back to local CLI auth/session. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar-only. | If added, use config/API key and local CLI auth first. Good Windows candidate because it does not require browser scraping as the base flow. |
| Kimi | `json/file` + `oauth/api`: reads `~/.kimi/credentials/kimi-code.json`, refreshes at `auth.kimi.com`, calls Kimi usage API. Evidence: `plugins/kimi/plugin.js`, `docs/providers/kimi.md`. | `api`: token from `kimi-auth` cookie/manual entry or env, then Kimi billing API. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Different auth source: OpenUsage reuses CLI/local credential JSON; CodexBar expects cookie-derived token/API style. | On Windows prefer the local credential JSON / OAuth-refresh model if the Kimi desktop/CLI writes usable files. Manual cookie mode can be a fallback only. |
| Kimi K2 | not present | `api`: API key from settings/env to credits endpoint. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar-only. | Strong Windows candidate. Implement as direct API-key provider with Credential Manager storage. |
| Kiro | not present | `cli`: runs `kiro-cli chat --no-interactive "/usage"` and parses output. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar-only. | Windows approach should be CLI execution/parsing only. Avoid any browser work unless Kiro removes the CLI path. |
| MiniMax | `env` + `oauth/api`: reads `MINIMAX_*` env vars only, calls coding-plan remains API. Evidence: `plugins/minimax/plugin.js`, `docs/providers/minimax.md`. | `cookies` + `web` + local storage, with manual cookie/API hybrids: manual cookie header or browser cookies, local storage access token, coding-plan/remains web flow. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Large divergence. OpenUsage is API-key/env only; CodexBar is browser/manual-cookie centric. | On Windows, use API-key/env if the provider still supports it. If not, move to app-owned WebView2 login session. Do not make external browser cookie scraping the primary design. |
| Ollama | `web` + `cookies`: manual cookie header from provider secrets, scrape `https://ollama.com/settings`. Evidence: `plugins/ollama/plugin.js`, `docs/providers/ollama.md`. | `web` + `cookies`: browser-cookie settings page scrape, automatic/manual cookie source. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Similar output path. CodexBar has stronger cookie import UX; OpenUsage is manual-secret only. | Best Windows design: provider-specific WebView2 session for Ollama login, then scrape settings with that app-owned profile. Keep manual cookie header as fallback/import. |
| OpenCode | `web` + `cookies`: manual cookie header from env/provider secret/keychain, calls `https://opencode.ai/_server`, resolves workspace ID, reads subscription usage. Evidence: `plugins/opencode/plugin.js`. | `web` + `cookies`: dashboard cookies from opencode.ai with automatic/manual import. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same web source. OpenUsage currently lacks automatic browser import and provider docs page. | Same as Ollama: use an app-owned WebView2 login/session profile for OpenCode. Manual cookie fallback is fine; external browser import should stay optional. |
| OpenRouter | not present | `api`: API key from config/env to credits + key info endpoints. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar-only. | Excellent Windows candidate. Implement as direct API-key provider with Credential Manager storage. |
| Perplexity | `sqlite` + `web/api`: mines Perplexity macOS cache DB for bearer token, user-agent, device ID, then calls private REST APIs for groups, usage analytics, rate limits. Evidence: `plugins/perplexity/plugin.js`, `docs/providers/perplexity.md`. | not present | OpenUsage-only. | The current macOS cache-DB approach does not translate well. On Windows, prefer app-owned WebView2 login/session and then call the same web APIs from that session. |
| Synthetic | not present | `api`: API key from config/env. Evidence: `D:/usagebar/codexbar/docs/providers.md`, `Sources/CodexBarCore/Providers/Synthetic/*`. | CodexBar-only. | Simple Windows API-key provider. Good early candidate. |
| Vertex AI | not present | `oauth/api` + local logs: Google ADC OAuth plus Cloud Monitoring quota metrics; token cost scan from local Claude logs. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar-only. | Good Windows candidate. Use ADC / `gcloud auth application-default login` plus API calls; no browser dependency required. |
| Warp | not present | `api`: API token from settings/env to Warp GraphQL limits. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | CodexBar-only. | Strong Windows API-key/token provider. Implement directly with Credential Manager storage. |
| Windsurf | `sqlite` + `local process` + `oauth/api`: reads API key from local `state.vscdb`, probes running language server, falls back to Codeium cloud `GetUserStatus`. Evidence: `plugins/windsurf/plugin.js`, `docs/providers/windsurf.md`. | not present | OpenUsage-only. | Keep the current local SQLite + process probe strategy on Windows. It already matches the Windows-first architecture better than a browser model would. |
| Z.ai | `env` + `oauth/api`: API key from env, then quota/limit endpoints. Evidence: `plugins/zai/plugin.js`, `docs/providers/zai.md`. | `api`: API token from keychain or env to quota API. Evidence: `D:/usagebar/codexbar/docs/providers.md`. | Same API class; CodexBar adds keychain/config handling. | Implement as direct API-key/token provider with Credential Manager storage. Good Windows candidate. |

## Findings

1. `codexbar` is much more invested in browser-cookie and dashboard scraping flows.
   - This is visible for Amp, Cursor, Factory, MiniMax, Ollama, OpenCode, and Codex web extras.

2. `openusage` is stronger where local desktop/client auth already exists.
   - Claude, Codex, Cursor, Factory, Gemini, JetBrains, Kimi, Perplexity, Windsurf use local files, SQLite, keychain, or local process data directly.

3. Same provider often means different trust boundary.
   - Example: Cursor is desktop SQLite/keychain in `openusage`, but browser cookies/WebKit session in `codexbar`.
   - Example: Amp is CLI secrets/API in `openusage`, but browser cookies/settings HTML in `codexbar`.
   - Example: MiniMax is env API key in `openusage`, but browser/manual-cookie/local-storage in `codexbar`.

4. `codexbar` has the larger provider surface.
   - Extra providers there: Augment, Kilo, Kimi K2, Kiro, OpenRouter, Synthetic, Vertex AI, Warp.
   - Extra providers here: Perplexity, Windsurf.

5. OpenUsage doc/code drift exists in a few places.
   - `OpenCode` has a real plugin (`plugins/opencode/plugin.js`) but no matching `docs/providers/opencode.md`.
   - `README.md` provider list does not surface every plugin folder currently present.
   - `MiniMax` docs focus on API key flow; code matches env/API-key usage, while CodexBar has evolved toward cookie/web flows.

## Practical Takeaways For UsageBar

- If the goal is Windows-first parity, the fastest reusable `codexbar` ideas are the provider source models, not the implementation details.
- Low-risk ports from `codexbar` into this repo are providers that already use explicit APIs or local files: OpenRouter, Warp, Kimi K2, Vertex AI, maybe Kilo.
- Harder ports are cookie/web-session providers because CodexBar leans on macOS browser-cookie/WebKit infrastructure that does not translate directly.
- For overlapping providers, keep `openusage` local-auth implementations where they already work on Windows; only borrow `codexbar` browser/manual-cookie UX where local auth is unavailable.

## Windows Rollout Order

1. Ship/keep local-state providers first.
   - Claude
   - Codex
   - Cursor
   - Gemini
   - JetBrains AI Assistant
   - Windsurf
   - Antigravity

2. Ship direct API/token providers next.
   - Copilot
   - Z.ai
   - OpenRouter
   - Warp
   - Kimi K2
   - Vertex AI
   - Synthetic
   - Kilo

3. Then build one generic WebView2 session framework for dashboard-only providers.
   - Ollama
   - OpenCode
   - Perplexity
   - Factory if local auth proves insufficient
   - MiniMax if API-key path is insufficient
   - Amp only if CLI/API path breaks

4. Keep manual cookie import as fallback UX.
   - good for debugging
   - good for providers with unstable login flows
   - should not be the main Windows architecture

## Evidence Files Used

- `plugins/*/plugin.js`
- `docs/providers/*.md`
- `README.md`
- `D:/usagebar/codexbar/docs/providers.md`
- `D:/usagebar/codexbar/Sources/CodexBarCore/Providers/*`
