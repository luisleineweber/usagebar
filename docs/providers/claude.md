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

Direct UsageBar-owned refresh and recovery are Windows-only in this build. Linux and macOS reject before any direct refresh request. The refresh endpoint must use HTTPS.

Claude Code owns its local sign-in. UsageBar never updates that source or sends its refresh token.
When you import a profile, UsageBar links the source to the account and organization verified by
Claude's OAuth profile response. The source is the same credentials file or credential store entry
used for the import. Account metadata from a separate file cannot verify the link.

When the imported token is near expiry or fails with HTTP 401, UsageBar checks the linked source.
It saves a valid replacement only after verifying the same account and organization, then uses it for
usage. If the source is missing or expired, run Claude Code once. UsageBar picks up the updated login
on the next probe. A selected profile never uses a different login or a shared web cookie.

Older imports can link automatically if the access tokens match or Claude verifies both identities.
For an older import that cannot prove its identity, select **Link current Claude Code login** on that
profile in Settings and confirm. UsageBar verifies the current Claude Code account and keeps the
profile ID and selection. **Import current login** points to the selected older profile first, even
if the login already has another profile. If no older profile is selected, an email match takes
priority over an organization match. When more than one older profile matches, choose the correct
profile in Settings and use its link action. If UsageBar cannot save the profile details when
linking, it restores the previous sign-in.

A check that finds no update can retry once after usage HTTP 401. Temporary account verification
errors allow usage with a still-valid saved token. Verification HTTP 429 gives account verification
its own retry time. It does not set the OAuth usage, refresh, or web hold.

Direct refresh requires a separate UsageBar-owned managed credential document with
`usagebarCredentialOwner: "usagebar"`. Missing or unknown ownership stays with Claude Code. Do not add
this field to a copy of a Claude Code login. This change adds no separate login flow or user setting.
For explicitly owned documents, refresh runs five minutes before expiry or once after usage HTTP 401. A usage HTTP 403 does not start a refresh.
The host serializes each refresh chain across runtimes and UsageBar processes. It preserves the full
credential document in protected recovery storage before it replaces the main credential. A write
failure is visible. A later runtime or process replays recovery before it sends another refresh
request. If recovery storage fails, the host still attempts a verified main-store write. It reports unsaved credentials only if both writes fail. Successful credential removal or replacement cancels pending state. A failed credential deletion keeps the profile available for retry. Other provider writes use the same store lock, and unrelated refresh chains remain available.

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

The saved `expiresAt` belongs to the saved access token. When a refresh response has no positive `expires_in`, UsageBar saves `expiresAt: null` with the new token. The next probe then refreshes proactively, and a later HTTP 401 is not treated as a confirmed expiry.

### Error causes

The probe keeps these causes separate:

