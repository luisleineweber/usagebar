# Factory (Droid)

> Reverse-engineered, undocumented API. May change without notice.

## Overview

- **Protocol:** REST (JSON)
- **Base URL:** `https://api.factory.ai`
- **Auth:** stored Factory API key, or WorkOS session from the local droid login (`api.workos.com`)
- **Client ID:** `client_01HNM792M5G5G1A2THWPXKFMXB`
- **Token counts:** integers (raw token counts)
- **Timestamps:** unix milliseconds
- **Billing period:** ~27 days (monthly)

## Endpoints

### GET /api/organization/subscription/usage?useCache=true

Returns token usage for the current billing period. UsageBar sends the same request for both credential sources.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <api_key>` or `Bearer <access_token>` |
| Content-Type | yes | `application/json` |
| Accept | no | `application/json` |

#### Response

```jsonc
{
  "usage": {
    "startDate": 1770623326000,         // billing period start (unix ms)
    "endDate": 1772956800000,           // billing period end (unix ms)
    "standard": {
      "userTokens": 0,                  // user's token usage
      "orgTotalTokensUsed": 5000000,    // org total tokens used
      "orgOverageUsed": 0,              // overage tokens used
      "basicAllowance": 20000000,       // base allowance
      "totalAllowance": 20000000,       // total (base + bonus)
      "orgOverageLimit": 0,             // overage limit
      "usedRatio": 0.25                 // usage ratio (0-1)
    },
    "premium": {
      "userTokens": 0,
      "orgTotalTokensUsed": 0,
      "orgOverageUsed": 0,
      "basicAllowance": 0,
      "totalAllowance": 0,
      "orgOverageLimit": 0,
      "usedRatio": 0
    }
  },
  "source": "cache",                    // "cache" or "live"
  "cacheUpdated": false
}
```

### Plan Detection

UsageBar does not infer a Factory subscription name from token allowances. The endpoint currently exposes usage buckets, not a stable public plan contract, so the provider renders `Standard` and optional `Premium` usage lines without a plan badge.

UsageBar renders token progress only when Factory returns a positive `totalAllowance`. An absent `standard` or `premium` bucket, or an explicit `totalAllowance` of `0`, means the plan has no quota for that bucket. If no bucket has a positive allowance, UsageBar shows `No usage data` instead of creating a fake zero-limit progress bar.

Progress uses `orgTotalTokensUsed`, so the bar shows the organization total for the billing period, not only the tokens of the key owner.

UsageBar never turns a malformed response into usage data. The probe fails with the `providerResponse` category when:

- the body is not a JSON object, or `usage` is missing or not an object (for example an array)
- a present bucket is not an object
- `totalAllowance` in a present bucket is missing, not a number (for example the string `"20000"`), or negative
- a bucket with a positive allowance has a missing, non-numeric, or negative `orgTotalTokensUsed` (`Usage response missing token counts`)

### Error mapping

| Response | Result | Category |
|---|---|---|
| 401 with a stored API key | `Factory API key was rejected (HTTP 401)`. No refresh and no fallback to the local droid login. | `credentialInvalid` |
| 403 with a stored API key | `Factory API key cannot read subscription usage (HTTP 403)`. The key has no access to this organization usage. | `credentialInvalid` |
| Stored key with inner whitespace or control characters | `Stored Factory API key is malformed`. No request is sent. | `credentialInvalid` |
| Credential vault cannot be opened | `Could not read the stored Factory API key ...` | `credentialUnavailable` |
| Credential vault read fails | `Could not read the stored Factory API key ...` | `credentialUnreadable` |
| 401/403 with the local droid login | One WorkOS refresh and retry, then `Token expired`. | `credentialExpired` |
| 429 | `Factory rate limit reached (HTTP 429)` | `unknown` |
| Other non-2xx or network failure | `Usage request failed ...` | `unknown` |
| Malformed body (see above) | `Usage response invalid ...` or `Usage response missing ...` | `providerResponse` |

Settings shows Factory as signed out after a credential category, even while an API key is stored, so the user can replace or remove the key.

The `GET /api/billing/limits` endpoint (5-hour, weekly, and monthly token-rate windows) is not used yet.

## Authentication

### Source precedence

1. **Stored Factory API key (Windows app only).** Save it in Settings > Factory > API key. The field masks the key on screen. UsageBar stores it as the provider secret `apiKey` in the Windows-protected local secret store. When a key is saved, UsageBar sends only that key as `Authorization: Bearer <api_key>` to `api.factory.ai`. It does not read the local droid auth files or keychain.
2. **Local droid login.** Used only when no API key is saved. Remove the key in Settings to return to this source.

The API key source is strict. A rejected key or a credential vault read failure is shown as an error. UsageBar does not silently switch to the local droid login, because that login can belong to another account or organization.

UsageBar trims surrounding whitespace from the stored key and rejects a key with inner whitespace or control characters before it sends a request. The key never appears in plugin logs or error messages. The host masks the values of credential request headers in its logged response preview, so an error body that echoes the submitted key does not put it in the log, whatever the key format. Pattern redaction also masks `fk-` values in logged bodies and log messages.

On macOS and Linux, Settings does not offer the API key field. The `keyring` dependency has no native backend there in this build, so a saved key could not be read back. Those platforms use the local droid login only.

Use this source for a machine without a local droid login, such as a machine where only the API key from Factory settings is available. UsageBar does not read `FACTORY_API_KEY` from the environment or `~/.factory/.env`.

### Token Location

Lookup order for the local droid login:

1. `~/.factory/auth.v2.file` plus `~/.factory/auth.v2.key` (current droid / Factory v2 store)
2. `~/.factory/auth.encrypted` (legacy file store)
3. `~/.factory/auth.json` (older legacy file store)
4. OS keychain entry (when droid uses keyring-backed storage)

```jsonc
{
  "access_token": "<WorkOS JWT>",       // ~1329 chars, 7-day lifetime
  "refresh_token": "<token>"            // 25-char WorkOS session token
}
```

### v2 encrypted store

`auth.v2.file` is an AES-256-GCM envelope and `auth.v2.key` is the matching base64 key. UsageBar now decrypts that pair first, parses the same auth JSON payload shape, and writes refreshed tokens back into the encrypted v2 file.

### JWT Payload Structure

```jsonc
{
  "exp": 1738900000,                    // expiry (unix seconds)
  "org_id": "org_xxx",                  // organization ID
  "email": "user@example.com",
  "roles": ["owner"]
}
```

### Token Refresh

Access tokens have a 7-day lifetime. Refreshed when within 24 hours of expiry or on 401/403.

```
POST https://api.workos.com/user_management/authenticate
Content-Type: application/x-www-form-urlencoded
```

```
grant_type=refresh_token
&refresh_token=<refresh_token>
&client_id=client_01HNM792M5G5G1A2THWPXKFMXB
```

#### Response

```jsonc
{
  "access_token": "<new_jwt>",
  "refresh_token": "<new_refresh_token>",
  "user": { ... },
  "organization_id": "org_xxx"
}
```

## Prerequisites

The droid CLI must be installed and authenticated:

```bash
# Install droid CLI (if not already installed)
# Then authenticate:
droid
# Follow OAuth flow in browser
```

This creates auth data in the droid auth store (file and/or keychain, depending on droid version/configuration).

## Windows setup

With an API key:

1. Create a Factory API key in Factory settings.
2. Open UsageBar Settings > Factory, paste the key into **API key**, and save it.
3. Enable the Factory provider and refresh.

With the local droid login:

1. Install the `droid` CLI and complete sign-in once with `droid`.
2. Prefer the current store: confirm that both `~/.factory/auth.v2.file` and `~/.factory/auth.v2.key` now exist.
3. Legacy fallback still works if only `~/.factory/auth.encrypted` or `~/.factory/auth.json` exists.
4. Restart `UsageBar` if it was already open.
5. Enable the Factory provider in Settings and refresh.

Current local evidence on this machine: Windows validation is still marked `experimental` until a real signed-in v2-store capture is recorded in this fork.
