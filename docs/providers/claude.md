# Claude Code

> Reverse-engineered, undocumented API. May change without notice.

## Overview

- **Protocol:** REST (plain JSON)
- **Base URL:** `https://api.anthropic.com`
- **Auth provider:** `platform.claude.com` (OAuth 2.0)
- **Client ID:** `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
- **Beta header required:** `anthropic-beta: oauth-2025-04-20`
- **Utilization:** integer percentage (0-100)
- **Credits:** cents (divide by 100 for dollars)
- **Timestamps:** ISO 8601 (response), unix milliseconds (credentials file)

## Endpoints

### GET /api/oauth/usage

Returns rate limit windows and optional extra credits.

#### Headers

| Header         | Required | Value                   |
| -------------- | -------- | ----------------------- |
| Authorization  | yes      | `Bearer <access_token>` |
| Accept         | yes      | `application/json`      |
| Content-Type   | yes      | `application/json`      |
| anthropic-beta | yes      | `oauth-2025-04-20`      |

#### Response

```jsonc
{
  "five_hour": {
    "utilization": 25, // % used in 5h rolling window
    "resets_at": "2026-01-28T15:00:00Z",
  },
  "seven_day": {
    "utilization": 40, // % used in 7-day window
    "resets_at": "2026-02-01T00:00:00Z",
  },
  "seven_day_opus": {
    // separate weekly Opus limit (optional, plan-dependent)
    "utilization": 0,
    "resets_at": "2026-02-01T00:00:00Z",
  },
  "seven_day_fable": {
    // separate weekly Fable limit (optional, plan-dependent; null when absent)
    "utilization": 12,
    "resets_at": "2026-02-01T00:00:00Z",
  },
  "extra_usage": {
    // on-demand overage credits (optional)
    "is_enabled": true,
    "used_credits": 500, // cents spent
    "monthly_limit": 10000, // cents cap (0 = unlimited)
    "currency": "USD",
  },
}
```

All windows are enforced simultaneously — hitting any limit throttles the user.

UsageBar shows the `Fable` bar only when `seven_day_fable` has a numeric `utilization`. A `null` or missing window shows no bar; it is never shown as 0 %. Other product windows (Claude Design, routines) are not shown.

## Authentication

### Token Location

**Primary:** local Claude Code keychain entry `Claude Code-credentials`.

**Fallback:** `~/.claude/.credentials.json`

```jsonc
{
  "claudeAiOauth": {
    "accessToken": "<jwt>", // OAuth access token (Bearer)
    "refreshToken": "<token>",
    "expiresAt": 1738300000000, // unix ms
    "scopes": ["..."],
    "subscriptionType": "pro",
    "rateLimitTier": "...",
  },
}
```

Claude Code can leave stale legacy credential files behind after moving the current session into the keychain, so UsageBar prefers a usable keychain value before reading the legacy file. Both locations use the same JSON structure.

**Signed-in fallback metadata:** `~/.claude.json`

```jsonc
{
  "oauthAccount": {
    "organizationName": "Example Org",
    "billingType": "prepaid",
  },
  "primaryApiKey": "sk-ant-api03-...",
}
```

`~/.claude.json` is useful as a signed-in/account-state fallback when the legacy OAuth file is missing, but `primaryApiKey` is **not** a drop-in replacement for the OAuth bearer token used by `/api/oauth/usage`. OpenUsage should only treat it as account metadata plus a local-usage fallback hint unless `claudeAiOauth` is also present there.

### Claude web fallback

UsageBar can use a stored `claude.ai` Cookie header when local OAuth credentials are missing. The header must include `sessionKey=sk-ant-...`.

When configured, UsageBar calls:

- `GET https://claude.ai/api/organizations`
- `GET https://claude.ai/api/organizations/{org_id}/usage`
- Best-effort `GET https://claude.ai/api/organizations/{org_id}/overage_spend_limit`

This mirrors CodexBar's web/API probing in a Windows-friendly manual-cookie form. Local OAuth credentials are still preferred; the web fallback is used only when OAuth credentials are unavailable and no managed profile is selected. It is disabled during OAuth backoff. Organization names do not identify subscription plans. The web result leaves the plan unknown. Required web requests report transport, HTTP, and invalid-response errors. The organizations response must be an array. Usage and overage responses must be non-array objects. An invalid required response throws an error; an invalid optional overage response is ignored. The overage request remains best effort, except for authentication and rate-limit errors.

### Optional Microsoft Edge import

