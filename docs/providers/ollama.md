# Ollama

Tracks Ollama Cloud subscription usage by scraping the authenticated settings page at `https://ollama.com/settings`.

## Data source

- Web settings page via manual `Cookie` header stored in the system credential vault
- No public quota API is used in this first slice

## What it shows

- Plan badge when the page exposes `Cloud Usage`
- `Session` usage from the page's `Session usage` or `Hourly usage` block
- `Weekly` usage when present
- Reset times from nearby `data-time` attributes when available

## Setup

1. Open the Ollama provider detail view in OpenUsage.
2. Expand `Setup`.
3. Open `https://ollama.com/settings` in your browser while signed in.
4. Copy the full `Cookie` request header from the Network tab.
5. Paste it into `Ollama -> Cookie header`.
6. Save the secret and click `Retry`.

## Failure modes

- Missing cookie header: `Paste your Ollama Cookie header in Setup before refreshing.`
- Expired cookie: `Ollama session cookie expired. Paste a fresh Cookie header from ollama.com/settings.`
- Signed-out HTML or auth redirect: `Not logged in to Ollama. Paste a signed-in Cookie header from ollama.com/settings.`
- HTML shape changed: `Could not parse Ollama usage.`

## Notes

- This is a best-effort HTML scrape, not a stable Ollama account API integration.
- Browser auto-import is intentionally out of scope for this first Windows slice.
