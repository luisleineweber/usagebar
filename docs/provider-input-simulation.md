# Provider Input Simulation Guide

This guide documents, for every provider in `plugins/`, what local inputs UsageBar reads today and whether you can test the provider by faking those inputs.

Scope:
- `Fake local input` means recreating the file, SQLite row, env var, or stored secret that the plugin reads before it calls a remote API.
- `Works fully` means local replay is usually enough to make the plugin produce meaningful output.
- `Works partially` means local replay can get the plugin past login/session discovery, but live HTTP/account entitlements still control the final usage output.
- `No current path` means the plugin is a placeholder or synthetic test provider, not a real provider implementation.

Safety:
- Prefer plugin tests over editing your real home directory. The test harness in [plugins/test-helpers.js](/D:/UsageBar/usagebar/plugins/test-helpers.js) is the safest way to fake inputs.
- If you do manual local replay, back up the original file first.
- Several plugins refresh or rewrite auth files after a successful probe. Your fake file may be overwritten.
- Windows-only reminder: some providers in this repo still read macOS/Linux paths because their Windows implementation is not finished.

## Matrix

| Provider | Local inputs UsageBar reads | Fake local input? | Notes |
| --- | --- | --- | --- |
| `alibaba` | None | No current path | Placeholder plugin only. |
| `amp` | `~/.local/share/amp/secrets.json` | Works partially | Local file can fake signed-in state, but usage still comes from Amp HTTP. |
| `antigravity` | `~/AppData/Roaming/Antigravity/User/globalStorage/state.vscdb` on Windows, `pluginDataDir/auth.json`, local LS discovery | Works partially | You can fake auth DB/state file, but live LS/HTTP still drives real usage. |
| `augment` | None | No current path | Placeholder plugin only. |
| `claude` | `~/.claude/.credentials.json`, `~/.claude.json`, keychain, local `ccusage` runner | Works partially | File replay can fake signed-in state; remote OAuth usage and `ccusage` still matter for realistic output. |
| `codex` | `$CODEX_HOME/auth.json`, `~/.config/codex/auth.json`, `~/.codex/auth.json`, keychain, local `ccusage` runner | Works partially | File replay can fake auth/account shape; realistic usage usually depends on `ccusage`. |
| `copilot` | `~/AppData/Roaming/GitHub CLI/hosts.yml`, `GH_CONFIG_DIR/hosts.yml`, keychain, `pluginDataDir/auth.json`, `gh auth token` | Works partially | You can fake the host file and cached token file, but final usage comes from GitHub HTTP. |
| `cursor` | `~/AppData/Roaming/Cursor/User/globalStorage/state.vscdb`, keychain | Works partially | SQLite/keychain replay can fake session discovery, but billing/usage still comes from Cursor HTTP. |
| `factory` | `~/.factory/auth.encrypted`, `~/.factory/auth.json`, keychain | Works partially | File replay can fake login and refresh state; real usage still comes from HTTP. |
| `gemini` | `~/.gemini/settings.json`, `~/.gemini/oauth_creds.json`, Gemini CLI `oauth2.js` install path | Works partially | Local files can fake OAuth setup, but quota/plan still come from Google HTTP. |
| `jetbrains-ai-assistant` | IDE quota XML under `~/AppData/Roaming/JetBrains/.../options/AIAssistantQuotaManager2.xml` or `~/AppData/Roaming/Google/...` | Works fully | This plugin is local-file driven. Replaying the XML is the main test path. |
| `kilo` | None | No current path | Placeholder plugin only. |
| `kimi` | `~/.kimi/credentials/kimi-code.json` | Works partially | Local credential replay can fake login; usage still comes from HTTP. |
| `kimi-k2` | None | No current path | Placeholder plugin only. |
| `kiro` | None | No current path | Placeholder plugin only. |
| `minimax` | `MINIMAX_API_KEY`, `MINIMAX_API_TOKEN`, `MINIMAX_CN_API_KEY` env vars | Works partially | No file path today; you can only fake env-based auth locally. Usage still comes from HTTP. |
| `mock` | None | Works fully | Built-in self-test provider. Data is hardcoded in the plugin. |
| `ollama` | Stored provider secret `cookieHeader` | Works partially | Manual secret can fake signed-in session, but usage still comes from Ollama web HTTP. |
| `opencode` | Stored provider secret `cookieHeader`, `OPENCODE_COOKIE_HEADER`, keychain fallback | Works partially | Cookie replay can fake the web session, but billing data still comes from OpenCode HTTP. |
| `opencode-go` | `~/.local/share/opencode/auth.json`, `~/.local/share/opencode/opencode.db` | Works fully | Main output is derived from local auth + SQLite history. |
| `openrouter` | None | No current path | Placeholder plugin only. |
| `perplexity` | macOS cache DB paths only: `~/Library/Containers/.../Cache.db` and `~/Library/Caches/.../Cache.db` | Works partially | Local cache replay can fake session discovery, but billing/rate-limit data still comes from HTTP. |
| `synthetic` | None | No current path | Placeholder plugin only. |
| `vertex-ai` | None | No current path | Placeholder plugin only. |
| `warp` | None | No current path | Placeholder plugin only. |
| `windsurf` | `~/AppData/Roaming/Windsurf/User/globalStorage/state.vscdb`, `~/AppData/Roaming/Windsurf - Next/User/globalStorage/state.vscdb` | Works partially | SQLite replay can fake account discovery; quota still comes from Windsurf HTTP. |
| `zai` | `ZAI_API_KEY`, `GLM_API_KEY` env vars | Works partially | No file path today; auth is env-only and usage comes from HTTP. |

