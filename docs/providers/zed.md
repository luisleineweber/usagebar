# Zed

> Uses a stored Zed dashboard `Cookie` header to show live billing spend through an embedded browser-backed request. When no billing cookie is configured, the provider falls back to local Zed-hosted telemetry totals.

## What this provider tracks

Primary path:

- Dashboard token spend in dollars
- Dashboard spend limit in dollars
- Billing payload update timestamp

Fallback path:

- Local Zed-hosted agent prompt count
- Input tokens
- Output tokens
- Cache read input tokens
- Cache write input tokens
- Models seen in the telemetry log

## Setup on Windows

1. Sign in at `https://dashboard.zed.dev/account`.
2. Open DevTools and capture the full `Cookie` request header from a `https://cloud.zed.dev/frontend/billing/usage` request.
3. Paste that cookie header into `Settings -> Providers -> Zed`.
4. Refresh the provider.

If the pasted cookie comes from an old browser session, the billing request can still return `401`. Re-capture the header from the live page if that happens.

If you skip the cookie setup, UsageBar falls back to the local Zed telemetry log instead of billing spend.

## Data source details

### Billing path

- **Endpoint:** `GET https://cloud.zed.dev/frontend/billing/usage`
- **Auth:** browser session via `Cookie` header
- **Runtime path:** hidden browser window loads `https://dashboard.zed.dev/account`, injects the captured cookies into the browser store, then fetches `https://cloud.zed.dev/frontend/billing/usage` with `credentials: "include"`
- **Observed payload shape:** `plan`, `current_usage.token_spend_in_cents`, `current_usage.token_spend.{spend_in_cents, limit_in_cents, updated_at}`, `portal_url`

### Fallback telemetry path

- **Credential target:** Windows generic credential `zed:url=https://zed.dev`
- **Telemetry log:** `%LOCALAPPDATA%\Zed\logs\telemetry.log`
- **Event used:** `Agent Thread Completion Usage Updated`
- **Model filter:** `model_provider: "zed.dev"` or `model` starting with `zed.dev/`

The telemetry event stream is cumulative per prompt update. UsageBar keeps the max observed token counters per `prompt_id` and sums those prompt totals across the log.

## Important limitation

The local Zed client credential is readable on Windows, but it does not authenticate the web billing endpoint directly on this machine. Billing spend therefore requires the dashboard cookie header. Without that cookie, the provider intentionally falls back to local telemetry instead of pretending it has spend data.

## Display

When the dashboard cookie is configured:

- `Source`: `Dashboard billing`
- `Spend`: dollar progress from current spend to spend limit
- `Limit`: dollar limit
- `Updated`: billing payload timestamp

When the dashboard cookie is missing:

- `Source`: `Local telemetry`
- `Prompts`, `Input`, `Output`, `Cache read`, `Cache write`, `Models`

## Common errors

- `Zed not signed in locally. Open Zed and sign in, then retry.`
- `Zed credential invalid. Open Zed and sign in again.`
- `Zed dashboard session expired or was rejected. Re-capture the Cookie header from a fresh /frontend/billing/usage request.`
- `Zed billing request failed (HTTP <status>). Try again later.`
- `Zed billing response invalid. Refresh the Cookie header or update UsageBar.`
- `Zed telemetry log missing. Use Zed Agent once, then retry.`
- `Zed telemetry format changed. Update UsageBar.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and host keychain API tests
- Remaining gap: automatic dashboard-session import is not implemented; billing spend still depends on a manually supplied dashboard `Cookie` header
