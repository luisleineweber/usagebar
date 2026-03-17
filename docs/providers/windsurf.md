# Windsurf

> Reverse-engineered from the installed app, extension bundle, local SQLite state, and local language server behavior. May change without notice.

Windsurf and [Antigravity](antigravity.md) share the same Codeium language server family and Connect-RPC protocol. The discovery, port probing, and RPC endpoints are nearly identical. The main differences are authentication and the usage model: Windsurf requires an API key and reports credits, while Antigravity reports quota fractions.

## Variants

The plugin probes these variants in order:

| Variant | App | `--ide_name` | State DB root |
|---|---|---|---|
| Windsurf | `Windsurf.app` / `Windsurf.exe` | `windsurf` | `~/Library/Application Support/Windsurf/` or `~/AppData/Roaming/Windsurf/` |
| Windsurf Next | `Windsurf - Next.app` / `Windsurf - Next.exe` | `windsurf-next` | `~/Library/Application Support/Windsurf - Next/` or `~/AppData/Roaming/Windsurf - Next/` |

Both variants use the same RPC service and the same `windsurfAuthStatus` SQLite payload shape. They differ only in the `--ide_name` marker, the app-data path, and the metadata name sent to the backend.

## Overview

- Vendor: Codeium / Windsurf
- Protocol: Connect RPC v1 (JSON over HTTP)
- Local service: `exa.language_server_pb.LanguageServerService`
- Cloud fallback: `exa.seat_management_pb.SeatManagementService`
- Auth: API key (`sk-ws-01-...`) from SQLite plus the LS CSRF token for local requests
- Usage model: prompt credits + flex credits, both stored in hundredths
- Billing cycle: monthly (`planStart` / `planEnd`)
- Local requirement: a running Windsurf LS for the local path, or signed-in SQLite state for the cloud fallback

## Discovery

The LS is discovered from the running process plus its command-line flags.

### macOS

```bash
ps -ax -o pid=,command= | grep 'language_server_macos'
```

### Windows

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'language_server_windows*' }
```

Relevant arguments:

- `--ide_name windsurf` or `--ide_name windsurf-next`
- `--csrf_token <token>`
- `--windsurf_version <version>`
- `--extension_server_port <port>` for the plain-HTTP fallback

The plugin then finds listening ports for the LS PID and probes `GetUnleashData` until one port responds.

## Token location

The API key comes from the variant-specific `state.vscdb` entry:

| Variant | SQLite path |
|---|---|
| Windsurf | `~/Library/Application Support/Windsurf/User/globalStorage/state.vscdb` or `~/AppData/Roaming/Windsurf/User/globalStorage/state.vscdb` |
| Windsurf Next | `~/Library/Application Support/Windsurf - Next/User/globalStorage/state.vscdb` or `~/AppData/Roaming/Windsurf - Next/User/globalStorage/state.vscdb` |

```sql
SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus' LIMIT 1
```

Expected JSON payload:

```json
{
  "apiKey": "sk-ws-01-..."
}
```

## Local LS request

The plugin first calls:

```text
POST http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/GetUnleashData
```

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Connect-Protocol-Version` | `1` |
| `x-codeium-csrf-token` | `<csrf token>` |

Probe body shape:

```json
{
  "context": {
    "properties": {
      "devMode": "false",
      "extensionVersion": "unknown",
      "ide": "windsurf",
      "ideVersion": "unknown",
      "os": "windows"
    }
  }
}
```

`os` is platform-specific (`macos`, `windows`, or `linux`).

After a working port is found, the plugin requests:

```text
POST http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/GetUserStatus
```

Request body:

```json
{
  "metadata": {
    "apiKey": "sk-ws-01-...",
    "ideName": "windsurf",
    "ideVersion": "1.9544.26",
    "extensionName": "windsurf",
    "extensionVersion": "1.48.2",
    "locale": "en"
  }
}
```

For `windsurf-next`, use `windsurf-next` for both `ideName` and `extensionName`.

The live LS usually exposes `--windsurf_version`; the plugin uses that for `ideVersion` when available and falls back to installed-app metadata when it is not.

## Response mapping

The relevant response shape is:

```jsonc
{
  "userStatus": {
    "planStatus": {
      "planInfo": {
        "planName": "Teams"
      },
      "planStart": "2026-01-18T09:07:17Z",
      "planEnd": "2026-02-18T09:07:17Z",
      "availablePromptCredits": 50000,
      "usedPromptCredits": 4700,
      "availableFlexCredits": 2675000,
      "usedFlexCredits": 175550
    }
  }
}
```

Display rules:

- divide prompt and flex credit values by `100`
- use `planStart` / `planEnd` to derive the pacing period
- skip any credit line whose available total is missing or non-positive
- if no usable credit totals exist, show `Credits: Unlimited`

## Cloud fallback

If no LS is running, the plugin calls:

```text
POST https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus
```

Request body:

```json
{
  "metadata": {
    "apiKey": "sk-ws-01-...",
    "ideName": "windsurf",
    "ideVersion": "1.9544.26",
    "extensionName": "windsurf",
    "extensionVersion": "1.48.2",
    "locale": "en"
  }
}
```

The API key still comes from `windsurfAuthStatus`. Installed version metadata comes from the app bundle:

### macOS

- `/Applications/Windsurf.app/Contents/Info.plist`
- `/Applications/Windsurf - Next.app/Contents/Info.plist`

The plugin reads `CFBundleShortVersionString` and uses it for both `ideVersion` and `extensionVersion`.

### Windows

- `D:/Windsurf/resources/app/product.json`
- `~/AppData/Local/Programs/Windsurf/resources/app/product.json`
- `C:/Program Files/Windsurf/resources/app/product.json`
- `C:/Program Files (x86)/Windsurf/resources/app/product.json`
- the same candidate set for `Windsurf - Next`

Preferred field mapping:

| Product field | Request field |
|---|---|
| `windsurfVersion` | `metadata.ideVersion` |
| `codeiumVersion` | `metadata.extensionVersion` |
| fallback `version` | used when the Windsurf-specific fields are absent |

If installed version metadata cannot be read, the cloud fallback sends `0.0.0` for both version fields.

## Plugin strategy

1. Probe `windsurf`, then `windsurf-next`.
2. Try the local LS path first using process discovery, port probing, and `GetUserStatus`.
3. Read the API key from the variant-specific SQLite DB.
4. When the LS path is unavailable, call the Codeium cloud `GetUserStatus` endpoint with the same API key.
5. Build prompt and flex credit lines from `userStatus.planStatus`.
6. If both local and cloud paths fail, return `Start Windsurf or sign in and try again.`
