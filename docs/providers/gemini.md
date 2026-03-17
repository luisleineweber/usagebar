# Gemini

Tracks Gemini CLI usage through local OAuth credentials and Gemini quota APIs.

## Windows status

- Status: Experimental in this Windows-first fork.
- Shared checklist: use [Windows provider verification](../windows-provider-verification.md) before calling Gemini fully validated on Windows.

## Data sources

- `~/.gemini/settings.json` for auth mode
- `~/.gemini/oauth_creds.json` for OAuth tokens
- Gemini CLI `oauth2.js` for OAuth client ID/secret

### Windows OAuth client paths

- `~/AppData/Roaming/npm/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js`
- `~/AppData/Roaming/npm/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js`
- `~/.bun/install/global/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js`

## Supported auth modes

- `oauth-personal`
- missing auth type (treated as personal OAuth)

## Unsupported auth modes

- `api-key`
- `vertex-ai`

These return explicit errors.

## API endpoints

- `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- `GET https://cloudresourcemanager.googleapis.com/v1/projects` (project fallback)
- `POST https://oauth2.googleapis.com/token` (refresh)

## Output mapping

- **Plan** from `loadCodeAssist` tier:
  - `standard-tier` -> `Paid`
  - `free-tier` + `hd` claim -> `Workspace`
  - `free-tier` -> `Free`
  - `legacy-tier` -> `Legacy`
- **Pro**: lowest remaining Gemini Pro bucket
- **Flash**: lowest remaining Gemini Flash bucket
- **Account**: email from `id_token` claims
