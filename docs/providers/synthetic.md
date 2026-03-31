# Synthetic

> Uses a stored Synthetic API key or `SYNTHETIC_API_KEY` to fetch quota data from the Synthetic quotas endpoint.

## What this provider tracks

- Primary quota usage from the first quota entry returned by the Synthetic API
- Plan or tier label when the API exposes one
- Optional reset timing from quota metadata

## Setup on Windows

Use either of these paths:

1. Open Settings -> Providers -> Synthetic and paste your API key.
2. Or set a persistent user environment variable:
   - `SYNTHETIC_API_KEY`

## Data source details

- **Endpoint:** `GET https://api.synthetic.new/v2/quotas`
- **Auth:** `Authorization: Bearer <api key>`
- **Payload tolerance:** UsageBar accepts several quota field variants such as direct percent-used values, `used + remaining`, or `limit + remaining`

The provider keeps v1 intentionally narrow: app-owned secret storage plus one direct HTTP call. It does not depend on browser cookies, local app state, or external CLI tooling.

## Display

- `Credits`: primary quota progress from the first parsed quota entry
- `Tier`: plan or tier label from the response, with the quota label as a fallback
- Plan text: same plan/tier label shown in the provider header

## Common errors

- `Synthetic API key missing. Save it in Setup or set SYNTHETIC_API_KEY.`
- `Synthetic API key invalid. Check Setup or SYNTHETIC_API_KEY.`
- `Synthetic request failed (HTTP <status>). Try again later.`
- `Synthetic response invalid. Try again later.`
- `Synthetic quota response missing usage data. Try again later.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and the host env allowlist test
- Remaining gap: real signed-in Windows validation with a live Synthetic API key