On Windows, Settings can import Claude's approved `sessionKey` cookie from an explicitly selected Microsoft Edge profile. The control is disabled by default and appears only after browser import is enabled for Claude.

- The compiled policy reads only `sessionKey` for `claude.ai`.
- The result returns redacted counts and diagnostic codes, never cookie values.
- The imported cookie header is written directly to UsageBar's DPAPI-protected provider secret store.
- Unsupported Edge encryption, a locked database, or no matching session leaves guided login and manual cookie entry available.

### Managed account profiles

Settings can import the current Claude Code login into a managed profile. The profile receives a
stable UUID. When selected, probes read only `account:<profileId>:authJson` from the protected
provider secret store. A missing or invalid profile fails instead of switching to another login.

The profile UUID also scopes cached snapshots, local history, quota notifications, and surface pins.

### Token Refresh

Access tokens are short-lived JWTs. Refreshed proactively 5 minutes before expiration, or reactively on 401/403.

```
POST https://platform.claude.com/v1/oauth/token
Content-Type: application/json
```

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "<refresh_token>",
  "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  "scope": "user:profile user:inference user:sessions:claude_code user:mcp_servers"
}
```

```jsonc
{
  "access_token": "<new_jwt>",
  "refresh_token": "<new_refresh_token>", // may be same as previous
  "expires_in": 3600, // seconds
}
```

### HTTP 429 handling

OAuth usage and token refresh responses save separate per-profile retry deadlines in plugin data. Usage holds survive token rotation and credential replacement. Token identity does not prove an account change. Managed profiles keep separate holds. Startup and manual refresh respect these holds. Retry-After supports seconds and HTTP dates. An active refresh hold skips token refresh. A still-valid access token can request usage, including within the five-minute expiry buffer. Expired credentials keep the refresh hold visible. Each probe attempts token refresh at most once.

A usage hold returns HTTP 429. A refresh hold returns HTTP 429 when the access token is expired or missing. A valid access token can still return OAuth usage during a refresh hold. Both OAuth holds block shared web cookie reads and web requests. An organization can contain multiple users, so an organization match does not prove the same account owns both sessions. UsageBar has no verified user identity binding between the selected OAuth token and the shared web session. It does not join metadata from `~/.claude.json` to a token from another record. Managed profiles never read shared cookies.

The earlier test records with `oauthAccount` embedded beside `claudeAiOauth` were synthetic, not evidence of a real credential format. The authentication documentation does not establish that format or a cross-session user binding. See [Claude Code authentication](https://code.claude.com/docs/en/authentication). No embedded identity or `organizationId` alias is used to authorize web fallback.

Web HTTP 429 responses save a separate per-instance retry deadline. The same Retry-After rules apply. Probes do not repeat web requests before that deadline, when the web path is used without OAuth credentials. OAuth backoff blocks the web path entirely.

The tray retains successful data within the current session. It does not load the separate usage API disk cache on startup. A first-probe error therefore shows an error card, even if the usage API has an older snapshot. A 429 does not remove session data.

#### Wait time

Each hold (usage, refresh, and web) counts its own consecutive HTTP 429 responses. The wait is the longer of two values:

- The backoff: 5 minutes for the first 429, then 10, 20, and at most 30 minutes.
- The Retry-After value, capped at 60 minutes.

Only a success of the same kind resets the count: OAuth usage for the usage hold, a token refresh for the refresh hold, and a web probe whose requests all succeed (including the optional overage request) for the web hold. An expired hold does not reset it. A 429 from a request that was in flight when the hold started does not add to the count; it can only make the hold longer.

Each request reads its hold record once, directly before it is sent. That one record decides whether the request may go out, and it is the only record that the request's success may clear. A hold written after that read is kept, even if the clock changed.

Holds stay in each build's plugin data directory. Installed and dev builds keep separate holds.

No credential record carries a verified account identity, and usage holds survive token rotation and credential replacement. If you switch the Claude Code login during a hold, the new login keeps the hold until its stored end. That end is at most 60 minutes after the hold was recorded.

#### Hold records

A hold record stores `retryAt`, `streak`, and `recordedAt`. It contains no tokens and no account data. A record from an earlier version that stores only `retryAt` counts as one 429. Its remaining wait is capped at 60 minutes.

UsageBar logs and discards a record that is not valid JSON, is not an object, has non-finite times, or ends more than 60 minutes after `recordedAt`. If the system clock moves back during a hold, the remaining wait restarts once from the new time. It does not grow by the size of the clock change. Each read takes the record before the clock, so a record written just before the read is not mistaken for a clock change.