## Provider Details

### `alibaba`
- Current implementation: placeholder that always throws.
- Local replay path: none.
- Manual testing outcome: not possible without first implementing the real provider.

### `amp`
- Local input read: `~/.local/share/amp/secrets.json`.
- What to fake: the local CLI secrets file shape expected by Amp.
- Limitation: the plugin still fetches usage over HTTP, so a fake file alone cannot prove real quota parsing end to end.

### `antigravity`
- Local inputs read:
- `~/AppData/Roaming/Antigravity/User/globalStorage/state.vscdb` on Windows.
- `pluginDataDir/auth.json` as a local cached token file.
- Local LS discovery via `ctx.host.ls.discover(...)`.
- What to fake:
- The state DB rows that contain auth/session values.
- The cached `pluginDataDir/auth.json` file.
- Limitation: even with fake auth files, the provider still talks to a live LS/HTTP endpoint for actual usage.

### `augment`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `claude`
- Local inputs read:
- `~/.claude/.credentials.json`
- `~/.claude.json`
- keychain fallback
- local `ccusage` query
- What to fake:
- A credential file with `claudeAiOauth.accessToken`
- An account file with `oauthAccount`
- Limitation:
- Remote Claude usage still requires valid OAuth data.
- Some output paths come from `ccusage`, so file replay alone does not cover everything.

### `codex`
- Local inputs read:
- `$CODEX_HOME/auth.json`
- `~/.config/codex/auth.json`
- `~/.codex/auth.json`
- keychain fallback
- local `ccusage` query
- What to fake:
- An auth file with the expected token/account structure.
- Optional `CODEX_HOME` if you want to redirect the read path without editing your real home folder.
- Limitation: realistic usage often depends on `ccusage`, not only the auth file.

### `copilot`
- Local inputs read:
- `~/AppData/Roaming/GitHub CLI/hosts.yml`
- `GH_CONFIG_DIR/hosts.yml`
- OpenUsage keychain cache
- `pluginDataDir/auth.json`
- `gh auth token` fallback
- What to fake:
- `hosts.yml` to control active-account detection.
- `pluginDataDir/auth.json` to fake a cached token.
- Limitation: final usage still comes from `https://api.github.com/copilot_internal/user`.

### `cursor`
- Local inputs read:
- `~/AppData/Roaming/Cursor/User/globalStorage/state.vscdb` on Windows.
- keychain token fallback.
- What to fake:
- SQLite rows for access/refresh tokens.
- Limitation: usage/billing still comes from Cursor HTTP.

### `factory`
- Local inputs read:
- `~/.factory/auth.encrypted`
- `~/.factory/auth.json`
- keychain fallback
- What to fake:
- Either auth file with access/refresh token payloads.
- Limitation: real usage still comes from HTTP after auth is loaded.

### `gemini`
- Local inputs read:
- `~/.gemini/settings.json`
- `~/.gemini/oauth_creds.json`
- Gemini CLI `oauth2.js` install path
- Windows paths include:
- `~/AppData/Roaming/npm/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js`
- `~/AppData/Roaming/npm/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js`
- What to fake:
- `settings.json` with `authType: "oauth-personal"` or omit it.
- `oauth_creds.json` with access and refresh token fields.
- `oauth2.js` containing `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`.
- Limitation: the plan/quota still comes from Google HTTP endpoints.

