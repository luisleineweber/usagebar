# Windsurf

> Reverse-engineered from the local Windsurf state DB and the current cloud quota response. May change without notice.

The current UsageBar Windsurf plugin follows upstream OpenUsage's newer quota contract, but keeps this fork's Windows-aware auth discovery. It reads the saved Windsurf API key from the local `state.vscdb` file, then calls Windsurf's cloud quota endpoint directly. A running local language server is no longer required.

## Variants

The plugin probes these variants in order:

| Variant | Metadata name | macOS state DB | Windows state DB |
|---|---|---|---|
| Windsurf | `windsurf` | `~/Library/Application Support/Windsurf/User/globalStorage/state.vscdb` | `~/AppData/Roaming/Windsurf/User/globalStorage/state.vscdb` |
| Windsurf Next | `windsurf-next` | `~/Library/Application Support/Windsurf - Next/User/globalStorage/state.vscdb` | `~/AppData/Roaming/Windsurf - Next/User/globalStorage/state.vscdb` |

The first variant with a usable local API key and a valid quota response wins.

## Auth source

The plugin reads this SQLite key:

```sql
SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus' LIMIT 1
```

Expected payload shape:

```json
{
  "apiKey": "sk-ws-01-..."
}
```

If no usable API key is present in either variant DB, the plugin returns:

```text
Start Windsurf or sign in and try again.
```

## Cloud request

Endpoint:

```text
POST https://server.self-serve.windsurf.com/exa.seat_management_pb.SeatManagementService/GetUserStatus
```

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Connect-Protocol-Version` | `1` |

Request body:

```json
{
  "metadata": {
    "apiKey": "sk-ws-01-...",
    "ideName": "windsurf",
    "ideVersion": "1.108.2",
    "extensionName": "windsurf",
    "extensionVersion": "1.108.2",
    "locale": "en"
  }
}
```

Notes:

- The plugin currently sends the compatibility version `1.108.2` for both `ideVersion` and `extensionVersion`, matching the newer upstream quota flow.
- `windsurf-next` uses `windsurf-next` for both `ideName` and `extensionName`.
- HTTP `401` / `403` is treated as a login/auth failure and surfaces the normal sign-in hint.

## Response mapping

The plugin expects the newer quota payload:

```jsonc
{
  "userStatus": {
    "planStatus": {
      "planInfo": {
        "planName": "Teams"
      },
      "dailyQuotaRemainingPercent": 100,
      "weeklyQuotaRemainingPercent": 100,
      "overageBalanceMicros": "964220000",
      "dailyQuotaResetAtUnix": "1774080000",
      "weeklyQuotaResetAtUnix": "1774166400"
    }
  }
}
```

UsageBar renders:

| Response field | UI line | Mapping |
|---|---|---|
| `dailyQuotaRemainingPercent` | `Daily quota` | `used = 100 - remaining`, clamped to `0..100` |
| `weeklyQuotaRemainingPercent` | `Weekly quota` | `used = 100 - remaining`, clamped to `0..100` |
| `overageBalanceMicros` | `Extra usage balance` | micros -> dollars with 2 decimals |
| `dailyQuotaResetAtUnix` | reset time for `Daily quota` | unix seconds -> ISO |
| `weeklyQuotaResetAtUnix` | reset time for `Weekly quota` | unix seconds -> ISO |
| `planInfo.planName` | plan label | blank or missing becomes `Unknown` |

If the payload falls back to the older credit-based shape or omits any required quota fields, the plugin returns:

```text
Windsurf quota data unavailable. Try again later.
```

## Behavior summary

1. Read `windsurfAuthStatus` from the Windsurf DB, then Windsurf Next DB.
2. Call the Windsurf cloud quota endpoint for the first usable variant.
3. Render daily quota, weekly quota, and extra usage balance.
4. If the first variant returns no usable quota data, try the next variant.
5. If auth is invalid, show the login hint. If auth exists but quota data is unusable, show the quota hint.
