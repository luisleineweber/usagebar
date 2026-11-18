# Cursor

> Reverse-engineered, undocumented API. May change without notice.

## Overview

- **Protocol:** Connect RPC v1 (JSON over HTTP)
- **Base URL:** `https://api2.cursor.sh`
- **Service:** `aiserver.v1.DashboardService`
- **Auth provider:** Auth0 (via Cursor)
- **Client ID:** `KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB`
- **Amounts:** cents (divide by 100 for dollars)
- **Timestamps:** unix milliseconds (as strings)

## Plugin metrics

| Metric | Source field | Scope | Format | Notes |
|---|---|---|---|---|
| Credits | `GetCreditGrantsBalance` + `/api/auth/stripe.customerBalance` | overview | dollars | Combined total: active grant total + Stripe prepaid balance (negative `customerBalance`). Used stays based on grant usage. |
| Total usage | `planUsage.totalPercentUsed` | overview | percent (individual) / dollars (team) | Falls back to computed `(limit - remaining) / limit * 100` when `totalPercentUsed` is not finite. Free/individual payloads observed on 2026-03-06 may omit `limit`; plugin uses `totalPercentUsed` directly in that case. Team accounts use dollars format and still require `limit`. |
| Auto usage | `planUsage.autoPercentUsed` | detail | percent | Omitted when field is missing or non-finite |
| API usage | `planUsage.apiPercentUsed` | detail | percent | Omitted when field is missing or non-finite |
| Requests | `/api/usage` (enterprise) | overview | count | Enterprise accounts only; unchanged from previous behavior |
| On-demand | `spendLimitUsage` | detail | dollars | Only when individual or pooled limit > 0 |

### Usage history

The plugin also returns daily, per-model usage history for the last 30 local days (today included). It comes from `POST https://cursor.com/api/dashboard/get-filtered-usage-events`. History is extra data: when the event fetch fails, the plugin keeps the summary lines, omits `history`, and logs a warning. When a successful output has no `history`, the host keeps the last valid history as retained data. So the plugin omits history for every doubtful result instead of returning partial history.

Each entry covers one local calendar day. `periodStart` and `periodEnd` are RFC 3339 values with the local UTC offset, for example `2026-10-25T00:00:00+02:00` to `2026-10-26T00:00:00+01:00` in Europe/Berlin. The date part is the local date, so day groups in the local HTTP API and CLI show the correct day.

| History field | Source field | Meaning |
|---|---|---|
| `requests` | count of events | Number of usage events in the day and model bucket |
| `inputTokens` | `tokenUsage.inputTokens` | |
| `outputTokens` | `tokenUsage.outputTokens` | |
| `cacheReadTokens` | `tokenUsage.cacheReadTokens` | |
| `cacheCreationTokens` | `tokenUsage.cacheWriteTokens` | |
| `totalTokens` | sum of the four token fields | Set only when all four are known |
| `costUsd` | `tokenUsage.totalCents / 100` | **List-price token cost.** The token cost at the model vendor's API price. It is not the amount Cursor billed. |
| `chargedCostUsd` | `chargedCents / 100` | **Charged plan cost.** The amount Cursor deducted from the plan or charged. |

Rules:

- Events are grouped by local calendar day and `model`. An event without a model goes into a bucket without a model label.
- Every event must have a `timestamp` inside the requested window. When one event does not, day totals would be too low, so history is omitted.
- A bucket metric is set only when every event in the bucket reports a valid, non-negative value. Otherwise the metric stays unknown (omitted). A missing `chargedCents` is never treated as zero.
- `costUsd` and `chargedCostUsd` are never added together, and one is never used in place of the other.

**Event paging.** The request body is `{ page, pageSize, startDate, endDate }`. Page numbers start at 1, the page size is 500, and the dates are Unix milliseconds as strings. The request uses the session cookie and an `Origin: https://cursor.com` header (Cursor checks it on dashboard POST requests). The response is `{ totalUsageEventsCount, usageEventsDisplay: [...] }`.

