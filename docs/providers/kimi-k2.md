# Kimi K2

> Uses a stored Kimi K2 API key or supported env vars to fetch credits from the Kimi K2 credits endpoint.

## What this provider tracks

- Consumed credits
- Remaining credits
- Optional average tokens per request when the API exposes it

## Setup on Windows

Use either of these paths:

1. Open Settings -> Providers -> Kimi K2 and paste your API key.
2. Or set one of these persistent user environment variables:
   - `KIMI_K2_API_KEY`
   - `KIMI_API_KEY`
   - `KIMI_KEY`

## Data source details

- **Endpoint:** `GET https://kimi-k2.ai/api/user/credits`
- **Auth:** `Authorization: Bearer <api key>`
- **Fallbacks:** if JSON omits remaining credits, UsageBar also checks the `X-Credits-Remaining` response header

The provider scans several common response shapes for consumed credits, remaining credits, and optional average-token metadata so it can tolerate small schema changes without immediately breaking.

## Display

- `Credits`: progress from consumed over total credits
- `Average tokens`: optional detail line; `Unavailable` if the API does not expose the field
- Plan text: current remaining credit count

## Common errors

- `Kimi K2 API key missing. Save it in Setup or set KIMI_K2_API_KEY.`
- `Kimi K2 API key invalid. Check Setup or KIMI_K2_API_KEY.`
- `Kimi K2 request failed (HTTP <status>). Try again later.`
- `Kimi K2 response invalid. Try again later.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and the host env allowlist test
- Remaining gap: real signed-in Windows validation with a live Kimi K2 API key
