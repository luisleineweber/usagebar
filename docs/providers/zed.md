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

1. Open `Settings -> Providers -> Zed`.
2. Click `Connect dashboard`.
3. Sign in to Zed in the opened dashboard window.
4. Navigate to the Zed AI Usage page. The route must include `/billing/usage`, for example `https://dashboard.zed.dev/org_<id>/billing/usage`.
5. UsageBar captures the dashboard cookies for the configured Zed domains, stores only the resulting `Cookie` header in the app credential vault, and closes the login window.
6. Refresh the provider.

UsageBar does not read or store email, password, form fields, or page content during guided login. It stores only the same dashboard `Cookie` header that the old manual setup required.

Manual fallback: open browser DevTools, select the `Network` tab, click the request named `usage`, then copy the request header named exactly `Cookie` from `Headers -> Request Headers`. Do not paste the `Set-Cookie` response header, the whole Headers panel, or the dashboard URL.

If the pasted cookie comes from an old browser session, the billing request can still return `401`. Re-capture the header from the live page if that happens.

If you skip the cookie setup, UsageBar falls back to the local Zed telemetry log instead of billing spend.

## Data source details

### Billing path

- **Usage endpoint:** `GET https://cloud.zed.dev/frontend/billing/usage`
- **Subscription endpoint:** `GET https://cloud.zed.dev/frontend/billing/subscriptions/current`
- **Auth:** browser session via `Cookie` header
- **Runtime path:** guided login captures dashboard cookies after `/billing/usage`; hidden browser window later loads `https://dashboard.zed.dev/account`, injects the captured cookies into the browser store, then fetches the billing endpoints with `credentials: "include"`
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
- `Auth source`: `Stored Cookie header`
- `Endpoint`: `https://cloud.zed.dev/frontend/billing/usage`
- `Spend`: dollar progress from current spend to spend limit, with reset countdown when `subscription.period.end_at` is available
- `Limit`: dollar limit
- `Updated`: billing payload timestamp

When the dashboard cookie is missing:

- `Source`: `Local telemetry`
- `Prompts`, `Input`, `Output`, `Cache read`, `Cache write`, `Models`
- `Billing`: `Dashboard cookie required for spend`

Local telemetry is a fallback for Zed-hosted agent activity only. It is not a billing-spend substitute.

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
- Remaining gap: Zed still has no official billing API/token path here; billing spend depends on a dashboard session cookie captured by guided login or manual fallback
