# Z.ai

Tracks [Z.ai](https://z.ai) (Zhipu AI) usage quotas for GLM coding plans.

> These API endpoints are not documented in Z.ai's public API reference. They are used internally by the subscription management UI and work with both OAuth tokens and API keys.

## Overview

- **Protocol:** REST (plain JSON)
- **Base URL:** `https://api.z.ai/`
- **Auth:** API key via environment variable (`ZAI_API_KEY`, fallback `GLM_API_KEY`)
- **Session utilization:** percentage (0-100)
- **Weekly utilization:** percentage (0-100)
- **Web searches:** count-based (`used / limit`)
- **Reset periods:** 5 hours (session), 7 days (weekly), monthly (web searches, from subscription renewal date)

## Setup

1. [Subscribe to a GLM Coding plan](https://z.ai/subscribe) and get your API key from the [Z.ai console](https://z.ai/manage-apikey/apikey-list).
2. Create a persistent `ZAI_API_KEY` user environment variable.
3. Restart `UsageBar` so the desktop app can read the updated environment.
4. Enable the Z.ai provider in Settings and refresh.

PowerShell example:

```powershell
[Environment]::SetEnvironmentVariable("ZAI_API_KEY", "YOUR_API_KEY", "User")
```

Use `GLM_API_KEY` only when you already manage the same token under that older variable name. A one-off `$env:ZAI_API_KEY=...` only affects the current shell and will not be visible to a normally launched desktop app.

## Endpoints

### GET /api/biz/subscription/list

Returns the user's active subscription(s). Used to extract the plan name.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <api_key>` |
| Accept | yes | `application/json` |

#### Response

```json
{
  "code": 200,
  "data": [
    {
      "id": "169359",
      "customerId": "71321768207710758",
      "productName": "GLM Coding Max",
      "description": "-All Pro plan benefits\n-4x Pro plan usage...",
      "status": "VALID",
      "purchaseTime": "2026-01-12 16:55:13",
      "valid": "2026-02-12 16:55:13-2026-03-12 16:55:13",
      "autoRenew": 1,
      "initialPrice": 30.0,
      "actualPrice": 30.0,
      "currentPeriod": 2,
      "currentRenewTime": "2026-01-12",
      "nextRenewTime": "2026-02-12",
      "billingCycle": "monthly",
      "inCurrentPeriod": true,
      "paymentChannel": "STRIPE"
    }
  ],
  "success": true
}
```

Used fields:

- `productName` - plan display name (for example `GLM Coding Max`)
- `nextRenewTime` - monthly reset date for web search quota

### GET /api/monitor/usage/quota/limit

Returns session token usage and web search quotas.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <api_key>` |
| Accept | yes | `application/json` |

#### Response

```json
{
  "code": 200,
  "data": {
    "limits": [
      {
        "type": "TOKENS_LIMIT",
        "unit": 3,
        "number": 5,
        "usage": 800000000,
        "currentValue": 127694464,
        "remaining": 672305536,
        "percentage": 15,
        "nextResetTime": 1770648402389
      },
      {
        "type": "TIME_LIMIT",
        "unit": 5,
        "number": 1,
        "usage": 4000,
        "currentValue": 1828,
        "remaining": 2172,
        "percentage": 45,
        "usageDetails": [
          {
            "modelCode": "search-prime",
            "usage": 1433
          },
          {
            "modelCode": "web-reader",
            "usage": 462
          },
          {
            "modelCode": "zread",
            "usage": 0
          }
        ]
      }
    ]
  },
  "success": true
}
```

`TOKENS_LIMIT` fields:

- `usage` - total token limit
- `currentValue` - tokens consumed
- `remaining` - tokens remaining
- `percentage` - usage as percentage (0-100)
- `nextResetTime` - epoch milliseconds of next reset
- `unit: 3, number: 5` - 5-hour rolling period (`Session`)
- `unit: 6, number: 7` - 7-day rolling period (`Weekly`)

`TIME_LIMIT` fields:

- `usage` - total web search or reader call limit
- `currentValue` - calls consumed
- `remaining` - calls remaining
- `percentage` - usage as percentage (0-100)
- `usageDetails` - per-model breakdown (`search-prime`, `web-reader`, `zread`)
- `unit: 5, number: 1` - monthly period; when `nextResetTime` is absent the plugin falls back to the first day of the next UTC month

## Displayed Lines

| Line | Description |
|---|---|
| Session | Token usage as percentage (0-100%) with 5h reset timer |
| Weekly | Token usage as percentage (0-100%) with 7-day reset timer |
| Web Searches | Web search or reader call count (`used / limit`) |

## Errors

| Condition | Message |
|---|---|
| No API key | `No ZAI_API_KEY found. Set up environment variable first.` |
| 401/403 | `API key invalid. Check your Z.ai API key.` |
| HTTP error | `Usage request failed (HTTP {status}). Try again later.` |
| Network error | `Usage request failed. Check your connection.` |
| Invalid JSON | `Usage response invalid. Try again later.` |
