# Ollama

Tracks Ollama Cloud subscription usage by scraping the authenticated settings page at `https://ollama.com/settings`.

## Data source

- Web settings page via manual `Cookie` header stored in the system credential vault
- Cloud auth detection from `OLLAMA_API_KEY` or local `~/.ollama/id_ed25519` + `~/.ollama/id_ed25519.pub`
- No public account-quota API is used

## What it shows

- Plan badge when the page exposes `Cloud Usage`
- `Session` usage from the page's `Session usage` or `Hourly usage` block
- `Weekly` usage when present
- Reset times from nearby `data-time` attributes when available
- If Cloud auth exists but no settings cookie is configured, a text-only auth status plus `Settings cookie required`
- Provider detail `Source` line:
  - `Settings page cookie` means Session/Weekly quota came from the authenticated settings page.
  - `Cloud auth only; settings cookie required for quota` means API key or local signin was detected, but no account-quota endpoint has been validated.
- Provider detail `Auth source` line:
  - `Stored Cookie header` means the quota request used the saved settings-page cookie.
- Provider detail `Endpoint` line:
  - `https://ollama.com/settings`

## Setup

1. Open the Ollama provider detail view in OpenUsage.
2. Expand `Setup`.
3. Run `ollama signin` or set `OLLAMA_API_KEY` if you want UsageBar to detect Cloud auth.
4. For Session/Weekly quota, open `https://ollama.com/settings` in your browser while signed in.
5. Copy the full `Cookie` request header from the Network tab.
6. Paste it into `Ollama -> Cookie header`.
7. Save the secret and click `Retry`.

## Failure modes

- Missing cookie header and no Cloud auth: `Paste your Ollama Cookie header in Setup before refreshing, or run `ollama signin` / set OLLAMA_API_KEY for Cloud auth detection.`
- Expired cookie: `Ollama session cookie expired. Paste a fresh Cookie header from ollama.com/settings.`
- Signed-out HTML or auth redirect: `Not logged in to Ollama. Paste a signed-in Cookie header from ollama.com/settings.`
- HTML shape changed: `Could not parse Ollama usage.`

## Notes

- This is a best-effort HTML scrape, not a stable Ollama account API integration.
- Ollama's official Cloud/API docs support `ollama signin` and `OLLAMA_API_KEY`, and API usage responses include per-request telemetry. They do not document an account Session/Weekly quota endpoint, so UsageBar does not create quota bars from API-key auth alone.
- Browser auto-import remains out of scope for this Windows slice.
