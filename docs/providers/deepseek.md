# DeepSeek

> Uses a stored DeepSeek API key or `DEEPSEEK_API_KEY` to fetch API balance from DeepSeek's balance endpoint.

## What this provider tracks

- Total API balance
- Paid / topped-up balance
- Granted balance
- Whether the balance is currently available for API calls

## Setup on Windows

Use either of these paths:

1. Open Settings -> Providers -> DeepSeek and paste your API key.
2. Or set a persistent user environment variable:
   - `DEEPSEEK_API_KEY`
   - `DEEPSEEK_KEY`

Get a key from:

- `https://platform.deepseek.com/api_keys`

## Data source details

- **Endpoint:** `GET https://api.deepseek.com/user/balance`
- **Auth:** `Authorization: Bearer <api key>`
- **Dashboard:** `https://platform.deepseek.com/usage`

The provider prefers the USD balance when DeepSeek returns multiple currencies, then falls back to the first balance entry.

## Display

- `Balance`: current API balance
- `Paid balance`: topped-up balance
- `Granted balance`: granted balance
- `API availability`: shown when DeepSeek reports a positive balance that is unavailable for API calls
- Plan text: current balance, or a top-up prompt for zero balance

DeepSeek's balance endpoint returns remaining account balance, not a subscription quota cap or used/max token allowance. UsageBar renders it as text instead of a progress bar so the UI does not imply a fake maximum.

## Common errors

- `DeepSeek API key missing. Save it in Setup or set DEEPSEEK_API_KEY.`
- `DeepSeek API key invalid. Check Setup or DEEPSEEK_API_KEY.`
- `DeepSeek balance request failed (HTTP <status>). Try again later.`
- `DeepSeek balance response invalid. Try again later.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and the host env allowlist test
- Remaining gap: real signed-in Windows validation with a live DeepSeek key
