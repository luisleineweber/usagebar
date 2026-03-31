# Warp

> Uses a stored Warp token or supported env vars to fetch request limits from Warp's GraphQL endpoint.

## What this provider tracks

- Metered request-limit usage
- Optional next refresh time when Warp returns it
- Simple plan badge: `Metered` or `Unlimited`

## Setup on Windows

Use either of these paths:

1. Open Warp -> Settings -> Platform -> API Keys, create a key, then paste it into Settings -> Providers -> Warp.
2. Or set one of these persistent user environment variables:
   - `WARP_API_KEY`
   - `WARP_TOKEN`

## Data source details

- **Endpoint:** `POST https://app.warp.dev/graphql/v2?op=GetRequestLimitInfo`
- **Auth:** `Authorization: Bearer <token>`
- **Client headers:** `x-warp-client-id: warp-app`, `User-Agent: Warp/1.0`
- **Operation:** `GetRequestLimitInfo`

This v1 implementation intentionally limits itself to `requestLimitInfo`. It does not yet model Warp bonus-credit grants or richer account metadata.

## Display

- `Requests`: progress from used over request limit
- `Plan`: `Metered` or `Unlimited`

## Common errors

- `Warp token missing. Save it in Setup or set WARP_API_KEY.`
- `Warp token invalid. Check Setup or WARP_API_KEY.`
- `Warp request failed (HTTP <status>). Try again later.`
- `Warp API error: <message>`
- `Warp response invalid. Try again later.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and the host env allowlist test
- Remaining gap: real signed-in Windows validation with a live Warp token
