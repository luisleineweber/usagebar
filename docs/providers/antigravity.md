# Antigravity

> Reverse-engineered from app bundle and language server binary. May change without notice.

Antigravity retains a Codeium-family local language server, but Antigravity 2.0 quota is tracked primarily through stored Google OAuth credentials and project-scoped Cloud Code calls. Once signed in, UsageBar can refresh quota while the IDE is closed; the local language server is a secondary compatibility path.

The preferred output matches Antigravity 2.0's shared pools: `Gemini session`, `Gemini weekly`, `Claude/GPT session`, and `Claude/GPT weekly`. The older per-model endpoint remains a detail fallback. Unknown quota is shown as unavailable, never as exhausted or full.

Provider detail output also includes `Source` so local diagnostics are visible:

- `Live Antigravity language server`
- `Cached live Antigravity language server`
- `Cloud Code quota summary`
- `Cloud Code fallback`
- `Antigravity language server without usable quota`

## Overview

- **Vendor:** Google (internal codename "Jetski")
- **Protocol:** Connect RPC v1 (JSON over HTTP) on local language server
- **Service:** `exa.language_server_pb.LanguageServerService`
- **Auth:** CSRF token from process args; Google OAuth access/refresh tokens from SQLite
- **Quota:** fraction (`0.0-1.0`, where `1.0` means 100% remaining)
- **Quota windows:** five-hour session and weekly baseline pools
- **Timestamps:** ISO 8601
- **Requires:** Antigravity IDE running for LS mode only; signed-in local credentials are enough for Cloud Code fallback after the IDE closes

## Discovery

The language server listens on a random localhost port. Three values must be discovered from the running process.

```bash
# 1. Find process and extract CSRF token
ps -ax -o pid=,command= | grep 'language_server_macos.*antigravity'
# Match: --app_data_dir antigravity OR path contains /antigravity/
# Extract: --csrf_token <token>
# Extract: --extension_server_port <port>  (HTTP fallback)

# 2. Find listening ports
lsof -nP -iTCP -sTCP:LISTEN -a -p <pid>

# 3. Probe each port to find the Connect-RPC endpoint
POST https://127.0.0.1:<port>/.../GetUnleashData -> first 200 OK wins
```

Port and CSRF token change on every IDE restart. The LS may use HTTPS with a self-signed cert.

## Headers (all local requests)

| Header                   | Required | Value                            |
| ------------------------ | -------- | -------------------------------- |
| Content-Type             | yes      | `application/json`               |
| Connect-Protocol-Version | yes      | `1`                              |
| x-codeium-csrf-token     | yes      | `<csrf_token>` from process args |

## Endpoints

### GetUserStatus (primary)

Returns plan info and model quota data in one call.

```text
POST http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/GetUserStatus
```

#### Request

```json
{
  "metadata": {
    "ideName": "antigravity",
    "extensionName": "antigravity",
    "ideVersion": "unknown",
    "locale": "en"
  }
}
```

The CSRF token authenticates the local request. When an API key is available from SQLite, OpenUsage includes it in `metadata.apiKey`.

#### Response

```jsonc
{
  "userStatus": {
    "planStatus": {
      "planInfo": {
        "planName": "Pro", // "Free" | "Pro" | "Teams" | "Ultra"
        "teamsTier": "TEAMS_TIER_PRO",
      },
    },
    "cascadeModelConfigData": {
      "clientModelConfigs": [
        {
          "label": "Gemini 3 Pro (High)",
          "modelOrAlias": { "model": "MODEL_PLACEHOLDER_M7" },
          "quotaInfo": {
            "remainingFraction": 1,
            "resetTime": "2026-02-07T14:23:01Z",
          },
        },
      ],
      "clientModelSorts": [
        {
          "groups": [
            {
              "modelLabels": ["Gemini 3 Pro (High)"],
            },
          ],
        },
      ],
    },
  },
}
```

`remainingFraction` is optional in practice. Missing fraction means quota is unknown, not empty.

### GetCommandModelConfigs (fallback)

Returns model configs without plan info. Used when `GetUserStatus` fails.

```text
POST http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/GetCommandModelConfigs
```

#### Request

```json
{
  "metadata": {
    "ideName": "antigravity",
    "extensionName": "antigravity",
    "ideVersion": "unknown",
    "locale": "en"
  }
}
```

#### Response

```jsonc
{
  "clientModelConfigs": [
    // same shape as GetUserStatus.userStatus.cascadeModelConfigData.clientModelConfigs
  ],
}
```

## Available Models

| Display Name                 | Internal ID             | Provider            |
| ---------------------------- | ----------------------- | ------------------- |
| Gemini 3 Flash               | 1018                    | Google              |
| Gemini 3 Pro (High)          | 1008                    | Google              |
| Gemini 3 Pro (Low)           | 1007                    | Google              |
| Claude Sonnet 4.5            | 333                     | Anthropic (proxied) |
| Claude Sonnet 4.5 (Thinking) | 334                     | Anthropic (proxied) |
| Claude Opus 4.6 (Thinking)   | `MODEL_PLACEHOLDER_M26` | Anthropic (proxied) |
| GPT-OSS 120B (Medium)        | 342                     | OpenAI (proxied)    |

