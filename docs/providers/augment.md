# Augment

Windows state: experimental.

## Data source

UsageBar can detect local Auggie auth from either:

1. `AUGMENT_SESSION_AUTH`
2. `~/.augment/session.json`

Those are the official Auggie session JSON sources created by `auggie login` / `auggie token print`. They prove local Auggie auth, but they do not currently replace the dashboard credit-balance source.

UsageBar reads Augment credit usage from the signed-in web session:

1. `GET https://app.augmentcode.com/api/credits`
2. Optional `GET https://app.augmentcode.com/api/subscription`

The credits response normally provides used, remaining, and total credit values. The subscription response adds plan, account, organization, and billing-cycle reset details when available. UsageBar renders a progress bar only when the response exposes a real max through `used + remaining` or explicit available/used fields; partial used-only responses render as text.

## Setup

1. Run `auggie login` if you use Auggie locally. UsageBar can detect the local session from `~/.augment/session.json`.
2. For dashboard credit usage, sign in at `https://app.augmentcode.com`.
3. Open the subscription or account page.
4. In DevTools > Network, copy the full request `Cookie` header from an authenticated `app.augmentcode.com` request.
5. Paste it into Augment setup in UsageBar, or set `AUGMENT_COOKIE_HEADER` before launching the app.

Do not paste `Set-Cookie`.

## Windows validation

- Contract coverage: focused plugin tests and provider-settings detail tests.
- Entitlement coverage: pending real signed-in Windows account validation.
- Current gap: local Auggie session detection is wired, but browser-cookie auto import and Auggie CLI credit-summary execution are not wired into the JS plugin host.