- Paging stops at an empty page or a page shorter than the page size. A full page at the 40-page limit makes the window incomplete, so history is omitted.
- An empty object `{}` means a confirmed empty window. Any other response without `usageEventsDisplay` (for example an error envelope) is a failure.
- When `totalUsageEventsCount` changes between pages, or fewer events arrive than it reports, history is omitted.
- The endpoint has no stable event ID, and two real events can be identical. The reported total proves how many rows repeat, but not which rows. The plugin removes rows only when the raw row count is higher than `totalUsageEventsCount` and the repeats at page boundaries explain that excess exactly, with one possible overlap per boundary. In every other case history is omitted, because a guess could drop the wrong row and move usage to the wrong model. When the response has no total, no rows are removed.

**Time budget.** The host stops a probe after 30 seconds and discards its result. History paging must end 20 seconds after the probe starts. Each page uses the smaller of 15 seconds and the remaining budget as its timeout. The plugin does not start a page with less than 3 seconds left. When the budget runs out, the plugin returns the summary and omits history.

**Refresh schedule.** History changes slowly, so the plugin fetches it at most every 30 minutes. Between fetches it omits `history`, and the host shows the last valid history. The next fetch time is stored with the Cursor user ID in `usage-history-schedule.json` in the plugin data directory. A different signed-in user, or a stored time more than one day ahead, starts a fetch at once.

- After HTTP 429 the next fetch waits for `Retry-After` (delay seconds or an HTTP date), at least 5 minutes and at most 1 day. Without a usable header, it waits 30 minutes.
- When the time budget or the page limit runs out, the next fetch waits 30 minutes, because the same window would fail again.
- After other failures the next probe tries again.

**Enterprise flow** remains request-based via the REST `/api/usage` endpoint -- unchanged.

**Team detection**: an account is treated as "team" when `planName` is `"Team"`, or `spendLimitUsage.limitType` is `"team"`, or `spendLimitUsage.pooledLimit` is a positive number. Team accounts display Total usage in dollars; individual accounts display it as a percentage.

## Endpoints

### POST /aiserver.v1.DashboardService/GetCurrentPeriodUsage

Returns current billing cycle spend, limits, and percentage used.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <access_token>` |
| Content-Type | yes | `application/json` |
| Connect-Protocol-Version | yes | `1` |

#### Request

```json
{}
```

#### Response

```jsonc
{
  "billingCycleStart": "1768399334000",   // unix ms (string)
  "billingCycleEnd": "1771077734000",
  "planUsage": {
    "totalSpend": 23222,                  // cents — includedSpend + bonusSpend
    "includedSpend": 23222,               // cents — counted against plan limit
    "bonusSpend": 0,                      // cents — free credits from model providers
    "remaining": 16778,                   // cents — limit minus includedSpend
    "limit": 40000,                       // cents — plan included amount
    "remainingBonus": false,              // true when bonus credits still available
    "bonusTooltip": "...",
    "autoPercentUsed": 0,                 // auto-mode usage %
    "apiPercentUsed": 46.444,             // API/manual usage %
    "totalPercentUsed": 15.48             // combined %
  },
  "spendLimitUsage": {                    // on-demand budget (after plan exhausted)
    "totalSpend": 0,                      // cents
    "pooledLimit": 50000,                 // cents — team pool (team plans only, optional)
    "pooledUsed": 0,
    "pooledRemaining": 50000,
    "individualLimit": 10000,             // cents — per-user cap
    "individualUsed": 0,
    "individualRemaining": 10000,
    "limitType": "user"                   // "user" | "team"
  },
  "displayThreshold": 200,               // basis points
  "enabled": true,
  "displayMessage": "You've used 46% of your usage limit",
  "autoModelSelectedDisplayMessage": "...",
  "namedModelSelectedDisplayMessage": "..."
}
```

### POST /aiserver.v1.DashboardService/GetPlanInfo

Returns plan name, price, and included amount.

#### Headers

Same as above.

#### Request

```json
{}
```

#### Response

```json
{
  "planInfo": {
    "planName": "Ultra",
    "includedAmountCents": 40000,
    "price": "$200/mo",
    "billingCycleEnd": "1771077734000"
  }
}
```

### POST /aiserver.v1.DashboardService/GetUsageLimitPolicyStatus

Returns whether user is in slow pool, feature gates, and allowed models. Response undocumented.

### POST /aiserver.v1.DashboardService/GetUsageLimitStatusAndActiveGrants

Returns limit policy status plus any active credit grants. Response undocumented.

### GET /api/auth/stripe

Returns subscription and Stripe customer balance metadata from `cursor.com`.

#### Headers

| Header | Required | Value |
|---|---|---|
| Cookie | yes | `WorkosCursorSessionToken=<userId>%3A%3A<access_token>` |

#### Response (partial)

```json
{
  "membershipType": "ultra",
  "subscriptionStatus": "active",
  "customerBalance": -123456
}
```

`customerBalance` is in cents. Negative means customer credit/prepaid balance.

### POST https://cursor.com/api/dashboard/get-filtered-usage-events

Returns account usage events for a time window. See [Usage history](#usage-history) for paging and mapping.

#### Headers

| Header | Required | Value |
|---|---|---|
| Cookie | yes | `WorkosCursorSessionToken=<userId>%3A%3A<access_token>` |
| Origin | yes | `https://cursor.com` |
| Content-Type | yes | `application/json` |

