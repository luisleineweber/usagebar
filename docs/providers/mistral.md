# Mistral

> Uses a stored Mistral admin Cookie header, with `MISTRAL_COOKIE_HEADER` or `MISTRAL_SESSION` as fallbacks, to fetch current-month La Plateforme usage and billing totals.

## What It Tracks

- Current-month spend from `GET https://admin.mistral.ai/api/billing/v2/usage`
- Input, output, and cached token totals by billing payload
- Number of completion models with usage in the billing response
- Reported billing currency

## Setup

1. Sign in at `https://admin.mistral.ai/organization/usage`.
2. Open DevTools -> Network and reload the usage page.
3. Copy the full `Cookie` request header from the usage request.
4. Open Settings -> Providers -> Mistral and paste the header, or set `MISTRAL_COOKIE_HEADER`.
5. Enable Mistral in Settings -> Providers.

`MISTRAL_SESSION` is also accepted as a convenience input and is converted to an `ory_session_mistral=...` cookie.

## Displayed Lines

- `Spend`: computed current-month spend using the prices returned by Mistral
- `Input tokens`: paid input tokens
- `Output tokens`: paid output tokens
- `Cached tokens`: paid cached tokens when present
- `Models`: completion model count represented in the usage payload

## Errors

- `Not logged in. Save a Mistral Cookie header or set MISTRAL_COOKIE_HEADER.`
- `Session expired. Update your Mistral cookie and try again.`
- `Usage request failed. Check your connection.`
- `Usage request failed (HTTP <status>). Try again later.`
- `Usage response invalid. Try again later.`

## Notes

- This provider stays `experimental` because it depends on a signed-in admin web session rather than a documented public usage API.
- Mistral currently reports spend/tokens but not a universal subscription quota limit in this payload, so UsageBar does not invent a max-usage progress bar for it.
