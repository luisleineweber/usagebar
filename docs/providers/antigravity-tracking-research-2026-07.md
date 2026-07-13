# Modern Antigravity quota tracking research (2026-07)

## Executive summary

- Antigravity now has **session and weekly baseline limits**, plus optional AI-credit overage. A per-model-only display is no longer a complete representation.
- The most stable Windows-compatible path is stored Google OAuth credentials + Google Cloud Code HTTP calls. It does not require the IDE process after sign-in.
- UsageBar's current fallback sends `{}` to `fetchAvailableModels`. Current clients resolve `cloudaicompanionProject` with `loadCodeAssist` and send `{ "project": "..." }`. An empty project can produce a false `remainingFraction: 1` (the observed permanent `100% left`).
- Prefer `retrieveUserQuotaSummary` for the four real baseline buckets when present; fall back to project-scoped `fetchAvailableModels`. Keep the local language-server path only as an opportunistic secondary signal.
- These Cloud Code methods are undocumented `v1internal` contracts. They need tolerant parsing, fixtures captured from real accounts, and explicit unknown states.

## What Google officially promises

Google documents baseline quota refreshed every five hours and weekly rate limits. Pro has a higher weekly limit; Ultra has the highest five-hour and weekly limits and third-party models. The exact numerical allocation is deliberately not published and model availability/rate limits vary by plan ([Antigravity plans](https://antigravity.google/docs/plans?app=cli)).

Google also documents a second usage layer: AI credits can continue requests after baseline quota is exhausted, when enabled. Credit usage is model/feature dependent; the Google One activity page is the supported place to see total balance and transaction history ([Google One AI-credit management](https://support.google.com/googleone/answer/16287445?hl=en), [AI Ultra benefits](https://support.google.com/googleone/answer/16286513?hl=en)). Consequently, baseline remaining and AI-credit balance are separate concepts and must not be merged.

No public Google documentation specifies the quota HTTP schema below. `cloudcode-pa.googleapis.com/v1internal:*` must be treated as a reverse-engineered, changeable product contract, not a supported public API.

## Recommended acquisition pipeline

### 1. Read the signed-in account from Antigravity state

Windows state database:

```text
%APPDATA%\Antigravity\User\globalStorage\state.vscdb
```

Relevant SQLite keys observed in current clients and UsageBar:

- `antigravityUnifiedStateSync.oauthToken`: access token, refresh token, expiry; Antigravity versions may wrap this in a double-base64 JSON envelope.
- `antigravityAuthStatus`: account/auth status and an optional API key used by the local language server.

Reading SQLite is locale-independent and Windows-native. Copying or opening it read-only avoids lock contention with the IDE. Never log token values or persist them outside provider-private storage.

### 2. Refresh OAuth when required

Use `POST https://oauth2.googleapis.com/token` with `client_id`, `client_secret`, `refresh_token`, and `grant_type=refresh_token`. Send the resulting access token as `Authorization: Bearer ...`. This flow and the possibility of refresh-token expiry/revocation are documented by Google ([Google OAuth refresh flow](https://developers.google.com/identity/protocols/oauth2/web-server#offline)).

Use the OAuth client credentials stored by Antigravity/current account data. Do not introduce a UsageBar-owned OAuth client or interactive consent unless Google provides a supported integration: scopes and client identity affect access to the internal API.

### 3. Resolve the Cloud AI Companion project

```http
POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist
Authorization: Bearer <access-token>
Content-Type: application/json
User-Agent: antigravity/<version> windows/amd64

{"metadata":{"ideType":"ANTIGRAVITY"}}
```

Read:

- `cloudaicompanionProject` — required project value for reliable quota calls.
- `paidTier` first, otherwise `currentTier` — plan identity.
- tier fields such as `id`, `name`, and upgrade metadata only when present.

This exact project discovery is implemented by [AntigravityQuotaWatcher](https://github.com/wusimpl/AntigravityQuotaWatcher/blob/55e855650ec34f155154585e7959283106d57e90/src/api/googleCloudCodeClient.ts#L69-L103) and [Quotio](https://github.com/nguyenphutrong/quotio/blob/ecd9d6f12130163ebe9fe7ea1781cced5f8e9d5e/Quotio/Services/Antigravity/AntigravityQuotaFetcher.swift). The project is not a normal user-selected GCP project; use the returned value verbatim.

### 4. Prefer quota summary

Current open-source clients have begun using:

```http
POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary
Authorization: Bearer <access-token>
Content-Type: application/json
User-Agent: antigravity/<version> windows/amd64

{"project":"<cloudaicompanionProject>"}
```

Quotio's current implementation treats this as preferred and parses four semantic buckets ([source](https://github.com/nguyenphutrong/quotio/blob/ecd9d6f12130163ebe9fe7ea1781cced5f8e9d5e/Quotio/Services/Antigravity/AntigravityQuotaFetcher.swift)):

- Gemini session (five-hour)
- Gemini weekly
- Claude/GPT session (five-hour)
- Claude/GPT weekly

Observed response variants place `groups` at the root, under `response`, or under `summary`. Group names identify Gemini versus Claude/GPT. Bucket labels identify session versus weekly. Remaining may be:

- `remainingFraction` / `remaining_fraction`
- nested below `remaining`
- a tagged `{ "case": "remainingFraction", "value": ... }`

Reset timestamps have appeared as `resetTime`, `reset_time`, `resetAt`, or `reset_at`. Parse all conservatively. Missing remaining is **unknown**, never zero or 100%.

Because this method is especially new and undocumented, only accept it when all required semantic fields parse. Otherwise continue to the model fallback.

### 5. Fall back to project-scoped model quota

Try hosts in this order, continuing on transport/5xx/unsupported failures:

1. `https://daily-cloudcode-pa.googleapis.com`
2. `https://daily-cloudcode-pa.sandbox.googleapis.com`
3. `https://cloudcode-pa.googleapis.com`

```http
POST <host>/v1internal:fetchAvailableModels
Authorization: Bearer <access-token>
Content-Type: application/json
User-Agent: antigravity/<version> windows/amd64

{"project":"<cloudaicompanionProject>"}
```

Response shape:

```json
{
  "models": {
    "model-id": {
      "displayName": "...",
      "quotaInfo": {
        "remainingFraction": 0.42,
        "resetTime": "2026-07-12T18:00:00Z"
      }
    }
  }
}
```

The object-map shape, project-bearing request, and fields are independently implemented by [AntigravityQuotaWatcher](https://github.com/wusimpl/AntigravityQuotaWatcher/blob/55e855650ec34f155154585e7959283106d57e90/src/api/googleCloudCodeClient.ts#L105-L183), [Antigravity Tools LS](https://github.com/lbjlaq/Antigravity-Tools-LS/blob/d312237af83820ca15a636e81c5e61660bdf13f4/apps/cli-server/src/handlers/probes.rs), and [Quotio](https://github.com/nguyenphutrong/quotio/blob/ecd9d6f12130163ebe9fe7ea1781cced5f8e9d5e/Quotio/Services/Antigravity/AntigravityQuotaFetcher.swift). Multiple active tools use all three host variants ([CPA Manager Plus constants](https://github.com/seakee/CPA-Manager-Plus/blob/79d681c5771b536d2517a36cdcafb04f3930402e/apps/web/src/utils/quota/constants.ts)).

Important: a current account-management project documents a backend defect where omitting `project` made exhausted accounts return `remainingFraction: 1` ([Antigravity Manager release note](https://github.com/lbjlaq/Antigravity-Manager/blob/main/README_EN.md)). This exactly matches UsageBar's current empty-body request and reported `100% left` failure.

Model IDs are dynamic. Do not maintain an allowlist. Group by semantic family, but preserve unknown models for diagnostics. For a group, use the minimum known remaining fraction and earliest valid future reset among members because aliases commonly share a pool. Do not infer exhaustion merely from a reset timestamp or missing `remainingFraction`.

### 6. Local language server: optional, not authoritative

The live IDE path can still probe the Codeium-family language server using its loopback port and CSRF token, calling `GetUserStatus` and `GetCommandModelConfigs`. It is useful as a temporary fallback or validation source, but is less stable because process arguments, ports, RPC schemas, and startup state change by release. Windows discovery must use process executable/command-line data and numeric network columns, never localized `netstat` state words.

Do not cache a live LS `100%` value across sessions as authoritative. Cache only a fully parsed sample until its reset time, tag its source, and invalidate it when the account changes or its reset window passes.

## Failure taxonomy

| Condition                                            | Meaning                                                              | Handling                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 401                                                  | access token expired/revoked or wrong OAuth client/scopes            | Refresh once; retry once; then require Antigravity sign-in.                            |
| 403                                                  | account/region/tier not entitled, or internal endpoint denies client | Do not retry repeatedly; show unavailable with status.                                 |
| 404 / unsupported method                             | host/version does not expose an internal method                      | Try next host or fallback method.                                                      |
| 429                                                  | service throttling or quota exhaustion                               | Preserve response details/`Retry-After`; do not convert to auth failure.               |
| 5xx, timeout, DNS/TLS                                | transient backend/network failure                                    | Bounded host fallback; retain last known sample only if still inside its reset window. |
| HTTP 200 + `remainingFraction: 1` from empty project | known false-full behavior                                            | Reject projectless result; resolve project and retry.                                  |
| missing fraction, models, groups, or reset           | schema drift / partial response                                      | Mark unknown; never default to 0 or 1.                                                 |
| expired reset timestamp                              | stale response/cache                                                 | Invalidate and refetch; if refetch fails, unknown.                                     |
| SQLite locked/corrupt or token envelope changed      | local discovery failure                                              | Read copied snapshot/read-only; report parse stage without leaking data.               |

## Implementation recommendation for UsageBar

1. Make stored OAuth + HTTP the primary Windows path.
2. Add `loadCodeAssist`; require a non-empty `cloudaicompanionProject` before accepting remote quota.
3. Add tolerant `retrieveUserQuotaSummary` parsing for the four session/weekly baseline pools.
4. Retain `fetchAvailableModels` as fallback, but send `{ project }`, add the sandbox host, and reject projectless `100%` data.
5. Keep live LS as secondary/fallback and label its provenance.
6. Represent AI-credit balance separately. The internal quota responses above do not establish a stable credit-balance contract; linking to Google One activity is safer until a first-party or reproducible API contract is available.
7. Add captured, redacted fixtures for free/Pro/Ultra, partially consumed, exhausted/429, missing fraction, summary-schema variants, 401 refresh, and all-host failure. Audit any newly exposed fields against the plugin host redaction list.

## Confidence

- **High:** product quota semantics, OAuth refresh behavior, Windows state location already used by this repo, need for project resolution, `fetchAvailableModels` core fields.
- **Medium:** three-host fallback order and model grouping; supported by multiple independent current implementations but not public Google documentation.
- **Emerging:** `retrieveUserQuotaSummary` response variants. Prefer it, but gate on successful semantic parsing and retain the model fallback.
