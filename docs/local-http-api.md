# Local HTTP API

UsageBar exposes a read-only HTTP API on the loopback interface so local tools, scripts, widgets, and dashboards can consume the same cached usage data shown in the tray panel.

**Base URL:** `http://127.0.0.1:6736`

The server starts automatically with the app. It only binds to `127.0.0.1`. If the port is already in use, the API is disabled for that app session and UsageBar continues running normally.

## Routes

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

## Filtering And Caching

- `GET /v1/usage` returns enabled providers only.
- Provider order follows the plugin order saved in UsageBar settings.
- If no plugin settings exist yet, the default enabled providers are `claude`, `codex`, and `cursor`.
- Only successful probe results are cached. A failed probe does not overwrite the previous successful snapshot.
- `GET /v1/usage/:providerId` works for any known provider, including disabled providers.
- Cache data is persisted in UsageBar's app data directory as `usage-api-cache.json`.

## CORS

All responses include permissive CORS headers for local browser-based tools:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` requests return `204 No Content`.

## Error Responses

```json
{
  "error": "provider_not_found"
}
```

Possible error codes are `provider_not_found`, `not_found`, and `method_not_allowed`.

## Examples

```powershell
Invoke-RestMethod http://127.0.0.1:6736/v1/usage
Invoke-RestMethod http://127.0.0.1:6736/v1/usage/codex
```