### `jetbrains-ai-assistant`
- Local inputs read:
- JetBrains or Google IDE options XML under `.../options/AIAssistantQuotaManager2.xml`.
- Windows roots include:
- `~/AppData/Roaming/JetBrains`
- `~/AppData/Roaming/Google`
- What to fake:
- The quota XML file itself. This is the best provider for pure local replay.
- Limitation: none for the main quota parsing path. This provider is intentionally local-data driven.

### `kilo`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `kimi`
- Local inputs read:
- `~/.kimi/credentials/kimi-code.json`
- What to fake:
- The credential JSON file with access and/or refresh tokens.
- Limitation: actual usage still comes from HTTP.

### `kimi-k2`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `kiro`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `minimax`
- Local inputs read:
- `MINIMAX_API_KEY`
- `MINIMAX_API_TOKEN`
- `MINIMAX_CN_API_KEY`
- What to fake:
- Set env vars before launching UsageBar.
- Limitation:
- This provider has no file-based auth path today.
- All usage still comes from HTTP, so env replay only gets you past auth configuration.

### `mock`
- Current implementation: hardcoded self-test output.
- Local replay path: not needed.
- Manual testing outcome: use this for pure UI validation, not provider-auth simulation.

### `ollama`
- Local inputs read:
- provider secret `cookieHeader`
- What to fake:
- Save a fake or captured cookie header through the app settings.
- Limitation: actual usage still comes from the Ollama web settings page over HTTP.

### `opencode`
- Local inputs read:
- provider secret `cookieHeader`
- `OPENCODE_COOKIE_HEADER`
- keychain fallback service `OpenCode Cookie Header`
- optional workspace override in app settings
- What to fake:
- The cookie header secret or env var.
- Workspace ID if you need to steer which team is read.
- Limitation: billing usage still comes from OpenCode HTTP.

### `opencode-go`
- Local inputs read:
- `~/.local/share/opencode/auth.json`
- `~/.local/share/opencode/opencode.db`
- What to fake:
- `auth.json` with an `opencode-go` key entry.
- SQLite history rows in `opencode.db` `message` table with `providerID`, `role`, `cost`, and `time.created`.
- Limitation: this is one of the best fully local replay targets in the repo.

### `openrouter`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `perplexity`
- Local inputs read:
- `~/Library/Containers/ai.perplexity.mac/Data/Library/Caches/ai.perplexity.mac/Cache.db`
- `~/Library/Caches/ai.perplexity.mac/Cache.db`
- What to fake:
- A macOS cache DB row containing the cached `/api/user` request bytes.
- Limitation:
- This path is macOS-only in the current repo.
- Even with a fake cache DB, actual balance/rate-limit values still come from HTTP.

### `synthetic`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `vertex-ai`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `warp`
- Current implementation: placeholder that always throws.
- Local replay path: none.

### `windsurf`
- Local inputs read:
- `~/AppData/Roaming/Windsurf/User/globalStorage/state.vscdb`
- `~/AppData/Roaming/Windsurf - Next/User/globalStorage/state.vscdb`
- What to fake:
- SQLite rows for `windsurfAuthStatus`.
- Limitation: daily/weekly quota values still come from Windsurf HTTP, so file replay is only a login/session shim.

### `zai`
- Local inputs read:
- `ZAI_API_KEY`
- `GLM_API_KEY`
- What to fake:
- Set env vars before launching UsageBar.
- Limitation:
- This provider has no file-based auth path today.
- Usage still comes from HTTP.

## Best Candidates For Manual Local Replay

If your goal is “change an input file and see UsageBar react” without needing a paid account, start here:

1. `jetbrains-ai-assistant`
2. `opencode-go`
3. `mock`
4. `claude` or `codex` for signed-in-state simulation only
5. `cursor` or `windsurf` for state-DB discovery only

## Best Candidates For Automated Fixture Tests

If your goal is strong regression coverage without real subscriptions, use:

1. plugin unit tests with [plugins/test-helpers.js](/D:/UsageBar/usagebar/plugins/test-helpers.js)
2. fake auth files/SQLite rows for local discovery
3. mocked `ctx.host.http.request(...)` responses for remote usage payloads

That split matches how the repo already tests most real providers today.
