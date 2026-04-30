# Warp

> Endpoint provenance: the host is legitimate (`app.warp.dev`), but `graphql/v2?op=GetRequestLimitInfo` appears to be an internal app GraphQL operation rather than Warp's documented public Oz API. Warp's public API docs document `/api/v1/agent/run` and related Oz API flows.

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

This endpoint is not documented in Warp's public API reference. UsageBar keeps this provider `experimental` because it depends on a reverse-engineered request-limit operation. If Warp publishes an official usage/limits endpoint, this provider should move to that contract.

Sources:

- [Warp API & SDK quickstart](https://docs.warp.dev/reference/api-and-sdk/quickstart)
- [Warp API rate limiting](https://docs.warp.co/rate-limiting)

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
- Remaining gaps: real signed-in Windows validation with a live Warp token, plus migration to an official usage endpoint if Warp documents one