| Cause                     | Response                                                                                                                                  | Message                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Expired sign-in           | Usage HTTP 401, and the token's known expiry time has passed or the `authentication_error` message starts with "OAuth token has expired." | ``Token expired. Run `claude` to log in again.``                                                           |
| Rejected sign-in          | Other usage HTTP 401 after the refresh attempt, for example a revoked token                                                               | `Invalid token: Claude rejected the sign-in (HTTP 401). …`                                                 |
| Refused refresh grant     | Refresh HTTP 400/401 with `invalid_grant`                                                                                                 | ``Session expired. Run `claude` to log in again.``                                                         |
| Invalid OAuth config      | Custom `refreshUrl` in `~/.usagebar/config.json` is not https on a domain in `plugin.json` `httpDomains`, or has a port outside 1–65535   | `Claude OAuth config invalid: refreshUrl must use https on …`                                              |
| Missing OAuth scope       | Usage HTTP 403 `permission_error` with "scope requirement" in its message                                                                 | `Invalid token: Claude login lacks the OAuth scope required for usage. …`                                  |
| Refused refresh scope     | Refresh HTTP 400/401 with `invalid_scope`                                                                                                 | `Invalid token: Claude refused the requested OAuth scopes. …`                                              |
| Other refresh rejection   | Refresh HTTP 400/401 with another or no error code                                                                                        | `Token refresh rejected (HTTP <status>). …`                                                                |
| Denied access             | Other usage HTTP 403                                                                                                                      | `Usage request denied (HTTP 403). …`                                                                       |
| Temporary refresh failure | Refresh network error, or an unexpected refresh status, followed by usage HTTP 401                                                        | `Token refresh failed. Check your connection.` or `Token refresh failed (HTTP <status>). Try again later.` |
| Invalid refresh response  | Refresh 2xx without a usable `access_token`, followed by usage HTTP 401                                                                   | `Provider response invalid: Claude token refresh returned no access token. …`                              |
| Usage network failure     | The usage HTTP request throws                                                                                                             | `Usage request failed. Check your connection.`                                                             |
| Usage server failure      | Other usage non-2xx status                                                                                                                | `Usage request failed (HTTP <status>). Try again later.`                                                   |
| Rate limit                | HTTP 429 from usage or refresh                                                                                                            | See [HTTP 429 handling](#http-429-handling).                                                               |

After a failed sync, a usage HTTP 401 on a Claude Code import asks the user to run Claude Code. The message claims expiry only when the expiry time or response confirms it.

A failed or rejected refresh does not stop the probe while the current access token can still be valid. The probe then tries usage with the current token and reports the refresh problem only if usage returns HTTP 401. A rejected refresh for a token whose expiry time has passed ends the probe at once. An invalid OAuth config ends the probe before any request. Logs record known provider error codes and types; any other value is logged as `other`. Local failures, such as a failed write of the retry deadline, keep their own error and are not reported as connection failures.

### HTTP 429 handling

OAuth usage and native token refresh responses save separate per-profile retry deadlines in plugin data. Managed profiles keep separate holds. Startup and manual refresh respect these holds. Retry-After supports seconds and HTTP dates. An active refresh hold skips token refresh. A still-valid access token can request usage, including within the five-minute expiry buffer. Expired credentials keep the refresh hold visible. Each probe attempts token rotation at most once. Credential-save and unsaved errors remain visible if a hold changes during the transaction.

A usage hold returns HTTP 429. A refresh hold returns HTTP 429 when the access token is expired or missing, or when OAuth usage rejects it with HTTP 401 or 403 before its recorded expiry. A valid access token can still return OAuth usage during a refresh hold. Both OAuth holds block shared web cookie reads and web requests. An organization can contain multiple users, so an organization match does not prove the same account owns both sessions. UsageBar has no verified user identity binding between the selected OAuth token and the shared web session. It does not join metadata from `~/.claude.json` to a token from another record. Managed profiles never read shared cookies.

The earlier test records with `oauthAccount` embedded beside `claudeAiOauth` were synthetic, not evidence of a real credential format. The authentication documentation does not establish that format or a cross-session user binding. See [Claude Code authentication](https://code.claude.com/docs/en/authentication). No embedded identity or `organizationId` alias is used to authorize web fallback.

Web HTTP 429 responses save a separate per-instance retry deadline. The same Retry-After rules apply. Probes do not repeat web requests before that deadline, when the web path is used without OAuth credentials. OAuth backoff blocks the web path entirely.

The tray retains successful data within the current session. It does not load the separate usage API disk cache on startup. A first-probe error therefore shows an error card, even if the usage API has an older snapshot. A 429 does not remove session data.

#### Wait time

Each hold (usage, refresh, web, and account verification) counts its own consecutive HTTP 429 responses. The wait is the longer of two values:

- The backoff: 5 minutes for the first 429, then 10, 20, and at most 30 minutes.
- The Retry-After value, capped at 60 minutes.

Only a valid success of the same kind resets the count. For usage, the response body must be a JSON object. `{}` counts. Arrays, strings, numbers, and `null` keep the count. For refresh, the native host must return a usable access token. For web, all requests must succeed, including the optional overage request. For account verification, the native sync must return a verified replacement token. Successful usage does not clear verification backoff. A 2xx response that fails validation and an expired hold both keep the count. A 429 from a request already in flight when the hold started can extend the hold without adding to the count.

Each request or native credential operation reads its hold record before it starts. That record decides whether the operation can start and is the only record that its success can clear. A hold written after that read is kept, even if the clock changed. Each web request checks the web hold again, so a hold that starts during an earlier web request stops the rest of the web probe.

The host runs at most one probe per provider instance. It trims the instance id, and an empty or blank id counts as the default instance, the same way the plugin reads it. A probe that passes its timeout can still be inside a blocking host call. The next probe of that instance waits until the earlier one ends, or reports an error if it does not end within the probe timeout.

Holds stay in each build's plugin data directory. Installed and dev builds keep separate holds. The one-probe-per-instance guard works only inside one process. Two processes that share a data directory, such as dev builds from two worktrees, can clear each other's new hold. The result is extra HTTP 429 requests, not lost data.

Holds belong to the probe instance. Usage holds survive token rotation and credential replacement. If you switch the Claude Code login during a hold, the new login keeps the hold until its stored end. That end is at most 60 minutes after the hold was recorded.

#### Hold records

A hold record stores `retryAt`, `streak`, and `recordedAt`. It contains no tokens and no account data. A record from an earlier version that stores only `retryAt` counts as one 429. Its remaining wait is capped at 60 minutes.

UsageBar logs and discards a record that is not valid JSON, is not an object, has non-finite times, or ends more than 60 minutes after `recordedAt`. If the system clock moves back before `recordedAt` during a hold, the full hold restarts once from the new time. It does not grow by the size of the clock change. If the clock moves back but stays at or after `recordedAt`, the stored `retryAt` stays. Each read takes the record before the clock, so a record written just before the read is not mistaken for a clock change.
