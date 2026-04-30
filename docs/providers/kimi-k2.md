# Moonshot API Balance Legacy Provider

> Legacy hidden provider. New setups should use `Kimi Code (Moonshot)`, which now includes optional official Moonshot API balance.

This provider is no longer surfaced separately in Settings. It remains only as a compatibility implementation for older local plugin state.

This provider intentionally does not call `kimi-k2.ai`. The official Kimi Open Platform balance endpoint documented by Moonshot is `https://api.moonshot.ai/v1/users/me/balance`.

## What this provider tracks

- Available API balance
- Voucher balance
- Cash balance

## Setup on Windows

Use either of these paths:

1. Open Settings -> Providers -> Moonshot API Balance and paste your Kimi Open Platform API key.
2. Or set one of these persistent user environment variables:
   - `MOONSHOT_API_KEY`
   - `KIMI_API_KEY`
   - `KIMI_KEY`

## Data source details

- **Endpoint:** `GET https://api.moonshot.ai/v1/users/me/balance`
- **Auth:** `Authorization: Bearer <api key>`
- **Key source:** Kimi Open Platform / Moonshot API dashboard

Official response shape:

```json
{
  "code": 0,
  "data": {
    "available_balance": 49.58894,
    "voucher_balance": 46.58893,
    "cash_balance": 3.00001
  },
  "scode": "0x0",
  "status": true
}
```

## Display

- `Balance`: available API balance
- `Voucher balance`: voucher portion of the balance
- `Cash balance`: cash portion of the balance
- Plan text: current available API balance

## Common errors

- `Moonshot API key missing. Save it in Setup or set MOONSHOT_API_KEY.`
- `Moonshot API key invalid. Check Setup or MOONSHOT_API_KEY.`
- `Moonshot API balance request failed (HTTP <status>). Try again later.`
- `Moonshot API balance response invalid. Try again later.`

## Current Windows state

- Windows support state: `experimental`
- Contract coverage: focused plugin tests, provider-settings detail tests, and the host env allowlist test
- Remaining gap: real signed-in Windows validation with a live Moonshot API key
