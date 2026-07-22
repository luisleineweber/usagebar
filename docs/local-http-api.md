# Local HTTP API

UsageBar exposes a read-only HTTP API on the loopback interface so local tools, scripts, widgets, and dashboards can consume the same cached usage data shown in the tray panel.

**Base URL:** `http://127.0.0.1:6736`

The server starts automatically with the app. It only binds to `127.0.0.1`. If the port is already in use, the API is disabled for that app session and UsageBar continues running normally.

## Hardening

The API is loopback-only, but it exposes cached subscription information. It is therefore configurable before app startup:

| Variable | Effect |
| --- | --- |
| `USAGEBAR_LOCAL_HTTP_API_ENABLED=false` | Does not start the listener. `0` and `off` have the same effect. |
| `USAGEBAR_LOCAL_HTTP_API_TOKEN=<secret>` | Requires `Authorization: Bearer <secret>` for every `GET` request. |
| `USAGEBAR_LOCAL_HTTP_API_ALLOWED_ORIGIN=<origin>` | Restricts browser CORS to exactly one origin, for example `http://localhost:3000`. |

Without this variable, the API retains its legacy `Access-Control-Allow-Origin: *` behavior for existing browser clients. Set it to restrict browser CORS to one origin.

When a token is configured, use:

```powershell
$headers = @{ Authorization = "Bearer $env:USAGEBAR_LOCAL_HTTP_API_TOKEN" }
Invoke-RestMethod http://127.0.0.1:6736/v1/usage -Headers $headers
```

## Routes

### `GET /v1/health`

Returns API health and cache metadata.

- `200 OK`: JSON object with `ok`, app `version`, and `cachedProviderCount`.

### `GET /v1/providers`

Returns known provider IDs and whether each provider currently has a cached successful snapshot.

- `200 OK`: JSON array. Each entry includes `providerId`, `cached`, and optional `fetchedAt`.

### `GET /v1/latest`

Returns the latest enabled provider snapshots wrapped in a stable object shape for widgets and status-line tools.

- `200 OK`: JSON object with a `providers` array.

### `GET /v1/usage`

Returns cached usage snapshots for all enabled providers, ordered by your plugin settings.

- `200 OK`: JSON array. The array can be empty when no successful probe result has been cached yet.

### `GET /v1/usage/:providerId`

Returns one cached usage snapshot for a known provider.

- `200 OK`: JSON object with the cached snapshot.
- `204 No Content`: Provider is known but has no cached snapshot yet.
- `404 Not Found`: Provider ID is unknown.

### Unsupported Methods

`GET` and `OPTIONS` are supported on the API routes. Other methods return `405 Method Not Allowed`.

Unknown routes return `404 Not Found`.

## Response Shape

```json
{
  "providerId": "claude",
  "displayName": "Claude",
  "plan": "Team 5x",
  "lines": [
    {
      "type": "progress",
      "label": "Session",
      "used": 42.0,
      "limit": 100.0,
      "format": { "kind": "percent" },
      "resetsAt": "2026-03-26T13:00:00.161Z",
      "periodDurationMs": 18000000,
      "color": null
    },
    {
      "type": "text",
      "label": "Today",
      "value": "$5.17 / 9.2M tokens",
      "color": null,
      "subtitle": null
    }
  ],
  "fetchedAt": "2026-03-26T11:16:29Z"
}
```

The `lines` array uses the same metric line types as plugin output: `progress`, `text`, and `badge`.

`fetchedAt` is an ISO 8601 timestamp indicating when the snapshot was last successfully fetched.

`iconUrl` is intentionally omitted to keep API payloads small.

`GET /v1/latest` uses this wrapper:

```json
{
  "providers": [
    {
      "providerId": "claude",
      "displayName": "Claude",
      "plan": "Team 5x",
      "lines": [],
      "fetchedAt": "2026-03-26T11:16:29Z"
    }
  ]
}
```

## Filtering And Caching

- `GET /v1/usage` returns enabled providers only.
- `GET /v1/latest` returns the same enabled provider set as `GET /v1/usage`, but uses an object wrapper so more fields can be added without changing the top-level type.
- Provider order follows the plugin order saved in UsageBar settings.
- If no plugin settings exist yet, the default enabled providers are `claude`, `codex`, and `cursor`.
- Only successful probe results are cached. A failed probe does not overwrite the previous successful snapshot.
- `GET /v1/usage/:providerId` works for any known provider, including disabled providers.
- Cache data is persisted in UsageBar's app data directory as `usage-api-cache.json`.

## CORS

Browser CORS remains permissive by default for backwards compatibility. When `USAGEBAR_LOCAL_HTTP_API_ALLOWED_ORIGIN` is set, only matching responses include:

```http
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Vary: Origin
```

`OPTIONS` requests return `204 No Content`.

## Error Responses

```json
{
  "error": "provider_not_found"
}
```

Possible error codes are `provider_not_found`, `not_found`, `method_not_allowed`, and `unauthorized`.

## Examples

```powershell
Invoke-RestMethod http://127.0.0.1:6736/v1/health
Invoke-RestMethod http://127.0.0.1:6736/v1/providers
Invoke-RestMethod http://127.0.0.1:6736/v1/latest
Invoke-RestMethod http://127.0.0.1:6736/v1/usage
Invoke-RestMethod http://127.0.0.1:6736/v1/usage/codex
```
