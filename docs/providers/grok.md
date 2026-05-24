# Grok

Tracks Grok billing credits from the local Grok CLI login.

## Windows Status

- Status: Experimental in this Windows-first fork.
- Requires Grok CLI auth from `grok login`.
- Uses an undocumented CLI billing endpoint, so response shape can change.

## Data Sources

- Local auth file: `~/.grok/auth.json`
- Billing endpoint: `https://cli-chat-proxy.grok.com/v1/billing`
- Plan endpoint: `https://cli-chat-proxy.grok.com/v1/settings`

UsageBar reads a non-expired CLI token from the auth file, calls the billing endpoint, and displays the current billing-period credit percentage. It reads the plan label from the settings endpoint when present.

## What It Shows

| Line | Source | Format |
| --- | --- | --- |
| Credits used | `config.used` / `config.monthlyLimit` | percent progress |
| Pay as you go | `config.onDemandCap` | badge |
| Plan | `subscription_tier_display` | provider badge |

## Setup

1. Install the Grok CLI.
2. Run `grok login`.
3. Confirm `~/.grok/auth.json` exists.
4. Enable Grok in UsageBar Settings.
5. Refresh the provider.

## Failure Modes

- Missing auth file: `Grok not logged in. Run grok login.`
- Expired token: `Grok auth expired. Run grok login again.`
- Invalid token shape: `Grok auth invalid. Run grok login again.`
- Network failure: `Grok billing request failed. Check your connection.`
- HTTP failure: `Grok billing request failed (HTTP {status}). Try again later.`
- Shape change: `Grok billing response changed.`

## Notes

- UsageBar does not store Grok credentials for this provider.
- Request headers contain the CLI bearer token, but plugin HTTP logging records method, URL, status, and redacted response previews only.
- The integration is experimental until the billing endpoint is public or live-account validation is broader.
