# Perplexity

> Experimental Windows path. Uses a signed-in web billing session via a manual Cookie header or matching env vars.

## Overview

- **Protocol:** HTTPS (JSON)
- **Auth:** browser billing-session Cookie header
- **Endpoint:** `GET https://www.perplexity.ai/rest/billing/credits`
- **Output:** recurring, purchased, and bonus credit pools

## Authentication

Auth precedence in this fork:

1. `PERPLEXITY_COOKIE_HEADER`
2. `PERPLEXITY_COOKIE`
3. stored provider secret `cookieHeader`
4. `PERPLEXITY_SESSION_TOKEN` converted to `__Secure-next-auth.session-token=<token>`

If none of those are present, the plugin throws:

- `Not logged in. Save a Perplexity Cookie header or set PERPLEXITY_COOKIE_HEADER.`

## Manual setup

1. Sign in to `https://www.perplexity.ai` in a browser.
2. Open DevTools and load a billing or credits request.
3. Copy the full `Cookie` request header.
4. Paste it into UsageBar Settings for Perplexity.

Do not paste:

- `Set-Cookie`
- a single cookie value without its name
- response headers

If you only have the session token, `PERPLEXITY_SESSION_TOKEN` is a convenience fallback, but the full Cookie header is the preferred setup.

## Credits response

The credits endpoint is undocumented and may return different grant shapes. UsageBar currently normalizes pools into:

- `Recurring credits`
- `Purchased credits`
- `Bonus credits`

Plan inference is based on the recurring pool size:

- recurring credits present: `Pro`
- large recurring pool: `Max`

Zero-value pools are rendered as depleted rather than incorrectly showing as full.

## Limitations

- This is not a public API and may change without notice.
- Session cookies expire and must be refreshed manually when Perplexity invalidates them.
- The plugin does not currently import cookies from a browser automatically.
- The plugin does not yet offer a WebView sign-in flow.
