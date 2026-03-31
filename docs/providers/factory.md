# Factory (Droid)

> Reverse-engineered, undocumented API. May change without notice.

## Overview

- **Protocol:** REST (JSON)
- **Base URL:** `https://api.factory.ai`
- **Auth provider:** WorkOS (`api.workos.com`)
- **Client ID:** `client_01HNM792M5G5G1A2THWPXKFMXB`
- **Token counts:** integers (raw token counts)
- **Timestamps:** unix milliseconds
- **Billing period:** ~27 days (monthly)

## Endpoints

### POST /api/organization/subscription/usage

Returns token usage for the current billing period.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <access_token>` |
| Content-Type | yes | `application/json` |
| Accept | no | `application/json` |

#### Request Body

```json
{
  "useCache": true
}
```

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
      "basicAllowance": 0,              // 0 for Pro, >0 for Max/Enterprise
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

Plan is inferred from `standard.totalAllowance`:

| Allowance | Plan |
|---|---|
| 200M+ | Max |
| 20M+ | Pro |
| >0 | Basic |

Premium tokens (`premium.totalAllowance > 0`) are only available on Max/Enterprise plans.

## Authentication

### Token Location

Lookup order in this fork:

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

1. Install the `droid` CLI and complete sign-in once with `droid`.
2. Prefer the current store: confirm that both `~/.factory/auth.v2.file` and `~/.factory/auth.v2.key` now exist.
3. Legacy fallback still works if only `~/.factory/auth.encrypted` or `~/.factory/auth.json` exists.
4. Restart `UsageBar` if it was already open.
5. Enable the Factory provider in Settings and refresh.

Current local evidence on this machine: Windows validation is still marked `experimental` until a real signed-in v2-store capture is recorded in this fork.
