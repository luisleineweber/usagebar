# Mistral

> Uses Mistral's official Admin API with a dedicated Admin API key. Existing browser-session cookie credentials remain compatibility fallbacks.

## What It Tracks

- Current-month spend from `GET https://console.mistral.ai/api/admin/usage`
- Input, output, and cached token totals by billing payload
- Number of completion models with usage in the billing response
- Reported billing currency

## Setup

1. Create a dedicated Admin API key in Mistral Backoffice.
2. Open Settings -> Providers -> Mistral and save the key, or set `MISTRAL_ADMIN_API_KEY`.
3. Enable Mistral in Settings -> Providers.

Existing stored Cookie headers, `MISTRAL_COOKIE_HEADER`, and `MISTRAL_SESSION` remain supported after the preferred Admin API key sources. `MISTRAL_SESSION` is converted to an `ory_session_mistral=...` cookie.

## Displayed Lines

- `Spend`: computed current-month spend using the prices returned by Mistral
- `Input tokens`: paid input tokens
- `Output tokens`: paid output tokens
- `Cached tokens`: paid cached tokens when present
- `Models`: completion model count represented in the usage payload
- `Source`: `Mistral Admin API` or compatibility `Mistral admin billing session`
- `Auth source`: stored/Admin API environment key first, then stored/environment cookie fallback
- `Endpoint`: current-month admin billing usage URL

## Errors

- `Not logged in. Save a Mistral Admin API key or configure a cookie fallback.`
- `Mistral Admin API key invalid or unauthorized. Update the key and try again.`
- `Session expired. Update your Mistral cookie and try again.`
- `Usage request failed. Check your connection.`
- `Usage request failed (HTTP <status>). Try again later.`
- `Usage response invalid. Try again later.`

## Notes

- The Admin API is currently documented as public preview, so the provider remains experimental.
- Mistral currently reports spend/tokens but not a universal subscription quota limit in this payload, so UsageBar does not invent a max-usage progress bar for it.
