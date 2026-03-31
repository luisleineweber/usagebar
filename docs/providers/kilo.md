# Kilo

> Uses a stored Kilo API key or `KILO_API_KEY` to fetch usage from Kilo's documented tRPC batch endpoint.

## What this provider tracks

- Primary Kilo credit or pass usage from the Kilo API response
- Plan or tier label when the pass-state payload exposes one
- Optional reset timing from the Kilo pass state

## Setup on Windows

Use either of these paths:

1. Open Settings -> Providers -> Kilo and paste your API key.
2. Or set a persistent user environment variable:
   - `KILO_API_KEY`

Current limitation:

- CLI-session fallback from `~/.local/share/kilo/auth.json` is intentionally deferred in this Windows-first build. v1 is API-key only.

## Data source details

- **Endpoint base:** `https://app.kilo.ai/api/trpc`
- **Procedures:** `user.getCreditBlocks`, `kiloPass.getState`, `user.getAutoTopUpPaymentMethod`
- **Auth:** `Authorization: Bearer <api key>`
- **Transport:** single tRPC batch GET request

The provider keeps the first Windows rollout intentionally narrow: one stored secret or env var plus one direct API call. It does not yet read local CLI auth files even though CodexBar documents that future fallback path.

## Display

- `Credits`: dollar-based progress from Kilo pass usage when available, otherwise credit-block balance usage
- `Plan`: tier or pass label from the pass-state payload
- Plan text: same plan/tier label shown in the provider header

## Common errors

- `Kilo API key missing. Save it in Setup or set KILO_API_KEY.`
- `Kilo API key invalid. Refresh KILO_API_KEY.`
- `Kilo API endpoint not found. Verify the tRPC batch path.`
- `Kilo API unavailable (HTTP <status>). Try again later.`
- `Kilo request failed (HTTP <status>). Try again later.`
- `Kilo response invalid. Try again later.`
- `Kilo response missing usage data. Try again later.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and the host env allowlist test
- Remaining gaps: real signed-in Windows validation with a live Kilo API key, plus the deferred CLI-session fallback