Models are dynamic. OpenUsage reads labels and IDs from runtime responses rather than relying on a hardcoded list.

Non-Google models (Claude, GPT-OSS) are proxied through Codeium/Windsurf infrastructure because Antigravity uses the same LS binary family as Windsurf.

## Local SQLite Database

Antigravity stores auth credentials in a VS Code-compatible state database.

- **Path:** `~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb`
- **Table:** `ItemTable` (`key` TEXT, `value` TEXT)

### antigravityAuthStatus

```json
{
  "apiKey": "ya29.<token>",
  "email": "user@example.com",
  "name": "Test User"
}
```

`apiKey` is a Google OAuth access token. OpenUsage includes it in LS metadata when available and may also use it as a last-resort Bearer token for Cloud Code.

### jetskiStateSync.agentManagerInitState (protobuf)

Google OAuth tokens are also stored as a base64-encoded protobuf blob with access token, refresh token, and expiry timestamp.

```protobuf
message AgentManagerInitState {
  OAuthTokenInfo oauth_token = 6;
}
message OAuthTokenInfo {
  string access_token = 1;
  string token_type = 2;
  string refresh_token = 3;
  Timestamp expiry = 4;
}
message Timestamp {
  int64 seconds = 1;
}
```

OpenUsage decodes this with a minimal protobuf wire parser and uses the refresh token when Cloud Code returns auth failures.

### Token Refresh

```text
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id=REDACTED_GOOGLE_OAUTH_CLIENT_ID
&client_secret=REDACTED_GOOGLE_OAUTH_CLIENT_SECRET
&refresh_token=<refresh_token>
&grant_type=refresh_token
```

Response: `{ "access_token": "ya29...", "expires_in": 3599 }`

## Cloud Code API (primary)

UsageBar first resolves the account's Cloud AI Companion project. A quota response without this project is rejected because projectless model requests can falsely report `100%` remaining.

### loadCodeAssist

```text
POST <base>/v1internal:loadCodeAssist
Authorization: Bearer <access_token>
Content-Type: application/json

{"metadata":{"ideType":"ANTIGRAVITY"}}
```

UsageBar reads `cloudaicompanionProject` and the paid/current tier. Without a non-empty project, remote quota remains unavailable.

### retrieveUserQuotaSummary

```text
POST <base>/v1internal:retrieveUserQuotaSummary
Authorization: Bearer <access_token>
Content-Type: application/json

{"project":"<cloudaicompanionProject>"}
```

When all four semantic buckets parse, this endpoint supplies the Gemini and Claude/GPT session and weekly lines. Root/wrapped responses, camel/snake-case fields, and tagged remaining-fraction variants are accepted conservatively. Any missing bucket falls through to the model endpoint.

### fetchAvailableModels fallback

```text
POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels
Authorization: Bearer <access_token>
Content-Type: application/json
User-Agent: antigravity

{"project":"<cloudaicompanionProject>"}
```

Base URLs tried in order:

1. `https://daily-cloudcode-pa.googleapis.com`
2. `https://daily-cloudcode-pa.sandbox.googleapis.com`
3. `https://cloudcode-pa.googleapis.com`

#### Response

```jsonc
{
  "models": {
    "gemini-3-pro": {
      "displayName": "Gemini 3 Pro",
      "model": "gemini-3-pro",
      "quotaInfo": {
        "remainingFraction": 0.8,
        "resetTime": "2026-02-08T10:00:00Z",
      },
    },
  },
  "agentModelSorts": [
    {
      "groups": [
        {
          "modelIds": ["gemini-3-pro"],
        },
      ],
    },
  ],
}
```

HTTP 401 triggers one refresh-and-retry when a refresh token exists. HTTP 403 is treated as an account, region, or plan entitlement failure and does not trigger OAuth refresh. Throttling and transient host failures use bounded host fallback.

The response includes all provisioned models. OpenUsage filters out non-user-facing entries using:

1. `isInternal: true`
2. Empty `displayName`
3. A narrow blacklist for clearly internal or unsupported IDs

User-facing placeholder-backed IDs such as `MODEL_PLACEHOLDER_M9` and `MODEL_PLACEHOLDER_M12` must remain visible.

## Plugin Strategy

1. Read and decode `antigravityUnifiedStateSync.oauthToken` from SQLite.
2. Use a valid cached access token, valid SQLite access token, or one OAuth refresh attempt.
3. Call `loadCodeAssist` and require `cloudaicompanionProject`.
4. Prefer `retrieveUserQuotaSummary`; render only when all four session/weekly buckets parse.
5. Fall back to project-scoped `fetchAvailableModels` and preserve its model-family detail lines.
6. If remote quota is unavailable, probe the local language server:
   a. Discover the Antigravity LS process.
   b. Probe ports with `GetUnleashData`.
   c. Call `GetUserStatus`.
   d. Fall back to `GetCommandModelConfigs` when needed.
7. Parse LS quota carefully:
   a. Keep `remainingFraction` only when it is a valid numeric `0..1`.
   b. Keep `resetTime` only when it is usable.
   c. Use `clientModelSorts` ordering when present.
   d. Render grouped quota lines only.
8. Cache only fully parsed live LS output until its reset window; invalidate it afterward.
9. If neither remote nor local paths yield usable fractions, show an explicit unavailable/error state.
