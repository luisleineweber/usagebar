# Codebuff

> Uses a stored Codebuff API token, `CODEBUFF_API_KEY`, or `~/.config/manicode/credentials.json` from `codebuff login` to fetch credit balance and weekly limits.

## What It Tracks

- Credit usage from `POST https://www.codebuff.com/api/v1/usage`
- Remaining credit balance and next quota reset when returned by Codebuff
- Weekly rate-limit usage from `GET https://www.codebuff.com/api/user/subscription` when the token can access subscription metadata
- Plan/tier and account email when available

## Setup

1. Open Settings -> Providers -> Codebuff and paste your API token, or set `CODEBUFF_API_KEY`.
2. Alternatively, run `codebuff login`; UsageBar reads `~/.config/manicode/credentials.json`.
3. Enable Codebuff in Settings -> Providers.

## Displayed Lines

- `Credits`: credit usage over quota, with reset time when available. UsageBar renders a progress bar only when Codebuff returns a real total or a total can be derived from used plus remaining credits; used-only payloads render as text.
- `Weekly`: weekly rate-limit usage when subscription metadata is available
- `Plan`: reported Codebuff tier, falling back to `Codebuff`

## Errors

- `Codebuff API token missing. Save it in Setup, set CODEBUFF_API_KEY, or run codebuff login.`
- `Codebuff API token invalid. Set CODEBUFF_API_KEY or run codebuff login again.`
- `Codebuff usage endpoint not found.`
- `Codebuff API unavailable (HTTP <status>). Try again later.`
- `Codebuff request failed (HTTP <status>). Try again later.`
- `Codebuff response invalid. Try again later.`
- `Codebuff response missing usage data. Try again later.`

## Notes

- The subscription endpoint is treated as optional so a working credit response still displays if weekly metadata is unavailable.
- Remaining gap: real signed-in Windows validation with live Codebuff tokens.
