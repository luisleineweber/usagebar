# Zed

> Uses a stored Zed dashboard `Cookie` header to show live billing spend through an embedded browser-backed request. When no billing cookie is configured, the provider falls back to local Zed-hosted telemetry totals.

## What this provider tracks

Primary path:

- Dashboard token spend in dollars
- Dashboard spend limit in dollars
- Billing payload update timestamp
- Billing period reset date when the subscription endpoint is available

Fallback path:

- Local Zed-hosted agent prompt count
- Input tokens
- Output tokens
- Cache read input tokens
- Cache write input tokens
- Models seen in the telemetry log

## Setup on Windows

1. Sign in at `https://dashboard.zed.dev/account`.
2. Open the Zed AI Usage page. In the screenshot, this is the dashboard route ending in `/billing/usage`, for example `https://dashboard.zed.dev/org_<id>/billing/usage`.
3. Open browser DevTools with `F12` or `Ctrl+Shift+I`, then select the `Network` tab.
4. Refresh the page if the request list is empty.
5. Click the request named `usage`. In the screenshot, it is selected in the Network request list and the Headers panel shows `:path /org_<id>/billing/usage`.
6. In `Headers -> Request Headers`, copy the full value of the `Cookie` header only. It is the long semicolon-separated line shown under `Cookie:`.
7. Paste that cookie header into `Settings -> Providers -> Zed -> Cookie header`.
8. Refresh the provider.

Copy the request header named exactly `Cookie`. Do not paste the `Set-Cookie` response header, the whole Headers panel, or the dashboard URL.

If the pasted cookie comes from an old browser session, the billing request can still return `401`. Re-capture the header from the live page if that happens.

If you skip the cookie setup, UsageBar falls back to the local Zed telemetry log instead of billing spend.

## Data source details

### Billing path

- **Usage endpoint:** `GET https://cloud.zed.dev/frontend/billing/usage`
- **Subscription endpoint:** `GET https://cloud.zed.dev/frontend/billing/subscriptions/current`
- **Auth:** browser session via `Cookie` header
- **Runtime path:** hidden browser window loads `https://dashboard.zed.dev/account`, injects the captured cookies into the browser store, then fetches the billing endpoints with `credentials: "include"`
- **Observed payload shape:** `plan`, `current_usage.token_spend_in_cents`, `current_usage.token_spend.{spend_in_cents, limit_in_cents, updated_at}`, `portal_url`
- **Observed subscription shape:** `subscription.period.{start_at,end_at}` for the current billing window; `end_at` is used as the spend reset date

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
- `Spend`: dollar progress from current spend to spend limit, with reset countdown when `subscription.period.end_at` is available
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
