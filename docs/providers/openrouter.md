# OpenRouter

> Uses a stored OpenRouter API key or `OPENROUTER_API_KEY` to fetch account credits and key-rate data.

## What this provider tracks

- Account credits from `GET https://openrouter.ai/api/v1/credits`
- Optional key-level quota and request-rate detail from `GET https://openrouter.ai/api/v1/key`

## Setup on Windows

Use either of these paths:

1. Open Settings -> Providers -> OpenRouter and paste your API key.
2. Or set a persistent user environment variable:
   - `OPENROUTER_API_KEY=sk-or-v1-...`

Optional override:

- `OPENROUTER_API_URL` to point UsageBar at a different OpenRouter-compatible base URL for testing.

Get a key from:

- `https://openrouter.ai/settings/keys`

## Data source details

- **Primary endpoint:** `GET /credits`
- **Secondary endpoint:** `GET /key`
- **Auth:** `Authorization: Bearer <api key>`
- **Client header:** `X-Title: UsageBar`

The provider reads `/credits` first and treats `/key` as optional enrichment. If `/key` is slow or unavailable, credits still render and the request detail line falls back to `Unavailable`.

## Display

- `Credits`: dollar-based progress using `total_usage` over `total_credits`
- `Requests`: request-rate detail from `/key`, or a fallback key-credit summary / unavailable state
- Plan text: current remaining credit balance

## Common errors

- `OpenRouter API key missing. Save it in Setup or set OPENROUTER_API_KEY.`
- `OpenRouter API key invalid. Check Setup or OPENROUTER_API_KEY.`
- `OpenRouter request failed (HTTP <status>). Try again later.`
- `OpenRouter response invalid. Try again later.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and the host env allowlist test
- Remaining gap: real signed-in Windows validation with a live OpenRouter key