#### Request

```json
{ "page": 1, "pageSize": 500, "startDate": "1792886400000", "endDate": "1795449000000" }
```

#### Response (partial)

```jsonc
{
  "totalUsageEventsCount": 2,
  "usageEventsDisplay": [
    {
      "timestamp": "1795435200000",          // unix ms (string)
      "model": "claude-4.5-sonnet",
      "kind": "USAGE_EVENT_KIND_INCLUDED_IN_PRO",
      "chargedCents": 4,                     // amount charged or deducted from the plan
      "owningUser": "...",                   // redacted in host logs
      "tokenUsage": {
        "inputTokens": 100,
        "outputTokens": 50,
        "cacheWriteTokens": 10,
        "cacheReadTokens": 5,
        "totalCents": 25                     // token cost at vendor list price
      }
    }
  ]
}
```

Numbers can arrive as numbers or numeric strings.

## Authentication

### Token Sources

OpenUsage reads Cursor auth in this order:

1. **Cursor Desktop SQLite** (preferred)
2. **Cursor CLI keychain** (fallback)

#### 1) Cursor Desktop SQLite (preferred)

Path: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`

```bash
sqlite3 ~/Library/Application\ Support/Cursor/User/globalStorage/state.vscdb \
  "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'"
```

| Key | Description |
|---|---|
| `cursorAuth/accessToken` | JWT bearer token |
| `cursorAuth/refreshToken` | Token refresh credential |
| `cursorAuth/cachedEmail` | Account email |
| `cursorAuth/stripeMembershipType` | Plan tier (e.g. `pro`, `ultra`) |
| `cursorAuth/stripeSubscriptionStatus` | Subscription status |

#### 2) Cursor CLI keychain (fallback)

OpenUsage reads Cursor CLI tokens from keychain:

- `cursor-access-token`
- `cursor-refresh-token`

To initialize CLI auth:

```bash
agent login
```

### Token Refresh

Access tokens are short-lived JWTs. The app refreshes before each request if expired, then persists the new access token back to the same source it was loaded from (SQLite or keychain).

```
POST https://api2.cursor.sh/oauth/token
Content-Type: application/json
```

```json
{
  "grant_type": "refresh_token",
  "client_id": "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB",
  "refresh_token": "<refresh_token>"
}
```

**Success:**

```json
{
  "access_token": "<new_jwt>",
  "id_token": "<id_token>",
  "shouldLogout": false
}
```

**Invalid/expired token:**

```json
{
  "access_token": "",
  "id_token": "",
  "shouldLogout": true
}
```

When `shouldLogout` is `true`, the refresh token is invalid and the user must re-authenticate via Cursor.

### Session Cookie (for `cursor.com` endpoints)

Some web endpoints (for example `/api/auth/stripe` and enterprise `/api/usage`) use a session cookie instead of bearer auth:

```
WorkosCursorSessionToken=<userId>%3A%3A<access_token>
```

`userId` is derived from JWT `sub` (e.g. `google-oauth2|user_abc` -> `user_abc`).
