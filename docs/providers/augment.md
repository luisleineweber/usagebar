# Augment

Windows state: experimental.

## Data source

UsageBar reads Augment credit usage from the signed-in web session:

1. `GET https://app.augmentcode.com/api/credits`
2. Optional `GET https://app.augmentcode.com/api/subscription`

The credits response provides used, remaining, and total credit values. The subscription response adds plan, account, organization, and billing-cycle reset details when available.

## Setup

1. Sign in at `https://app.augmentcode.com`.
2. Open the subscription or account page.
3. In DevTools > Network, copy the full request `Cookie` header from an authenticated `app.augmentcode.com` request.
4. Paste it into Augment setup in UsageBar, or set `AUGMENT_COOKIE_HEADER` before launching the app.

Do not paste `Set-Cookie`.

## Windows validation

- Contract coverage: focused plugin tests and provider-settings detail tests.
- Entitlement coverage: pending real signed-in Windows account validation.
- Current gap: browser-cookie auto import and Auggie CLI probing are not wired into the JS plugin host.
